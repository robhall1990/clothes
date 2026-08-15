// Local weather for outfit suggestions, via Open-Meteo.
//
// Chosen because it needs no API key and sends permissive CORS headers, so it
// works from a static GitHub Pages site with nothing to configure. Location
// comes from the browser's geolocation prompt; if the user declines (or
// anything else fails) every call degrades to null and the app carries on
// without weather rather than nagging.
const WardrobeWeather = (function () {
  "use strict";

  const CACHE_KEY = "wardrobe-capsule-weather-v1";
  const CACHE_TTL_MS = 60 * 60 * 1000; // an hour is plenty for "what to wear"

  // WMO weather interpretation codes, condensed to what changes an outfit.
  function describeCode(code) {
    if (code === 0) return "clear";
    if (code <= 3) return "partly cloudy";
    if (code === 45 || code === 48) return "foggy";
    if (code >= 51 && code <= 57) return "drizzly";
    if (code >= 61 && code <= 67) return "rainy";
    if (code >= 71 && code <= 77) return "snowy";
    if (code >= 80 && code <= 82) return "rain showers";
    if (code === 85 || code === 86) return "snow showers";
    if (code >= 95) return "thunderstorms";
    return "mixed";
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (!cached || Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
      return cached.weather;
    } catch (e) {
      return null;
    }
  }

  function writeCache(weather) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), weather }));
    } catch (e) {
      /* non-fatal */
    }
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("geolocation unavailable"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 8000,
        maximumAge: 30 * 60 * 1000,
        enableHighAccuracy: false,
      });
    });
  }

  async function fetchForecast(lat, lon) {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=" +
      encodeURIComponent(lat.toFixed(2)) +
      "&longitude=" +
      encodeURIComponent(lon.toFixed(2)) +
      "&current=temperature_2m,apparent_temperature,weather_code" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code" +
      "&timezone=auto&forecast_days=1";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const json = await res.json();
      const current = json.current || {};
      const daily = json.daily || {};
      const pick = (arr) => (Array.isArray(arr) ? arr[0] : undefined);

      const code = typeof current.weather_code === "number" ? current.weather_code : pick(daily.weather_code);
      return {
        tempC: Math.round(current.temperature_2m),
        feelsLikeC: Math.round(current.apparent_temperature),
        highC: Math.round(pick(daily.temperature_2m_max)),
        lowC: Math.round(pick(daily.temperature_2m_min)),
        rainChance: pick(daily.precipitation_probability_max),
        condition: describeCode(code),
      };
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Returns a weather object or null. Never throws, never blocks the UI for
  // long — callers render fine without it.
  async function get({ force } = {}) {
    if (!force) {
      const cached = readCache();
      if (cached) return cached;
    }
    try {
      const pos = await getPosition();
      const weather = await fetchForecast(pos.coords.latitude, pos.coords.longitude);
      if (weather && typeof weather.tempC === "number" && !isNaN(weather.tempC)) {
        writeCache(weather);
        return weather;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // Cached value only — for synchronous render paths that shouldn't trigger a
  // geolocation prompt on their own.
  function getCached() {
    return readCache();
  }

  function summarise(weather) {
    if (!weather) return "";
    const parts = [weather.tempC + "°C", weather.condition];
    if (typeof weather.rainChance === "number" && weather.rainChance >= 30) {
      parts.push(weather.rainChance + "% rain");
    }
    return parts.join(" · ");
  }

  // The line handed to Gemini.
  function promptLine(weather) {
    if (!weather) return "";
    let line =
      "Today's local weather: " +
      weather.tempC +
      "°C (feels like " +
      weather.feelsLikeC +
      "°C), " +
      weather.condition +
      ", high " +
      weather.highC +
      "°C / low " +
      weather.lowC +
      "°C";
    if (typeof weather.rainChance === "number") line += ", " + weather.rainChance + "% chance of rain";
    line +=
      ". Dress for this specifically — match layer count and fabric weight to these temperatures, and " +
      "prefer something rain-appropriate if rain is likely.";
    return line;
  }

  return { get, getCached, summarise, promptLine, describeCode };
})();
