// test/sw.test.js
// The service worker is the only part of the site that keeps running after a
// deploy, and its failure mode is silent: a worker that never yields control
// keeps serving the HTML shell it cached, so a visitor who comes back after a
// rename clicks a route the server no longer has. Nothing 500s, nothing shows
// up in the logs, and the browser is the one holding the stale bytes. Three
// things have to hold together for that not to happen:
//
//   (a) /sw.js is revalidated on every visit (cache-control: no-cache), so the
//       browser sees the new bytes at all. Under the stale-while-revalidate
//       policy the rest of the js gets, the old worker stays in charge for up
//       to an hour after a deploy.
//   (b) The new worker takes over on the spot (skipWaiting + clients.claim)
//       rather than waiting for every tab to close.
//   (c) The cache name comes from the built asset manifest, so a deploy lands
//       in a cache nothing has written to yet and activate() drops the rest.
//
// What this suite honestly cannot do: none of it runs in a browser. There is
// no ServiceWorkerGlobalScope, no real install/activate lifecycle, no
// CacheStorage, no navigation preload, no update-on-reload timing. Both sw.js
// and sw-register.js are classic (non-module) scripts, so they load into a
// Function scope with the globals they read passed in, and the handlers they
// register get called by hand. That covers the branch logic, which is where
// the bugs are. Whether Chrome actually adopts the new worker, and whether a
// precached response is really reused offline, needs a real browser and is not
// claimed here.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from '../src/server.js'
import { FIXTURES } from './fixtures.js'

const ROOT = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const WORKER_SRC = read('src/static/sw.js')
const REGISTER_SRC = read('src/static/js/sw-register.js')

const ORIGIN = 'https://example.com'
const flush = () => new Promise((resolve) => setImmediate(resolve))

// A CacheStorage stand-in. Only the calls the worker actually makes, keyed by
// URL the way the real thing keys same-method GETs, plus a log so a test can
// see what was written or dropped rather than inferring it.
function fakeCaches(seed = {}) {
  const store = new Map(
    Object.entries(seed).map(([name, entries]) => [name, new Map(Object.entries(entries))])
  )
  const log = { deleted: [], put: [], addAll: [], opened: [] }
  const key = (req) => (typeof req === 'string' ? req : req.url)
  const wrap = (entries) => ({
    match: async (req) => entries.get(key(req)),
    put: async (req, res) => {
      log.put.push(key(req))
      entries.set(key(req), res)
    },
    addAll: async (urls) => {
      log.addAll.push(...urls)
      for (const url of urls) entries.set(url, `precached ${url}`)
    },
  })
  return {
    log,
    entries: (name) => [...(store.get(name)?.keys() ?? [])],
    open: async (name) => {
      log.opened.push(name)
      if (!store.has(name)) store.set(name, new Map())
      return wrap(store.get(name))
    },
    keys: async () => [...store.keys()],
    delete: async (name) => {
      log.deleted.push(name)
      return store.delete(name)
    },
    match: async (req) => {
      for (const entries of store.values()) {
        const hit = entries.get(key(req))
        if (hit) return hit
      }
    },
  }
}

const offline = () => Promise.reject(new Error('offline'))
const request = (url, { method = 'GET', mode = 'no-cors' } = {}) => ({ url, method, mode })

function swEvent(req) {
  const event = {
    request: req,
    responded: undefined,
    waited: undefined,
    respondWith(promise) {
      event.responded = promise
    },
    waitUntil(promise) {
      event.waited = promise
    },
  }
  return event
}

// Load the real worker source into a scope holding the globals it reads, and
// hand back both its internals and the listeners it registered. Nothing here
// re-implements the worker: every assertion below runs its actual code.
function loadWorker({ assets = {}, version, caches = fakeCaches(), fetch = offline } = {}) {
  const listeners = {}
  const calls = { skipWaiting: 0, claim: 0 }
  const scope = {
    __ASSET_MANIFEST: assets,
    __CACHE_VERSION: version,
    location: { origin: ORIGIN },
    addEventListener: (type, handler) => {
      listeners[type] = handler
    },
    skipWaiting: () => {
      calls.skipWaiting += 1
    },
    clients: {
      claim: async () => {
        calls.claim += 1
      },
    },
  }
  const factory = new Function(
    'self',
    'caches',
    'fetch',
    `${WORKER_SRC}\nreturn { isStaticAsset, PRECACHE_URLS, CACHE_VERSION, ASSETS }`
  )
  return { ...factory(scope, caches, fetch), listeners, calls, caches }
}

describe('the production build stamps the worker with a content-derived cache version', () => {
  // scripts/build-assets.mjs derives its own root from its file location and
  // wipes dist/ before writing, so it runs against a throwaway copy of the
  // tree. The repo's dist/ is left alone: a production server may be serving
  // out of it right now.
  let sandbox
  const dist = () => join(sandbox, 'dist')
  const buildOnce = () => {
    execFileSync(process.execPath, [join(sandbox, 'scripts', 'build-assets.mjs')], {
      encoding: 'utf8',
    })
    const sw = readFileSync(join(dist(), 'static', 'sw.js'), 'utf8')
    return {
      sw,
      manifest: JSON.parse(readFileSync(join(dist(), 'asset-manifest.json'), 'utf8')),
      version: sw.match(/self\.__CACHE_VERSION=("[^"]+")/)?.[1],
    }
  }

  before(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'canvas-sw-'))
    mkdirSync(join(sandbox, 'scripts'), { recursive: true })
    cpSync(join(ROOT, 'scripts/build-assets.mjs'), join(sandbox, 'scripts/build-assets.mjs'))
    cpSync(join(ROOT, 'src/static'), join(sandbox, 'src/static'), { recursive: true })
    cpSync(join(ROOT, 'primitives'), join(sandbox, 'primitives'), { recursive: true })
    cpSync(join(ROOT, 'package.json'), join(sandbox, 'package.json'))
    symlinkSync(join(ROOT, 'node_modules'), join(sandbox, 'node_modules'))
  })

  after(() => {
    // Unlink the node_modules symlink first, deliberately: never hand a
    // recursive delete a live link into the real tree.
    unlinkSync(join(sandbox, 'node_modules'))
    rmSync(sandbox, { recursive: true, force: true })
  })

  it('injects a manifest and a cache version prologue ahead of the worker', () => {
    const { sw, manifest } = buildOnce()
    const prologue = sw.slice(0, sw.indexOf('\n'))
    assert.match(prologue, /^self\.__ASSET_MANIFEST=\{/, 'the manifest leads the file')
    assert.match(prologue, /self\.__CACHE_VERSION="canvas-[0-9a-f]{12}"/, 'a version follows it')

    const injected = JSON.parse(prologue.match(/self\.__ASSET_MANIFEST=(\{.*?\});self\./)[1])
    assert.deepEqual(injected, manifest, 'the injected map is dist/asset-manifest.json')
    assert.ok(Object.keys(injected).length > 10, 'the manifest is not empty')
    for (const [logical, hashed] of Object.entries(injected)) {
      assert.match(hashed, /-[0-9a-f]{8}\.(css|js)$/, `${logical} maps to a content-hashed name`)
      assert.ok(existsSync(join(dist(), 'static', hashed)), `${hashed} was written`)
    }
  })

  it('the version is the manifest hash and nothing else', () => {
    // Single source: the cache name is a pure function of the hashed asset
    // set, so a deploy that changes any css or js lands in a cache no older
    // worker ever wrote to.
    const { manifest, version } = buildOnce()
    const digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 12)
    assert.equal(version, JSON.stringify(`canvas-${digest}`))
  })

  // mutation: sw.version-from-worker-source
  it('rebuilds identically, and rolls the version when an asset changes', () => {
    const first = buildOnce()
    assert.equal(buildOnce().version, first.version, 'an unchanged tree is a stable version')

    const css = join(sandbox, 'primitives/kit/canvas-tokens.css')
    const original = readFileSync(css, 'utf8')
    try {
      writeFileSync(css, `${original}\n:root { --cv-nudge: 1px; }\n`)
      const rolled = buildOnce()
      assert.notEqual(rolled.version, first.version, 'a changed asset rolls the cache version')
      assert.notEqual(
        rolled.manifest['/primitives/kit/canvas-tokens.css'],
        first.manifest['/primitives/kit/canvas-tokens.css'],
        'and rolls the hashed filename with it'
      )
    } finally {
      writeFileSync(css, original)
    }
  })

  it('keeps the worker at its registration URL: unhashed, and out of the manifest', () => {
    // A hashed sw.js would be a new registration URL on every deploy, which
    // means the old worker is never replaced, only joined.
    const { manifest } = buildOnce()
    assert.ok(existsSync(join(dist(), 'static', 'sw.js')), 'dist/static/sw.js exists by name')
    assert.equal(manifest['/sw.js'], undefined, 'sw.js is not remapped')
    assert.deepEqual(
      Object.values(manifest).filter((v) => /sw(-[0-9a-f]{8})?\.js$/.test(v)),
      [],
      'no hashed copy of the worker was emitted'
    )
  })

  // mutation: sw.precache-renamed-logo
  it('resolves its precache list against the tree the build actually wrote', () => {
    // cache.addAll rejects as a unit: one 404 in this list and install fails,
    // so the worker never activates at all. Renaming logo.png without touching
    // the worker is the way that happens.
    const { manifest } = buildOnce()
    const { PRECACHE_URLS } = loadWorker({ assets: manifest })
    assert.ok(PRECACHE_URLS.includes('/'), 'the offline shell is precached')
    for (const url of PRECACHE_URLS) {
      if (url === '/') continue
      assert.ok(existsSync(join(dist(), 'static', url)), `precache target ${url} is missing`)
    }
  })
})

describe('the cache name has one source, so a stale cache is never reused', () => {
  // This used to grep sw.js for caches.open(...) and 'canvas-*' literals. The
  // handlers below hold the same fact by running: install opens the current
  // version, the asset path reads and writes it, activate drops the rest. A
  // second cache name fails those, and a correct rewrite does not.
  // mutation: sw.version-hardcoded
  it('falls back to a dev cache name when the build prologue is absent', () => {
    // npm run dev serves src/static raw, with no prologue in front of it.
    assert.equal(loadWorker().CACHE_VERSION, 'canvas-dev')
    assert.equal(loadWorker({ version: 'canvas-abc123' }).CACHE_VERSION, 'canvas-abc123')
  })
})

describe('the worker hands control to the new version instead of waiting', () => {
  // mutation: sw.install-waits
  it('install precaches the shell, then skips waiting', async () => {
    const caches = fakeCaches()
    const worker = loadWorker({ version: 'canvas-new', caches })
    const event = swEvent()
    worker.listeners.install(event)
    await event.waited

    assert.deepEqual(
      caches.log.opened,
      ['canvas-new'],
      'the precache goes into the current version'
    )
    assert.deepEqual(caches.log.addAll, worker.PRECACHE_URLS)
    assert.equal(worker.calls.skipWaiting, 1, 'without skipWaiting the old worker keeps control')
  })

  // mutation: sw.activate-no-claim
  it('activate drops every older cache and claims the open tabs', async () => {
    const caches = fakeCaches({
      'canvas-old': { '/': 'stale shell' },
      'canvas-older': { '/': 'staler shell' },
      'canvas-new': { '/': 'fresh shell' },
    })
    const worker = loadWorker({ version: 'canvas-new', caches })
    const event = swEvent()
    worker.listeners.activate(event)
    await event.waited

    assert.deepEqual(caches.log.deleted.sort(), ['canvas-old', 'canvas-older'])
    assert.deepEqual(await caches.keys(), ['canvas-new'], 'only the current cache survives')
    assert.equal(worker.calls.claim, 1, 'clients.claim is what makes the swap take effect now')
  })
})

describe('the fetch strategy', () => {
  const VERSION = 'canvas-new'

  // mutation: sw.static-forgets-glb
  it('isStaticAsset keys on the extension, never on the path', () => {
    const { isStaticAsset } = loadWorker()
    const asset = (path) => isStaticAsset(new URL(path, ORIGIN))
    for (const path of [
      '/css/canvas.css',
      '/canvas/app-1a2b3c4d.js',
      '/fonts/dotgothic16-regular.woff2',
      '/logo.png',
      '/favicon.svg',
      '/mesh/head.glb',
      '/img/dither-3.svg?v=2',
    ]) {
      assert.equal(asset(path), true, `${path} is a static asset`)
    }
    for (const path of ['/', `/work/${FIXTURES.caseStudy}`, '/feed.xml', '/about', '/gpg.asc']) {
      assert.equal(asset(path), false, `${path} is not a static asset`)
    }
  })

  // mutation: sw.health-cached
  it('leaves non-GET, cross-origin, api, health and the sitemap to the network', () => {
    // Each one is tried as a subresource AND as a navigation. As a
    // subresource, /health and the api fall through on having no asset
    // extension, so only a navigation (someone opening /health in a tab)
    // proves the exemption is there at all.
    const worker = loadWorker({ version: VERSION })
    const untouched = [
      [`${ORIGIN}/api/presence`, 'POST'],
      ['https://cdn.example.net/script.js', 'GET'],
      [`${ORIGIN}/api/weather/last`, 'GET'],
      [`${ORIGIN}/health`, 'GET'],
      [`${ORIGIN}/sitemap.xml`, 'GET'],
    ]
    for (const [url, method] of untouched)
      for (const mode of ['no-cors', 'navigate']) {
        const event = swEvent(request(url, { method, mode }))
        worker.listeners.fetch(event)
        assert.equal(event.responded, undefined, `${method} ${url} (${mode}) was intercepted`)
      }
  })

  // mutation: sw.navigation-cached
  it('serves navigations from the network and never writes the HTML into the cache', async () => {
    // This is the whole anti-stale-shell contract. The moment a navigation
    // response gets cached under a stable key, a renamed route can outlive its
    // deploy in someone's browser.
    const caches = fakeCaches({ [VERSION]: { '/': 'stale shell' } })
    const fresh = { ok: true, body: 'fresh shell', clone: () => 'fresh shell' }
    const worker = loadWorker({ version: VERSION, caches, fetch: async () => fresh })

    const event = swEvent(request(`${ORIGIN}/work/${FIXTURES.caseStudy}`, { mode: 'navigate' }))
    worker.listeners.fetch(event)
    assert.equal(await event.responded, fresh, 'the network copy wins while the network is up')
    await flush()
    assert.deepEqual(caches.log.put, [], 'no navigation response entered the cache')
  })

  // mutation: sw.offline-no-shell
  it('falls back to the cached shell when the network is gone', async () => {
    const caches = fakeCaches({ [VERSION]: { '/': 'offline shell' } })
    const worker = loadWorker({ version: VERSION, caches, fetch: offline })

    const deep = swEvent(request(`${ORIGIN}/work/${FIXTURES.caseStudy}`, { mode: 'navigate' }))
    worker.listeners.fetch(deep)
    assert.equal(await deep.responded, 'offline shell', 'an uncached route lands on the shell')

    const exact = swEvent(request(`${ORIGIN}/`, { mode: 'navigate' }))
    worker.listeners.fetch(exact)
    assert.equal(await exact.responded, 'offline shell')
  })

  // mutation: sw.assets-network-first, sw.asset-cache-own-name
  it('serves a cached asset immediately and refreshes it behind the request', async () => {
    const url = `${ORIGIN}/css/canvas.css`
    const caches = fakeCaches({ [VERSION]: { [url]: 'stale css' } })
    const fresh = { ok: true, clone: () => 'fresh css' }
    const worker = loadWorker({ version: VERSION, caches, fetch: async () => fresh })

    const event = swEvent(request(url))
    worker.listeners.fetch(event)
    assert.equal(await event.responded, 'stale css', 'the page load is not made to wait')
    await flush()
    assert.deepEqual(caches.log.put, [url], 'the fresh copy was written for next time')
    assert.equal(await (await caches.open(VERSION)).match(request(url)), 'fresh css')
  })

  // mutation: sw.caches-error-response
  it('keeps the cached copy when the refresh fails or comes back an error', async () => {
    const url = `${ORIGIN}/css/canvas.css`
    for (const fetchImpl of [offline, async () => ({ ok: false, clone: () => 'a 500 page' })]) {
      const caches = fakeCaches({ [VERSION]: { [url]: 'good css' } })
      const worker = loadWorker({ version: VERSION, caches, fetch: fetchImpl })
      const event = swEvent(request(url))
      worker.listeners.fetch(event)
      assert.equal(await event.responded, 'good css')
      await flush()
      assert.deepEqual(caches.log.put, [], 'a failed refresh never overwrites a good asset')
    }
  })

  // mutation: sw.refresh-only-cached
  it('fetches an uncached asset from the network and stores it', async () => {
    const url = `${ORIGIN}/img/dither-3.svg`
    const caches = fakeCaches({ [VERSION]: {} })
    const fresh = { ok: true, clone: () => 'the svg' }
    const worker = loadWorker({ version: VERSION, caches, fetch: async () => fresh })

    const event = swEvent(request(url))
    worker.listeners.fetch(event)
    assert.equal(await event.responded, fresh)
    await flush()
    assert.deepEqual(caches.log.put, [url])
  })
})

describe('/sw.js is served so the browser can adopt a new worker', () => {
  let app

  before(async () => {
    app = await build({ logger: false })
  })

  after(async () => {
    await app.close()
  })

  it('is revalidated on every visit, never stale-while-revalidate', async () => {
    const r = await app.inject({ method: 'GET', url: '/sw.js' })
    assert.equal(r.statusCode, 200)
    assert.equal(r.headers['cache-control'], 'no-cache')

    // The contrast that makes the special case worth having: the same policy
    // applied by extension would hand the worker an hour of staleness, and the
    // worker is the one script whose staleness compounds.
    const script = await app.inject({ method: 'GET', url: '/js/sw-register.js' })
    assert.equal(
      script.headers['cache-control'],
      'public, max-age=3600, stale-while-revalidate=86400'
    )
  })

  it('is served as javascript, so the registration is not rejected outright', async () => {
    const r = await app.inject({ method: 'GET', url: '/sw.js' })
    assert.match(r.headers['content-type'], /javascript/)
  })

  it('the home page still loads the registration script', async () => {
    // Drop that script tag and the worker is never installed on any machine,
    // with no error anywhere to say so.
    const r = await app.inject({ method: 'GET', url: '/' })
    assert.equal(r.statusCode, 200)
    assert.match(r.body, /<script[^>]+src="[^"]*sw-register[^"]*\.js"/)
  })

  // mutation: sw.precache-renamed-logo
  it('every URL the worker precaches actually serves', async () => {
    const { PRECACHE_URLS } = loadWorker()
    for (const url of PRECACHE_URLS) {
      const r = await app.inject({ method: 'GET', url })
      assert.equal(r.statusCode, 200, `precache target ${url} returns ${r.statusCode}`)
    }
  })
})

describe('sw-register.js keeps the worker off the development machine', () => {
  // A worker registered against `npm run dev` serves stale css out of its own
  // cache for the rest of the session, which reads as "my change did nothing".
  function runRegister(host, { hasServiceWorker = true, cacheKeys = ['canvas-old'] } = {}) {
    const log = { registered: [], unregistered: 0, deleted: [], loadHandlers: 0 }
    const registrations = [1, 2].map(() => ({
      unregister: async () => {
        log.unregistered += 1
      },
    }))
    const navigator = hasServiceWorker
      ? {
          serviceWorker: {
            getRegistrations: async () => registrations,
            register: async (url) => {
              log.registered.push(url)
            },
          },
        }
      : {}
    let onLoad = null
    const window = {
      addEventListener: (type, handler) => {
        if (type !== 'load') return
        log.loadHandlers += 1
        onLoad = handler
      },
    }
    const caches = {
      keys: async () => cacheKeys,
      delete: async (name) => {
        log.deleted.push(name)
        return true
      },
    }
    new Function('navigator', 'location', 'window', 'caches', REGISTER_SRC)(
      navigator,
      { hostname: host },
      window,
      caches
    )
    return { log, fireLoad: () => onLoad?.() }
  }

  for (const host of ['localhost', '127.0.0.1', 'my-laptop.local']) {
    it(`unregisters and purges on ${host} instead of registering`, async () => {
      const { log } = runRegister(host)
      await flush()
      assert.deepEqual(log.registered, [], 'no worker is registered locally')
      assert.equal(log.unregistered, 2, 'every existing registration is torn down')
      assert.deepEqual(log.deleted, ['canvas-old'], 'and its caches go with it')
      assert.equal(log.loadHandlers, 0, 'the load path is not even wired up')
    })
  }

  it('registers /sw.js on a public host, and only once the page has loaded', async () => {
    const { log, fireLoad } = runRegister('example.com')
    await flush()
    assert.deepEqual(log.deleted, [], 'production caches are left alone')
    assert.equal(log.unregistered, 0)
    assert.deepEqual(log.registered, [], 'registration waits rather than competing with load')

    assert.equal(log.loadHandlers, 1)
    fireLoad()
    await flush()
    assert.deepEqual(log.registered, ['/sw.js'], 'the registration URL is the stable one')
  })

  it('registers on a LAN address, because the guard is a host list not a range', async () => {
    // Documented, not endorsed: `npm run dev` binds 0.0.0.0 and prints a LAN
    // URL, and a phone opening that URL does get a worker against the dev
    // server. If the guard ever grows to cover private ranges, this is the
    // line that says so.
    const { log, fireLoad } = runRegister('192.168.1.20')
    await flush()
    fireLoad()
    await flush()
    assert.deepEqual(log.registered, ['/sw.js'])
  })

  it('does nothing at all on a browser without service workers', async () => {
    const { log } = runRegister('example.com', { hasServiceWorker: false })
    await flush()
    assert.deepEqual(log.registered, [])
    assert.deepEqual(log.deleted, [], 'the cache purge is inside the feature guard')
    assert.equal(log.loadHandlers, 0)
  })
})
