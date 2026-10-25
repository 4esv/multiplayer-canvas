// The canvas data feed: every live tile on the home canvas in one object,
// shaped exactly the way app.js consumes it. Each key is loaded through the
// same cached() pattern (5-min TTL, last-known-good on error) and
// falls back per key to the checked-in snapshot (src/data/canvas-fallback.json),
// so a dead upstream degrades one tile, never the canvas.
import { readFile } from 'node:fs/promises'

import config from '../config.js'
import { getCurrentWeather } from './weather.js'

const FALLBACK_URL = new URL('../data/canvas-fallback.json', import.meta.url)
const CACHE_TTL_MS = 5 * 60 * 1000

const snapshot = JSON.parse(await readFile(FALLBACK_URL, 'utf8'))

const cache = new Map()
// In-flight promises are shared: a burst of cold /api/canvas hits (or a TTL
// expiry under load) runs each loader once, never a stampede per caller.
const inflight = new Map()

// Per-key reachability, so a flapping upstream leaves one readable line per
// transition instead of either silence or a log per refresh. Only a genuine
// state CHANGE prints (live->fallback, fallback->live); the first success or
// first failure of a never-seen key is not a change and stays quiet.
const health = new Map()
function noteHealth(key, next) {
  const prev = health.get(key)
  if (prev && prev !== next) console.warn(`canvas-data: ${key} ${prev}->${next}`)
  health.set(key, next)
}

function cached(key, loader) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.value)
  if (inflight.has(key)) return inflight.get(key)
  const pending = (async () => {
    try {
      const value = await loader()
      cache.set(key, { at: Date.now(), value })
      noteHealth(key, 'live')
      return value
    } catch {
      // Fall back to last known good value on error, the snapshot merge below
      // covers the never-succeeded case.
      noteHealth(key, 'fallback')
      return hit?.value ?? null
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, pending)
  return pending
}

// Per-source freshness for the boot payload: the ISO of each key's last
// cached success. A key that has never succeeded is absent, so the integrator
// whispers "as of …" only where there is a real timestamp to whisper.
const FRESHNESS_KEYS = ['weather']
export function getFetchedAt() {
  const out = {}
  for (const key of FRESHNESS_KEYS) {
    const hit = cache.get(key)
    if (hit) out[key] = new Date(hit.at).toISOString()
  }
  return out
}

const defaultLoaders = {
  weather: (config) => getCurrentWeather(config.weather),
}

// `loaders` is injectable so tests can exercise the mapping and the per-key
// fallback without touching the network.
export async function getCanvasData(cfg = config, loaders = {}) {
  const load = { ...defaultLoaders, ...loaders }
  const snap = snapshot

  const weather = await cached('weather', () => load.weather(cfg))

  return {
    // isDay rides along so a clear night draws a moon, not a lie of a sun;
    // high/low are the day's real spread.
    weather: weather
      ? {
          tempF: weather.tempF,
          cond: weather.condition,
          place: weather.place || cfg.weather?.place || '',
          day: weather.isDay !== false,
          hi: weather.highF ?? null,
          lo: weather.lowF ?? null,
          // the day's real sunrise and sunset, epoch seconds: the sky's hour
          rise: weather.sunrise ?? null,
          set: weather.sunset ?? null,
        }
      : snap.weather,
  }
}

// The home shell reads synchronously: a render must never block on an
// upstream. The background refresh (routes/api.js) keeps lastGood warm;
// until the first refresh lands, the boot payload is the snapshot itself.
let lastGood = null

export async function refreshCanvasData(config, loaders = {}) {
  lastGood = await getCanvasData(config, loaders)
  return lastGood
}

export function getCanvasBoot() {
  return lastGood ?? snapshot
}

// Which keys moved between two of these payloads: the push asks it here and
// the tab asks it in app.js, so the diff and its key list are stated once,
// where the browser can load them (canvas/wire.js).
export { changedKeys } from 'multiplayer-canvas/presence/wire'
