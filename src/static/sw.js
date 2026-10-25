// The service worker.
//
// Strategy:
//   · Precache the offline shell (the home route, font, logo, manifest)
//     so the site renders instantly on repeat visits.
//   · HTML navigations: network-first, fall back to the cached '/' so
//     offline visitors still get a real shell rather than the browser's
//     default error page.
//   · Static assets (css, js, fonts, images): stale-while-revalidate.
//     Page loads use the cached copy, a fresh copy is fetched in the
//     background for next time.
//
// The production build (scripts/build-assets.mjs) prepends a prologue that
// defines self.__ASSET_MANIFEST (logical → content-hashed URLs) and
// self.__CACHE_VERSION (derived from the manifest, so any asset change
// rolls the cache automatically - no manual bump to forget). Old caches
// are deleted on activate so stale assets can't linger past a rebuild,
// which was the symptom that took down the previous worker.

const ASSETS = self.__ASSET_MANIFEST || {}
const CACHE_VERSION = self.__CACHE_VERSION || 'canvas-dev'

const PRECACHE_URLS = ['/', '/manifest.json', '/fonts/dotgothic16-regular.woff2', '/logo.png'].map(
  (url) => ASSETS[url] || url
)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

function isStaticAsset(url) {
  return /\.(css|js|woff2?|png|svg|ico|jpg|jpeg|webp|avif|glb)$/.test(url.pathname)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never cache OAuth callbacks, the API surface, or the sitemap.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/health' ||
    url.pathname === '/sitemap.xml'
  ) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request)
        return cached || caches.match('/')
      })
    )
    return
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(request).then((cached) => {
          const fetched = fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone())
              return response
            })
            .catch(() => cached)
          return cached || fetched
        })
      )
    )
  }
})
