// The /ws/cursors endpoint: the socket layer over primitives/presence/presence-room.js.
// Nothing is stored: the room holds each open connection's latest {fx,fy} in
// memory and fans moves out to the other open sockets. Close the socket and
// you vanish, no history, no replay. Coordinates arrive as world fractions in
// [0,1) so the client can place a peer on its own torus regardless of viewport
// (see presence.js).
//
// The same socket carries the server's data pushes. routes/api.js publishes a
// {type:'stale', keys} nudge through the room when its 5-minute refresh lands
// changed data, so every open tab hears about it at the same moment and reads
// the same /api/canvas. That is the point: one server-owned payload, not N
// client polls landing on N different upstream states.
//
// And it carries the two shared hands (BIBLE.md section 2): Maurice, the
// ladybug (a participant sends {type:'squish'} and the room tells every
// open tab, sender included, {type:'squish', until}) and the piles' fronts
// ({type:'front', stack, i} in, the same out to everyone), and the slime
// mould's food ({type:'feed', x, y} in; the dish's next frame out, from
// primitives/slime/slime.js, to the tabs that said {type:'watch', on:true} and have
// not since said otherwise: a keyframe first, then the changed cells), and
// the weather window's push ({type:'push', dx, dy} in; the sky's offset out,
// from primitives/sky/server.js, to the tabs watching it with of:'sky').
//
// SESSIONS ride the same endpoint. `?session=new&kind=...` from
// the owner (the session cookie AND our own Origin) opens one with a
// generated code and joins it as its host; `?session=<code>&kind=...` from
// the owner opens one WITH that code when none is live, so a
// room can be named in the address (`?session=jam`), and joins it when it
// is. Anybody else's `?session=<code>[&pin=<digits>]` joins a live one, with
// the PIN when it has one. Joining, the room's own kind wins over the
// query's: a follow room asked for as a session is still a follow room. The
// owner's `pin` when he opens one is absent (the desk's default), four
// digits (that PIN) or `off` (none) (primitives/rooms/sessions.js pinAsked). A session
// is a room of its own (primitives/rooms/sessions.js), so nothing said in it reaches the
// public room or the other way round, and in it a participant's act
// (presence-protocol.js actOf) is relayed at once to the others (in a
// follow room, the host's only). In the public room an act goes to the
// sender's followers and nobody else. A refusal is a close code the client
// reads:
//   4403 owner    session=new from anybody but the owner
//   4404 ended    no such session, or it ended (sent to all when it does);
//                 an unknown code from anybody but the owner is this too
//   4401 pin      the PIN is missing or wrong
//   4429 locked   too many wrong PINs for this session this hour
//   1013 busy     the room is full (as ever)
//
// Deploy note: the endpoint lives in this same Node process, so any reverse
// proxy that upgrades WebSockets (nginx can) serves it with
// no separate route.
import fastifyWebsocket from '@fastify/websocket'

import { parseFrame } from 'multiplayer-canvas/presence/protocol'
import { RATE_MS } from 'multiplayer-canvas/presence/wire'
import { feedSlime, watchSlime } from 'multiplayer-canvas/slime/server'
import { pushSky, watchSky } from 'multiplayer-canvas/sky/server'
import { presenceRoom } from 'multiplayer-canvas/presence/room'
import {
  CODE_RE,
  KINDS,
  checkSessionPin,
  findSession,
  pinAsked,
  startSession,
} from 'multiplayer-canvas/rooms'
import { sameOrigin, sessionFromRequest } from '../middleware/auth.js'
import { audit } from '../services/audit.js'
import { roomSettings } from '../services/rooms.js'

// A per-socket floor: the first frame through, then nothing until `ms` has
// passed since the last one it took. Extra messages are dropped, not queued:
// a scripted client cannot spend our CPU faster than this. A socket holds one
// per kind of frame it gates.
const floor = (ms) => {
  let last = 0
  return (now) => {
    if (now - last < ms) return false
    last = now
    return true
  }
}
// Moves take RATE_MS (primitives/presence/wire.js), the pace the tab keeps too. It gates
// the cursor side; the data push stays server to client only, so it never
// contends with it.
// The squish has a gate of its OWN, and it must. The move gate DROPS what
// it does not accept, and a click always lands a few milliseconds after the
// pointermove that carried the hand to the bug, so a squish behind the
// shared gate would be dropped precisely when somebody squishes. Four a
// second is plenty of stamping for one ladybug.
const SQUISH_GATE_MS = 250
// A push is a sweep, so it comes as a stream, and a stream wants a finer
// gate than a tap; ten a second is as fast as the client flushes one
const PUSH_GATE_MS = 100
// Acts come in bursts (a chord is four notes in one instant, a drag on a
// knob is a stream), so they get a token bucket rather than a floor: forty
// at once, refilled at forty a second. A floor would drop the second note
// of every chord; the bucket lets the chord through and still caps what a
// scripted client can make the room fan out.
// seam: test/sessions.test.js
export const ACT_BURST = 40
const ACT_PER_S = 40

// The owner, as the socket's upgrade request shows him: our own Origin (a
// page on another site can make a browser send the cookie, it cannot make
// it send our Origin) and a live session cookie. Origin first, since it
// costs nothing and the cookie costs a store read.
async function isOwner(request) {
  if (!sameOrigin(request)) return false
  return Boolean(await sessionFromRequest(request))
}

/**
 * Register the /ws/cursors WebSocket route.
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function registerPresenceRoutes(fastify) {
  // maxPayload caps a single INBOUND frame: {fx,fy} JSON is well under 512
  // bytes, so a larger frame is garbage or abuse and the socket is torn down by
  // the plugin. Outbound frames are not bound by it (the welcome roster already
  // exceeds it in a busy room), which is a reason to size our own pushes, not a
  // licence to skip doing so. It was 512 until the act (sessions):
  // the act grammar (presence-protocol.js isActData) admits eight keys of
  // sixty-four-character strings, about 660 bytes framed, and a frame the
  // grammar would accept must never be one that tears the socket down.
  await fastify.register(fastifyWebsocket, { options: { maxPayload: 1024 } })

  fastify.addHook('onClose', (_instance, done) => {
    presenceRoom.stop()
    done()
  })

  fastify.register(async (scoped) => {
    scoped.get('/ws/cursors', { websocket: true }, (socket, request) => {
      const q = request.query || {}
      // the public room is joined at once: no await, so
      // its timing does not depend on sessions
      if (q.session === undefined) {
        admit(socket, presenceRoom)
        return
      }
      enterSession(socket, request, q).catch((err) => {
        request.log?.error({ err }, 'session door failed')
        if (socket.readyState === socket.OPEN) socket.close(1011, 'error')
      })
    })
  })
}

// The session door. Everything that decides who gets in is here, before the
// socket is admitted: a refused socket is closed with its code and never
// sees a room.
async function enterSession(socket, request, q) {
  const owner = await isOwner(request)
  // the checks above are a store read; a tab that gave up meanwhile is not
  // admitted as a peer nobody will ever retract
  if (socket.readyState !== socket.OPEN) return
  let rec
  const fresh = q.session === 'new'
  // the owner naming a room nobody has opened yet opens it: the code in
  // his address is the room. Anybody else's unknown code is
  // the same 4404 as an ended one, so a guess learns nothing either way.
  const naming = !fresh && owner && typeof q.session === 'string' && CODE_RE.test(q.session)
  if (fresh || (naming && !findSession(q.session))) {
    if (!owner) return socket.close(4403, 'owner')
    const { pin } = await roomSettings()
    if (socket.readyState !== socket.OPEN) return
    const kind = KINDS.includes(q.kind) ? q.kind : 'session'
    const opts = { kind, pin: pinAsked(q.pin, pin) }
    // two of the owner's tabs naming the same room at once: the second
    // finds the first's after the settings read, and joins it
    rec = fresh ? null : findSession(q.session)
    if (!rec) {
      rec = startSession(fresh ? opts : { ...opts, code: q.session })
      if (!rec) return socket.close(1013, 'busy')
      audit(request, 'rooms.create', {
        target: rec.code,
        kind: rec.kind,
        pinned: Boolean(rec.pin),
        via: 'socket',
      })
    }
  } else {
    rec = findSession(q.session)
    if (!rec) return socket.close(4404, 'ended')
    if (!owner) {
      const status = checkSessionPin(rec, q.pin)
      if (status === 'locked') return socket.close(4429, 'locked')
      if (status !== 'ok') {
        // a wrong PIN is a line (never the PIN itself); a missing one is how
        // every guest first knocks, before they have been asked, so it is not
        if (status === 'bad') audit(request, 'rooms.pin', { target: rec.code, outcome: 'bad' })
        return socket.close(4401, 'pin')
      }
    }
  }
  if (rec.room.ended) return socket.close(4404, 'ended')
  admit(socket, rec.room, { host: owner })
}

/**
 * One socket in one room: the per-socket gates and the event wiring.
 * @param {object} socket
 * @param {object} room a presence room (primitives/presence/presence-room.js)
 * @param {{host?:boolean}} [opts]
 */
function admit(socket, room, { host = false } = {}) {
  const me = room.join(socket, { host })
  if (!me) {
    if (room.ended) socket.close(4404, 'ended')
    else socket.close(1013, 'busy')
    return
  }

  socket.on('pong', () => room.alive(socket))

  const moveGate = floor(RATE_MS)
  const squishGate = floor(SQUISH_GATE_MS)
  const frontGate = floor(SQUISH_GATE_MS)
  const playGate = floor(SQUISH_GATE_MS)
  const feedGate = floor(SQUISH_GATE_MS)
  const pushGate = floor(PUSH_GATE_MS)
  let tokens = ACT_BURST
  let refilled = Date.now()
  socket.on('message', (raw) => {
    const now = Date.now()
    // who hears an act is the room's to decide (presence-room.js act),
    // never the frame's
    const frame = parseFrame(raw.toString())
    if (!frame) return
    // a spectator's move says one thing, which page it is reading, so
    // the room sends it that page's cursors and selections; nobody else
    // hears a word of it (presence-room.js place)
    if (me.spectator && frame.kind === 'move') return room.place(socket, frame.at)
    // the watch is the one other frame a spectator may send: it asks for
    // nothing on anybody's canvas, it says whether THIS tab can see the
    // dish, and a spectator that cannot must not be sent the picture
    // any more than a participant that cannot (primitives/slime/slime.js)
    if (frame.kind === 'watch') {
      if (frame.of === 'sky') watchSky(socket, frame.on)
      else watchSlime(socket, frame.on)
      return
    }
    if (me.spectator) return // spectators observe only
    // a selection is not gated here: the room keeps the latest and says
    // it at most once a snapshot (presence-room.js flushSels), so a burst
    // costs one entry and its last state is the one that lands, where a
    // drop gate would lose exactly the selection somebody stopped on. It
    // goes to the socket's OWN room, so a session's highlights stay in it.
    if (frame.kind === 'sel') {
      room.select(socket, frame.sel)
      return
    }
    if (frame.kind === 'act') {
      tokens = Math.min(ACT_BURST, tokens + ((now - refilled) * ACT_PER_S) / 1000)
      refilled = now
      if (tokens < 1) return
      tokens -= 1
      room.act(socket, frame.ch, frame.d)
      return
    }
    if (frame.kind === 'front') {
      if (!frontGate(now)) return
      room.front(socket, frame.stack, frame.i)
      return
    }
    if (frame.kind === 'play') {
      if (!playGate(now)) return
      room.play(socket, frame.stack, frame.on, frame.n)
      return
    }
    if (frame.kind === 'feed') {
      if (!feedGate(now)) return
      feedSlime(frame.x, frame.y)
      return
    }
    if (frame.kind === 'push') {
      if (!pushGate(now)) return
      pushSky(frame.dx, frame.dy)
      return
    }
    if (frame.kind === 'squish') {
      if (!squishGate(now)) return
      room.squish(socket, now)
      return
    }
    if (!moveGate(now)) return
    room.move(socket, frame)
  })

  const gone = () => {
    watchSlime(socket, false)
    watchSky(socket, false)
    room.leave(socket)
  }
  socket.on('close', gone)
  socket.on('error', gone)
}
