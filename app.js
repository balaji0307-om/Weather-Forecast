const weatherCodeMap = {
  0: ["Clear sky", "☀", "clear"],
  1: ["Mainly clear", "◐", "clear"],
  2: ["Partly cloudy", "☁", "clear"],
  3: ["Overcast", "☁", "rainy"],
  45: ["Fog", "≋", "rainy"],
  48: ["Rime fog", "≋", "rainy"],
  51: ["Light drizzle", "◌", "rainy"],
  53: ["Drizzle", "◌", "rainy"],
  55: ["Dense drizzle", "◌", "rainy"],
  61: ["Light rain", "☂", "rainy"],
  63: ["Rain", "☂", "rainy"],
  65: ["Heavy rain", "☂", "rainy"],
  71: ["Light snow", "✳", "snowy"],
  73: ["Snow", "✳", "snowy"],
  75: ["Heavy snow", "✳", "snowy"],
  80: ["Rain showers", "☂", "rainy"],
  81: ["Showers", "☂", "rainy"],
  82: ["Violent showers", "☂", "stormy"],
  95: ["Thunderstorm", "⚡", "stormy"],
  96: ["Thunderstorm with hail", "⚡", "stormy"],
  99: ["Severe thunderstorm", "⚡", "stormy"]
};

const defaultPlace = {
  name: "Chennai",
  country: "India",
  latitude: 13.0878,
  longitude: 80.2785,
  timezone: "Asia/Kolkata"
};

const els = {
  form: document.querySelector("#searchForm"),
  input: document.querySelector("#cityInput"),
  geoButton: document.querySelector("#geoButton"),
  place: document.querySelector("#currentPlace"),
  temp: document.querySelector("#currentTemp"),
  orb: document.querySelector("#weatherOrb"),
  orbIcon: document.querySelector("#orbIcon"),
  condition: document.querySelector("#currentCondition"),
  narrative: document.querySelector("#weatherNarrative"),
  feels: document.querySelector("#feelsLike"),
  wind: document.querySelector("#windSpeed"),
  rain: document.querySelector("#rainChance"),
  date: document.querySelector("#todayDate"),
  score: document.querySelector("#comfortScore"),
  ring: document.querySelector("#comfortRing"),
  comfortTitle: document.querySelector("#comfortTitle"),
  comfortText: document.querySelector("#comfortText"),
  sunrise: document.querySelector("#sunrise"),
  sunset: document.querySelector("#sunset"),
  sunDot: document.querySelector("#sunDot"),
  updated: document.querySelector("#updatedAt"),
  hourly: document.querySelector("#hourlyStrip"),
  daily: document.querySelector("#dailyList"),
  humidity: document.querySelector("#humidity"),
  pressure: document.querySelector("#pressure"),
  uv: document.querySelector("#uvIndex"),
  visibility: document.querySelector("#visibility"),
  recent: document.querySelector("#recentList"),
  clearRecent: document.querySelector("#clearRecent"),
  toast: document.querySelector("#toast")
};

let toastTimer;

function formatTime(value) {
  const time = value.includes("T") ? value.split("T")[1] : value;
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(Date.UTC(2000, 0, 1, hour, minute || 0));
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(date);
}

function formatDay(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatLongDate(value) {
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function minutesFromLocalTime(value) {
  const time = value.includes("T") ? value.split("T")[1] : value;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + (minute || 0);
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3200);
}

function getCodeInfo(code) {
  return weatherCodeMap[code] || ["Changing weather", "◌", "clear"];
}

function setLoading(isLoading) {
  document.body.style.cursor = isLoading ? "progress" : "";
  els.form.querySelector("button").disabled = isLoading;
}

async function searchCity(query) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetch(url);
  if (!response.ok) throw new Error("City search failed");
  const data = await response.json();
  if (!data.results?.length) throw new Error("No city found");
  return data.results[0];
}

async function reverseGeocode(latitude, longitude) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetch(url);
  const data = await response.json();
  return data.results?.[0] || {
    name: "Your location",
    country: "",
    latitude,
    longitude,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

async function fetchForecast(place) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", place.latitude);
  url.searchParams.set("longitude", place.longitude);
  url.searchParams.set("timezone", place.timezone || "auto");
  url.searchParams.set("current", [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "precipitation",
    "weather_code",
    "pressure_msl",
    "wind_speed_10m"
  ].join(","));
  url.searchParams.set("hourly", [
    "temperature_2m",
    "precipitation_probability",
    "weather_code",
    "visibility",
    "uv_index"
  ].join(","));
  url.searchParams.set("daily", [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_probability_max",
    "sunrise",
    "sunset"
  ].join(","));
  url.searchParams.set("forecast_days", "7");

  const response = await fetch(url);
  if (!response.ok) throw new Error("Forecast failed");
  return response.json();
}

function calculateComfort(current, rainChance, uvIndex) {
  const temp = current.temperature_2m;
  const humidity = current.relative_humidity_2m;
  const wind = current.wind_speed_10m;
  let score = 100;

  score -= Math.abs(temp - 24) * 2.4;
  score -= Math.max(0, humidity - 55) * 0.28;
  score -= Math.max(0, wind - 14) * 0.8;
  score -= rainChance * 0.35;
  score -= Math.max(0, uvIndex - 7) * 4;

  return Math.max(12, Math.min(99, Math.round(score)));
}

function narrativeFor(score, condition, rainChance, windSpeed) {
  if (rainChance >= 70) return `A ${condition.toLowerCase()} pattern is likely. Keep plans flexible and expect wet windows through the day.`;
  if (windSpeed >= 28) return `${condition} with a lively breeze. Outdoor plans are fine, but loose items may need attention.`;
  if (score >= 78) return `${condition} and genuinely comfortable. It is a strong day for errands, walks, and open-window energy.`;
  if (score >= 55) return `${condition} with a few tradeoffs. The sky is workable, but check the hourly cards before heading out.`;
  return `${condition} with lower comfort. Dress with intention and keep an eye on wind, rain, or humidity shifts.`;
}

function saveRecent(place) {
  const recent = JSON.parse(localStorage.getItem("atmosRecent") || "[]");
  const next = [
    place,
    ...recent.filter(item => `${item.name}-${item.country}` !== `${place.name}-${place.country}`)
  ].slice(0, 5);
  localStorage.setItem("atmosRecent", JSON.stringify(next));
  renderRecent();
}

function renderRecent() {
  const recent = JSON.parse(localStorage.getItem("atmosRecent") || "[]");
  els.recent.innerHTML = "";

  if (!recent.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Search a city to build your quick list.";
    els.recent.appendChild(empty);
    return;
  }

  recent.forEach(place => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${place.name}${place.admin1 ? `, ${place.admin1}` : ""}${place.country ? ` · ${place.country}` : ""}`;
    button.addEventListener("click", () => loadPlace(place));
    els.recent.appendChild(button);
  });
}

function updateTheme(theme) {
  document.body.classList.remove("clear", "rainy", "stormy", "snowy");
  document.body.classList.add(theme);
}

function renderForecast(place, forecast) {
  const current = forecast.current;
  const timeZone = forecast.timezone;
  const [condition, symbol, theme] = getCodeInfo(current.weather_code);
  const currentHour = forecast.hourly.time.findIndex(time => time >= current.time);
  const hourStart = Math.max(0, currentHour);
  const rainChance = forecast.hourly.precipitation_probability[hourStart] ?? forecast.daily.precipitation_probability_max[0] ?? 0;
  const uvIndex = Math.round(forecast.hourly.uv_index[hourStart] ?? 0);
  const score = calculateComfort(current, rainChance, uvIndex);

  updateTheme(theme);
  els.place.textContent = `${place.name}${place.admin1 ? `, ${place.admin1}` : ""}${place.country ? ` · ${place.country}` : ""}`;
  els.temp.textContent = Math.round(current.temperature_2m);
  els.orbIcon.textContent = symbol;
  els.condition.textContent = condition;
  els.narrative.textContent = narrativeFor(score, condition, rainChance, current.wind_speed_10m);
  els.feels.textContent = `${Math.round(current.apparent_temperature)}°`;
  els.wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  els.rain.textContent = `${rainChance}%`;
  els.date.textContent = formatLongDate(current.time);
  els.score.textContent = score;
  els.ring.style.background = `conic-gradient(var(--accent) 0deg, var(--accent-2) ${score * 3.6}deg, rgba(23,32,42,0.12) ${score * 3.6}deg 360deg)`;
  els.comfortTitle.textContent = score >= 78 ? "Easy weather" : score >= 55 ? "Balanced weather" : "Challenging weather";
  els.comfortText.textContent = `Comfort is ${score}/100 after balancing heat, humidity, wind, UV, and rain risk.`;
  els.sunrise.textContent = formatTime(forecast.daily.sunrise[0]);
  els.sunset.textContent = formatTime(forecast.daily.sunset[0]);
  els.updated.textContent = `Updated ${formatTime(current.time)}`;
  els.humidity.textContent = `${current.relative_humidity_2m}%`;
  els.pressure.textContent = `${Math.round(current.pressure_msl)} hPa`;
  els.uv.textContent = uvIndex;
  els.visibility.textContent = `${Math.round((forecast.hourly.visibility[hourStart] ?? 0) / 1000)} km`;

  const sunrise = minutesFromLocalTime(forecast.daily.sunrise[0]);
  const sunset = minutesFromLocalTime(forecast.daily.sunset[0]);
  const now = minutesFromLocalTime(current.time);
  const sunProgress = Math.max(4, Math.min(96, ((now - sunrise) / (sunset - sunrise)) * 100));
  els.sunDot.style.left = `${sunProgress}%`;

  renderHourly(forecast, hourStart, timeZone);
  renderDaily(forecast, timeZone);
}

function renderHourly(forecast, start, timeZone) {
  els.hourly.innerHTML = "";
  const end = Math.min(start + 12, forecast.hourly.time.length);

  for (let index = start; index < end; index += 1) {
    const [condition, symbol] = getCodeInfo(forecast.hourly.weather_code[index]);
    const card = document.createElement("article");
    card.className = "hour-card";
    card.innerHTML = `
      <time>${formatTime(forecast.hourly.time[index])}</time>
      <span class="symbol" title="${condition}">${symbol}</span>
      <strong>${Math.round(forecast.hourly.temperature_2m[index])}°</strong>
      <span class="rain-pill">${forecast.hourly.precipitation_probability[index] ?? 0}% rain</span>
    `;
    els.hourly.appendChild(card);
  }
}

function renderDaily(forecast, timeZone) {
  els.daily.innerHTML = "";
  const highs = forecast.daily.temperature_2m_max;
  const lows = forecast.daily.temperature_2m_min;
  const min = Math.min(...lows);
  const max = Math.max(...highs);

  forecast.daily.time.forEach((day, index) => {
    const [condition, symbol] = getCodeInfo(forecast.daily.weather_code[index]);
    const low = Math.round(lows[index]);
    const high = Math.round(highs[index]);
    const width = ((high - low) / Math.max(1, max - min)) * 60 + 32;
    const row = document.createElement("article");
    row.className = "day-row";
    row.innerHTML = `
      <span>${index === 0 ? "Today" : formatDay(day)}</span>
      <span class="symbol" title="${condition}">${symbol}</span>
      <div class="range-bar" style="width:${width}%"></div>
      <strong>${low}° / ${high}° · ${forecast.daily.precipitation_probability_max[index] ?? 0}%</strong>
    `;
    els.daily.appendChild(row);
  });
}

async function loadPlace(place, shouldSave = true) {
  try {
    setLoading(true);
    const forecast = await fetchForecast(place);
    renderForecast(place, forecast);
    if (shouldSave) saveRecent(place);
  } catch (error) {
    showToast(error.message || "Could not load weather. Please try again.");
  } finally {
    setLoading(false);
  }
}

els.form.addEventListener("submit", async event => {
  event.preventDefault();
  const query = els.input.value.trim();
  if (!query) return;

  try {
    setLoading(true);
    const place = await searchCity(query);
    els.input.value = "";
    await loadPlace(place);
  } catch (error) {
    showToast(error.message === "No city found" ? "I could not find that city." : "Search failed. Check your connection and try again.");
  } finally {
    setLoading(false);
  }
});

els.geoButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showToast("Geolocation is not available in this browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(async position => {
    const { latitude, longitude } = position.coords;
    try {
      const place = await reverseGeocode(latitude, longitude);
      await loadPlace(place);
    } catch {
      await loadPlace({
        name: "Your location",
        country: "",
        latitude,
        longitude,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
    }
  }, () => showToast("Location permission was not granted."));
});

els.clearRecent.addEventListener("click", () => {
  localStorage.removeItem("atmosRecent");
  renderRecent();
});

renderRecent();
loadPlace(defaultPlace, false);
