// Upstream fetch with a hard deadline. Every third-party call on the site
// (open-meteo today) goes through here: a hung
// upstream becomes a rejected promise its caller already degrades on,
// never a request that pins the refresh cycle until the platform gives up.

const UPSTREAM_TIMEOUT_MS = 10_000

export function fetchUpstream(url, options = {}) {
  return fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), ...options })
}
