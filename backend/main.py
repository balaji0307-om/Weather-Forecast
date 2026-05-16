from typing import Any
from urllib.parse import urlencode
from urllib.request import urlopen, Request
import json

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="Atmos Weather API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def fetch_json(base_url: str, params: dict[str, Any], timeout: int = 15) -> Any:
    url = f"{base_url}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "Atmos-Weather-Dashboard/1.0"})

    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Weather service is unavailable") from exc


def apply_observed_current(forecast: dict[str, Any], latitude: float, longitude: float) -> dict[str, Any]:
    try:
        observed = fetch_json(
            f"https://wttr.in/{latitude},{longitude}",
            {
                "format": "j1",
            },
            timeout=4,
        )
        current_condition = observed.get("current_condition", [{}])[0]
        temp = current_condition.get("temp_C")
        feels = current_condition.get("FeelsLikeC")
        humidity = current_condition.get("humidity")
        wind = current_condition.get("windspeedKmph")

        if temp not in (None, ""):
            forecast["current"]["temperature_2m"] = float(temp)
            forecast["current"]["observed_temperature_2m"] = float(temp)
            forecast["current"]["temperature_source"] = "live observation"
        if feels not in (None, ""):
            forecast["current"]["apparent_temperature"] = float(feels)
        if humidity not in (None, ""):
            forecast["current"]["relative_humidity_2m"] = int(float(humidity))
        if wind not in (None, ""):
            forecast["current"]["wind_speed_10m"] = float(wind)
    except HTTPException:
        forecast["current"]["temperature_source"] = "forecast grid"

    return forecast


def apply_air_quality(forecast: dict[str, Any], latitude: float, longitude: float, timezone: str) -> dict[str, Any]:
    try:
        air = fetch_json(
            "https://air-quality-api.open-meteo.com/v1/air-quality",
            {
                "latitude": latitude,
                "longitude": longitude,
                "timezone": timezone,
                "forecast_days": 3,
                "hourly": "us_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,ozone",
            },
            timeout=8,
        )
        forecast["air_quality"] = air
    except HTTPException:
        forecast["air_quality"] = None

    return forecast


def compact_parts(*parts: Any) -> list[str]:
    clean: list[str] = []
    seen: set[str] = set()
    for part in parts:
        if part is None:
            continue
        value = str(part).strip()
        key = value.lower()
        if value and key not in seen:
            clean.append(value)
            seen.add(key)
    return clean


def normalize_open_meteo_place(place: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"openmeteo-{place.get('id', '')}",
        "name": place.get("name", ""),
        "admin1": place.get("admin1", ""),
        "admin2": place.get("admin2", ""),
        "country": place.get("country", ""),
        "latitude": float(place.get("latitude")),
        "longitude": float(place.get("longitude")),
        "timezone": place.get("timezone") or "auto",
        "source": "Open-Meteo",
        "type": place.get("feature_code", "place"),
    }


def normalize_osm_place(place: dict[str, Any]) -> dict[str, Any]:
    address = place.get("address", {})
    display_parts = [part.strip() for part in place.get("display_name", "").split(",")]
    name = (
        place.get("name")
        or address.get("neighbourhood")
        or address.get("suburb")
        or address.get("village")
        or address.get("town")
        or address.get("city")
        or address.get("hamlet")
        or (display_parts[0] if display_parts else "Selected place")
    )
    district = (
        address.get("city")
        or address.get("town")
        or address.get("municipality")
        or address.get("county")
        or address.get("state_district")
    )

    return {
        "id": f"osm-{place.get('place_id', '')}",
        "name": name,
        "admin1": address.get("state", ""),
        "admin2": district if district != name else address.get("county", ""),
        "country": address.get("country", ""),
        "latitude": float(place.get("lat")),
        "longitude": float(place.get("lon")),
        "timezone": "auto",
        "source": "OpenStreetMap",
        "type": place.get("type") or place.get("class") or "place",
        "displayName": ", ".join(compact_parts(name, district, address.get("state"), address.get("country"))),
    }


def unique_places(places: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for place in places:
        key = (
            str(place.get("name", "")).lower(),
            f"{float(place.get('latitude')):.4f}",
            f"{float(place.get('longitude')):.4f}",
        )
        if key not in seen:
            unique.append(place)
            seen.add(key)
    return unique


def search_open_meteo_places(query: str) -> list[dict[str, Any]]:
    data = fetch_json(
        "https://geocoding-api.open-meteo.com/v1/search",
        {
            "name": query,
            "count": 10,
            "language": "en",
            "format": "json",
        },
    )
    return [normalize_open_meteo_place(place) for place in data.get("results", [])]


def search_osm_places(query: str) -> list[dict[str, Any]]:
    data = fetch_json(
        "https://nominatim.openstreetmap.org/search",
        {
            "q": query,
            "format": "jsonv2",
            "addressdetails": 1,
            "namedetails": 1,
            "limit": 10,
            "accept-language": "en",
        },
    )
    return [normalize_osm_place(place) for place in data]


def parent_location_fallback(query: str) -> list[dict[str, Any]]:
    words = [word for word in query.replace(",", " ").split() if word.lower() not in {"in", "near", "at"}]
    if len(words) < 3:
        return []

    fallback_results: list[dict[str, Any]] = []
    max_locality_words = min(3, len(words) - 1)
    for split_at in range(1, max_locality_words + 1):
        locality = " ".join(words[:split_at])
        parent_query = " ".join(words[split_at:])

        parent_places: list[dict[str, Any]] = []
        for searcher in (search_osm_places, search_open_meteo_places):
            try:
                parent_places.extend(searcher(parent_query))
            except HTTPException:
                pass

        for parent in unique_places(parent_places)[:2]:
            fallback_results.append(
                {
                    **parent,
                    "id": f"locality-{locality.lower()}-{parent.get('id')}",
                    "name": locality.title(),
                    "admin2": parent.get("name", parent.get("admin2", "")),
                    "admin1": parent.get("admin1", ""),
                    "country": parent.get("country", ""),
                    "source": "Approximate locality",
                    "type": "locality",
                    "approximate": True,
                    "displayName": ", ".join(
                        compact_parts(locality.title(), parent.get("name"), parent.get("admin1"), parent.get("country"))
                    ),
                }
            )

        if fallback_results:
            break

    return fallback_results


def known_locality_fallback(query: str) -> list[dict[str, Any]]:
    normalized = " ".join(query.lower().replace(",", " ").split())
    known_places = {
        "manpur gaya bihar": {
            "name": "Manpur",
            "admin2": "Gaya",
            "admin1": "Bihar",
            "country": "India",
            "latitude": 24.8118,
            "longitude": 85.0660,
        },
        "manpur gaya": {
            "name": "Manpur",
            "admin2": "Gaya",
            "admin1": "Bihar",
            "country": "India",
            "latitude": 24.8118,
            "longitude": 85.0660,
        },
        "manpur gaya bihar india": {
            "name": "Manpur",
            "admin2": "Gaya",
            "admin1": "Bihar",
            "country": "India",
            "latitude": 24.8118,
            "longitude": 85.0660,
        },
        "lakhibag gaya bihar": {
            "name": "Lakhibag",
            "admin2": "Gaya",
            "admin1": "Bihar",
            "country": "India",
            "latitude": 24.7964,
            "longitude": 85.0080,
        },
        "lakhibag gaya": {
            "name": "Lakhibag",
            "admin2": "Gaya",
            "admin1": "Bihar",
            "country": "India",
            "latitude": 24.7964,
            "longitude": 85.0080,
        },
        "lakhibag gaya bihar india": {
            "name": "Lakhibag",
            "admin2": "Gaya",
            "admin1": "Bihar",
            "country": "India",
            "latitude": 24.7964,
            "longitude": 85.0080,
        },
        "lakhibagh gaya bihar": {
            "name": "Lakhibag",
            "admin2": "Gaya",
            "admin1": "Bihar",
            "country": "India",
            "latitude": 24.7964,
            "longitude": 85.0080,
        },
        "lakhibagh gaya": {
            "name": "Lakhibag",
            "admin2": "Gaya",
            "admin1": "Bihar",
            "country": "India",
            "latitude": 24.7964,
            "longitude": 85.0080,
        },
        "lakhibagh gaya bihar india": {
            "name": "Lakhibag",
            "admin2": "Gaya",
            "admin1": "Bihar",
            "country": "India",
            "latitude": 24.7964,
            "longitude": 85.0080,
        },
    }

    place = known_places.get(normalized)
    if not place:
        return []

    return [
        {
            **place,
            "id": f"known-{normalized.replace(' ', '-')}",
            "timezone": "auto",
            "source": "Local fallback",
            "type": "locality",
            "approximate": normalized.startswith("lakhibag") or normalized.startswith("lakhibagh"),
            "displayName": ", ".join(compact_parts(place["name"], place["admin2"], place["admin1"], place["country"])),
        }
    ]


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/search")
def search_city(q: str = Query(..., min_length=2)) -> dict[str, Any]:
    results: list[dict[str, Any]] = known_locality_fallback(q)
    if results:
        return {"results": results}

    for searcher in (search_osm_places, search_open_meteo_places):
        try:
            results.extend(searcher(q))
        except HTTPException:
            pass

    results = unique_places(results)
    if not results:
        results = parent_location_fallback(q)

    if not results:
        raise HTTPException(status_code=404, detail="No city found")

    return {"results": results}


@app.get("/api/reverse")
def reverse_geocode(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> dict[str, Any]:
    try:
        osm_data = fetch_json(
            "https://nominatim.openstreetmap.org/reverse",
            {
                "lat": latitude,
                "lon": longitude,
                "format": "jsonv2",
                "addressdetails": 1,
                "zoom": 16,
                "accept-language": "en",
            },
        )
        if osm_data:
            place = normalize_osm_place(
                {
                    **osm_data,
                    "lat": latitude,
                    "lon": longitude,
                    "name": osm_data.get("name") or osm_data.get("address", {}).get("suburb"),
                }
            )
            place["source"] = "Browser location"
            place["liveLocation"] = True
            return {"place": place}
    except HTTPException:
        pass

    data = fetch_json(
        "https://geocoding-api.open-meteo.com/v1/reverse",
        {
            "latitude": latitude,
            "longitude": longitude,
            "language": "en",
            "format": "json",
        },
    )

    results = data.get("results", [])
    if results:
        place = normalize_open_meteo_place(results[0])
        place["liveLocation"] = True
        return {"place": place}

    return {
        "place": {
            "name": "Your location",
            "country": "",
            "latitude": latitude,
            "longitude": longitude,
            "timezone": "auto",
            "source": "Browser location",
            "liveLocation": True,
        }
    }


@app.get("/api/weather")
def weather(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    timezone: str = Query("auto"),
) -> dict[str, Any]:
    forecast = fetch_json(
        "https://api.open-meteo.com/v1/forecast",
        {
            "latitude": latitude,
            "longitude": longitude,
            "timezone": timezone,
            "forecast_days": 7,
            "cell_selection": "nearest",
            "temperature_unit": "celsius",
            "wind_speed_unit": "kmh",
            "precipitation_unit": "mm",
            "current": ",".join(
                [
                    "temperature_2m",
                    "relative_humidity_2m",
                    "apparent_temperature",
                    "precipitation",
                    "weather_code",
                    "pressure_msl",
                    "wind_speed_10m",
                    "wind_direction_10m",
                ]
            ),
            "hourly": ",".join(
                [
                    "temperature_2m",
                    "precipitation_probability",
                    "weather_code",
                    "visibility",
                    "uv_index",
                    "wind_speed_10m",
                    "wind_direction_10m",
                ]
            ),
            "daily": ",".join(
                [
                    "weather_code",
                    "temperature_2m_max",
                    "temperature_2m_min",
                    "precipitation_probability_max",
                    "sunrise",
                    "sunset",
                ]
            ),
        },
    )
    forecast = apply_observed_current(forecast, latitude, longitude)
    return apply_air_quality(forecast, latitude, longitude, timezone)
