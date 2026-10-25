// /admin: the owner's page behind the passkey. It says you are signed in,
// launches what the owner can do (the desk registry, lib/desk.js: open a
// session room, read the kit sheet), and lists the readouts the box can
// answer: the passkey store, the weather cache, the process, and every
// device signed in.

import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import { requireAuth, sessionFromRequest } from '../middleware/auth.js'
import { deviceLabel } from '../lib/device-label.js'
import { renderPage } from '../lib/render.js'
import { fmtRelative, fmtWhen } from '../lib/when.js'
import { isClaimed, listSessions } from '../services/auth.js'

import config from '../config.js'
const SITE_URL = config.site.url
const SITE_NAME = config.site.name

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`
}

function fmtUptime(seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

async function fileFacts(path) {
  try {
    const s = await stat(path)
    return { present: true, bytes: s.size, modifiedAt: s.mtimeMs }
  } catch {
    return { present: false, bytes: 0, modifiedAt: null }
  }
}

export async function registerAdminRoutes(fastify) {
  const owner = { preHandler: requireAuth }

  fastify.get('/admin', owner, async (request, reply) => {
    const now = Date.now()
    const [sessions, claimed, authFile] = await Promise.all([
      listSessions(await sessionFromRequest(request)),
      isClaimed(),
      fileFacts(resolve(process.cwd(), config.auth.storePath)),
    ])
    const page = fastify.getPageData()

    const sections = [
      {
        title: 'signed in',
        rows: [
          {
            name: 'passkey',
            state: claimed ? 'claimed' : 'unclaimed',
            bad: !claimed,
            detail: authFile.present
              ? `${fmtBytes(authFile.bytes)} · ${fmtWhen(authFile.modifiedAt)}`
              : null,
          },
          { name: 'weather', state: page.weather ? 'filled' : 'empty', bad: !page.weather },
        ],
      },
      {
        title: 'process',
        rows: [
          { name: 'uptime', state: fmtUptime(process.uptime()) },
          { name: 'node', state: process.version },
          { name: 'env', state: config.env },
        ],
      },
      {
        // A session is a device, so it is named as one; the raw user agent
        // rides the tooltip. The caller's own row says so and cannot revoke
        // itself here (that is the log out button); every other row can.
        title: 'sessions',
        wide: true,
        logout: true,
        action:
          sessions.length > 1 ? { revokeOthers: true, label: 'sign out everywhere else' } : null,
        rows: sessions.length
          ? sessions.map((s) => ({
              name: s.current
                ? `${deviceLabel(s.userAgent)} · this device`
                : deviceLabel(s.userAgent),
              title: s.userAgent,
              state: `lapses ${fmtRelative(s.expiresAt, now)}`,
              detail: `since ${fmtWhen(s.createdAt)}`,
              action: s.current ? null : { revoke: s.id, label: 'sign out' },
            }))
          : [{ name: 'none', state: '' }],
      },
    ]

    return renderPage(fastify, request, reply, 'admin/index.njk', {
      desk: 'admin',
      sections,
      meta: {
        title: `admin · ${SITE_NAME}`,
        description: 'Owner dashboard.',
        canonical: `${SITE_URL}/admin`,
        robots: 'noindex, nofollow',
      },
    })
  })
}
