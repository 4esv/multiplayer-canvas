import { existsSync } from 'fs'
import { networkInterfaces } from 'os'
import { join } from 'path'

import Fastify, { LogController } from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyView from '@fastify/view'
import nunjucks from 'nunjucks'

import config from './config.js'
import { registerErrorHandler } from './errors/handler.js'
import { imgVersion } from './lib/img-version.js'
import { INLINE_SCRIPTS_CSP } from './lib/import-map.js'
import { onSessionEnd } from 'multiplayer-canvas/rooms'
import { audit } from './services/audit.js'
import { registerFilters, registerGlobals } from './lib/template-helpers.js'
import { registerGridMiddleware } from './middleware/grid.js'
import { registerAboutRoutes } from './routes/about.js'
import { registerCanvasRoutes } from './routes/canvas.js'
import { registerDocRoutes } from './routes/docs.js'
import { apiRoutes, getPageData } from './routes/api.js'
import { registerAdminRoutes } from './routes/admin.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerFeedRoutes } from './routes/feed.js'
import { registerHomeRoutes } from './routes/home.js'
import { registerLlmsRoute } from './routes/llms.js'
import { registerMetaRoutes } from './routes/meta.js'
import { registerPageRoutes } from './routes/pages.js'
import { registerPresenceRoutes } from './routes/presence.js'
import { registerRoomRoutes } from './routes/rooms.js'
import { registerSitemapRoute } from './routes/sitemap.js'
import { registerKitRoutes } from './routes/kit.js'
import { registerWorkRoutes } from './routes/work.js'
import { ensureSetupCode, isClaimed } from './services/auth.js'
import { startSlime } from 'multiplayer-canvas/slime/server'
import { startSky } from 'multiplayer-canvas/sky/server'

const TEMPLATES_DIR = join(import.meta.dirname, 'templates')
// Production serves the minified/content-hashed tree that
// scripts/build-assets.mjs wrote (the Docker assets stage runs it); dev and
// tests serve the committed sources raw. The manifest file is the marker
// that a built tree actually exists - a prod boot without one (local
// NODE_ENV=production run) falls back to raw sources, matching the identity
// asset() in template-helpers.
const DIST_STATIC_DIR = join(import.meta.dirname, '..', 'dist', 'static')
const HAS_BUILT_ASSETS =
  config.env === 'production' &&
  existsSync(join(import.meta.dirname, '..', 'dist', 'asset-manifest.json'))
const STATIC_DIR = HAS_BUILT_ASSETS ? DIST_STATIC_DIR : join(import.meta.dirname, 'static')
// the engine (primitives/), served at /primitives/: raw in dev, minified by
// the build in production, unhashed either way because its modules import
// each other by relative path
const PRIMITIVES_DIR = HAS_BUILT_ASSETS
  ? join(DIST_STATIC_DIR, 'primitives')
  : join(import.meta.dirname, '..', 'primitives')
const CSP_HEADER = [
  "default-src 'none'",
  `script-src 'self' 'inline-speculation-rules' ${INLINE_SCRIPTS_CSP}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  // Every pixel on the page comes from here: no third-party image host is
  // on the boot path.
  "img-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/**
 * Build and configure the Fastify application
 * @param {object} opts - Fastify options override
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
// seam: test/abyss.test.js, test/canvas-ssr.test.js, test/case-study-page.test.js, test/contact.test.js, test/crawlability.test.js, test/door-title.test.js, test/errors.test.js, test/first-paint.test.js, test/headers.test.js, test/img-version.test.js, test/jsonld.test.js, test/kit-tag.test.js, test/music-windows.test.js, test/og.test.js, test/page-bar.test.js, test/page-furniture.test.js, test/page-reader.test.js, test/page-ring.test.js, test/presence.test.js, test/retro.test.js, test/routes.test.js, test/routing.test.js, test/served-labels.test.js, test/shared-highlight.test.js, test/sitemap.test.js, test/stacks.test.js, test/sw.test.js, test/waste.test.js, test/watchdog.test.js, test/zones.test.js
export async function build(opts = {}) {
  const fastify = Fastify({
    logger: { level: config.logLevel },
    // No per-request lines from the app: the reverse proxy in front of it
    // writes the access log, since it is the one that sees the client
    // address. This process logs errors and warns here, and privileged
    // actions to the audit trail (services/audit.js).
    logController: new LogController({ disableRequestLogging: true }),
    // The proxy's private range in production, nobody anywhere else. See config.js.
    trustProxy: config.trustProxy || false,
    ...opts,
  })

  fastify.decorate('config', config)
  // Who is calling, once the session gate has run (middleware/auth.js). The
  // audit trail reads it; declared here so the property exists on every
  // request with a stable shape.
  fastify.decorateRequest('actor', null)
  nunjucks.configure(TEMPLATES_DIR, {
    autoescape: true,
    noCache: config.env === 'development',
  })

  await fastify.register(fastifyView, {
    engine: { nunjucks },
    root: TEMPLATES_DIR,
    viewExt: 'njk',
    options: {
      onConfigure: (env) => {
        registerFilters(env)
        registerGlobals(env)
      },
    },
  })

  registerGridMiddleware(fastify)
  // Before any route: fastify binds a route to the error handler its
  // context had when the route was added, so a handler set after them all
  // reaches only routes added later still, and a JSON body the parser
  // refused comes back in fastify's own shape.
  registerErrorHandler(fastify)

  // One URL per page. A `/work/` that 404s while `/work` serves turns every
  // hand-typed or hand-written trailing slash into a dead link and a
  // "Not found (404)" row in Search Console. Redirect instead of routing
  // both: two live URLs for one page would split the signal, which is the
  // problem the canonical tag then has to clean up. 301, not 308 - the
  // method is always GET here and 301 is what crawlers cache hardest.
  // onRequest runs before the 404 handler, so unmatched paths land here first.
  fastify.addHook('onRequest', async (request, reply) => {
    const [path, query] = request.url.split(/(?=\?)/)
    if (path.length > 1 && path.endsWith('/')) {
      return reply.redirect(path.replace(/\/+$/, '') + (query || ''), 301)
    }
  })

  // `?v=` equal to the hash of the bytes this path serves now
  const askedAtHash = (request) => {
    const [path, query] = request.url.split('?')
    const v = new URLSearchParams(query).get('v')
    return !!v && v === imgVersion(path.slice('/img/'.length))
  }

  await fastify.register(fastifyStatic, {
    root: STATIC_DIR,
    prefix: '/',
  })
  await fastify.register(fastifyStatic, {
    root: PRIMITIVES_DIR,
    prefix: '/primitives/',
    decorateReply: false,
  })

  // a room that ends on its own (idle, age) leaves a line in the trail
  onSessionEnd((ended) => audit(null, 'rooms.end', ended))

  // Cache policy: content-hashed css/js from the build (name-<8hex>.ext),
  // fonts, and images asked for at their own hash (/img/...?v=<hash8>) get a
  // year + immutable so browsers and the service worker can hold onto them
  // forever. Unhashed css/js (dev passthrough) get an hour with
  // stale-while-revalidate: fresh on the next request, but never a blank
  // tab on a deploy. Dev disables all caching.
  fastify.addHook('onSend', async (request, reply) => {
    const path = request.url.split('?')[0]
    // Site metadata matches none of the extension branches below; cache it
    // an hour in every environment (safe in dev, testable everywhere).
    if (path === '/robots.txt' || path === '/manifest.json' || path === '/desk.webmanifest') {
      reply.header('cache-control', 'public, max-age=3600')
    } else if (config.env === 'development') {
      if (/\.(css|js|njk|html)$/.test(path)) {
        reply.header('cache-control', 'no-store')
      }
    } else {
      if (path === '/sw.js') {
        // The service worker script must be revalidated on every visit so a
        // new worker (and the cache version baked into it) is adopted on the
        // next load, not up to an hour later. Under stale-while-revalidate a
        // stale worker keeps control and serves stale content (e.g. a home
        // page still linking a renamed route). no-cache, not no-store: a 304
        // is fine, a stale body is not.
        reply.header('cache-control', 'no-cache')
      } else if (/-[0-9a-f]{8}\.(css|js)$/.test(path) || /\.(woff2?|ttf|otf)$/.test(path)) {
        // `immutable` is a promise that this URL's bytes will never change,
        // so it may only be made where the URL moves with the content. Two
        // cases qualify: the build's content-hashed css/js, and the fonts,
        // whose filename names the face and weight (a different cut is a
        // different file, by convention this repo keeps).
        reply.header('cache-control', 'public, max-age=31536000, immutable')
      } else if (reply.statusCode === 200 && path.startsWith('/img/') && askedAtHash(request)) {
        // An image asked for at its own hash (lib/img-version.js).
        // Every /img URL the site emits carries `?v=<hash8>` of the file's
        // bytes, so a re-bake is a new URL and the promise can be made. Only
        // when the hash is the one on disk: a stale page asking for an old
        // hash, or a guessed one, gets the bytes under the week policy below
        // and never pins them for a year under a name that is not theirs.
        reply.header('cache-control', 'public, max-age=31536000, immutable')
      } else if (/\.(png|jpg|jpeg|gif|webp|avif|svg|ico)$/.test(path)) {
        // An image at a bare URL: the icons, the logo, or
        // an /img path a stale page still asks for without its hash. The
        // build does not rename them, so such a URL is stable while its bytes
        // are not: an OG card is regenerated whenever its title changes.
        // Serving those `immutable` for a year would let og-freshness.test.js
        // keep a card in sync with its title while every client that
        // had already fetched it kept the stale one for a year. A week fresh,
        // then revalidate in the background: a changed file reaches new
        // fetchers at once and everyone else within a week, and nothing pays
        // a round trip on the happy path.
        reply.header('cache-control', 'public, max-age=604800, stale-while-revalidate=2592000')
      } else if (/\.(css|js)$/.test(path)) {
        reply.header('cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
      } else if (!/\.[a-z0-9]+$/i.test(path)) {
        // HTML pages (extensionless routes): always revalidate, never serve
        // blind from cache. no-cache (not no-store) keeps bfcache and the
        // service worker's network-first navigations intact. A route or
        // middleware that already chose (the auth gate's private, no-store)
        // wins; the static branches above stay unconditional because
        // @fastify/static presets public, max-age=0 that must be replaced.
        if (!reply.getHeader('cache-control')) reply.header('cache-control', 'no-cache')
      }
    }
    reply.header('content-security-policy', CSP_HEADER)
    reply.header('x-content-type-options', 'nosniff')
    reply.header('referrer-policy', 'strict-origin-when-cross-origin')
    // HTTPS-only, one year, covers the (currently empty) subdomain space.
    // No `preload`: that's a one-way commitment to the browser preload list.
    reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains')
    // Belt-and-suspenders with CSP frame-ancestors 'none' for old browsers.
    reply.header('x-frame-options', 'DENY')
    // Deny the powerful features the site never uses; opt out of Topics.
    reply.header(
      'permissions-policy',
      'camera=(), microphone=(), geolocation=(), browsing-topics=()'
    )
  })

  await fastify.register(apiRoutes)
  fastify.decorate('getPageData', getPageData)

  await registerHomeRoutes(fastify)
  await registerAboutRoutes(fastify)
  await registerDocRoutes(fastify)
  await registerCanvasRoutes(fastify)
  await registerWorkRoutes(fastify)
  await registerFeedRoutes(fastify)
  await registerSitemapRoute(fastify)
  await registerLlmsRoute(fastify)
  await registerMetaRoutes(fastify)
  await registerPageRoutes(fastify)
  await registerAuthRoutes(fastify)
  await registerKitRoutes(fastify)
  await registerAdminRoutes(fastify)
  await registerRoomRoutes(fastify)
  await registerPresenceRoutes(fastify)

  return fastify
}

async function start() {
  // WARNING: no logger override here. build() defaults to pino at LOG_LEVEL,
  // which is the production error channel: the 500 handler and the background
  // refresher log through it. Booting with logger:false silently discards
  // every server error.
  const app = await build()

  try {
    await app.listen({ port: config.port, host: config.host })
    startSlime()
    startSky()

    // The one-time setup code is a human banner, not a log line; print it
    // directly so it shows regardless of LOG_LEVEL.
    if (!(await isClaimed())) {
      console.log('')
      console.log(`  Passkey: unclaimed. Setup code: ${await ensureSetupCode()}`)
    }

    console.log('')
    console.log(`  Local:   http://localhost:${config.port}`)
    if (config.host === '0.0.0.0') {
      for (const iface of Object.values(networkInterfaces()).flat()) {
        if (iface?.family === 'IPv4' && !iface.internal) {
          console.log(`  Network: http://${iface.address}:${config.port}`)
        }
      }
    }
    console.log('')
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start()
}
