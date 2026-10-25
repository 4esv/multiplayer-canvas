// test/sessions.test.js
// Sessions (lib/sessions.js): a room of the owner's own on the presence
// socket, reached with `?session=`. The security-relevant decisions are all
// at the door (routes/presence.js enterSession), so they are driven here
// over REAL sockets against a real server, with the headers a browser would
// send: only the owner (cookie AND our own Origin) opens one, a guest needs
// the PIN, wrong PINs lock the session, an ended session closes everyone.
// Then what a session is for: the act grammar, the acts relayed to the
// others and nowhere else, and the two rooms not seeing each other.
import './env.js' // first: no boot refresh over the network (issue #273)

import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import WebSocket from 'ws'

const tmp = mkdtempSync(join(tmpdir(), 'canvas-sessions-'))
process.env.AUTH_STORE_PATH = join(tmp, 'auth.json')
process.env.AUDIT_DIR = join(tmp, 'audit')
process.env.ROOMS_STORE_PATH = join(tmp, 'rooms.json')
process.env.TOKENS_PATH = join(tmp, 'tokens.json')
process.env.CREDENTIALS_STORE_PATH = join(tmp, 'credentials.json')

const { build } = await import('../src/server.js')
const { createSession } = await import('../src/services/auth.js')
const { SESSION_COOKIE } = await import('../src/middleware/auth.js')
const { readAudit } = await import('../src/services/audit.js')
// the whole trail as one string, to prove a secret is nowhere in it
const trail = async () => JSON.stringify(await readAudit())
const { ACT_CHANNELS, actOf, isActData, parseFrame } =
  await import('../primitives/presence/presence-protocol.js')
const { presenceRoom, publish } = await import('../primitives/presence/presence-room.js')
const { ACT_BURST } = await import('../src/routes/presence.js')
const {
  CODE_RE,
  IDLE_MS,
  KINDS,
  MAX_AGE_MS,
  PIN_TRIES,
  findSession,
  listSessions,
  pinAsked,
  resetSessions,
  startSession,
  sweepSessions,
} = await import('../primitives/rooms/sessions.js')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let app
let cookie
let base
let origin

before(async () => {
  app = await build({ logger: false })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const { port } = app.server.address()
  base = `ws://127.0.0.1:${port}`
  origin = `http://127.0.0.1:${port}`
  cookie = `${SESSION_COOKIE}=${await createSession('node:test sessions')}`
})

after(async () => {
  resetSessions()
  await app.close()
  rmSync(tmp, { recursive: true, force: true })
})

// every socket a test opened closes here, pass or fail (the public room is
// the process's one room, see test/presence.test.js)
const opened = []
afterEach(() => {
  for (const ws of opened.splice(0)) ws.terminate()
})

// A client the way a browser is one: the cookie when it has one, and an
// Origin. `as` picks who it is: 'owner' (cookie, our origin), 'guest' (our
// origin, no cookie), 'foreign' (cookie, somebody else's origin).
function client(query = '', as = 'guest') {
  const headers = as === 'guest' ? {} : { cookie }
  const ws = new WebSocket(`${base}/ws/cursors${query}`, {
    headers,
    origin: as === 'foreign' ? 'https://evil.example' : origin,
  })
  opened.push(ws)
  const seen = []
  ws.on('message', (d) => seen.push(JSON.parse(d.toString())))
  ws.on('error', () => {})
  // bounded: a door that wrongly lets a socket in leaves it open, and a
  // guard must fail on that, not wait for it forever
  const closed = new Promise((res) => {
    const t = setTimeout(() => res({ code: 'still open', reason: '' }), 3000)
    ws.on('close', (code, reason) => {
      clearTimeout(t)
      res({ code, reason: reason.toString() })
    })
  })
  return {
    ws,
    seen,
    closed,
    send: (m) => ws.send(JSON.stringify(m)),
    typed: (type) => seen.filter((m) => m.type === type),
    async next(type, ms = 5000) {
      const until = Date.now() + ms
      for (;;) {
        const hit = seen.find((m) => m.type === type)
        if (hit) return hit
        if (Date.now() > until) throw new Error(`no ${type} frame in ${ms}ms`)
        await sleep(10)
      }
    },
  }
}

// the owner opens a session over the socket and is its host
async function open(kind = 'session') {
  const host = client(`?session=new&kind=${kind}`, 'owner')
  const hello = await host.next('welcome')
  return { host, hello, code: hello.session.code, pin: hello.session.pin }
}

const OWNER_API = { host: 'example.com', origin: 'http://example.com' }
const inject = (method, url, payload) =>
  app.inject({ method, url, payload, headers: { ...OWNER_API, cookie } })

describe('the act grammar', () => {
  it('is five channels and a flat object of short keys and plain values', () => {
    assert.deepEqual([...ACT_CHANNELS], ['note', 'off', 'patch', 'egg', 'view'])
    for (const d of [
      { i: 'rhodes', n: 60, v: 0.8 },
      { i: 'drums', p: 'kick', v: 1 },
      { i: 'synth', k: 'cutoff', v: true },
      { w: 'sword', p: [0.123, -0.5, 1], n: [0, 1, 0] },
      { p: 'nao', s: [3, 12], e: [4, 0] },
      { p: 'nao' },
      { a: null, b: 'c#4', c: 'x-y' },
      {},
    ])
      assert.ok(isActData(d), JSON.stringify(d))
  })

  it('drops the whole frame for anything else', () => {
    const nine = Object.fromEntries('abcdefghi'.split('').map((k) => [k, 1]))
    for (const d of [
      null,
      [],
      'note',
      3,
      nine,
      { I: 1 },
      { toolongkey: 1 },
      { a_b: 1 },
      { a: 'Upper' },
      { a: '<b>' },
      { a: 'x'.repeat(65) },
      { a: '' },
      { a: '-lead' },
      { a: { nested: 1 } },
      { a: [1, 2, 3, 4, 5, 6, 7] },
      { a: ['1'] },
      { a: [null] },
    ])
      assert.equal(isActData(d), false, JSON.stringify(d))
    // non-finite numbers cannot arrive through JSON, but the check holds
    assert.equal(isActData({ a: Infinity }), false)
    assert.equal(isActData({ a: [NaN] }), false)
    assert.equal(actOf({ ch: 'play', d: {} }), null)
    assert.equal(actOf({ ch: 'note' }), null)
    assert.deepEqual(actOf({ ch: 'note', d: { n: 60 } }), { ch: 'note', d: { n: 60 } })
  })

  // who hears it is the room's to say (presence-room.js act), so the frame
  // reads the same in every room
  it('is one word in every room, read to its plain shape', () => {
    const act = JSON.stringify({ type: 'act', ch: 'note', d: { n: 60 }, extra: 1 })
    assert.deepEqual(parseFrame(act), { kind: 'act', ch: 'note', d: { n: 60 } })
    assert.equal(parseFrame(JSON.stringify({ type: 'act', ch: 'note', d: { N: 1 } })), null)
  })
})

describe('the door', () => {
  it('the owner opens a session and is its host, with the code and the PIN', async () => {
    const { host, hello } = await open('follow')
    assert.match(hello.session.code, CODE_RE)
    assert.equal(hello.session.code.length, 6, 'a generated code is six characters')
    assert.equal(hello.session.kind, 'follow')
    assert.equal(hello.session.host, true)
    // a fresh desk defaults to a PIN (no rooms.json yet)
    assert.match(hello.session.pin, /^\d{4}$/)
    assert.deepEqual(hello.peers, [])
    const [line] = (await readAudit()).filter(
      (l) => l.action === 'rooms.create' && l.target === hello.session.code
    )
    assert.ok(line, 'opening a session is on the trail')
    assert.equal(line.actor.kind, 'session')
    assert.ok(!(await trail()).includes(`"${hello.session.pin}"`), 'a PIN reached the audit trail')
    host.ws.close()
  })

  // mutation: sessions.new-without-owner, sessions.owner-origin-unchecked
  it('nobody else opens one: no cookie, or the cookie from another origin, is 4403', async () => {
    const before = listSessions().length
    for (const as of ['guest', 'foreign']) {
      const c = client('?session=new&kind=session', as)
      const { code, reason } = await c.closed
      assert.equal(code, 4403, as)
      assert.equal(reason, 'owner')
      assert.equal(c.typed('welcome').length, 0, `${as} was welcomed`)
    }
    assert.equal(listSessions().length, before, 'a refused socket opened a session anyway')
  })

  it('an unknown or malformed code is 4404', async () => {
    for (const q of ['?session=zzzzzz', '?session=NOPE!!', '?session=', '?session=a&session=b']) {
      const { code } = await client(q).closed
      assert.equal(code, 4404, q)
    }
  })

  // mutation: sessions.pin-unchecked
  it('a guest needs the PIN: none or a wrong one is 4401, the right one joins', async () => {
    const { host, hello, code, pin } = await open()
    const none = await client(`?session=${code}`).closed
    assert.equal(none.code, 4401)
    assert.equal(none.reason, 'pin')
    const wrong = String((Number(pin) + 1) % 10000).padStart(4, '0')
    for (const bad of [wrong, '12', 'abcd', `${pin}0`])
      assert.equal((await client(`?session=${code}&pin=${bad}`).closed).code, 4401, bad)
    const bads = (await readAudit()).filter((l) => l.action === 'rooms.pin' && l.target === code)
    assert.equal(bads.length, 4, 'every wrong PIN is a line, and a missing one is not')
    assert.ok(!(await trail()).includes(`"${wrong}"`), 'the guess was logged')

    const guest = client(`?session=${code}&pin=${pin}`)
    const welcome = await guest.next('welcome')
    assert.deepEqual(welcome.session, { code, kind: 'session', host: false, pin: null })
    // the guest sees the host, marked
    const h = welcome.peers.find((p) => p.id === hello.id)
    assert.equal(h.h, 1)
    assert.equal(welcome.peers.length, 1)
    // and the host is told the guest joined, unmarked
    const joined = await host.next('join')
    assert.deepEqual(joined, { type: 'join', id: welcome.id })
  })

  it('the owner never needs the PIN, and a second owner tab joins as host too', async () => {
    const { code, hello } = await open()
    const again = client(`?session=${code}`, 'owner')
    const w = await again.next('welcome')
    assert.equal(w.session.host, true)
    assert.equal(w.session.pin, hello.session.pin)
    assert.equal(w.peers[0].h, 1)
  })

  it(`${PIN_TRIES} wrong PINs lock the session, right PIN or not (4429)`, async () => {
    const { code, pin } = await open()
    const wrong = String((Number(pin) + 1) % 10000).padStart(4, '0')
    for (let i = 0; i < PIN_TRIES; i++)
      assert.equal((await client(`?session=${code}&pin=${wrong}`).closed).code, 4401, `try ${i}`)
    const locked = await client(`?session=${code}&pin=${pin}`).closed
    assert.equal(locked.code, 4429)
    assert.equal(locked.reason, 'locked')
    assert.equal((await client(`?session=${code}`).closed).code, 4429, 'no PIN, still locked')
    // the owner is not a guest and is never locked out of his own room
    const owner = client(`?session=${code}`, 'owner')
    assert.equal((await owner.next('welcome')).session.host, true)
  })

  it('a session opened without a PIN lets anybody with the code in', async () => {
    const rec = startSession({ kind: 'session', pin: false })
    const g = client(`?session=${rec.code}`)
    const w = await g.next('welcome')
    assert.deepEqual(w.session, { code: rec.code, kind: 'session', host: false, pin: null })
  })

  // mutation: sessions.code-grammar-narrow
  it('a code is a word: lower case, digits and dashes, a letter or digit first, up to 32', () => {
    assert.deepEqual([...KINDS], ['follow', 'session'])
    for (const ok of ['jam', 'demo', 'thursday-jam', 'k3x9qa', '7', 'a'.repeat(32), 'new'])
      assert.match(ok, CODE_RE, ok)
    for (const bad of ['', '-jam', 'Jam', 'a_b', 'a b', 'a.b', 'a'.repeat(33), 'jam!', 'é'])
      assert.doesNotMatch(bad, CODE_RE, bad)
  })

  // mutation: sessions.owner-names-nothing
  it("the owner naming a room nobody opened opens it with that code; the room's kind wins after", async () => {
    const host = client('?session=demo-1&kind=follow&pin=off', 'owner')
    const hw = await host.next('welcome')
    assert.deepEqual(hw.session, { code: 'demo-1', kind: 'follow', host: true, pin: null })
    const [line] = (await readAudit()).filter(
      (l) => l.action === 'rooms.create' && l.target === 'demo-1'
    )
    assert.ok(line, 'a named room is on the trail as a new one')
    // a guest asking for it as a session is in the follow room it is
    const guest = client('?session=demo-1&kind=session')
    assert.deepEqual((await guest.next('welcome')).session, {
      code: 'demo-1',
      kind: 'follow',
      host: false,
      pin: null,
    })
    // and a second owner tab joins it rather than opening another
    const again = client('?session=demo-1&kind=session', 'owner')
    const aw = await again.next('welcome')
    assert.equal(aw.session.kind, 'follow')
    assert.equal(aw.session.host, true)
    assert.equal(listSessions().filter((r) => r.code === 'demo-1').length, 1)
  })

  // mutation: sessions.guest-names-a-room
  it("anybody else's unknown code is 4404 and opens nothing, a word or not", async () => {
    const before = listSessions().length
    for (const q of ['?session=jam-x&kind=session', '?session=jam-x&kind=follow&pin=off']) {
      const c = client(q)
      assert.equal((await c.closed).code, 4404, q)
      assert.equal(c.typed('welcome').length, 0)
    }
    // nor the owner's across somebody else's origin
    assert.equal((await client('?session=jam-x', 'foreign').closed).code, 4404)
    assert.equal(listSessions().length, before, 'a refused socket opened a room')
    // and a code that is not a code opens nothing for the owner either
    assert.equal((await client('?session=Not_A_Code', 'owner').closed).code, 4404)
  })

  // mutation: sessions.pin-off-ignored, sessions.pin-digits-ignored
  it("the owner's pin: off is none, four digits are that PIN, absent is the desk's default", async () => {
    assert.equal(pinAsked('off', true), false)
    assert.equal(pinAsked('4821', false), '4821')
    assert.equal(pinAsked(undefined, true), true)
    assert.equal(pinAsked('', false), false)
    // a slip is the desk's door, never an open room
    assert.equal(pinAsked('482', true), true)
    const off = client('?session=pin-off&kind=session&pin=off', 'owner')
    assert.equal((await off.next('welcome')).session.pin, null)
    const set = client('?session=pin-set&kind=session&pin=4821', 'owner')
    assert.equal((await set.next('welcome')).session.pin, '4821')
    // the guest's pin is the attempt, as ever
    assert.equal((await client('?session=pin-set&pin=1111').closed).code, 4401)
    const g = client('?session=pin-set&pin=4821')
    assert.equal((await g.next('welcome')).session.code, 'pin-set')
    const dflt = client('?session=pin-dflt&kind=session', 'owner')
    assert.match((await dflt.next('welcome')).session.pin, /^\d{4}$/)
  })
})

describe('in the room', () => {
  async function pair() {
    const { host, hello, code, pin } = await open()
    const guest = client(`?session=${code}&pin=${pin}`)
    const gw = await guest.next('welcome')
    await host.next('join')
    return { host, guest, hostId: hello.id, guestId: gw.id, code }
  }

  it('an act goes to every other socket at once, and never back to its sender', async () => {
    const { host, guest, hostId, guestId } = await pair()
    host.send({ type: 'act', ch: 'note', d: { i: 'rhodes', n: 60, v: 0.5 } })
    const got = await guest.next('act')
    assert.deepEqual(got, {
      type: 'act',
      id: hostId,
      ch: 'note',
      d: { i: 'rhodes', n: 60, v: 0.5 },
    })
    guest.send({ type: 'act', ch: 'egg', d: { w: 'egg', p: [0, 1, 0], n: [0, 0, 1] } })
    assert.deepEqual(await host.next('act'), {
      type: 'act',
      id: guestId,
      ch: 'egg',
      d: { w: 'egg', p: [0, 1, 0], n: [0, 0, 1] },
    })
    await sleep(80)
    assert.equal(host.typed('act').length, 1, 'the host heard its own act')
    assert.equal(guest.typed('act').length, 1, 'the guest heard its own act')
    // a malformed act is dropped whole, not relayed in part
    host.send({ type: 'act', ch: 'note', d: { i: '<script>' } })
    host.send({ type: 'act', ch: 'shout', d: {} })
    await sleep(80)
    assert.equal(guest.typed('act').length, 1)
  })

  // A follow is a session of one direction: the one followed plays, the
  // ones following hear it, and nobody else in the public room does.
  // mutation: sessions.public-act-to-all, sessions.public-act-to-none, sessions.public-act-upstream
  it("an act in the public room reaches the sender's followers and nobody else", async () => {
    const lead = client()
    const fan = client()
    const idle = client()
    const leadId = (await lead.next('welcome')).id
    await fan.next('welcome')
    await idle.next('welcome')
    const note = { i: 'rhodes', n: 60, v: 0.5 }
    // nobody follows yet: the act goes nowhere
    lead.send({ type: 'act', ch: 'note', d: note })
    await sleep(80)
    assert.equal(fan.typed('act').length, 0, 'an act reached a tab following nobody')
    fan.send({ type: 'move', fx: 0.5, fy: 0.5, k: null, f: leadId })
    idle.send({ type: 'move', fx: 0.25, fy: 0.25, k: null })
    await sleep(60)
    lead.send({ type: 'act', ch: 'note', d: note })
    assert.deepEqual(await fan.next('act'), { type: 'act', id: leadId, ch: 'note', d: note })
    // and never the other way: the one followed never chose to hear them
    fan.send({ type: 'act', ch: 'note', d: { i: 'rhodes', n: 62, v: 0.5 } })
    await sleep(80)
    assert.equal(lead.typed('act').length, 0, 'a follower played into the one it follows')
    assert.equal(idle.typed('act').length, 0, 'an act reached a tab following nobody')
    // letting go is the end of it
    fan.send({ type: 'move', fx: 0.5, fy: 0.5, k: null, f: 0 })
    await sleep(60)
    lead.send({ type: 'act', ch: 'note', d: note })
    await sleep(80)
    assert.equal(fan.typed('act').length, 1, 'an act reached a tab that let go')
  })

  // A follow room is the follow made a room: the host plays to everyone
  // in it, and what a guest plays goes nowhere, not to the host and not to
  // the other guests.
  // mutation: sessions.follow-room-guest-plays
  it('in a follow room the host plays to every guest, and a guest plays to nobody', async () => {
    const { host, hello, code, pin } = await open('follow')
    const a = client(`?session=${code}&pin=${pin}`)
    const b = client(`?session=${code}&pin=${pin}`)
    const aId = (await a.next('welcome')).id
    await b.next('welcome')
    const note = { i: 'rhodes', n: 60, v: 0.5 }
    host.send({ type: 'act', ch: 'note', d: note })
    assert.deepEqual(await a.next('act'), { type: 'act', id: hello.id, ch: 'note', d: note })
    assert.deepEqual(await b.next('act'), { type: 'act', id: hello.id, ch: 'note', d: note })
    a.send({ type: 'act', ch: 'note', d: { i: 'rhodes', n: 62, v: 0.5 } })
    await sleep(100)
    assert.equal(host.typed('act').length, 0, 'a guest played into the host')
    assert.equal(
      b.typed('act').filter((m) => m.id === aId).length,
      0,
      'a guest played into another guest'
    )
  })

  it(`acts are a bucket of ${ACT_BURST}: a chord gets through, a flood does not`, async () => {
    const { host, guest } = await pair()
    for (let i = 0; i < ACT_BURST * 2; i++)
      host.send({ type: 'act', ch: 'note', d: { n: i % 128 } })
    await sleep(150)
    const n = guest.typed('act').length
    assert.ok(n >= ACT_BURST, `only ${n} of a burst of ${ACT_BURST} got through`)
    assert.ok(n < ACT_BURST + 10, `${n} of ${ACT_BURST * 2} got through: no bucket`)
  })

  it('the public room and a session never see each other move', async () => {
    const a = client()
    const b = client()
    await a.next('welcome')
    await b.next('welcome')
    const { host, guest } = await pair()
    guest.send({ type: 'move', fx: 0.5, fy: 0.5, k: null })
    await host.next('moves')
    await sleep(100)
    assert.equal(a.typed('moves').length, 0, 'a session move reached the public room')
    // (the guest hears its own entry too: a snapshot is one frame for the
    // whole place, sender included, see presence-room.js flush)
    const heard = host.typed('moves').length + guest.typed('moves').length
    a.send({ type: 'move', fx: 0.25, fy: 0.25, k: null })
    await b.next('moves')
    await sleep(100)
    assert.equal(
      host.typed('moves').length + guest.typed('moves').length,
      heard,
      'a public move reached the session'
    )
    // nor each other's joins
    assert.equal(a.typed('join').length, 1, 'only b joined the public room')
  })

  it('the follow rides the move in a session too, with its stamp', async () => {
    const { host, guest, hostId, guestId } = await pair()
    guest.send({ type: 'move', fx: 0.5, fy: 0.5, f: hostId })
    const m = await host.next('moves')
    const e = m.m.find((x) => x[0] === guestId)
    assert.equal(e.length, 8)
    assert.equal(e[6], hostId)
    assert.ok(e[7] > 0)
  })

  it('publish and sendTo reach session sockets as well as public ones', async () => {
    const pub = client()
    await pub.next('welcome')
    const { guest } = await pair()
    publish({ type: 'stale', keys: ['weather'] })
    assert.deepEqual(await guest.next('stale'), { type: 'stale', keys: ['weather'] })
    assert.deepEqual(await pub.next('stale'), { type: 'stale', keys: ['weather'] })
    // the dish's and the sky's channel: a socket from ANY room, through the
    // public room's handle (services/slime.js, services/sky.js)
    const rec = startSession({ pin: false })
    const sent = []
    const fake = { OPEN: 1, readyState: 1, send: (t) => sent.push(JSON.parse(t)), ping() {} }
    rec.room.join(fake)
    presenceRoom.sendTo([fake], { type: 'sky', x: 1, y: 0 })
    assert.deepEqual(sent.at(-1), { type: 'sky', x: 1, y: 0 })
    rec.room.leave(fake)
    presenceRoom.sendTo([fake], { type: 'sky', x: 2, y: 0 })
    assert.deepEqual(sent.at(-1), { type: 'sky', x: 1, y: 0 }, 'a socket that left was sent to')
  })
})

describe('the end', () => {
  it('ending tells every tab, closes each with 4404, and the code is gone', async () => {
    const { host, code, pin } = await open()
    const guest = client(`?session=${code}&pin=${pin}`)
    await guest.next('welcome')
    const r = await inject('DELETE', `/api/admin/rooms/${code}`)
    assert.equal(r.statusCode, 200)
    assert.deepEqual(await guest.next('ended'), { type: 'ended' })
    assert.deepEqual(await guest.closed, { code: 4404, reason: 'ended' })
    assert.equal((await host.closed).code, 4404)
    assert.equal((await client(`?session=${code}&pin=${pin}`).closed).code, 4404)
    const [line] = (await readAudit()).filter((l) => l.action === 'rooms.end' && l.target === code)
    assert.equal(line.outcome, 'ok')
    assert.equal(line.actor.kind, 'session')
    assert.equal((await inject('DELETE', `/api/admin/rooms/${code}`)).statusCode, 404)
    // the owner naming the code again opens a NEW room with it (the flag in
    // his address is the room): empty, with nothing of the old one in it
    const again = client(`?session=${code}&kind=follow&pin=off`, 'owner')
    const w = await again.next('welcome')
    assert.deepEqual(w.session, { code, kind: 'follow', host: true, pin: null })
    assert.deepEqual(w.peers, [])
  })

  it('the sweep ends a session empty for twenty minutes, or twelve hours old', () => {
    resetSessions() // the sessions the tests above left, all empty by now
    const t0 = Date.now()
    const idle = startSession({ pin: false }, t0)
    const busy = startSession({ pin: false }, t0)
    const fake = { OPEN: 1, readyState: 1, send() {}, ping() {}, close() {} }
    busy.room.join(fake)
    assert.deepEqual(sweepSessions(t0 + IDLE_MS - 1), [])
    assert.deepEqual(sweepSessions(t0 + IDLE_MS), [idle.code])
    assert.equal(findSession(idle.code, t0 + IDLE_MS), null)
    assert.ok(findSession(busy.code, t0 + IDLE_MS), 'a session with somebody in it went idle')
    assert.deepEqual(sweepSessions(t0 + MAX_AGE_MS), [busy.code])
  })
})

describe('the desk', () => {
  it('lists, starts, sets the default and ends, each mutation on the trail', async () => {
    const list0 = await inject('GET', '/api/admin/rooms')
    assert.equal(list0.statusCode, 200)
    assert.equal(list0.json().pin, true)

    const made = await inject('POST', '/api/admin/rooms', { kind: 'follow' })
    assert.equal(made.statusCode, 201)
    const room = made.json()
    assert.match(room.code, CODE_RE)
    assert.equal(room.kind, 'follow')
    assert.match(room.pin, /^\d{4}$/)
    // the flag in the link is the room's kind: the address is the room
    assert.equal(room.link, `/?follow=${room.code}`)
    const listed = (await inject('GET', '/api/admin/rooms')).json().rooms
    const row = listed.find((x) => x.code === room.code)
    assert.deepEqual(Object.keys(row).sort(), [
      'code',
      'hosts',
      'idleSince',
      'kind',
      'people',
      'pin',
      'started',
    ])
    assert.equal(row.people, 0)

    const set = await inject('PUT', '/api/admin/rooms/settings', { pin: false })
    assert.deepEqual(set.json(), { pin: false })
    assert.equal((await inject('GET', '/api/admin/rooms')).json().pin, false)
    const open2 = await inject('POST', '/api/admin/rooms', { kind: 'session' })
    assert.equal(open2.json().pin, null, 'the default did not reach a new session')
    const pinned = await inject('POST', '/api/admin/rooms', { kind: 'session', pin: true })
    assert.match(pinned.json().pin, /^\d{4}$/, 'an explicit pin lost to the default')
    await inject('PUT', '/api/admin/rooms/settings', { pin: true })

    for (const bad of [
      {},
      { kind: 'party' },
      { kind: 'presentation' },
      { kind: 'session', pin: 'yes' },
    ])
      assert.equal((await inject('POST', '/api/admin/rooms', bad)).statusCode, 400)
    assert.equal(
      (await inject('PUT', '/api/admin/rooms/settings', { pin: 1 })).statusCode,
      400,
      'a setting that is not a boolean'
    )

    assert.equal((await inject('DELETE', `/api/admin/rooms/${room.code}`)).statusCode, 200)
    const lines = await readAudit()
    const of = (action, target) => lines.find((l) => l.action === action && l.target === target)
    assert.ok(of('rooms.create', room.code))
    assert.ok(of('rooms.create', open2.json().code))
    assert.ok(of('rooms.end', room.code))
    assert.ok(lines.some((l) => l.action === 'rooms.settings' && l.pinDefault === false))
    const text = await trail()
    for (const p of [room.pin, pinned.json().pin])
      assert.ok(!text.includes(`"${p}"`), 'a PIN reached the audit trail')
  })

  it("is the owner's: no cookie is 401, another origin is 403", async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/admin/rooms' })
    assert.equal(anon.statusCode, 401)
    const cross = await app.inject({
      method: 'POST',
      url: '/api/admin/rooms',
      payload: { kind: 'session' },
      headers: { host: 'example.com', origin: 'https://evil.example', cookie },
    })
    assert.equal(cross.statusCode, 403)
  })

  it('the page shows each live room with its link, QR and PIN', async () => {
    const made = (await inject('POST', '/api/admin/rooms', { kind: 'session', pin: true })).json()
    const r = await app.inject({ method: 'GET', url: '/admin/sessions', headers: { cookie } })
    assert.equal(r.statusCode, 200)
    assert.ok(r.body.includes(`data-code="${made.code}"`))
    assert.ok(r.body.includes(`href="/?session=${made.code}"`))
    assert.ok(r.body.includes(made.pin))
    // the QR is of the absolute link, on this request's own origin
    assert.match(
      r.body,
      new RegExp(`aria-label="QR code of https?://[^"/]+/\\?session=${made.code}"`)
    )
    // the page's script arms its end button instead of asking the browser
    assert.ok(r.body.includes('data-act="end"'))
  })
})
