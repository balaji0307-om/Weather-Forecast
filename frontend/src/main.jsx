import React from "react";
import { createRoot } from "react-dom/client";
import { Crosshair, Heart, Moon, Search, Sun } from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";
const API_CANDIDATES = [...new Set([API_BASE, "http://127.0.0.1:9016", "http://127.0.0.1:9014", "http://127.0.0.1:9012", "http://127.0.0.1:9010", "http://127.0.0.1:9000", "http://127.0.0.1:8000"])];

const codeMap = {
  0: ["Clear sky", "sun", "clear"],
  1: ["Mainly clear", "sun-half", "clear"],
  2: ["Partly cloudy", "cloud", "clear"],
  3: ["Overcast", "cloud", "rainy"],
  45: ["Fog", "mist", "rainy"],
  48: ["Rime fog", "mist", "rainy"],
  51: ["Light drizzle", "drop", "rainy"],
  53: ["Drizzle", "drop", "rainy"],
  55: ["Dense drizzle", "drop", "rainy"],
  61: ["Light rain", "rain", "rainy"],
  63: ["Rain", "rain", "rainy"],
  65: ["Heavy rain", "rain", "rainy"],
  71: ["Light snow", "snow", "snowy"],
  73: ["Snow", "snow", "snowy"],
  75: ["Heavy snow", "snow", "snowy"],
  80: ["Rain showers", "rain", "rainy"],
  81: ["Showers", "rain", "rainy"],
  82: ["Violent showers", "storm", "stormy"],
  95: ["Thunderstorm", "storm", "stormy"],
  96: ["Thunderstorm with hail", "storm", "stormy"],
  99: ["Severe thunderstorm", "storm", "stormy"],
};

const defaultPlace = {
  name: "India fallback",
  country: "India",
  latitude: 20.5937,
  longitude: 78.9629,
  timezone: "auto",
};

const locatingPlace = {
  name: "Finding your location",
  country: "",
  latitude: 20.5937,
  longitude: 78.9629,
  timezone: "auto",
};

function weatherIcon(type) {
  const icons = {
    sun: "☀",
    "sun-half": "◐",
    cloud: "☁",
    mist: "≋",
    drop: "◌",
    rain: "☂",
    snow: "✳",
    storm: "⚡",
  };
  return icons[type] || "◌";
}

function codeInfo(code) {
  return codeMap[code] || ["Changing weather", "cloud", "clear"];
}

function localTime(value) {
  const time = value.includes("T") ? value.split("T")[1] : value;
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(Date.UTC(2000, 0, 1, hour, minute || 0));
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function localDay(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function longDate(value) {
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function minutesFromTime(value) {
  const time = value.includes("T") ? value.split("T")[1] : value;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + (minute || 0);
}

async function requestJson(path, options = {}) {
  let lastError = new Error("Request failed");

  for (const baseUrl of API_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, options);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        lastError = new Error(data.detail || "Request failed");
        continue;
      }
      return response.json();
    } catch (error) {
      if (error.name === "AbortError") throw error;
      lastError = error;
    }
  }

  throw lastError;
}

async function api(path) {
  return requestJson(path);
}

function placeLabel(place) {
  const [name, ...rest] = compactPlaceParts(place.name, place.admin2, place.admin1, place.country);
  return `${name || "Selected place"}${rest.length ? ` · ${rest.join(", ")}` : ""}`;
}

function placeDetail(place) {
  return place.displayName || compactPlaceParts(place.name, place.admin2, place.admin1, place.country).join(", ");
}

function coordinatesLabel(place) {
  return `${Number(place.latitude).toFixed(2)}, ${Number(place.longitude).toFixed(2)}`;
}

function compactPlaceParts(...parts) {
  const seen = new Set();
  return parts
    .map((part) => String(part || "").trim())
    .filter((part) => {
      const key = part.toLowerCase();
      if (!part || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function distanceKm(from, to) {
  if (!from || !to?.latitude || !to?.longitude) return null;
  const earthRadius = 6371;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const deltaLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const deltaLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const angle =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(angle), Math.sqrt(1 - angle)));
}

function rankSuggestions(results, reference) {
  return results
    .map((item) => ({ ...item, distance: distanceKm(reference, item) }))
    .sort((a, b) => {
      if (a.distance === null && b.distance === null) return 0;
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });
}

function comfortScore(current, rainChance, uvIndex) {
  let score = 100;
  score -= Math.abs(current.temperature_2m - 24) * 2.4;
  score -= Math.max(0, current.relative_humidity_2m - 55) * 0.28;
  score -= Math.max(0, current.wind_speed_10m - 14) * 0.8;
  score -= rainChance * 0.35;
  score -= Math.max(0, uvIndex - 7) * 4;
  return Math.max(12, Math.min(99, Math.round(score)));
}

function narrative(score, condition, rainChance, windSpeed) {
  if (rainChance >= 70) return `${condition} now, but rain risk climbs soon. Keep plans flexible and expect wet windows through the day.`;
  if (windSpeed >= 28) return `${condition} with a lively breeze. Outdoor plans are fine, but loose items may need attention.`;
  if (score >= 78) return `${condition} and genuinely comfortable. It is a strong day for errands, walks, and open-window energy.`;
  if (score >= 55) return `${condition} with a few tradeoffs. Check the hourly cards before heading out.`;
  return `${condition} with lower comfort. Dress with intention and watch wind, rain, or humidity shifts.`;
}

function compassDirection(degrees = 0) {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round(degrees / 45) % 8];
}

function aqiLevel(value) {
  if (value === null || value === undefined || value === "--") return ["Unknown", "AQI data is not available yet."];
  if (value <= 50) return ["Good", "Air looks friendly for outdoor plans."];
  if (value <= 100) return ["Moderate", "Sensitive people may want lighter outdoor activity."];
  if (value <= 150) return ["Unhealthy for sensitive groups", "Reduce long outdoor effort if you have breathing concerns."];
  if (value <= 200) return ["Unhealthy", "Keep outdoor activity short and consider a mask."];
  return ["Very unhealthy", "Avoid outdoor exertion until air improves."];
}

function uvRisk(value) {
  if (value === "--") return "UV data is loading.";
  if (value < 3) return "Low UV risk.";
  if (value < 6) return "Moderate UV. Sunglasses help.";
  if (value < 8) return "High UV. Use shade and sunscreen.";
  return "Very high UV. Limit direct sun.";
}

function activityTip(view) {
  if (view.aqi > 150) return "Indoor plans are the smarter move right now.";
  if (view.rain >= 65) return "Carry rain gear and keep outdoor plans flexible.";
  if (view.uv >= 7) return "Morning or evening outings will feel better than midday.";
  if (view.score >= 75) return "Great window for walks, errands, and open-air plans.";
  return "Short outdoor plans are fine, but check the next few hours first.";
}

function App() {
  const [query, setQuery] = React.useState("");
  const [place, setPlace] = React.useState(locatingPlace);
  const [forecast, setForecast] = React.useState(null);
  const [recent, setRecent] = React.useState(() => JSON.parse(localStorage.getItem("atmosRecentReact") || "[]"));
  const [favorites, setFavorites] = React.useState(() => JSON.parse(localStorage.getItem("atmosFavorites") || "[]"));
  const [suggestions, setSuggestions] = React.useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = React.useState(false);
  const [suggesting, setSuggesting] = React.useState(false);
  const [activeSuggestion, setActiveSuggestion] = React.useState(0);
  const [referenceCoords, setReferenceCoords] = React.useState(defaultPlace);
  const [nearbyRequested, setNearbyRequested] = React.useState(false);
  const [liveLocation, setLiveLocation] = React.useState(true);
  const [darkMode, setDarkMode] = React.useState(() => localStorage.getItem("atmosTheme") === "dark");
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const liveLocationRef = React.useRef(true);
  const watchIdRef = React.useRef(null);

  React.useEffect(() => {
    const weatherClass = forecast ? codeInfo(forecast.current.weather_code)[2] : "clear";
    document.body.className = `${weatherClass}${darkMode ? " dark-mode" : ""}${loading ? " is-loading" : ""}`;
    localStorage.setItem("atmosTheme", darkMode ? "dark" : "light");
  }, [forecast, darkMode, loading]);

  React.useEffect(() => {
    startLiveLocation();
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    liveLocationRef.current = liveLocation;
  }, [liveLocation]);

  React.useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setSuggesting(true);
        const data = await requestJson(`/api/search?q=${encodeURIComponent(text)}`, {
          signal: controller.signal,
        });
        setSuggestions(rankSuggestions(data.results || [], referenceCoords));
        setSuggestionsOpen(true);
        setActiveSuggestion(0);
      } catch (error) {
        if (error.name !== "AbortError") {
          setSuggestions([]);
          setSuggestionsOpen(false);
        }
      } finally {
        setSuggesting(false);
      }
    }, 240);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, referenceCoords]);

  function flash(text) {
    setMessage(text);
    window.clearTimeout(window.atmosToast);
    window.atmosToast = window.setTimeout(() => setMessage(""), 3200);
  }

  function remember(nextPlace) {
    const next = [
      nextPlace,
      ...recent.filter((item) => `${item.name}-${item.country}` !== `${nextPlace.name}-${nextPlace.country}`),
    ].slice(0, 5);
    setRecent(next);
    localStorage.setItem("atmosRecentReact", JSON.stringify(next));
  }

  function placeKey(item) {
    return `${item.name}-${item.admin2 || ""}-${item.admin1 || ""}-${item.country || ""}`;
  }

  function isFavorite(item) {
    return favorites.some((favorite) => placeKey(favorite) === placeKey(item));
  }

  function toggleFavorite(item) {
    const exists = isFavorite(item);
    const next = exists
      ? favorites.filter((favorite) => placeKey(favorite) !== placeKey(item))
      : [item, ...favorites].slice(0, 6);
    setFavorites(next);
    localStorage.setItem("atmosFavorites", JSON.stringify(next));
  }

  async function loadWeather(nextPlace, shouldRemember = true) {
    try {
      setLoading(true);
      const timezone = encodeURIComponent(nextPlace.timezone || "auto");
      const data = await api(`/api/weather?latitude=${nextPlace.latitude}&longitude=${nextPlace.longitude}&timezone=${timezone}`);
      setPlace(nextPlace);
      setForecast(data);
      setReferenceCoords(nextPlace);
      if (shouldRemember) remember(nextPlace);
    } catch (error) {
      flash(error.message || "Could not load weather.");
    } finally {
      setLoading(false);
    }
  }

  async function submitSearch(event) {
    event.preventDefault();
    if (!query.trim()) return;
    setLiveLocation(false);
    liveLocationRef.current = false;
    if (suggestions.length) {
      await selectSuggestion(suggestions[activeSuggestion] || suggestions[0]);
      return;
    }
    try {
      setLoading(true);
      const data = await api(`/api/search?q=${encodeURIComponent(query.trim())}`);
      setQuery("");
      await loadWeather(rankSuggestions(data.results || [], referenceCoords)[0]);
    } catch (error) {
      flash(error.message || "City search failed.");
      setLoading(false);
    }
  }

  async function selectSuggestion(nextPlace) {
    setLiveLocation(false);
    liveLocationRef.current = false;
    setQuery("");
    setSuggestions([]);
    setSuggestionsOpen(false);
    await loadWeather(nextPlace);
  }

  function handleSearchKeyDown(event) {
    if (!suggestionsOpen || !suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((index) => Math.min(index + 1, suggestions.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Escape") {
      setSuggestionsOpen(false);
    }
  }

  function prepareNearbySearch() {
    if (nearbyRequested || !navigator.geolocation) return;
    setNearbyRequested(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setReferenceCoords({ latitude: coords.latitude, longitude: coords.longitude }),
      () => undefined,
      { maximumAge: 600000, timeout: 5000 }
    );
  }

  function startLiveLocation() {
    if (!navigator.geolocation) {
      flash("Location is not available, showing India as a fallback.");
      loadWeather(defaultPlace, false);
      return;
    }

    setLiveLocation(true);
    liveLocationRef.current = true;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async ({ coords }) => {
        const currentCoords = {
          latitude: Number(coords.latitude.toFixed(5)),
          longitude: Number(coords.longitude.toFixed(5)),
        };
        setReferenceCoords(currentCoords);
        if (!liveLocationRef.current) return;

        try {
          const data = await api(`/api/reverse?latitude=${currentCoords.latitude}&longitude=${currentCoords.longitude}`);
          await loadWeather(
            {
              ...data.place,
              latitude: currentCoords.latitude,
              longitude: currentCoords.longitude,
              liveLocation: true,
            },
            false
          );
        } catch {
          await loadWeather(
            {
              name: "Your current location",
              country: "",
              latitude: currentCoords.latitude,
              longitude: currentCoords.longitude,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              liveLocation: true,
            },
            false
          );
        }
      },
      () => {
        flash("Allow location permission to show your current weather. Showing India fallback for now.");
        loadWeather(defaultPlace, false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 12000,
      }
    );
  }

  function useLocation() {
    startLiveLocation();
  }

  const view = React.useMemo(() => buildView(forecast), [forecast]);

  return (
    <>
      <main className="app-shell">
        <section className="weather-stage" aria-label="Current weather">
          <div className="topbar">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">☁️</span>
              <div>
                <p>Atmos Weather</p>
                <span>Live sky near you</span>
              </div>
            </div>

            <form className="search" onSubmit={submitSearch}>
              <Search size={20} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => {
                  prepareNearbySearch();
                  if (query.trim().length >= 2) setSuggestionsOpen(true);
                }}
                onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 140)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search area, city, state, country"
                aria-expanded={suggestionsOpen}
                aria-controls="locationSuggestions"
              />
              <button disabled={loading}>{loading ? "..." : "Find"}</button>
              <button className="mode-button" type="button" onClick={() => setDarkMode((value) => !value)} title="Toggle dark mode" aria-label="Toggle dark mode">
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              {suggestionsOpen && (
                <div className="suggestions" id="locationSuggestions" role="listbox">
                  {suggesting && <div className="suggestion-status">Finding exact places...</div>}
                  {!suggesting && suggestions.length === 0 && <div className="suggestion-status">No matching places found.</div>}
                  {suggestions.map((item, index) => (
                    <button
                      className={`suggestion-item ${activeSuggestion === index ? "active" : ""}`}
                      key={`${item.id || item.name}-${item.latitude}-${item.longitude}`}
                      type="button"
                      role="option"
                      aria-selected={activeSuggestion === index}
                      onMouseEnter={() => setActiveSuggestion(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSuggestion(item)}
                    >
                      <span>
                        <strong>{placeDetail(item)}</strong>
                        <small>{item.approximate ? `Approx weather point · ${coordinatesLabel(item)}` : coordinatesLabel(item)}</small>
                      </span>
                      {item.distance !== null && (
                        <em>{item.distance <= 100 ? "Nearby" : `${item.distance.toLocaleString()} km`}</em>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </form>
          </div>

          <div className="hero-grid">
            <div className="current-panel">
              <div className="location-line">
                <span>{placeLabel(place)}</span>
                <button className="icon-button" type="button" onClick={useLocation} title="Use my location" aria-label="Use my location">
                  <Crosshair size={20} />
                </button>
                <button className={`icon-button ${isFavorite(place) ? "favorite-active" : ""}`} type="button" onClick={() => toggleFavorite(place)} title="Save favorite" aria-label="Save favorite">
                  <Heart size={20} />
                </button>
              </div>
              <div className="temperature-row">
                <div>
                  <span className="temperature">{view.temp}</span>
                  <span className="degree">°C</span>
                </div>
                <div className="weather-orb" aria-hidden="true">
                  <span>{view.icon}</span>
                </div>
              </div>
              <h1>{view.condition}</h1>
              <p>{view.narrative}</p>
              <div className="quick-stats">
                <Stat label="Feels" value={`${view.feels}°`} />
                <Stat label="Wind" value={`${view.wind} km/h`} />
                <Stat label="Rain" value={`${view.rain}%`} />
              </div>
            </div>

            <aside className="insight-panel">
              <div className="panel-heading">
                <span>Today Lens</span>
                <strong>{view.date}</strong>
              </div>
              <div className="comfort-meter">
                <div className="meter-ring" style={{ "--score": view.score }}>
                  <span>{view.score}</span>
                </div>
                <div>
                  <h2>{view.score >= 78 ? "Easy weather" : view.score >= 55 ? "Balanced weather" : "Challenging weather"}</h2>
                  <p>Comfort is {view.score}/100 after balancing heat, humidity, wind, UV, and rain risk.</p>
                </div>
              </div>
              <div className="sun-track">
                <div>
                  <span>Sunrise</span>
                  <strong>{view.sunrise}</strong>
                </div>
                <div className="sun-line"><span style={{ left: `${view.sunProgress}%` }} /></div>
                <div>
                  <span>Sunset</span>
                  <strong>{view.sunset}</strong>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="content-grid">
          <section className="forecast-panel">
            <div className="section-title">
              <h2>Next 12 Hours</h2>
              <span>Updated {view.updated}</span>
            </div>
            <div className="hourly-strip">
              {view.hourly.map((hour) => <HourCard key={hour.time} hour={hour} />)}
            </div>
          </section>

          <section className="forecast-panel">
            <div className="section-title">
              <h2>7 Day Outlook</h2>
              <span>Highs, lows, and rain risk</span>
            </div>
            <ForecastGraph daily={view.daily} />
            <div className="daily-list">
              {view.daily.map((day) => <DayRow key={day.time} day={day} />)}
            </div>
          </section>

          <section className="forecast-panel">
            <div className="section-title">
              <h2>Rain Probability</h2>
              <span>Next 12 hours</span>
            </div>
            <PrecipChart hourly={view.hourly} />
          </section>

          <section className="forecast-panel">
            <div className="section-title">
              <h2>Smart Summary</h2>
              <span>What matters now</span>
            </div>
            <SmartCards view={view} />
          </section>

          <aside className="side-column">
            <section className="forecast-panel compact">
              <div className="section-title"><h2>Air & Motion</h2></div>
              <div className="metric-grid">
                <Stat label="Humidity" value={`${view.humidity}%`} />
                <Stat label="Pressure" value={`${view.pressure} hPa`} />
                <Stat label="UV Index" value={view.uv} />
                <Stat label="Visibility" value={`${view.visibility} km`} />
                <Stat label="AQI" value={`${view.aqi}`} />
                <Stat label="Wind Dir" value={view.windDirection} />
              </div>
            </section>

            <section className="forecast-panel compact">
              <div className="section-title">
                <h2>Favorites</h2>
              </div>
              <div className="recent-list">
                {favorites.length ? favorites.map((item) => (
                  <button key={placeKey(item)} onClick={() => loadWeather(item)}>{placeLabel(item)}</button>
                )) : <p className="empty-state">Tap the heart on a location to save it.</p>}
              </div>
            </section>

            <section className="forecast-panel compact">
              <div className="section-title">
                <h2>Recent Places</h2>
                <button className="text-button" onClick={() => { setRecent([]); localStorage.removeItem("atmosRecentReact"); }}>Clear</button>
              </div>
              <div className="recent-list">
                {recent.length ? recent.map((item) => (
                  <button key={`${item.name}-${item.country}`} onClick={() => loadWeather(item)}>{placeLabel(item)}</button>
                )) : <p className="empty-state">Search a city to build your quick list.</p>}
              </div>
            </section>
          </aside>
        </section>
      </main>
      <div className={`toast ${message ? "show" : ""}`}>{message}</div>
    </>
  );
}

function buildView(forecast) {
  if (!forecast) {
    return {
      temp: "--",
      condition: "Finding the sky...",
      icon: "◌",
      narrative: "Your personalized forecast will appear here in a moment.",
      feels: "--",
      wind: "--",
      rain: "--",
      date: "--",
      score: 0,
      sunrise: "--",
      sunset: "--",
      sunProgress: 50,
      updated: "--",
      humidity: "--",
      pressure: "--",
      uv: "--",
      visibility: "--",
      aqi: "--",
      aqiLabel: "Unknown",
      aqiText: "Air quality is loading.",
      windDirection: "--",
      uvText: "UV data is loading.",
      activity: "Loading outdoor guidance.",
      summary: "Weather details are loading.",
      hourly: [],
      daily: [],
    };
  }

  const current = forecast.current;
  const [condition, iconType] = codeInfo(current.weather_code);
  const currentHour = Math.max(0, forecast.hourly.time.findIndex((time) => time >= current.time));
  const rain = forecast.hourly.precipitation_probability[currentHour] ?? forecast.daily.precipitation_probability_max[0] ?? 0;
  const uv = Math.round(forecast.hourly.uv_index[currentHour] ?? 0);
  const score = comfortScore(current, rain, uv);
  const airHourly = forecast.air_quality?.hourly;
  const airHour = airHourly?.time?.findIndex((time) => time >= current.time) ?? -1;
  const aqiIndex = airHour >= 0 ? airHour : 0;
  const aqi = Math.round(airHourly?.us_aqi?.[aqiIndex] ?? 0) || "--";
  const [aqiLabelText, aqiText] = aqiLevel(aqi);
  const sunriseMinutes = minutesFromTime(forecast.daily.sunrise[0]);
  const sunsetMinutes = minutesFromTime(forecast.daily.sunset[0]);
  const nowMinutes = minutesFromTime(current.time);
  const highs = forecast.daily.temperature_2m_max;
  const lows = forecast.daily.temperature_2m_min;
  const min = Math.min(...lows);
  const max = Math.max(...highs);

  return {
    temp: Math.round(current.temperature_2m),
    condition,
    icon: weatherIcon(iconType),
    narrative: narrative(score, condition, rain, current.wind_speed_10m),
    feels: Math.round(current.apparent_temperature),
    wind: Math.round(current.wind_speed_10m),
    rain,
    date: longDate(current.time),
    score,
    sunrise: localTime(forecast.daily.sunrise[0]),
    sunset: localTime(forecast.daily.sunset[0]),
    sunProgress: Math.max(4, Math.min(96, ((nowMinutes - sunriseMinutes) / (sunsetMinutes - sunriseMinutes)) * 100)),
    updated: localTime(current.time),
    humidity: current.relative_humidity_2m,
    pressure: Math.round(current.pressure_msl),
    uv,
    visibility: Math.round((forecast.hourly.visibility[currentHour] ?? 0) / 1000),
    aqi,
    aqiLabel: aqiLabelText,
    aqiText,
    windDirection: compassDirection(current.wind_direction_10m || forecast.hourly.wind_direction_10m?.[currentHour] || 0),
    windDegrees: Math.round(current.wind_direction_10m || forecast.hourly.wind_direction_10m?.[currentHour] || 0),
    uvText: uvRisk(uv),
    activity: activityTip({ aqi: aqi === "--" ? 0 : aqi, rain, uv, score }),
    summary: `${condition}, ${Math.round(current.temperature_2m)}°C, ${rain}% rain, wind ${Math.round(current.wind_speed_10m)} km/h ${compassDirection(current.wind_direction_10m || 0)}.`,
    hourly: forecast.hourly.time.slice(currentHour, currentHour + 12).map((time, offset) => {
      const index = currentHour + offset;
      const [hourCondition, hourIcon] = codeInfo(forecast.hourly.weather_code[index]);
      return {
        time,
        label: localTime(time),
        condition: hourCondition,
        icon: weatherIcon(hourIcon),
        temp: Math.round(forecast.hourly.temperature_2m[index]),
        rain: forecast.hourly.precipitation_probability[index] ?? 0,
        wind: Math.round(forecast.hourly.wind_speed_10m?.[index] ?? current.wind_speed_10m),
        direction: compassDirection(forecast.hourly.wind_direction_10m?.[index] ?? current.wind_direction_10m ?? 0),
      };
    }),
    daily: forecast.daily.time.map((time, index) => {
      const [dayCondition, dayIcon] = codeInfo(forecast.daily.weather_code[index]);
      return {
        time,
        label: index === 0 ? "Today" : localDay(time),
        condition: dayCondition,
        icon: weatherIcon(dayIcon),
        low: Math.round(lows[index]),
        high: Math.round(highs[index]),
        rain: forecast.daily.precipitation_probability_max[index] ?? 0,
        width: ((highs[index] - lows[index]) / Math.max(1, max - min)) * 60 + 32,
      };
    }),
  };
}

function Stat({ label, value }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function HourCard({ hour }) {
  return (
    <article className="hour-card">
      <time>{hour.label}</time>
      <span className="symbol" title={hour.condition}>{hour.icon}</span>
      <strong>{hour.temp}°</strong>
      <span className="rain-pill">{hour.rain}% rain</span>
      <small>{hour.wind} km/h {hour.direction}</small>
    </article>
  );
}

function DayRow({ day }) {
  return (
    <article className="day-row">
      <span>{day.label}</span>
      <span className="symbol" title={day.condition}>{day.icon}</span>
      <div className="range-bar" style={{ width: `${day.width}%` }} />
      <strong>{day.low}° / {day.high}° · {day.rain}%</strong>
    </article>
  );
}

function ForecastGraph({ daily }) {
  if (!daily.length) return <div className="chart-empty">Loading forecast graph...</div>;
  const min = Math.min(...daily.map((day) => day.low));
  const max = Math.max(...daily.map((day) => day.high));
  return (
    <div className="forecast-graph" aria-label="7 day temperature graph">
      {daily.map((day) => {
        const height = Math.max(18, ((day.high - min) / Math.max(1, max - min)) * 88);
        return (
          <div className="graph-day" key={day.time}>
            <span>{day.high}°</span>
            <i style={{ height: `${height}px` }} />
            <strong>{day.label}</strong>
          </div>
        );
      })}
    </div>
  );
}

function PrecipChart({ hourly }) {
  if (!hourly.length) return <div className="chart-empty">Loading rain chart...</div>;
  return (
    <div className="precip-chart" aria-label="Precipitation probability chart">
      {hourly.map((hour) => (
        <div className="precip-bar" key={hour.time}>
          <span>{hour.rain}%</span>
          <i style={{ height: `${Math.max(8, hour.rain)}%` }} />
          <small>{hour.label.replace(":00", "")}</small>
        </div>
      ))}
    </div>
  );
}

function SmartCards({ view }) {
  return (
    <div className="smart-grid">
      <article>
        <span>Weather Summary</span>
        <strong>{view.summary}</strong>
      </article>
      <article>
        <span>Air Quality</span>
        <strong>{view.aqiLabel}</strong>
        <p>{view.aqiText}</p>
      </article>
      <article>
        <span>UV Risk</span>
        <strong>UV {view.uv}</strong>
        <p>{view.uvText}</p>
      </article>
      <article>
        <span>Outdoor Plan</span>
        <strong>{view.activity}</strong>
      </article>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
