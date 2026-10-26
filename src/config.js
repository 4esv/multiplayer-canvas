import { join } from 'node:path'

import site from '../site.config.js'

function env(key, fallback) {
  return process.env[key] ?? fallback
}

function envInt(key, fallback) {
  const value = process.env[key]
  return value !== undefined ? parseInt(value, 10) : fallback
}

export default Object.freeze({
  env: env('NODE_ENV', 'development'),
  port: envInt('PORT', 3000),
  host: env('HOST', '0.0.0.0'),
  logLevel: env('LOG_LEVEL', 'info'),

  // Which peers may speak for the client through X-Forwarded-*. Production
  // sits behind a reverse proxy on Docker's private network, so `uniquelocal` (the
  // RFC 1918 ranges) is the proxy and nothing else: a hop count is not an
  // option: Fastify 5 fails a number closed because a count cannot tell the
  // proxy from a direct client that supplied enough hops (request.ip would
  // stay the Docker peer in prod).
  // Off outside production: a dev server is hit directly, and the loopback
  // check on /api/auth/dev-session must read the real peer, not a header
  // anyone on the LAN can write. Any proxy-addr spec works in the env.
  trustProxy: env(
    'TRUST_PROXY',
    env('NODE_ENV', 'development') === 'production' ? 'uniquelocal' : ''
  ),

  site: Object.freeze({
    name: env('SITE_NAME', site.name),
    tagline: site.description,
    url: env('SITE_URL', site.url),
    author: Object.freeze({ ...site.author }),
    social: Object.freeze({ ...site.social }),
  }),

  weather: Object.freeze({ ...site.weather }),

  // The passkey store lives under data/ (a volume persists it across
  // deploys). Paths are relative to the process cwd (repo root in dev, /app
  // in Docker); the env override exists so tests can point it at a temp dir.
  auth: Object.freeze({
    storePath: env('AUTH_STORE_PATH', 'data/auth.json'),
  }),

  // The audit trail (services/audit.js): one NDJSON file per month under
  // data/ (the volume). Every suite that takes a privileged action
  // points this at a temp dir, same as the stores above.
  audit: Object.freeze({
    dir: env('AUDIT_DIR', 'data/audit'),
  }),

  // The two trees an entry is made of: its markdown, and the pictures a
  // photo set points at (imageDir is what the /img URL prefix maps to, so
  // a set's folder is imageDir/<slug>/). Absolute paths off this file, not
  // the process cwd, because the server is started from both the repo root
  // and /app. The env overrides exist so a test can point a whole content
  // surface at a temp dir, the same reason the auth store has one.
  content: Object.freeze({
    dir: env('CONTENT_DIR', join(import.meta.dirname, '../content/feed')),
    imageDir: env('CONTENT_IMAGE_DIR', join(import.meta.dirname, 'static/img')),
  }),
})
