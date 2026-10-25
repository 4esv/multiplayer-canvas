// /admin/sessions: the owner's desk for sessions (lib/sessions.js). Start
// one (a follow room or a session, with or without a PIN), hand its link
// and QR and PIN to the room, watch who is in each, end one, and set
// whether a new session gets a PIN by default (services/rooms.js).
//
// The page is session-only like every desk page. The API behind it takes a
// signed key with the `rooms` scope too (`sessions` is the login-session
// scope, a different thing), so a script can open a room before a talk.
// Every mutating route writes an audit line; a PIN never lands in one.

import { guard, requestOrigin, requireAuth } from '../middleware/auth.js'
import { qrSvg } from '../lib/qr.js'
import { fail } from '../lib/api-errors.js'
import { renderPage } from '../lib/render.js'
import { KINDS, endSession, listSessions, startSession } from 'multiplayer-canvas/rooms'
import { fmtRelative } from '../lib/when.js'
import { audit } from '../services/audit.js'
import { roomSettings, setRoomSettings } from '../services/rooms.js'

import config from '../config.js'
const SITE_URL = config.site.url
const SITE_NAME = config.site.name

// the link names the room's kind as well as its code, since the flag in the
// address is the room (BIBLE.md section 2): a follow room's is `?follow=`
const linkOf = (r) => `/?${r.kind}=${r.code}`

export async function registerRoomRoutes(fastify) {
  const key = { preHandler: guard('rooms') }

  fastify.get('/admin/sessions', { preHandler: requireAuth }, async (request, reply) => {
    const origin = requestOrigin(request)
    const now = Date.now()
    const rooms = listSessions().map((r) => {
      const url = `${origin}${linkOf(r)}`
      return {
        ...r,
        link: linkOf(r),
        url,
        qr: qrSvg(url, `QR code of ${url}`),
        startedLabel: fmtRelative(r.started, now),
      }
    })
    return renderPage(fastify, request, reply, 'rooms/index.njk', {
      desk: 'rooms',
      rooms,
      kinds: KINDS,
      settings: await roomSettings(),
      meta: {
        title: `sessions · ${SITE_NAME}`,
        description: 'Follow rooms and sessions.',
        canonical: `${SITE_URL}/admin/sessions`,
        robots: 'noindex, nofollow',
      },
    })
  })

  fastify.get('/api/admin/rooms', key, async () => {
    const { pin } = await roomSettings()
    return { pin, rooms: listSessions() }
  })

  fastify.post('/api/admin/rooms', key, async (request, reply) => {
    const body = request.body || {}
    if (!KINDS.includes(body.kind))
      return fail(reply, 400, 'invalid', `kind is one of ${KINDS.join(', ')}`)
    if (body.pin !== undefined && typeof body.pin !== 'boolean')
      return fail(reply, 400, 'invalid', 'pin is true or false')
    const pin = body.pin ?? (await roomSettings()).pin
    const rec = startSession({ kind: body.kind, pin })
    if (!rec) {
      await audit(request, 'rooms.create', { outcome: 'full', kind: body.kind })
      return fail(reply, 409, 'full', 'too many sessions')
    }
    await audit(request, 'rooms.create', { target: rec.code, kind: rec.kind, pinned: pin })
    return reply.code(201).send({ code: rec.code, kind: rec.kind, pin: rec.pin, link: linkOf(rec) })
  })

  fastify.put('/api/admin/rooms/settings', key, async (request, reply) => {
    const result = await setRoomSettings(request.body || {})
    if (result.error) return fail(reply, 400, 'invalid', result.error)
    await audit(request, 'rooms.settings', { target: 'pin', pinDefault: result.settings.pin })
    return result.settings
  })

  fastify.delete('/api/admin/rooms/:code', key, async (request, reply) => {
    const code = String(request.params.code)
    const gone = endSession(code)
    await audit(request, 'rooms.end', {
      target: code.slice(0, 16),
      outcome: gone ? 'ok' : 'missing',
      why: 'owner',
    })
    if (!gone) return fail(reply, 404, 'notfound')
    return { ok: true }
  })
}
