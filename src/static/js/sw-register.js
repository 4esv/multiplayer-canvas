// Register the service worker in production only.
// On localhost the SW gets in the way of dev iteration (stale CSS via
// stale-while-revalidate), so we actively unregister any existing
// worker and purge caches when the page is opened locally.
if ('serviceWorker' in navigator) {
  const host = location.hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')

  if (isLocal) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister())
    })
    if (typeof caches !== 'undefined') {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)))
    }
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }
}
