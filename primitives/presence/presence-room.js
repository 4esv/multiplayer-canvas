// multiplayer-canvas/presence/room: the server side of presence: who is connected, what each said
//   last, and the fan-out.
// Inputs: createRoom({ pingMs, maxConn, session, onSize }); join(socket), move(socket, frame),
//   leave(socket) from any ws-style socket (send, ping, terminate, readyState).
// Outputs: a room handle; presenceRoom is the shared public one, publish(msg) pushes to it. Node.
//
// The room behind /ws/cursors: who is connected, what each peer last said, and
// the fan-out to the open sockets. Split out of routes/presence.js so anything
// in the process can publish to every live tab without reaching through route
// registration. The room used to live in a closure inside the route handler,
// which meant it existed only after registerPresenceRoutes ran, and server.js
// runs that AFTER the api routes: a module that wanted to push would have
// captured undefined at boot. A module-level room has no order to get wrong.
//
// Division of labour: the route file owns the plugin, the per-socket inbound
// rate gates and the socket event wiring; this file owns the state, the roster
// and every send. Nothing here is stored past the socket's life, except
// the room's own state (Maurice, each pile's front), which outlives any one
// socket and not the process.
import { rosterOf, spectatesAt } from './presence-protocol.js'
import { SERVER_PUSH } from './wire.js'

// Total connection backstop: PARTICIPANT_CAP broadcasters plus room for
// spectators, capped so an open public socket can't hold unbounded connections
// (each spectator still costs ~PARTICIPANT_CAP inbound moves to relay). The
// quadratic fan-out is bounded by PARTICIPANT_CAP; spectators add only linear
// outbound. Refuse past this.
// seam: test/presence.test.js
export const MAX_CONN = 256
// how long a replay holds each position: the pace the lamp has always run at
// seam: test/presence.test.js
export const PLAY_MS = 800
// how long Maurice stays squished: five minutes, for everyone at once
// (five seconds while developing, so a squish can be watched coming back
// without waiting out the real five minutes; the shell bakes the number so
// the client counts the same clock)
export const SQUISH_MS = process.env.NODE_ENV === 'production' ? 5 * 60 * 1000 : 5 * 1000
// Heartbeat period. A client that drops without a close frame (laptop sleep,
// killed process) would otherwise linger as a frozen ghost cursor until the OS
// TCP timeout; the ping/pong sweep reaps it in at most two periods.
const PING_MS = 30000
// THE ROOM SNAPSHOTS AT 24fps (2026-09-16), it does not relay.
//
// Every accepted move used to be fanned out the instant it arrived, and the
// arithmetic on that is bad in a way no amount of tuning fixes. The inbound
// gate is 33ms, so 100 participants can send ~3030 moves a second between
// them; each one went to every other open socket, and with MAX_CONN at 256
// that is ~772,000 outbound frames a second, 67 MB/s off the box, and every
// client parsing 3030 JSON messages a second to draw at most 60 frames.
//
// So the room keeps the LATEST position per peer and ships one frame a tick
// carrying everyone who moved. Three things fall out of that, and the third
// is the one that matters most:
//   - a client parses 24 messages a second instead of 3030
//   - a peer that moved ten times in a tick costs one entry, not ten
//   - the frame is IDENTICAL for every recipient, so it is serialised ONCE
//     per tick rather than once per message. The old fan-out already had one
//     stringify per message, which was the right fix for the wrong loop.
//
// 24 is the number because it is the one the visitor asked for: stepped
// enough to read as frames, which is this canvas's whole register, and fluid
// enough not to stutter. The client eases between snapshots either way
// (primitives/presence/presence.js SMOOTH_TAU), so this is the rate news ARRIVES at, not
// the rate anything is drawn at.
// A SWITCH, temporarily: PRESENCE_SNAP_MS=0 goes back to relaying every move
// the instant it arrives, which is what this replaced. It exists to bisect a
// stutter by hand rather than by argument; delete it once that is settled.
const SNAP_MS =
  process.env.PRESENCE_SNAP_MS !== undefined ? Number(process.env.PRESENCE_SNAP_MS) : 1000 / 24
// Positions go over as 12-bit integers instead of full floats. The world is
// 3840 px across; one part in 4096 is under a pixel of it, and well under a
// cell, so nothing is lost that anybody could see. A float costs ~12 bytes in
// JSON and this costs 4.
const QUANT = 4096
const quant = (f) => Math.min(QUANT - 1, Math.max(0, Math.round(f * QUANT)))

const isOpen = (s) => s.readyState === s.OPEN
const raw = (s, text) => {
  if (isOpen(s)) s.send(text)
}

// EVERY ROOM'S SOCKETS, in one place (sessions, 2026-09-25). There used to be
// one room, so "a socket in the room" and "a live socket" were the same
// question. A session is a room of its own (primitives/rooms/sessions.js), and the things
// that push to tabs from outside any room do not care which room a tab is
// in: the slime mould and the weather window send to whoever says it is
// watching (primitives/slime/slime.js, primitives/sky/server.js), and the stale nudge is for
// every open tab (routes/api.js). So each room adds its sockets here on join
// and takes them out on leave, and sendTo and publish read this rather than
// one room's peers. It holds nothing a room does not already hold.
const LIVE = new Set()

/**
 * Send to every open socket in every room, spectators included: the
 * publish channel. One serialisation, every tab, whichever room it is in.
 * @param {object} msg
 */
// seam: test/sessions.test.js
export function publish(msg) {
  if (!LIVE.size) return
  const text = JSON.stringify(msg)
  for (const s of LIVE) raw(s, text)
}

/**
 * Create a presence room.
 * @param {object} [opts]
 * @param {number} [opts.pingMs] heartbeat period, overridable for tests
 * @param {number} [opts.maxConn] admission backstop
 * @param {{code:string, kind:string, pin:string|null}} [opts.session] a
 *   session's record (primitives/rooms/sessions.js): its welcome says so, and it relays acts
 * @param {(size:number) => void} [opts.onSize] told the head count after
 *   every join, leave and end, which is how a session knows it is empty
 * @returns {object} the room handle used by routes/presence.js and publishers
 */
// seam: test/presence.test.js, test/sessions.test.js
export function createRoom({
  pingMs = PING_MS,
  maxConn = MAX_CONN,
  session = null,
  onSize = null,
} = {}) {
  // socket -> { id, fx, fy, k, kd, d, at, ad, alive, spectator }. A peer's colour is not
  // sent: presence.js derives a hue from the id, so every client paints the
  // same colour for a given peer with nothing to keep in sync. `k` is what
  // that peer's cursor is over (a hover key, or null), held here for exactly
  // as long as the socket is open so a joiner can be told about highlights
  // that were already lit when it arrived. `kd` says the key changed since
  // the last snapshot, which is the only time it is sent (flush).
  const peers = new Map()
  let nextId = 1
  let participants = 0 // broadcasting peers; the rest of peers are spectators
  let heartbeat = null
  // Maurice (BIBLE.md section 5): the one piece of state the room holds
  // that is not a peer, the instant he is back on his feet (ms, server
  // clock; 0 = never squished). Whoever squishes him squishes him for
  // everyone, for SQUISH_MS, and a restart revives him. Nothing persists
  // it, deliberately: it is where the room left the bug, not a fact about
  // the visitor.
  let squishUntil = 0
  // and which member each pile shows (BIBLE.md section 5): stack id -> index.
  // Whoever turns a pile turns it for everyone; a restart shows the firsts.
  const fronts = {}
  // and which piles are being played through (a replay): stack id ->
  // the interval that turns its front. The room ticks it, so a replay is one
  // thing for every tab and no tab drives it.
  const plays = {}
  // peers who have moved since the last snapshot: id -> the peer record. A
  // SET of who changed, not a queue of what happened, which is what collapses
  // ten moves in a tick into one entry.
  const moved = new Set()
  // peers whose SELECTION changed since the last snapshot (shared
  // highlighting), the same set-of-who-changed as `moved`: a reader dragging
  // a selection through twenty states before the tick costs one entry, and
  // the entry is the latest, so the last state always lands. That is the
  // rate limit, and it is the cursor's: the room says it at most once a tick.
  const selMoved = new Set()
  let snap = null
  // THE CONGA's clock (2026-09-25): every time a peer starts following
  // somebody, the room stamps it with the next number. Two tabs that both
  // follow the same leader form a line in the order they joined it, and the
  // order has to be the room's, not each tab's guess from arrival times.
  let followSeq = 0
  // a session that has ended takes nobody else in
  let ended = false
  const sized = () => onSize?.(peers.size)
  // One serialisation per fan-out, not one per recipient. The old broadcast
  // called JSON.stringify inside the loop, which was invisible for a 40-byte
  // move frame and would be real work for a data push to 256 sockets.
  const fanout = (msg, skip) => {
    const text = JSON.stringify(msg)
    for (const s of peers.keys()) if (s !== skip) raw(s, text)
  }

  function endPlay(stack) {
    clearInterval(plays[stack])
    delete plays[stack]
  }
  // The heartbeat runs only while someone is connected. An idle process holds
  // no timer, and a room that empties and refills gets exactly one again, so
  // repeated joins can never stack sweeps.
  function tick() {
    for (const [s, p] of peers) {
      if (!p.alive) {
        s.terminate() // fires 'close' -> leave() broadcasts the departure
        continue
      }
      p.alive = false
      try {
        s.ping()
      } catch {
        /* a throwing socket is reaped on the next sweep */
      }
    }
  }
  function beat() {
    if (heartbeat) return
    heartbeat = setInterval(tick, pingMs)
    // Don't let the heartbeat hold the event loop open (clean test exit).
    heartbeat.unref?.()
  }
  function stop() {
    for (const k of Object.keys(plays)) endPlay(k)
    if (heartbeat) {
      clearInterval(heartbeat)
      heartbeat = null
    }
    if (snap) {
      clearInterval(snap)
      snap = null
    }
  }
  // one frame, one serialisation, every open socket. The sender's own move
  // rides along rather than being filtered out per-recipient: that filtering
  // is what forced a message per peer, and the client already skips its own
  // id when it draws (primitives/presence/presence.js).
  //
  // THE KEY GOES ONLY WHEN IT CHANGES. It was ~13 of an entry's
  // ~30 bytes, and a peer resting on one tile sent it 24 times a second to
  // say nothing had changed. So an entry has three states, told apart by its
  // length and its last field:
  //   [id, x, y, down]          the key is UNCHANGED, keep what you hold
  //   [id, x, y, down, 0]       CLEARED: over nothing at all
  //   [id, x, y, down, 'key']   a NEW key
  // Missing must not mean null, because null is already a fact on this wire:
  // a peer leaving a tile has to be able to say so, or the tile stays lit
  // after the pointer has gone.
  //
  // `kd` is a dirty FLAG set by move(), not a compare against the last key
  // sent, and the difference is a joiner. The welcome roster carries the key
  // as STORED; a peer that goes A -> B, is seen on B by a joiner, and is back
  // on A before the tick would compare equal to the A last sent and ship
  // nothing, stranding the joiner on B. A flag sends that A. The price is one
  // redundant key on a round trip inside a single tick.
  //
  // THE ANCHOR GOES THE SAME WAY, as a sixth field behind the
  // key, which is then always present when the anchor is:
  //   [id, x, y, down, key, 0]       back on the canvas
  //   [id, x, y, down, key, 'nao#4'] on a page, at a block
  //
  // AND A FRAME GOES WHERE IT CAN BE SEEN. A cursor on a page is drawn only
  // by the tabs on that page, and a cursor on the canvas only by the tabs
  // on the canvas, so the room cuts one frame per PLACE and sends each
  // place its own: one serialisation per place, not per recipient, and a
  // place with one reader in it is sent nothing at all (its own entry is
  // the one thing a tab never draws). A move that CHANGES place is the
  // exception and goes to everyone: it is how the who's-here list and a
  // follower learn where somebody went.
  function flush() {
    if (selMoved.size) flushSels()
    if (!moved.size) return
    const everyone = [] // entries that changed place
    const local = new Map() // place -> entries that stayed in it
    for (const p of moved) {
      const e = [p.id, quant(p.fx), quant(p.fy), p.d ? 1 : 0]
      if (p.kd || p.ad || p.fd) e.push(p.k ?? 0)
      if (p.ad || p.fd) e.push(p.at ?? 0)
      // THE FOLLOW GOES THE SAME WAY (the conga), as a seventh and eighth
      // field behind the anchor: who this peer follows (0 for nobody) and
      // the sequence the room stamped when they started. It is news for
      // everyone, like a change of place: the who's-here list and every
      // tab drawing the line need it wherever they are.
      if (p.fd) e.push(p.f, p.fs)
      const list =
        p.ad || p.fd ? everyone : local.get(placeOf(p)) || local.set(placeOf(p), []).get(placeOf(p))
      list.push(e)
      p.kd = false
      p.ad = false
      p.fd = false
    }
    moved.clear()
    // who is where, so a lone reader's own moves are not mailed back to it
    const heads = new Map()
    for (const q of peers.values()) heads.set(placeOf(q), (heads.get(placeOf(q)) || 0) + 1)
    const texts = new Map()
    for (const [s, q] of peers) {
      const place = placeOf(q)
      let text = texts.get(place)
      if (text === undefined) {
        const m = heads.get(place) === 1 ? everyone : everyone.concat(local.get(place) || [])
        text = m.length ? JSON.stringify({ type: 'moves', m }) : null
        texts.set(place, text)
      }
      if (text) raw(s, text)
    }
  }
  // the page a peer is on, or '' for the canvas: the part of the anchor
  // before the block index
  const placeOf = (p) => (p.at ? p.at.slice(0, p.at.indexOf('#')) : '')
  // the page a selection is on
  const selPlace = (sel) => sel.at.slice(0, sel.at.indexOf('#'))
  // one selection on the wire: [id, at, a, j, b, q, z] for words selected,
  // [id, 0] for a selection collapsed
  const selEntry = (p) =>
    p.sel ? [p.id, p.sel.at, p.sel.a, p.sel.j, p.sel.b, p.sel.q, p.sel.z] : [p.id, 0]
  // THE SELECTIONS GO TO THE PAGE THEY ARE ON, and nowhere else: one frame
  // per page, one serialisation, every reader of it (the selector too: the
  // frame is the same for everyone there, and the client skips its own id).
  // A clear goes where the selection was. A page with nobody else on it is
  // sent nothing.
  function flushSels() {
    const byPlace = new Map()
    for (const p of selMoved) {
      const place = p.sel ? selPlace(p.sel) : p.selWas
      p.selWas = p.sel ? place : null
      if (!place) continue
      if (!byPlace.has(place)) byPlace.set(place, [])
      byPlace.get(place).push(selEntry(p))
    }
    selMoved.clear()
    for (const [place, s] of byPlace) {
      const there = [...peers].filter(([, q]) => placeOf(q) === place).map(([sock]) => sock)
      if (there.length < 2) continue
      const text = JSON.stringify({ type: 'sels', s })
      for (const sock of there) raw(sock, text)
    }
  }
  // A reader arriving on a page is told what is already selected on it, the
  // way a joiner is told what is already lit: without it a presenter's
  // selection made before you arrived would stay invisible until they
  // changed it, which for a sentence held on screen could be never.
  function catchUp(socket, me) {
    const place = placeOf(me)
    if (!place) return
    const s = []
    for (const q of peers.values())
      if (q !== me && q.sel && selPlace(q.sel) === place) s.push(selEntry(q))
    if (s.length) raw(socket, JSON.stringify({ type: 'sels', s }))
  }
  // a peer changed place: its selection was on the page it left, and a
  // selection does not follow anybody anywhere. The readers of that page
  // clear it themselves off the place change, which goes to everyone.
  function leftPlace(me) {
    me.sel = null
    me.selWas = null
    selMoved.delete(me)
  }
  function beatSnap() {
    if (snap || SNAP_MS <= 0) return
    snap = setInterval(flush, SNAP_MS)
    snap.unref?.()
  }

  return {
    get size() {
      return peers.size
    },
    get participants() {
      return participants
    },
    /** how many of the peers are a session's hosts */
    get hosts() {
      let n = 0
      for (const p of peers.values()) if (p.host) n++
      return n
    },
    /** true once end() has run: the session is over and admits nobody */
    get ended() {
      return ended
    },
    /** @returns {boolean} true when the next connection must be refused */
    full: () => peers.size >= maxConn,

    /**
     * Admit a socket, greet it, and announce it to the room.
     * @param {object} socket
     * @param {{host?:boolean}} [opts] host: this socket is the session's
     *   owner, which the roster and the join frame say with h:1
     * @returns {object|null} the peer record, or null if the room is full
     *   (or is a session that has ended)
     *
     * Role is fixed here: a full room makes this connection a spectator.
     * Spectators are never announced (no join/leave) and their moves are never
     * relayed, so they stay invisible to everyone while still receiving the
     * participants' cursors and every data push.
     */
    join(socket, { host = false } = {}) {
      if (ended || peers.size >= maxConn) return null
      const id = nextId++
      const spectator = spectatesAt(participants)
      // `at`/`ad`: the page block this peer is on, and whether
      // that changed since the last snapshot, the same pair `k`/`kd` are
      const me = {
        id,
        fx: -1,
        fy: -1,
        k: null,
        kd: false,
        d: false,
        at: null,
        ad: false,
        // `f`/`fs`/`fd`: who this peer follows (0 for nobody), the room's
        // stamp for when they started, and whether that changed since the
        // last snapshot (the conga)
        f: 0,
        fs: 0,
        fd: false,
        host: host === true,
        // the words this peer has selected on its page, or null, held for
        // the socket's life and no longer; `selWas` is the page the last
        // one sent was on, where a clear has to go
        sel: null,
        selWas: null,
        alive: true,
        spectator,
      }
      if (!spectator) participants++

      // Snapshot the room before adding self: participants only, positions as
      // stored. A peer that has not moved yet rides along with the fx/fy -1
      // sentinel so the joiner can count it without drawing it (rosterOf).
      const roster = rosterOf(peers.values())
      peers.set(socket, me)
      LIVE.add(socket)
      beat()
      beatSnap()
      // `t` is the server's clock, so the tabs agree about the time
      // (primitives/presence/presence.js now()): the dust's tick, the instant Maurice
      // is back and the weather window's step are read off it, and every
      // tab that agrees on the time draws them the same. The statement is
      // not on it: the hero is a pile, and its phrase rides `fronts` like
      // any other pile's.
      const welcome = {
        type: 'welcome',
        id,
        spectator,
        t: Date.now(),
        squish: squishUntil,
        fronts,
        plays: Object.keys(plays),
        peers: roster,
      }
      // A session says what it is, and to a host only, what its PIN is: the
      // host is the one who reads it out to the room. A guest already typed
      // it, and a room with no PIN has none to tell.
      if (session)
        welcome.session = {
          code: session.code,
          kind: session.kind,
          host: me.host,
          pin: me.host ? (session.pin ?? null) : null,
        }
      raw(socket, JSON.stringify(welcome))
      if (!spectator) fanout(me.host ? { type: 'join', id, h: 1 } : { type: 'join', id }, socket)
      sized()
      return me
    },

    /**
     * Drop a socket and retract its cursor. Idempotent: close and error both
     * land here, and a socket already gone is a no-op.
     * @param {object} socket
     */
    leave(socket) {
      const me = peers.get(socket)
      if (!me) return
      peers.delete(socket)
      LIVE.delete(socket)
      moved.delete(me)
      // a leaver's selection goes with it: the readers drop it with the
      // cursor (primitives/presence/presence.js dropPeer), so there is nothing to send
      selMoved.delete(me)
      if (!peers.size) stop()
      sized()
      if (me.spectator) return // never announced, so nothing to retract
      participants--
      fanout({ type: 'leave', id: me.id }, socket)
    },

    /**
     * Record a validated move and relay it. Spectators are ignored.
     * @param {object} socket
     * @param {{fx:number, fy:number, k:string|null}} move
     *
     * The hover key rides the move because that is where it arrives
     * (presence-protocol.js parseMove). It is stored as well as relayed, so
     * the roster a later joiner gets shows the highlights already lit.
     */
    move(socket, move) {
      const me = peers.get(socket)
      if (!me || me.spectator) return
      me.fx = move.fx
      me.fy = move.fy
      const k = move.k ?? null
      // a changed key is news for the next snapshot; an unchanged one is not
      // sent at all (flush)
      if (k !== me.k) me.kd = true
      me.k = k
      me.d = move.d === true
      // a changed anchor is news for everyone (flush); the same one is not
      const at = move.at ?? null
      if (at !== me.at) me.ad = true
      const was = placeOf(me)
      me.at = at
      // a changed follow is news for everyone (flush), stamped with the
      // room's next number when it names somebody. Following yourself is
      // following nobody: a line cannot start and end at the same tab.
      const f = move.f && move.f !== me.id ? move.f : 0
      if (f !== me.f) {
        me.f = f
        me.fs = f ? ++followSeq : 0
        me.fd = true
      }
      if (placeOf(me) !== was) {
        leftPlace(me)
        catchUp(socket, me)
      }
      // not sent here: noted, and shipped with everyone else's on the next
      // tick. A peer that moves twenty times before the tick costs one entry.
      moved.add(me)
      if (SNAP_MS <= 0) flush() // the switch: relay at once, as it used to
    },

    /**
     * Where a SPECTATOR is, and nothing else. A spectator is never announced
     * and never relayed, but a page's frames go to the readers of that page,
     * so the room has to know which page a spectator reads or it would be
     * sent the ground's frames while it reads a case study. The place is
     * noted, the selections already on it are sent, and nothing is said to
     * anybody else.
     * @param {object} socket
     * @param {string|null} at
     */
    place(socket, at) {
      const me = peers.get(socket)
      if (!me || !me.spectator) return
      const was = placeOf(me)
      me.at = at ?? null
      if (placeOf(me) !== was) catchUp(socket, me)
    },

    /**
     * Record a reader's selection for the next snapshot. Participants only.
     * @param {object} socket
     * @param {{at:string, a:number, j:number, b:number, q:string, z:string}|null} sel parsed (presence-protocol.js parseSel), null for collapsed
     * @returns {boolean} true if it is news
     *
     * A selection on a page the sender is not reading is dropped: the room
     * draws a reader's words where the reader is, and nowhere else. The same
     * selection twice is not news, and neither is a clear with nothing
     * selected.
     */
    select(socket, sel) {
      const me = peers.get(socket)
      if (!me || me.spectator) return false
      if (sel && selPlace(sel) !== placeOf(me)) return false
      if (!sel && !me.sel) return false
      if (sel && me.sel && JSON.stringify(sel) === JSON.stringify(me.sel)) return false
      me.sel = sel
      selMoved.add(me)
      beatSnap()
      if (SNAP_MS <= 0) flush()
      return true
    },

    /**
     * When Maurice is back on his feet (server ms, 0 if never squished),
     * for the shell to bake into the boot payload so a fresh tab opens on
     * the shared bug instead of squishing him a moment after the socket
     * connects.
     */
    get squishUntil() {
      return squishUntil
    },

    /** which member each pile shows, for the shell to bake into the boot */
    get fronts() {
      return { ...fronts }
    },

    /**
     * Turn a pile to a member, for everyone, sender included. Participants
     * only. The route has already parsed the frame, so the id and the index
     * are well formed; the pile's size is the client's to clamp.
     * @param {object} socket
     * @param {string} stack
     * @param {number} i
     * @returns {boolean}
     */
    front(socket, stack, i) {
      const me = peers.get(socket)
      if (!me || me.spectator) return false
      fronts[stack] = i
      fanout({ type: SERVER_PUSH.front, stack, i }, null)
      return true
    },

    /**
     * Start or stop a pile's replay for everyone: the room turns its front
     * one member each PLAY_MS up to `n` and tells every tab, the last step
     * included, then lets it go. Starting at the end starts over.
     * @param {object} socket
     * @param {string} stack
     * @param {boolean} on
     * @param {number} n the pile's last member
     * @returns {boolean}
     */
    play(socket, stack, on, n) {
      const me = peers.get(socket)
      if (!me || me.spectator) return false
      if (!on) {
        if (!plays[stack]) return true
        endPlay(stack)
      } else {
        if (plays[stack] || n < 1) return true
        if ((fronts[stack] ?? 0) >= n) {
          fronts[stack] = 0
          fanout({ type: SERVER_PUSH.front, stack, i: 0 }, null)
        }
        plays[stack] = setInterval(() => {
          fronts[stack] = (fronts[stack] ?? 0) + 1
          fanout({ type: SERVER_PUSH.front, stack, i: fronts[stack] }, null)
          if (fronts[stack] >= n) {
            endPlay(stack)
            fanout({ type: SERVER_PUSH.play, stack, on: false }, null)
          }
        }, PLAY_MS)
        plays[stack].unref?.()
      }
      fanout({ type: SERVER_PUSH.play, stack, on }, null)
      return true
    },

    /**
     * Squish Maurice for everyone. Participants only: spectators watch, the
     * same line the cursors draw. A bug already squished stays squished
     * (the first hand's five minutes stand; a second click is not a second
     * squish), so nothing is sent. The squish goes to EVERY open socket,
     * the sender included: a tab that squished optimistically hears the
     * room's own `until` come back and keeps that one.
     * @param {object} socket
     * @param {number} [now] server ms (tests pass their own clock)
     * @returns {boolean} true if he was squished by this
     */
    squish(socket, now = Date.now()) {
      const me = peers.get(socket)
      if (!me || me.spectator) return false
      if (squishUntil > now) return false
      squishUntil = now + SQUISH_MS
      fanout({ type: 'squish', until: squishUntil }, null)
      return true
    },

    /**
     * Relay an act (presence-protocol.js actOf) at once. Not on the
     * snapshot tick: a note that waits up to 42ms for the next frame is a
     * note played late, and an act is an event, not a position, so there is
     * nothing to collapse. The sender is skipped because it already did the
     * thing. Participants only. In a session it goes to every other socket;
     * in the public room only to the tabs following the sender, so a follow
     * is a session of one direction (presence-protocol.js, the acts) and
     * nobody who follows nobody hears a note. A FOLLOW ROOM (primitives/rooms/sessions.js
     * KINDS) is that direction made a room: the host plays to everyone in
     * it, and a guest's act is dropped here, since everybody in the room
     * came to hear the host and none of them chose to hear each other.
     * @param {object} socket
     * @param {string} ch
     * @param {object} d
     * @returns {number} how many sockets it went to
     */
    act(socket, ch, d) {
      const me = peers.get(socket)
      if (me && !me.host && session && session.kind === 'follow') return 0
      if (!me || me.spectator) return 0
      if (session) {
        fanout({ type: 'act', id: me.id, ch, d }, socket)
        return peers.size - 1
      }
      let text = null
      let n = 0
      for (const [s, p] of peers) {
        if (p.spectator || p.f !== me.id || s === socket) continue
        text ??= JSON.stringify({ type: 'act', id: me.id, ch, d })
        raw(s, text)
        n++
      }
      return n
    },

    /**
     * End a session: tell every socket, then close each with 4404, the code
     * a tab reads as "this session is over" (the same code a join to an
     * unknown one gets). The room forgets them here rather than waiting for
     * each close handshake, so an ended room is empty at once and nothing
     * it held can be sent to again. Idempotent.
     */
    end() {
      if (ended) return
      ended = true
      const text = JSON.stringify({ type: 'ended' })
      for (const s of [...peers.keys()]) {
        raw(s, text)
        peers.delete(s)
        LIVE.delete(s)
        try {
          s.close(4404, 'ended')
        } catch {
          /* already gone */
        }
      }
      moved.clear()
      participants = 0
      stop()
      sized()
    },

    /** Mark a socket alive again (pong handler). */
    alive(socket) {
      const me = peers.get(socket)
      if (me) me.alive = true
    },

    /**
     * Send to everyone EXCEPT self. Cursor traffic: a client already drew its
     * own pointer.
     */
    broadcast(self, msg) {
      fanout(msg, self)
    },

    /**
     * Send to everyone, spectators included. This is the publish channel: one
     * message, one serialisation, every open tab. A data push is not cursor
     * traffic, so nobody is excluded and nobody has to have earned a
     * participant slot to hear it.
     */
    broadcastAll(msg) {
      fanout(msg, null)
    },

    /**
     * Send to SOME sockets: one serialisation, the given sockets, and only
     * those still in A room (any room: a session's tabs watch the same dish
     * as the public room's, see LIVE above) and open. The slime mould's
     * frames go this way (primitives/slime/slime.js): the picture is identical for
     * every tab watching the dish, and nothing for a tab that is not.
     * @param {Iterable<object>} sockets
     * @param {object} msg
     */
    sendTo(sockets, msg) {
      let text = null
      for (const s of sockets) {
        if (!LIVE.has(s)) continue
        if (text === null) text = JSON.stringify(msg)
        raw(s, text)
      }
    },

    /** Stop the heartbeat (server shutdown). It restarts on the next join. */
    stop,
  }
}

// One room for the whole process, imported by the route layer and by whoever
// publishes. Tests build their own with createRoom().
export const presenceRoom = createRoom()
