// test/session-client.test.js
// The browser half of rooms, following and the conga (2026-09-25). The
// server half (who may open a room, the PIN, the relay) is
// test/sessions.test.js; this holds what a tab does with it: the arithmetic
// of a line of followers (primitives/presence/conga.js), what lets a follow go
// (primitives/rooms/follow.js), and presence.js under a stub socket, since the room a
// tab asks for, what it may send and what it does with a refusal are all
// decided there. The address half (the flag is the room) is
// test/finder-url.test.js.
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { GAP_MS, TRAIL_MS, linesOf, record, sampleAt } from '../primitives/presence/conga.js'
import { FOLLOW_SLACK, createFollow } from '../primitives/rooms/follow.js'
import { ROOM_CODE_RE } from '../primitives/rooms/finder-url.js'
import { M } from '../src/static/canvas/layout.js'
import { initPresence } from '../primitives/presence/presence.js'
import { CODE_RE } from '../primitives/rooms/sessions.js'

describe('the conga: who walks behind whom (conga.js)', () => {
  // mutation: conga.line-by-id
  it('a line is in the order the room saw people join it, not by id', () => {
    const lines = linesOf([
      { id: 1, f: null, fs: 0 },
      { id: 2, f: 1, fs: 9 },
      { id: 3, f: 1, fs: 4 },
      { id: 4, f: 1, fs: 6 },
    ])
    assert.deepEqual([...lines], [[1, [3, 4, 2]]])
  })

  it('following a follower puts you in the same line, behind everyone in it', () => {
    // 3 picked 2, who picked 1: one line headed by 1, not a line inside a line
    const lines = linesOf([
      { id: 1, f: null, fs: 0 },
      { id: 2, f: 1, fs: 1 },
      { id: 3, f: 2, fs: 2 },
    ])
    assert.deepEqual([...lines], [[1, [2, 3]]])
  })

  it('a follower of nobody here is in no line, and a loop still makes one line', () => {
    assert.deepEqual([...linesOf([{ id: 5, f: 99, fs: 1 }])], [])
    // two people following each other: the lower id heads it, on every tab
    const loop = linesOf([
      { id: 8, f: 6, fs: 2 },
      { id: 6, f: 8, fs: 1 },
    ])
    assert.deepEqual([...loop], [[6, [8]]])
    // somebody following into that loop joins the same line
    const into = linesOf([
      { id: 8, f: 6, fs: 2 },
      { id: 6, f: 8, fs: 1 },
      { id: 9, f: 8, fs: 3 },
    ])
    assert.deepEqual([...into], [[6, [8, 9]]])
  })

  // mutation: conga.path-snaps
  it('a dancer is on the head path, between two recorded points', () => {
    const hist = [
      { t: 0, m: 0, x: 0.1, y: 0.2, at: null },
      { t: 100, m: 100, x: 0.3, y: 0.4, at: null },
    ]
    const mid = sampleAt(hist, 50)
    assert.ok(Math.abs(mid.x - 0.2) < 1e-9 && Math.abs(mid.y - 0.3) < 1e-9, JSON.stringify(mid))
    // the back of a long line waits at the start of the path, never nowhere
    assert.deepEqual(sampleAt(hist, 900), { x: 0.1, y: 0.2, at: null })
    assert.deepEqual(sampleAt(hist, 0), { x: 0.3, y: 0.4, at: null })
    assert.equal(sampleAt([], 5), null)
  })

  // mutation: conga.wall-clock
  it('a head that stops keeps its line strung out behind it, not stacked on it', () => {
    // walk right for 600ms at 60 frames a second, then stand for five seconds
    const hist = []
    let t = 0
    for (; t <= 600; t += 16) record(hist, t, 0.1 + t / 6000, 0.5, null)
    const head = hist[hist.length - 1].x
    for (; t <= 5600; t += 16) record(hist, t, head, 0.5, null)
    const first = sampleAt(hist, GAP_MS)
    assert.ok(
      head - first.x > 0.03,
      `the first dancer walked into the resting head: ${(head - first.x).toFixed(4)} behind`
    )
    // and the path's clock waited for it: standing is not a step
    assert.ok(hist[hist.length - 1].m <= 600 + 16, `the clock ran on: ${hist.at(-1).m}`)
    // moving again after the pause: one short step, not a five second leap
    record(hist, t + 16, head + 0.001, 0.5, null)
    assert.ok(hist.at(-1).m - hist.at(-2).m <= 100, 'a pause counted as a long step')
  })

  it('on the ground the path goes the short way round the seam; across a page change it jumps', () => {
    const seam = [
      { t: 0, m: 0, x: 0.95, y: 0.5, at: null },
      { t: 100, m: 100, x: 0.05, y: 0.5, at: null },
    ]
    const x = sampleAt(seam, 50).x
    assert.ok(x > 0.99 || x < 0.01, `took the long way: ${x}`)
    const pages = [
      { t: 0, m: 0, x: 0.2, y: 0.2, at: 'nao#1' },
      { t: 100, m: 100, x: 0.8, y: 0.8, at: 'nao#2' },
    ]
    assert.deepEqual(sampleAt(pages, 40), { x: 0.2, y: 0.2, at: 'nao#1' })
  })

  it('a path keeps its trail and one point older, and forgets the rest', () => {
    const hist = []
    for (let t = 0; t <= 30000; t += 16) record(hist, t, (t / 30000) * 0.9, 0.5, null)
    const newest = hist[hist.length - 1].m
    assert.ok(hist[0].m < newest - TRAIL_MS, 'no point left to stand on at the far edge')
    assert.ok(hist[1].m >= newest - TRAIL_MS, 'kept more than one point past the trail')
    assert.ok(GAP_MS > 0 && GAP_MS * 20 < TRAIL_MS, 'a line of twenty runs off its path')
  })
})

describe('one queue per line: a pick attaches to the head (follow.js)', () => {
  // 3 follows 2, who follows 1; 9 follows this tab (id 7)
  const F = { 1: null, 2: 1, 3: 2, 9: 7 }
  const headOf = (who) => {
    let cur = who
    while (F[cur]) {
      cur = F[cur]
      if (cur === 7) return null
    }
    return cur
  }

  // mutation: follow.pick-ignores-head
  it('picking somebody in a line follows its head, and never your own follower', () => {
    const f = createFollow(() => {}, headOf)
    assert.equal(f.pick(3), true)
    assert.equal(f.id, 1, 'picking the back of a line did not attach to its head')
    assert.equal(f.pick(2), false, 'the same line picked twice is a no-op')
    f.release()
    assert.equal(f.pick(9), false, 'this tab followed its own follower')
    assert.equal(f.id, null)
  })

  it('when the one followed joins a line, the follower moves up to its head', () => {
    F[4] = null
    const f = createFollow(() => {}, headOf)
    f.pick(4)
    assert.equal(f.reattach(), false, 'nothing changed, and it said otherwise')
    F[4] = 1
    assert.equal(f.reattach(), true)
    assert.equal(f.id, 1)
    delete F[4]
  })
})

describe('what lets a follow go (follow.js)', () => {
  it('the slack is three modules of screen', () => {
    assert.equal(FOLLOW_SLACK, 3 * M)
  })

  // mutation: follow.slack-ignored, follow.slack-kept-across-picks
  it("a click-follow ends when the follower's own hand walks off, not before", () => {
    const f = createFollow()
    f.pick(3)
    // the first hand after the pick is where the follow began
    assert.equal(f.pointer(500, 400), false)
    assert.equal(f.pointer(500 + FOLLOW_SLACK, 400), false, 'let go at the slack itself')
    assert.equal(f.pointer(500 - 60, 400 + 60), false, 'a drift let go')
    assert.equal(f.id, 3)
    assert.equal(f.pointer(500 + FOLLOW_SLACK * 0.8, 400 + FOLLOW_SLACK * 0.8), true)
    assert.equal(f.id, null)
    // and a new follow measures from where the hand is now, even one
    // picked straight over another without letting go
    f.pick(4)
    f.pointer(100, 100)
    f.pick(5)
    f.pointer(1000, 900)
    assert.equal(f.pointer(1000 + FOLLOW_SLACK - 1, 900), false)
    assert.equal(f.id, 5, 'the new follow was measured from the old one')
    // a hand moving while nobody is followed is nothing
    f.release()
    assert.equal(f.pointer(0, 0), false)
  })

  // mutation: follow.held-lets-go
  it("held (a follow room), the follower's own input and hand let nothing go", () => {
    const f = createFollow()
    f.hold(true)
    f.pick(3)
    f.pointer(0, 0)
    assert.equal(f.input(), false)
    assert.equal(f.pointer(10 * FOLLOW_SLACK, 0), false)
    assert.equal(f.id, 3)
    // leaving is still leaving, and the peer going still lets go
    assert.equal(f.left(3), true)
    f.pick(3)
    assert.equal(f.release(), true)
    // unheld, steering lets go at once
    f.hold(false)
    f.pick(3)
    assert.equal(f.input(), true)
  })
})

describe('presence.js in a session, under a stub socket', () => {
  function harness(room = null) {
    const saved = {
      WebSocket: globalThis.WebSocket,
      document: globalThis.document,
      location: globalThis.location,
      addEventListener: globalThis.addEventListener,
      matchMedia: globalThis.matchMedia,
    }
    const el = () => ({
      style: {},
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild() {},
      remove() {},
      setAttribute() {},
      addEventListener() {},
    })
    const sockets = []
    class StubSocket {
      static OPEN = 1
      constructor(url) {
        this.url = url
        this.readyState = 1
        this.sent = []
        sockets.push(this)
      }
      send(t) {
        this.sent.push(JSON.parse(t))
      }
      close() {
        this.readyState = 3
        this.onclose?.({ code: 1000 })
      }
    }
    globalThis.WebSocket = StubSocket
    globalThis.document = { createElement: el, hidden: false, addEventListener() {} }
    globalThis.location = { protocol: 'http:', host: 'test' }
    globalThis.addEventListener = () => {}
    globalThis.matchMedia = () => ({ matches: true })
    const api = initPresence({ scene: el(), wrapPos: () => null, room })
    const last = () => sockets[sockets.length - 1]
    const say = (m) => last().onmessage({ data: JSON.stringify(m) })
    const welcome = (extra = {}) =>
      say({
        type: 'welcome',
        id: 7,
        spectator: false,
        t: Date.now(),
        squish: 0,
        fronts: {},
        peers: [],
        ...extra,
      })
    const restore = () => Object.assign(globalThis, saved)
    return { api, sockets, last, say, welcome, restore }
  }
  const READ = { camX: 0, camY: 0, WORLD_W: 100, WORLD_H: 100, VW: 100, VH: 100 }

  it('the client and the server read a code with one grammar', () => {
    assert.equal(CODE_RE, ROOM_CODE_RE)
  })

  // mutation: session.kind-unsaid
  it('the room is the socket query: none for the public room, a code, or new, with its kind', () => {
    for (const [room, want] of [
      [null, 'ws://test/ws/cursors'],
      [{ code: 'abc234' }, 'ws://test/ws/cursors?session=abc234'],
      [{ code: 'abc234', pin: '1234' }, 'ws://test/ws/cursors?session=abc234&pin=1234'],
      [{ code: 'new', kind: 'follow' }, 'ws://test/ws/cursors?session=new&kind=follow'],
      // the owner's named room is opened as the kind his address says
      [
        { code: 'jam', kind: 'session', pin: 'off' },
        'ws://test/ws/cursors?session=jam&kind=session&pin=off',
      ],
      [{ code: 'demo', kind: 'follow' }, 'ws://test/ws/cursors?session=demo&kind=follow'],
    ]) {
      const h = harness(room)
      try {
        assert.equal(h.sockets[0].url, want)
      } finally {
        h.restore()
      }
    }
  })

  // mutation: session.act-outside, session.follow-hears-nothing, session.followed-by-anybody
  it('an act goes out in a session or to a follower, and never from a spectator', () => {
    const pub = harness()
    try {
      pub.welcome({
        peers: [{ id: 3, fx: 0.5, fy: 0.5, k: null, d: false, at: null, f: 0, fs: 0 }],
      })
      pub.api.act('note', { i: 'synth', n: 60, v: 1 })
      assert.deepEqual(pub.last().sent, [], 'the public room was sent an act nobody follows')
      // somebody else's follower is not this tab's
      pub.say({ type: 'moves', m: [[3, 100, 100, 0, 0, 0, 4, 1]] })
      pub.api.act('note', { i: 'synth', n: 60, v: 1 })
      assert.deepEqual(pub.last().sent, [], 'an act went to a line this tab does not lead')
      // a follow is a session of one direction: once 3 follows this tab
      // (7), what it plays goes out for 3 to hear
      pub.say({ type: 'moves', m: [[3, 100, 100, 0, 0, 0, 7, 1]] })
      pub.api.act('note', { i: 'synth', n: 61, v: 1 })
      assert.deepEqual(pub.last().sent, [
        { type: 'act', ch: 'note', d: { i: 'synth', n: 61, v: 1 } },
      ])
      // and letting go is the end of it
      pub.say({ type: 'moves', m: [[3, 100, 100, 0, 0, 0, 0, 0]] })
      pub.api.act('note', { i: 'synth', n: 62, v: 1 })
      assert.equal(pub.last().sent.length, 1, 'an act went out after the follower let go')
    } finally {
      pub.restore()
    }
    const h = harness({ code: 'abc234' })
    try {
      h.welcome({ session: { code: 'abc234', kind: 'session', host: false, pin: null } })
      h.api.act('note', { i: 'synth', n: 60, v: 1 })
      assert.deepEqual(h.last().sent, [{ type: 'act', ch: 'note', d: { i: 'synth', n: 60, v: 1 } }])
      h.welcome({ spectator: true, session: { code: 'abc234', kind: 'session', host: false } })
      h.api.act('note', { i: 'synth', n: 61, v: 1 })
      assert.equal(h.last().sent.length, 1, 'a spectator acted')
    } finally {
      h.restore()
    }
  })

  // mutation: session.follow-guest-sends
  it("a follow room's host plays to the room; its guest sends nothing, even followed", () => {
    const g = harness({ code: 'demo', kind: 'follow' })
    try {
      g.welcome({
        session: { code: 'demo', kind: 'follow', host: false, pin: null },
        peers: [{ id: 3, fx: 0.5, fy: 0.5, k: null, d: false, at: null, f: 7, fs: 1 }],
      })
      g.api.act('note', { i: 'synth', n: 60, v: 1 })
      assert.deepEqual(g.last().sent, [], "a follow room's guest sent an act")
    } finally {
      g.restore()
    }
    const h = harness({ code: 'demo', kind: 'follow' })
    try {
      h.welcome({ session: { code: 'demo', kind: 'follow', host: true, pin: null } })
      h.api.act('note', { i: 'synth', n: 60, v: 1 })
      assert.equal(h.last().sent.length, 1, "a follow room's host was silenced")
    } finally {
      h.restore()
    }
  })

  // mutation: session.follow-unsaid
  it('whom a tab follows rides its move frame, and letting go stops saying it', () => {
    const h = harness()
    try {
      h.welcome({ peers: [{ id: 3, fx: 0.5, fy: 0.5, k: null, d: false, at: null }] })
      h.api.post(0.2, 0.2)
      h.api.follow(3)
      h.api.frame(READ, 1000)
      const first = h.last().sent.at(-1)
      assert.equal(first.type, 'move')
      assert.equal(first.f, 3)
      h.api.follow(null)
      h.api.frame(READ, 2000)
      const second = h.last().sent.at(-1)
      assert.equal(second.type, 'move')
      assert.ok(!('f' in second), 'a tab following nobody still names somebody')
    } finally {
      h.restore()
    }
  })

  it('a peer following somebody is read off the eight-field entry and the roster', () => {
    const h = harness()
    try {
      h.welcome({
        peers: [
          { id: 3, fx: 0.5, fy: 0.5, k: null, d: false, at: null, f: 0, fs: 0 },
          { id: 4, fx: 0.5, fy: 0.5, k: null, d: false, at: null, f: 3, fs: 2 },
        ],
      })
      assert.equal(h.api.roster().find((p) => p.id === 4).f, 3)
      h.say({ type: 'moves', m: [[3, 100, 100, 0, 0, 0, 4, 5]] })
      assert.equal(h.api.roster().find((p) => p.id === 3).f, 4)
      h.say({ type: 'moves', m: [[3, 100, 100, 0, 0, 0, 0, 0]] })
      assert.equal(h.api.roster().find((p) => p.id === 3).f, null)
    } finally {
      h.restore()
    }
  })

  // mutation: session.pin-retried
  it('a PIN refusal waits for a PIN; a session that ended goes home to the public room', () => {
    const h = harness({ code: 'abc234' })
    try {
      const said = []
      h.api.onSession((state) => said.push(state))
      h.last().onclose({ code: 4401 })
      assert.deepEqual(said, ['pin'])
      assert.equal(h.sockets.length, 1, 'a wrong PIN was offered again, blind')
      h.api.goRoom({ code: 'abc234', pin: '4821' })
      assert.equal(h.last().url, 'ws://test/ws/cursors?session=abc234&pin=4821')
      h.welcome({ session: { code: 'abc234', kind: 'follow', host: false, pin: null } })
      assert.deepEqual(said, ['pin', 'joined'])
      assert.equal(h.api.sessionNow().kind, 'follow')
      h.say({ type: 'ended' })
      h.last().onclose({ code: 4404 })
      assert.equal(said.at(-1), 'ended')
      assert.equal(h.api.sessionNow(), null)
      assert.equal(h.last().url, 'ws://test/ws/cursors', 'an ended session did not go home')
    } finally {
      h.restore()
    }
  })

  it("the owner's welcome carries the PIN to show; a guest's never does", () => {
    const h = harness({ code: 'new', kind: 'session' })
    try {
      h.welcome({ session: { code: 'k3x9qa', kind: 'session', host: true, pin: '4821' } })
      assert.deepEqual(h.api.sessionNow(), {
        code: 'k3x9qa',
        kind: 'session',
        host: true,
        pin: '4821',
      })
    } finally {
      h.restore()
    }
  })
})

// A reader's hand leaving the window, or the window losing focus, is not the
// reader leaving the page: the post that retracts the highlight carries the
// page anchor it had, or every tab following this one closes its page.
describe('the place survives the hand leaving the window (app.js)', () => {
  const app = readFileSync(new URL('../src/static/canvas/app.js', import.meta.url), 'utf8')
  // mutation: session.leave-drops-place, session.blur-drops-place
  it('pointerleave and blur post the last anchor, not the ground', () => {
    assert.match(
      app,
      /addEventListener\('pointerleave', \(\)=>presence\.post\(-1, -1, null, false, lastAt\)\)/
    )
    assert.match(
      app,
      /addEventListener\('blur', \(\)=>presence\.post\(-1, -1, null, false, lastAt\)\)/
    )
  })
})
