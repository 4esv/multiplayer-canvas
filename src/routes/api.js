import { publish } from 'multiplayer-canvas/presence/room'
import {
  changedKeys,
  getCanvasBoot,
  getCanvasData,
  refreshCanvasData,
} from '../services/canvas-data.js'
import { getCurrentWeather } from '../services/weather.js'
import { SERVER_PUSH } from 'multiplayer-canvas/presence/wire'

const REFRESH_INTERVAL = 5 * 60 * 1000

// NOTE: shared page data for the terminal/retro home (pages/home.njk), the
// one surface reading it: the weather line.
let pageData = { weather: null }

async function refreshData(config) {
  const weather = await getCurrentWeather(config.weather).catch(() => null)
  pageData = { weather }

  // AFTER the page-data fetch settles, so the weather cache is warm and the
  // canvas refresh reads it instead of racing the same upstream. Its per-key
  // fallback handles errors.
  await refreshCanvasAndPublish(config).catch(() => null)
}

/**
 * Refresh the canvas payload, then tell every open tab what moved.
 * @param {object} config
 * @param {object} [loaders] injected upstreams, same shape getCanvasData takes
 * @returns {Promise<string[]>} the keys that changed (empty when nothing did)
 *
 * This is the one place in the process that knows fresh data landed, so it is
 * the only place allowed to publish. Two properties follow from that:
 *
 *   Idempotency. Every client hears one message from one poll and reads back
 *   the same /api/canvas, which is served out of the same warm per-key cache.
 *   Nobody's tile can disagree with anybody else's, which is the correctness
 *   bar the canvas holds itself to (BIBLE.md sections 5 and 12).
 *
 *   Sync. A tab sees a new reading in seconds instead of waiting up to five
 *   minutes for its own poll to come round.
 *
 * The frame is a nudge, not the payload. A stale frame measures 48 bytes
 * against the 7.9KB /api/canvas was serving in production when this was
 * written, so the bytes matter (48 x 256 sockets is 12KB, the payload is 2MB)
 * but they are not the reason. The reason is that the client has exactly one
 * way to apply fresh data, and pushing the data would give it a second one:
 * two transports carrying the same object is two things that can disagree,
 * and the poll path would rot the moment the push path diverged. The keys
 * travel, the bytes stay behind /api/canvas.
 *
 * Loaders are injectable for the same reason getCanvasData's are: the push
 * path is exercised end to end by test without touching the network.
 */
// seam: test/presence.test.js
export async function refreshCanvasAndPublish(config, loaders = {}) {
  const before = getCanvasBoot()
  const after = await refreshCanvasData(config, loaders)
  const keys = changedKeys(before, after)
  // every room: a session's tabs read the same /api/canvas as the public room's
  if (keys.length) publish({ type: SERVER_PUSH.stale, keys })
  return keys
}

export async function apiRoutes(fastify) {
  const { config } = fastify

  // Health check for Docker and uptime monitoring
  fastify.get('/health', async () => ({ status: 'ok' }))

  // Everything the canvas tiles show, live with per-key snapshot fallback.
  // The shell SSRs the same object into the boot payload; this endpoint is
  // the client refresh loop's source. no-cache so a proxy never serves a
  // stale tile past the server's own 5-min cadence.
  fastify.get('/api/canvas', async (_request, reply) => {
    reply.header('cache-control', 'no-cache')
    return getCanvasData(config)
  })

  // Background refresh on startup + interval. Caught so a sync throw inside
  // refreshData doesn't become an unhandled rejection at boot. Gated out of
  // the test env: every build() would otherwise fire live requests at
  // open-meteo from every test file, and the pages
  // degrade to the same nulls/snapshot the tests already assert against.
  if (config.env !== 'test') {
    refreshData(config).catch((err) => fastify.log.warn({ err }, 'refreshData failed'))
    setInterval(
      () => refreshData(config).catch((err) => fastify.log.warn({ err }, 'refreshData failed')),
      REFRESH_INTERVAL
    ).unref()
  }
}

export function getPageData() {
  return pageData
}
