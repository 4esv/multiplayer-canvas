import config from '../config.js'
import { fetchUpstream } from '../lib/http.js'

// seam: test/outlook.test.js (every code lands on a row of the sky)
export const CONDITION_BY_CODE = {
  0: 'clear',
  1: 'mostly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'fog',
  51: 'drizzle',
  53: 'drizzle',
  55: 'drizzle',
  56: 'freezing drizzle',
  57: 'freezing drizzle',
  61: 'rain',
  63: 'rain',
  65: 'heavy rain',
  66: 'freezing rain',
  67: 'freezing rain',
  71: 'snow',
  73: 'snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'showers',
  81: 'showers',
  82: 'showers',
  85: 'snow showers',
  86: 'snow showers',
  95: 'thunder',
  96: 'thunder',
  99: 'thunder',
}

// 5-minute TTL with last-known-good: the background refresh and the canvas
// data feed share one upstream call. Open-Meteo needs no key; the place is
// site.config.js `weather` (lat, lon, place).
const CACHE_TTL_MS = 5 * 60 * 1000
let cache = { value: null, at: 0 }

export async function getCurrentWeather({ lat, lon, place } = config.weather) {
  if (cache.value && Date.now() - cache.at < CACHE_TTL_MS) return cache.value
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,is_day` +
    `&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset` +
    `&temperature_unit=fahrenheit&timezone=auto&forecast_days=1` +
    // epoch seconds, so the sky's hour is the visitor's clock against the
    // real sunrise and sunset with no time zone parsed on either side
    `&timeformat=unixtime`

  try {
    const res = await fetchUpstream(url)
    if (!res.ok) return cache.value ?? null
    const data = await res.json()
    const cur = data.current
    const daily = data.daily
    // Shape-guard before caching: a partial payload (no current temperature)
    // must not fossilize a NaN. Throw so the catch keeps last-known-good, or
    // null on a cold cache, exactly like a network failure. The daily block
    // is secondary (high/low null out) and does not gate the temp tile.
    if (!cur || cur.temperature_2m == null) throw new Error('weather: missing current')
    const code = cur.weather_code
    const high = daily?.temperature_2m_max?.[0]
    const low = daily?.temperature_2m_min?.[0]
    const rise = daily?.sunrise?.[0]
    const set = daily?.sunset?.[0]
    const value = {
      tempF: Math.round(cur.temperature_2m),
      condition: CONDITION_BY_CODE[code] || 'unknown',
      conditionCode: code,
      isDay: cur.is_day === 1,
      highF: high != null ? Math.round(high) : null,
      lowF: low != null ? Math.round(low) : null,
      sunrise: Number.isFinite(rise) ? rise : null,
      sunset: Number.isFinite(set) ? set : null,
      place,
    }
    cache = { value, at: Date.now() }
    return value
  } catch {
    return cache.value ?? null
  }
}
