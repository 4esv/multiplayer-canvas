// test/presence.test.js
// The cursor-presence socket is public and unauthenticated, so the only
// security-relevant server decision is what counts as a valid inbound frame.
// parseMove is that boundary; these lock it down (see primitives/presence/presence-protocol.js
// and routes/presence.js). The roster/sentinel tests pin the never-moved
// contract: a connected-but-unmoved participant is counted, never drawn.
//
// The socket also carries the server's data push, so the room's fan-out and
// the live wire are exercised here too: one poll, one message, every open tab
// reading the same /api/canvas. Two clients disagreeing about what is on a
// tile is a correctness bug on a canvas that claims to be deterministic, so it
// gets a guard rather than a claim.
import './env.js' // first: no boot refresh over the network (issue #273)

import { describe, it, before, after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  AT_MAX,
  HOVER_KEY_MAX,
  PARTICIPANT_CAP,
  isAt,
  isHoverKey,
  parseSquish,
  parseFront,
  parsePlay,
  parseFeed,
  parseWatch,
  FRONT_MAX,
  parseFrame,
  parseMove,
  rosterOf,
  spectatesAt,
} from '../primitives/presence/presence-protocol.js'
import {
  createRoom,
  PLAY_MS,
  SQUISH_MS,
  MAX_CONN,
  presenceRoom,
} from '../primitives/presence/presence-room.js'
import { DISH } from '../primitives/slime/slime.js'
import { refreshCanvasAndPublish } from '../src/routes/api.js'
import { build } from '../src/server.js'
import { getCanvasBoot } from '../src/services/canvas-data.js'
import { _slime } from '../primitives/slime/server.js'
import { FRONT_CAP, hasPos, initPresence, keyOf } from '../primitives/presence/presence.js'
import { anchorOf, atOf, parseAt, placeOf, pointOf } from '../primitives/presence/anchor.js'
import { createFollow } from '../primitives/rooms/follow.js'

const ROOT = join(import.meta.dirname, '..')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')

// A socket stand-in with the two properties the room reads (readyState/OPEN)
// and a record of everything written to it.
function fake() {
  const s = {
    OPEN: 1,
    readyState: 1,
    sent: [],
    pings: 0,
    send: (text) => s.sent.push(text),
    ping: () => s.pings++,
    terminate: () => {
      s.readyState = 3
    },
    msgs: () => s.sent.map((t) => JSON.parse(t)),
    typed: (type) => s.msgs().filter((m) => m.type === type),
  }
  return s
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

describe('the pile index bound is one number in two places', () => {
  // mutation: presence.client-cap-drifts
  it('the client never sends an index the room would drop', () => {
    // presence-protocol.js is the server's and the browser never loads it, so
    // canvas/presence.js states the same bound. A client sending past it
    // would think it had shared something the room silently dropped. The
    // bound is exclusive: the last index the room keeps is FRONT_CAP - 1.
    assert.equal(FRONT_CAP, FRONT_MAX, 'the client and the wire disagree about the pile bound')
    const front = (i) => parseFront(JSON.stringify({ type: 'front', stack: 'reel', i }))
    assert.deepEqual(front(FRONT_CAP - 1), { stack: 'reel', i: FRONT_CAP - 1 })
    assert.equal(front(FRONT_CAP), null, 'the bound itself is past the end')
  })

  it('covers a real game, because a game is a pile now', () => {
    // a replay shares its step through the front frame; a forty-move game
    // is eighty plies and the bound was 64 until 2026-09-16
    assert.ok(FRONT_MAX >= 200, `FRONT_MAX is ${FRONT_MAX}; a long game would stop sharing`)
  })
})

describe('presence: parseMove accepts only well-formed moves', () => {
  it('accepts a move with both coords in [0,1)', () => {
    // no `d` in the frame reads as a button that is up, which is what a
    // client that has never pressed anything means by leaving it out
    assert.deepEqual(parseMove(JSON.stringify({ type: 'move', fx: 0.5, fy: 0.25 })), {
      fx: 0.5,
      fy: 0.25,
      k: null,
      d: false,
      at: null,
      f: 0,
    })
  })

  it('accepts the boundaries 0 and just-under-1', () => {
    assert.deepEqual(parseMove(JSON.stringify({ type: 'move', fx: 0, fy: 0.999999 })), {
      fx: 0,
      fy: 0.999999,
      k: null,
      d: false,
      at: null,
      f: 0,
    })
  })

  it('drops coords at or past the [0,1) edges', () => {
    for (const bad of [
      { fx: 1, fy: 0.5 }, // fx == 1 wraps to the seam origin: excluded
      { fx: 0.5, fy: 1 },
      { fx: -0.01, fy: 0.5 },
      { fx: 0.5, fy: -0.01 },
      { fx: 5, fy: 0.5 },
    ]) {
      assert.equal(parseMove(JSON.stringify({ type: 'move', ...bad })), null, JSON.stringify(bad))
    }
  })

  it('drops non-number coords', () => {
    assert.equal(parseMove(JSON.stringify({ type: 'move', fx: '0.5', fy: 0.5 })), null)
    assert.equal(parseMove(JSON.stringify({ type: 'move', fx: null, fy: 0.5 })), null)
    assert.equal(parseMove(JSON.stringify({ type: 'move', fy: 0.5 })), null)
  })

  it('carries a hover key when one is well formed', () => {
    const m = parseMove(JSON.stringify({ type: 'move', fx: 0.1, fy: 0.2, k: 'app-security' }))
    assert.deepEqual(m, { fx: 0.1, fy: 0.2, k: 'app-security', d: false, at: null, f: 0 })
    assert.equal(
      parseMove(JSON.stringify({ type: 'move', fx: 0.1, fy: 0.2, k: 'recent#4' })).k,
      'recent#4'
    )
  })

  it('drops a bad key without dropping the cursor', () => {
    // the cursor is the load-bearing half: a peer must not vanish from the
    // room because the highlight it claimed was junk
    for (const k of [
      '<img src=x onerror=alert(1)>',
      'Album', // the grammar is lowercase; a case slip is a bug, not a key
      'a'.repeat(HOVER_KEY_MAX + 1),
      '../../etc/passwd',
      'recent#999',
      '-leading-dash',
      '',
      42,
      { toString: () => 'slime' },
      null,
    ]) {
      const m = parseMove(JSON.stringify({ type: 'move', fx: 0.1, fy: 0.2, k }))
      assert.ok(m, `${JSON.stringify(k)} took the whole frame down with it`)
      assert.equal(m.k, null, `${JSON.stringify(k)} was let through`)
    }
  })

  it('THE WIRE HAS ROOM FOR THREE MUTATIONS, THE SQUISH, THE FRONT AND THE FEED, AND NO OTHER', () => {
    // The boundary the whole feature rests on, and the reason it is a
    // mechanical fact rather than a convention: a client may say where it is
    // and what it is looking at (a move), it may squish Maurice, and it may
    // turn a pile to a member (BIBLE.md section 2, the shared hands).
    // Nothing else, and "nothing else" is the claim: a frame inventing a
    // field parses to a plain move, or to nothing, and no fourth thing can
    // be asked for.
    //
    // WHAT THE SHARED SET HOLDS is a separate question from how wide the
    // vocabulary is, and the two have moved in opposite directions. A game
    // replay and the light/dark flip were the two examples here of
    // things kept deliberately private. The flip went with the second theme
    // (2026-09-15). The replay became SHARED on 2026-09-16 and did not need
    // a frame to do it: a pile's front already travels and takes any stack
    // id, a game is a pile of plies, so the ply rides `front` with the stack
    // named 'reel'. That is the point of a closed vocabulary rather than an
    // argument against one.
    //
    // The FEED (2026-09-17) is the fourth frame and the third mutation: food
    // in the slime mould's dish, a cell named by two whole numbers. It got a
    // frame rather than riding `front` because a cell is not a member index,
    // and the bound on it is the dish's own (canvas/slime.js DISH). It is
    // still a thing on the ground and not a visitor's view, which is the line.
    //
    // A move grew a THIRD field on 2026-09-16, `d`, and it is worth being
    // precise about why that is not a fourth mutation. The line this file
    // guards is not "a move has three keys", it is that a client may describe
    // ITSELF and may not reach into anybody else's view. `d` is whether the
    // sender's own button is down, which picks which of the two hands the
    // room draws for THEM, exactly as `k` picks what they light. Nothing
    // about another visitor's canvas changes because of it. A frame that
    // asked to press somebody else's button would still have nowhere to go.
    // A FOURTH field, `at` (issue #327), is the same kind of fact: the page
    // block the sender's own pointer is on, a slug and an index, so a
    // reader of that page can draw it there. A FIFTH, `f` (the conga,
    // 2026-09-25), says who the sender follows. It is the one field that
    // names somebody else, and it still reaches nobody: the followed tab's
    // view does not change, and there is still no frame that says "come
    // here". The ACT (sessions) is a word only a session's socket may say,
    // so in the public room it parses to nothing at all.
    const injected = JSON.stringify({
      type: 'move',
      fx: 0.4,
      fy: 0.4,
      k: 'reel',
      theme: 'dark',
      reel: 12,
      slime: 3,
      cmd: 'reset',
    })
    assert.deepEqual(Object.keys(parseMove(injected)).sort(), ['at', 'd', 'f', 'fx', 'fy', 'k'])
    assert.deepEqual(Object.keys(parseFrame(injected)).sort(), [
      'at',
      'd',
      'f',
      'fx',
      'fy',
      'k',
      'kind',
    ])
    // and the new field is a BOOLEAN whatever arrives in it: there is no
    // malformed press, so nothing here can be smuggled through as one
    for (const junk of ['yes', 1, {}, [], 'true'])
      assert.equal(parseMove(JSON.stringify({ type: 'move', fx: 0.1, fy: 0.1, d: junk })).d, false)
    assert.equal(parseMove(JSON.stringify({ type: 'move', fx: 0.1, fy: 0.1, d: true })).d, true)
    // the squish carries nothing at all: not who, not how long, not when
    const squish = JSON.stringify({
      type: 'squish',
      until: 1e15,
      i: 3,
      theme: 'dark',
      cmd: 'reset',
    })
    assert.deepEqual(parseFrame(squish), { kind: 'squish' })
    assert.deepEqual(parseSquish(squish), {})
    // the front carries a pile and a member, and nothing else
    const front = JSON.stringify({
      type: 'front',
      stack: 'instruments',
      i: 3,
      theme: 'dark',
      until: 1e15,
    })
    assert.deepEqual(parseFrame(front), { kind: 'front', stack: 'instruments', i: 3 })
    assert.deepEqual(parseFront(front), { stack: 'instruments', i: 3 })
    // the feed carries a cell, and nothing else
    const feed = JSON.stringify({ type: 'feed', x: 51, y: 40, amount: 1e9, theme: 'dark' })
    assert.deepEqual(parseFrame(feed), { kind: 'feed', x: 51, y: 40 })
    assert.deepEqual(parseFeed(feed), { x: 51, y: 40 })
    // the watch (issue #259) is the fifth frame and NOT a fourth mutation:
    // whether the sender can see the slime mould's dish, one boolean about
    // itself, the same line `k` and `d` sit on. It is what lets the room
    // send the dish to nobody who is not looking at it (test/slime.test.js)
    const watch = JSON.stringify({ type: 'watch', on: true, theme: 'dark', cmd: 'reset' })
    assert.deepEqual(parseFrame(watch), { kind: 'watch', on: true })
    assert.deepEqual(parseWatch(watch), { on: true })
    for (const junk of ['yes', 1, {}, [], 'true', undefined])
      assert.equal(parseWatch(JSON.stringify({ type: 'watch', on: junk })).on, false)
    // and no other frame type is accepted at all
    for (const type of ['theme', 'reel', 'slime', 'stale', 'welcome', 'hover', 'flip', 'crate']) {
      assert.equal(parseMove(JSON.stringify({ type, fx: 0.4, fy: 0.4, i: 1 })), null, type)
      assert.equal(parseFrame(JSON.stringify({ type, fx: 0.4, fy: 0.4, i: 1 })), null, type)
    }
  })

  it('a front is a slug and a small whole number, or nothing', () => {
    assert.deepEqual(parseFront(JSON.stringify({ type: 'front', stack: 'work', i: 0 })), {
      stack: 'work',
      i: 0,
    })
    for (const bad of [
      { stack: 'work' },
      { i: 1 },
      { stack: 'Work', i: 1 },
      { stack: 'a b', i: 1 },
      { stack: 'x'.repeat(40), i: 1 },
      { stack: 'reel', i: -1 },
      { stack: 'reel', i: FRONT_MAX },
      { stack: 'reel', i: 2.5 },
      { stack: 'reel', i: '3' },
      { stack: 3, i: 3 },
    ]) {
      assert.equal(parseFront(JSON.stringify({ type: 'front', ...bad })), null, JSON.stringify(bad))
    }
    assert.equal(parseMove(JSON.stringify({ type: 'front', stack: 'reel', i: 1 })), null)
  })

  it('a feed is two whole numbers inside the dish square, or nothing', () => {
    assert.deepEqual(parseFeed(JSON.stringify({ type: 'feed', x: 0, y: 0 })), { x: 0, y: 0 })
    assert.deepEqual(parseFeed(JSON.stringify({ type: 'feed', x: DISH - 1, y: DISH - 1 })), {
      x: DISH - 1,
      y: DISH - 1,
    })
    for (const bad of [
      { x: -1, y: 0 },
      { x: 0, y: DISH },
      { x: 1.5, y: 1 },
      { x: '1', y: 1 },
      { x: 1 },
      { y: 1 },
      { x: NaN, y: 1 },
      { x: 1e9, y: 1 },
    ])
      assert.equal(parseFeed(JSON.stringify({ type: 'feed', ...bad })), null, JSON.stringify(bad))
    // a feed is not a move: it carries no cursor and never lands as one
    assert.equal(parseMove(JSON.stringify({ type: 'feed', x: 1, y: 1 })), null)
  })

  it('a squish is the word and nothing else, or nothing', () => {
    assert.deepEqual(parseSquish(JSON.stringify({ type: 'squish' })), {})
    for (const raw of [
      '{"type":"crate","i":3}',
      '{"type":"move","fx":0.1,"fy":0.1}',
      'squish',
      '',
    ]) {
      assert.equal(parseSquish(raw), null, raw)
    }
    // a squish is not a move: it carries no cursor and never lands as one
    assert.equal(parseMove(JSON.stringify({ type: 'squish' })), null)
  })

  it('the key grammar names things, and only things', () => {
    for (const ok of [
      'slime',
      'reel',
      'ic-github',
      'fire-department',
      'recent#0',
      'door-work',
      'r9eda',
    ])
      assert.ok(isHoverKey(ok), `${ok} should be a key`)
    for (const no of ['recent#', '#3', 'a b', 'a_b', 'A', 'a'.repeat(60), null, undefined, 7])
      assert.ok(!isHoverKey(no), `${JSON.stringify(no)} should not be a key`)
  })

  it('drops frames that are not a move', () => {
    assert.equal(parseMove(JSON.stringify({ type: 'join', id: 2 })), null)
    assert.equal(parseMove(JSON.stringify({ fx: 0.5, fy: 0.5 })), null)
    assert.equal(parseMove(JSON.stringify(5)), null)
    assert.equal(parseMove(JSON.stringify(null)), null)
  })

  it('drops non-JSON without throwing', () => {
    assert.equal(parseMove('not json {'), null)
    assert.equal(parseMove(''), null)
  })
})

describe('presence on every page (issue #327): the anchor', () => {
  // mutation: presence.anchor-unbounded
  it('the anchor grammar is a slug and a block index, bounded, or nothing', () => {
    assert.equal(isAt('nao#0'), true)
    assert.equal(isAt('app-security#14'), true)
    assert.equal(isAt('a#999'), true)
    assert.equal(isAt('nao'), false, 'a page without a block is not a place on it')
    assert.equal(isAt('nao#'), false)
    assert.equal(isAt('nao#1000'), false, 'four digits is more blocks than any page has')
    assert.equal(isAt('#3'), false)
    assert.equal(isAt('Nao#3'), false)
    assert.equal(isAt('nao#3<b>'), false)
    assert.equal(isAt('a'.repeat(49) + '#1'), false, 'the slug is bounded')
    assert.equal(isAt('a'.repeat(48) + '#1'), true)
    assert.ok(('a'.repeat(48) + '#999').length <= AT_MAX)
    for (const junk of [null, undefined, 3, {}, [], ''])
      assert.equal(isAt(junk), false, String(junk))
  })

  it('the client and the server read the same grammar', () => {
    // anchor.js states the regex for the browser, which never loads the
    // server's module; a slug the server would drop must not be one the
    // client thinks it shared
    for (const at of ['nao#0', 'app-security#14', 'a'.repeat(48) + '#999'])
      assert.deepEqual(!!parseAt(at), isAt(at), at)
    for (const at of ['nao', 'nao#', 'nao#1000', 'Nao#3', 'a'.repeat(49) + '#1'])
      assert.deepEqual(!!parseAt(at), isAt(at), at)
    assert.equal(atOf('nao', 14), 'nao#14')
    assert.equal(atOf('nao', 1000), null)
    assert.deepEqual(parseAt('nao#14'), { slug: 'nao', i: 14 })
    assert.equal(placeOf('nao#14'), 'nao')
    assert.equal(placeOf(null), '')
  })

  it('a move carries a well-formed anchor and drops a bad one to the canvas', () => {
    const m = parseMove(JSON.stringify({ type: 'move', fx: 0.1, fy: 0.2, at: 'nao#4' }))
    assert.equal(m.at, 'nao#4')
    const bad = parseMove(JSON.stringify({ type: 'move', fx: 0.1, fy: 0.2, at: 'nao#<b>' }))
    assert.deepEqual(bad, { fx: 0.1, fy: 0.2, k: null, d: false, at: null, f: 0 })
  })

  const tick = () => new Promise((r) => setTimeout(r, 60))
  const entriesOf = (s) => s.typed('moves').flatMap((f) => f.m)
  const onPage = (fx, fy, at) => ({ fx, fy, k: null, d: false, at })

  // mutation: presence.lone-reader-mailed, presence.page-moves-leak
  it('a page frame goes to the readers of that page, and a lone reader is sent nothing', async () => {
    // Three tabs: a and b on nao, c on the canvas. a's moves reach b and
    // never c; c's moves reach nobody, since c is alone on the canvas. So
    // a page with one reader and a canvas with one visitor both cost zero
    // bytes a second, which is the claim the room made before pages and
    // keeps with them.
    const room = createRoom()
    const a = fake()
    const b = fake()
    const c = fake()
    room.join(a)
    room.join(b)
    room.join(c)
    room.move(a, onPage(0.1, 0.1, 'nao#3'))
    room.move(b, onPage(0.2, 0.2, 'nao#5'))
    await tick()
    // arriving on the page is a place change and goes to everyone, c too
    assert.deepEqual(
      entriesOf(c)
        .map((e) => e[5])
        .sort(),
      ['nao#3', 'nao#5']
    )
    for (const s of [a, b, c]) s.sent.length = 0

    room.move(a, onPage(0.3, 0.3, 'nao#3'))
    room.move(c, { fx: 0.5, fy: 0.5, k: null, d: false, at: null })
    await tick()
    assert.deepEqual(
      entriesOf(b),
      [[1, Math.round(0.3 * 4096), Math.round(0.3 * 4096), 0]],
      'b did not get the move of the peer beside it'
    )
    assert.deepEqual(c.sent, [], "c, alone on the canvas, was mailed a page's moves or its own")
    assert.deepEqual(
      entriesOf(a).map((e) => e[0]),
      [1],
      'a got more than the frame of its own place'
    )
    room.stop()
  })

  // mutation: presence.anchor-change-local
  it('a place change goes to everyone, position and anchor together, and the sixth field is the anchor', async () => {
    const room = createRoom()
    const a = fake()
    const c = fake()
    room.join(a)
    room.join(c)
    a.sent.length = 0
    c.sent.length = 0
    room.move(a, onPage(0.25, 0.5, 'nao#7'))
    await tick()
    // key present (unchanged, null -> 0) so the anchor can sit behind it
    assert.deepEqual(entriesOf(c), [
      [1, Math.round(0.25 * 4096), Math.round(0.5 * 4096), 0, 0, 'nao#7'],
    ])
    c.sent.length = 0
    // a new block on the same page is a place change too: it goes out, to
    // a reader of the page, as the sixth field
    const b = fake()
    room.join(b)
    room.move(b, onPage(0.5, 0.5, 'nao#1'))
    await tick()
    b.sent.length = 0
    room.move(a, onPage(0.5, 0.5, 'nao#8'))
    await tick()
    assert.deepEqual(
      entriesOf(b).map((e) => e[5]),
      ['nao#8']
    )
    // and back to the canvas is 0, to everyone
    c.sent.length = 0
    room.move(a, { fx: 0.5, fy: 0.5, k: null, d: false, at: null })
    await tick()
    assert.deepEqual(
      entriesOf(c).map((e) => e[5]),
      [0]
    )
    room.stop()
  })

  it('the roster carries where everybody is', () => {
    const room = createRoom()
    const a = fake()
    room.join(a)
    room.move(a, onPage(0.25, 0.5, 'nao#7'))
    const b = fake()
    room.join(b)
    assert.deepEqual(b.msgs()[0].peers, [
      { id: 1, fx: 0.25, fy: 0.5, k: null, d: false, at: 'nao#7', f: 0, fs: 0 },
    ])
    room.stop()
  })
})

describe("following (issue #327) is individual, and lets go on the follower's own input", () => {
  it('picks, replaces, and lets go on input, escape, the tag and the peer leaving', () => {
    const seen = []
    const f = createFollow((id) => seen.push(id))
    assert.equal(f.id, null)
    assert.equal(f.pick(3), true)
    assert.equal(f.id, 3)
    assert.equal(f.pick(3), false, 'picking the one followed is a no-op')
    assert.equal(f.pick(5), true, 'a follow replaces a follow')
    assert.equal(f.left(3), false, 'somebody else leaving changes nothing')
    assert.equal(f.id, 5)
    assert.equal(f.left(5), true, 'the followed peer leaving lets go')
    assert.equal(f.id, null)
    assert.equal(f.release(), false, 'letting go of nobody is a no-op, and says so')
    f.pick(7)
    assert.equal(f.input(), true, "the follower's own input lets go")
    f.pick(8)
    assert.equal(f.release(), true, 'the tag and Escape let go')
    for (const junk of [0, -1, 1.5, '3', null, undefined])
      assert.equal(f.pick(junk), false, String(junk))
    assert.deepEqual(
      seen,
      [3, 5, null, 7, null, 8, null],
      'told once per change and never for a no-op'
    )
  })

  // THE RULE CHANGED WITH THE CONGA (2026-09-25). It was "nothing about
  // following is on the wire". Now the wire carries WHO follows whom, `f` on
  // the move, so every tab can draw the line; what it still does not carry
  // is a request. There is no frame that makes anybody follow, stop, or go
  // anywhere, and the view a follower keeps is its own (follow.js above).
  // mutation: presence.follow-is-a-frame
  it('the wire says who follows whom, and has no frame that asks anybody to', () => {
    for (const type of ['follow', 'unfollow', 'come', 'goto'])
      assert.equal(parseFrame(JSON.stringify({ type, id: 3, f: 3 })), null, type)
    const mv = (f) => parseMove(JSON.stringify({ type: 'move', fx: 0.1, fy: 0.1, f })).f
    assert.equal(mv(3), 3)
    assert.equal(mv(2 ** 31 - 1), 2 ** 31 - 1)
    // anything that is not a peer id is nobody, and the cursor still stands
    for (const junk of [0, -1, 1.5, '3', 2 ** 31, null, {}, [3], true])
      assert.equal(mv(junk), 0, JSON.stringify(junk))
  })

  it('a follow is news for everyone, stamped in the order the line formed', async () => {
    const room = createRoom()
    const a = fake()
    const b = fake()
    const c = fake()
    room.join(a)
    room.join(b)
    room.join(c)
    const at = (f) => ({ fx: 0.5, fy: 0.5, k: null, d: false, at: null, f })
    room.move(b, at(1))
    room.move(c, at(2))
    await new Promise((r) => setTimeout(r, 80))
    const entries = a.typed('moves').flatMap((m) => m.m)
    assert.deepEqual(entries.find((e) => e[0] === 2).slice(4), [0, 0, 1, 1])
    assert.deepEqual(entries.find((e) => e[0] === 3).slice(4), [0, 0, 2, 2])
    // unchanged is not news: the next move is the short entry again
    a.sent.length = 0
    room.move(b, { ...at(1), fx: 0.25 })
    await new Promise((r) => setTimeout(r, 80))
    assert.equal(
      a
        .typed('moves')
        .flatMap((m) => m.m)
        .find((e) => e[0] === 2).length,
      4
    )
    // letting go is 0 and 0, following yourself is following nobody
    room.move(c, at(3))
    await new Promise((r) => setTimeout(r, 80))
    assert.deepEqual(
      a
        .typed('moves')
        .flatMap((m) => m.m)
        .find((e) => e[0] === 3)
        .slice(6),
      [0, 0]
    )
    // and a joiner sees the line already dancing
    const d = fake()
    room.join(d)
    const roster = d.msgs()[0].peers
    assert.deepEqual(
      roster.map((p) => [p.id, p.f, p.fs]),
      [
        [1, 0, 0],
        [2, 1, 1],
        [3, 0, 0],
      ]
    )
    room.stop()
  })
})

describe('presence speaks the kit (#336): panels, kit buttons, the face for words', () => {
  const PRES = readFileSync(join(ROOT, 'primitives/presence/presence.js'), 'utf8')
  const HOME_CSS = readFileSync(join(ROOT, 'src/static/css/canvas-home.css'), 'utf8')
  const HOME_NJK = readFileSync(join(ROOT, 'src/templates/canvas/home.njk'), 'utf8')

  // mutation: presence.kit-unlinked
  it('the canvas links kit.css, or no k- class on it means anything', () => {
    assert.match(
      HOME_NJK,
      /<link rel="stylesheet" href="\{\{ asset\('\/primitives\/kit\/kit\.css'\) \}\}">/
    )
  })

  // mutation: presence.who-row-own-light, presence.letgo-drawn, presence.tag-pixel-face
  it('the tag and the list are kit panels, a row is a kit button lit for the one followed, the x a kit icon button', () => {
    assert.match(APP, /followTag\.className = 'k-panel k-ground'/)
    assert.match(APP, /whoEl\.className = 'k-panel k-ground'/)
    assert.match(
      APP,
      /class="letgo k-btn k-ico"[^`]*>×<\/span><\/button>/,
      "the let-go x is not the kit icon button with the face's x"
    )
    assert.match(APP, /class="peer k-btn\$\{follow\.id === q\.id \? ' is-on' : ''\}"/)
    const ui = APP.slice(
      APP.indexOf("followTag.id = 'following'"),
      APP.indexOf('function openWho()')
    )
    assert.ok(
      !/pixelLabel|pixelText|<svg/.test(ui),
      'the tag or the list sets words in the pixel face or draws by hand'
    )
  })

  // mutation: presence.follow-frame-never, presence.follow-frame-takes-pointer, presence.follow-frame-uncoloured
  it('following frames the whole screen in the followed one’s colour, as Figma does', () => {
    // the author: "I like the figma frame for following, that sort of
    // intuitive association". The frame comes and goes with the tag
    const cb = APP.slice(APP.indexOf('const follow = createFollow('), APP.indexOf('}, lineHead);'))
    assert.match(cb, /followTag\.hidden = id == null;\s*followFrame\.hidden = id == null;/)
    assert.match(cb, /setProperty\('--follow-hue', q \? q\.color/)
    const frame = HOME_CSS.slice(
      HOME_CSS.indexOf('#followFrame {'),
      HOME_CSS.indexOf('}', HOME_CSS.indexOf('#followFrame {'))
    )
    assert.match(frame, /position: fixed;/)
    assert.match(frame, /inset: 0;/)
    assert.match(frame, /border: calc\(2 \* var\(--cv-px\)\) solid var\(--follow-hue/)
    // and it never stands between a hand and what is under it
    assert.match(frame, /pointer-events: none;/)
  })

  // mutation: presence.edge-drawn-chevron, presence.edge-cell-drifts
  it("the edge marker is the face's arrow in a cell the stylesheet and the seat agree on", () => {
    const edge = PRES.slice(PRES.indexOf('const EDGE ='), PRES.indexOf('const EDGE_W'))
    assert.ok(!/<svg/.test(edge), 'the edge marker is a drawn chevron')
    assert.match(edge, /class="edge up"[^>]*>↑</)
    assert.match(edge, /class="edge down"[^>]*>↓</)
    const cells = Number(
      HOME_CSS.match(/\.cursor \.edge \{[^}]*width: calc\((\d+) \* var\(--cv-px\)\)/)[1]
    )
    const TOKENS = readFileSync(join(ROOT, 'primitives/kit/canvas-tokens.css'), 'utf8')
    const px = Number(TOKENS.match(/--cv-px: (\d+)px/)[1])
    assert.equal(Number(PRES.match(/const EDGE_W = (\d+)/)[1]), cells * px)
  })
})

describe('the anchor is the same content point at every width (issue #327)', () => {
  // A page as two readers see it: the same blocks in document order, one
  // column 358 wide (a phone at 390) and one 720 wide (a desktop sheet),
  // with the paragraphs reflowed to different heights. The anchor taken
  // on one must name the same block on the other, and the fraction must
  // land on the same relative point of it.
  const phone = [
    { x: 16, y: 40, width: 358, height: 64 }, // h1
    { x: 16, y: 112, width: 358, height: 20 }, // meta
    { x: 16, y: 148, width: 358, height: 210 }, // p, reflowed tall
    { x: 16, y: 374, width: 358, height: 0 }, // an empty block, never nearest
    { x: 16, y: 374, width: 358, height: 240 }, // figure
    { x: 16, y: 630, width: 358, height: 96 }, // p
  ]
  const desktop = [
    { x: 280, y: 60, width: 720, height: 40 },
    { x: 280, y: 108, width: 720, height: 20 },
    { x: 280, y: 144, width: 720, height: 84 },
    { x: 280, y: 244, width: 720, height: 0 },
    { x: 280, y: 244, width: 720, height: 420 },
    { x: 280, y: 680, width: 720, height: 48 },
  ]

  // mutation: presence.anchor-is-a-pixel, presence.anchor-picks-empty
  it('a point in a block on the phone is the same fraction of the same block on the desktop', () => {
    // a third of the way across and two thirds down the long paragraph
    const a = anchorOf(phone, 16 + 358 / 3, 148 + 140)
    assert.equal(a.i, 2)
    assert.ok(Math.abs(a.fx - 1 / 3) < 1e-9)
    assert.ok(Math.abs(a.fy - 2 / 3) < 1e-9)
    const p = pointOf(desktop[a.i], a.fx, a.fy)
    assert.ok(Math.abs(p.x - (280 + 240)) < 1e-6, `x ${p.x}`)
    assert.ok(Math.abs(p.y - (144 + 56)) < 1e-6, `y ${p.y}`)
    // and the round trip on the desktop names the same anchor
    const back = anchorOf(desktop, p.x, p.y)
    assert.equal(back.i, a.i)
    assert.ok(Math.abs(back.fx - a.fx) < 1e-9 && Math.abs(back.fy - a.fy) < 1e-9)
    // a pointer in the gutter beside the figure is on the figure, clamped
    // inside the box the wire will carry
    const g = anchorOf(phone, 2, 500)
    assert.equal(g.i, 4)
    assert.equal(g.fx, 0)
    // between two blocks: the nearer one, never the empty one at the seam
    const s = anchorOf(desktop, 500, 236)
    assert.equal(
      s.i,
      2,
      'the paragraph above is 8 away, the figure 8 away too: first wins, the empty block never'
    )
    // the far edge stays under one
    const e = anchorOf(desktop, 999.999, 100)
    assert.equal(e.i, 0)
    assert.ok(e.fx < 1 && e.fy < 1)
    // no blocks, no anchor
    assert.equal(anchorOf([], 10, 10), null)
    assert.equal(anchorOf([{ x: 0, y: 0, width: 100, height: 0 }], 10, 10), null)
  })
})

describe('presence: the participant/spectator boundary is exactly PARTICIPANT_CAP', () => {
  it('caps broadcasting at 100', () => {
    assert.equal(PARTICIPANT_CAP, 100)
  })

  it('lets the first PARTICIPANT_CAP connections participate, the next spectate', () => {
    assert.equal(spectatesAt(0), false) // empty room: participant
    assert.equal(spectatesAt(PARTICIPANT_CAP - 1), false) // the 100th: participant
    assert.equal(spectatesAt(PARTICIPANT_CAP), true) // the 101st: spectator
    assert.equal(spectatesAt(PARTICIPANT_CAP + 50), true)
  })
})

describe('presence: the welcome roster carries the never-moved sentinel', () => {
  const room = [
    { id: 1, fx: 0.5, fy: 0.25, k: 'recent#2', alive: true, spectator: false }, // moved, on a song
    { id: 2, fx: -1, fy: -1, alive: true, spectator: false }, // connected, never moved
    { id: 3, fx: -1, fy: -1, alive: true, spectator: true }, // spectator: invisible
  ]

  it('includes the never-moved participant with fx/fy -1, positions as stored', () => {
    assert.deepEqual(rosterOf(room), [
      { id: 1, fx: 0.5, fy: 0.25, k: 'recent#2', d: false, at: null, f: 0, fs: 0 },
      { id: 2, fx: -1, fy: -1, k: null, d: false, at: null, f: 0, fs: 0 },
    ])
  })

  it('never includes spectators, even one that somehow holds a position', () => {
    assert.deepEqual(rosterOf([{ id: 7, fx: 0.5, fy: 0.5, spectator: true }]), [])
  })

  it('yields an empty roster for an empty room', () => {
    assert.deepEqual(rosterOf([]), [])
  })
})

describe('presence: the client paints a peer only once it has a real position', () => {
  it('skips the -1 roster sentinel', () => {
    assert.equal(hasPos({ fx: -1, fy: -1 }), false)
  })

  it('accepts the world origin as a real position (0,0 is a place, not a sentinel)', () => {
    assert.equal(hasPos({ fx: 0, fy: 0 }), true)
  })

  it('accepts any in-range position', () => {
    assert.equal(hasPos({ fx: 0.999999, fy: 0.000001 }), true)
  })
})

describe('presence room: the cursor fan-out, unchanged by the data push', () => {
  it('greets a joiner with the roster and announces it to everyone else', () => {
    const room = createRoom()
    const a = fake()
    const b = fake()
    room.join(a)
    a.sent.length = 0
    const me = room.join(b)

    assert.equal(me.id, 2)
    assert.equal(me.spectator, false)
    assert.deepEqual(b.msgs()[0], {
      type: 'welcome',
      id: 2,
      spectator: false,
      squish: 0,
      fronts: {},
      plays: [],
      peers: [{ id: 1, fx: -1, fy: -1, k: null, d: false, at: null, f: 0, fs: 0 }],
      t: b.msgs()[0].t,
    })
    // the clock the hero syncs off: a real instant, close to this one
    assert.ok(Math.abs(b.msgs()[0].t - Date.now()) < 5000, 'the welcome carries no usable clock')
    // the joiner is announced to the room, and never to itself
    assert.deepEqual(a.msgs(), [{ type: 'join', id: 2 }])
    assert.deepEqual(b.typed('join'), [])
  })

  it('SNAPSHOTS moves rather than relaying them, one frame a tick', async () => {
    // The room holds each peer's latest position and ships one frame at 24fps
    // carrying everyone who moved (lib/presence-room.js). Three separate
    // things are being asserted here and each one is a load-bearing half of
    // why the room can hold a hundred people: a move sends NOTHING on its
    // own, several moves from one peer collapse to one entry, and the frame
    // that finally goes out is the same bytes for everybody.
    const room = createRoom()
    const a = fake()
    const b = fake()
    room.join(a)
    room.join(b)
    b.sent.length = 0
    a.sent.length = 0

    room.move(a, { fx: 0.1, fy: 0.1, k: 'slime', d: false })
    room.move(a, { fx: 0.2, fy: 0.5, k: 'slime', d: false })
    room.move(a, { fx: 0.25, fy: 0.75, k: 'slime', d: true })
    assert.deepEqual(b.msgs(), [], 'a move went out on its own; the tick is what sends')

    await new Promise((r) => setTimeout(r, 90)) // two ticks at 24fps
    const frames = b.msgs()
    assert.equal(frames.length, 1, 'three moves from one peer cost more than one entry')
    assert.equal(frames[0].type, 'moves')
    // 12-bit coordinates: one part in 4096 of the world, under a pixel of it
    assert.deepEqual(frames[0].m, [
      [1, Math.round(0.25 * 4096), Math.round(0.75 * 4096), 1, 'slime'],
    ])
    // and the sender got the identical frame, because it is serialised once
    // for the whole room and the client skips its own id when it draws
    assert.deepEqual(a.msgs(), frames)
    room.stop()
  })

  // THE KEY GOES ONLY WHEN IT CHANGES (issue #246). Three states on the
  // wire: no fifth field is "unchanged", 0 is "over nothing", a string is a
  // new key. One tick per step, because the tick is what sends.
  const oneTick = () => new Promise((r) => setTimeout(r, 60))
  const entriesOf = (s) => s.typed('moves').flatMap((f) => f.m)

  it('sends a hover key once, then says nothing while the peer rests on it', async () => {
    const room = createRoom()
    const a = fake()
    const b = fake()
    room.join(a)
    room.join(b)
    b.sent.length = 0

    room.move(a, { fx: 0.1, fy: 0.1, k: 'slime', d: false })
    await oneTick()
    room.move(a, { fx: 0.2, fy: 0.2, k: 'slime', d: false })
    await oneTick()
    room.move(a, { fx: 0.3, fy: 0.3, k: 'slime', d: false })
    await oneTick()
    room.stop()

    const es = entriesOf(b)
    assert.equal(es.length, 3)
    assert.deepEqual(es[0], [1, 410, 410, 0, 'slime'], 'the first entry must carry the key')
    assert.equal(es[1].length, 4, 'a resting peer repeated its key')
    assert.equal(es[2].length, 4, 'a resting peer repeated its key')
  })

  it('a peer leaving a tile still says so: cleared is 0, not silence', async () => {
    const room = createRoom()
    const a = fake()
    const b = fake()
    room.join(a)
    room.join(b)
    b.sent.length = 0

    room.move(a, { fx: 0.1, fy: 0.1, k: 'slime', d: false })
    await oneTick()
    room.move(a, { fx: 0.2, fy: 0.2, k: null, d: false })
    await oneTick()
    room.move(a, { fx: 0.3, fy: 0.3, k: null, d: false })
    await oneTick()
    room.move(a, { fx: 0.4, fy: 0.4, k: 'recent#2', d: false })
    await oneTick()
    room.stop()

    const es = entriesOf(b)
    assert.equal(es.length, 4)
    assert.deepEqual(
      es[1],
      [1, 819, 819, 0, 0],
      'falling off a tile went unsaid; it would stay lit'
    )
    assert.equal(es[2].length, 4, 'still over nothing is not news')
    assert.equal(es[3][4], 'recent#2', 'a new key after a clear must be sent')
  })

  it('a peer that has never been over anything sends no key field at all', async () => {
    const room = createRoom()
    const a = fake()
    const b = fake()
    room.join(a)
    room.join(b)
    b.sent.length = 0
    room.move(a, { fx: 0.5, fy: 0.5, k: null, d: false })
    await oneTick()
    room.stop()
    assert.deepEqual(entriesOf(b), [[1, 2048, 2048, 0]])
  })

  it('every listener ends up holding the key the room holds, a mid-tick joiner included', async () => {
    // A client is modelled the way canvas/presence.js is: the roster seeds
    // the key, keyOf folds each entry in. The joiner is the trap. The roster
    // carries the key as STORED, so a peer that goes slime -> recent#2, is
    // seen on recent#2 by someone arriving, and is back on slime before the
    // tick, must still have slime sent: comparing against the last key SENT
    // would call that unchanged and strand the joiner on recent#2.
    const room = createRoom()
    const a = fake()
    const b = fake()
    room.join(a)
    room.join(b)
    const follow = (s) => {
      const held = new Map()
      for (const m of s.msgs()) {
        if (m.type === 'welcome') for (const q of m.peers) held.set(q.id, q.k)
        else if (m.type === 'moves') for (const e of m.m) held.set(e[0], keyOf(e, held.get(e[0])))
      }
      return held
    }

    room.move(a, { fx: 0.1, fy: 0.1, k: 'slime', d: false })
    await oneTick()
    room.move(a, { fx: 0.2, fy: 0.2, k: 'recent#2', d: false })
    const c = fake()
    room.join(c) // the roster says recent#2
    assert.equal(c.msgs()[0].peers[0].k, 'recent#2')
    room.move(a, { fx: 0.3, fy: 0.3, k: 'slime', d: false }) // and back, inside the tick
    await oneTick()
    room.move(a, { fx: 0.4, fy: 0.4, k: 'slime', d: false })
    await oneTick()
    room.stop()

    assert.equal(follow(b).get(1), 'slime')
    assert.equal(follow(c).get(1), 'slime', 'the joiner is stranded on a key the peer left')
  })

  it('keyOf reads the three states apart', () => {
    assert.equal(keyOf([1, 0, 0, 0], 'slime'), 'slime', 'missing means unchanged')
    assert.equal(keyOf([1, 0, 0, 0], null), null, 'unchanged from nothing is nothing')
    assert.equal(keyOf([1, 0, 0, 0], undefined), null)
    assert.equal(keyOf([1, 0, 0, 0, 0], 'slime'), null, '0 means cleared, not unchanged')
    assert.equal(keyOf([1, 0, 0, 0, 'gh:bbq'], 'slime'), 'gh:bbq')
  })

  it('holds the latest position for the next roster', () => {
    const room = createRoom()
    const a = fake()
    const b = fake()
    room.join(a)
    room.join(b)
    room.move(a, { fx: 0.25, fy: 0.75, k: 'slime', d: true })
    const c = fake()
    room.join(c)
    // a hand already held down when you arrive is part of the room, the same
    // way a lit tile is: without it that peer points until they move again
    assert.deepEqual(c.msgs()[0].peers, [
      { id: 1, fx: 0.25, fy: 0.75, k: 'slime', d: true, at: null, f: 0, fs: 0 },
      { id: 2, fx: -1, fy: -1, k: null, d: false, at: null, f: 0, fs: 0 },
    ])
  })

  it('retracts a leaver once, and a second leave is a no-op', () => {
    const room = createRoom()
    const a = fake()
    const b = fake()
    room.join(a)
    room.join(b)
    a.sent.length = 0
    room.leave(b)
    room.leave(b)

    assert.deepEqual(a.typed('leave'), [{ type: 'leave', id: 2 }])
    assert.equal(room.size, 1)
    assert.equal(room.participants, 1)
  })

  it('refuses past the connection backstop, and the caller closes with 1013', () => {
    const room = createRoom({ maxConn: 3 })
    for (let i = 0; i < 3; i++) assert.ok(room.join(fake()), `socket ${i} admitted`)
    assert.equal(room.full(), true)
    assert.equal(room.join(fake()), null, 'the fourth is refused, not queued')
    assert.equal(MAX_CONN, 256)
  })
})

describe('presence room: Maurice is the one shared hand', () => {
  it('a participant squishes him for everyone, sender included, for five minutes', () => {
    const room = createRoom()
    const a = fake()
    const b = fake()
    room.join(a)
    room.join(b)
    a.sent.length = 0
    b.sent.length = 0
    const t0 = 1_000_000
    assert.equal(room.squish(a, t0), true)
    assert.equal(room.squishUntil, t0 + SQUISH_MS)
    // the answer reaches the sender too: the room's instant is the instant,
    // and a tab that squished optimistically keeps the room's
    assert.deepEqual(a.msgs(), [{ type: 'squish', until: t0 + SQUISH_MS }])
    assert.deepEqual(b.msgs(), [{ type: 'squish', until: t0 + SQUISH_MS }])
    // a squished bug stays squished: a second stamp inside the five minutes
    // is not a second squish, and nothing is sent for it
    assert.equal(room.squish(b, t0 + 1000), false)
    assert.equal(room.squishUntil, t0 + SQUISH_MS)
    assert.equal(a.typed('squish').length, 1)
    // and once he is back he can be squished again
    assert.equal(room.squish(b, t0 + SQUISH_MS + 1), true)
    assert.equal(room.squishUntil, t0 + SQUISH_MS + 1 + SQUISH_MS)
  })

  it('a participant turns a pile for everyone, and a late joiner sees the fronts', () => {
    const room = createRoom()
    const a = fake()
    const b = fake()
    room.join(a)
    room.join(b)
    a.sent.length = 0
    b.sent.length = 0
    assert.equal(room.front(a, 'instruments', 4), true)
    assert.deepEqual(room.fronts, { instruments: 4 })
    assert.deepEqual(a.msgs(), [{ type: 'front', stack: 'instruments', i: 4 }])
    assert.deepEqual(b.msgs(), a.msgs())
    room.front(b, 'work', 2)
    const c = fake()
    room.join(c)
    assert.deepEqual(c.msgs()[0].fronts, { instruments: 4, work: 2 })
    assert.equal(room.front(fake(), 'instruments', 1), false, 'a stranger turns nothing')
  })

  it('a play frame is a slug, a bool and a last member, or nothing', () => {
    const ok = { type: 'play', stack: 'reel', on: true, n: 23 }
    assert.deepEqual(parsePlay(JSON.stringify(ok)), { stack: 'reel', on: true, n: 23 })
    assert.deepEqual(parseFrame(JSON.stringify(ok)), {
      kind: 'play',
      stack: 'reel',
      on: true,
      n: 23,
    })
    for (const bad of [
      { on: 'yes' },
      { n: -1 },
      { n: FRONT_MAX },
      { n: 1.5 },
      { stack: 'Not A Slug' },
    ])
      assert.equal(parsePlay(JSON.stringify({ ...ok, ...bad })), null, JSON.stringify(bad))
  })

  it('the room plays a game through for everyone, any hand stops it, and a late joiner sees it playing', () => {
    mock.timers.enable({ apis: ['setInterval'] })
    try {
      const room = createRoom()
      const a = fake()
      const b = fake()
      room.join(a)
      room.join(b)
      a.sent.length = 0
      b.sent.length = 0
      assert.equal(room.play(a, 'reel', true, 3), true)
      assert.deepEqual(b.msgs(), [{ type: 'play', stack: 'reel', on: true }])
      const c = fake()
      room.join(c)
      assert.deepEqual(c.msgs()[0].plays, ['reel'], 'a late joiner is told it is playing')
      b.sent.length = 0
      mock.timers.tick(PLAY_MS)
      assert.deepEqual(b.msgs(), [{ type: 'front', stack: 'reel', i: 1 }])
      assert.equal(room.play(b, 'reel', false, 3), true, 'a peer pauses it')
      assert.deepEqual(b.msgs().at(-1), { type: 'play', stack: 'reel', on: false })
      b.sent.length = 0
      mock.timers.tick(PLAY_MS * 5)
      assert.deepEqual(b.msgs(), [], 'nothing ticks once it is paused')
      room.play(a, 'reel', true, 3)
      b.sent.length = 0
      mock.timers.tick(PLAY_MS * 5)
      assert.deepEqual(
        b.msgs().at(-1),
        { type: 'play', stack: 'reel', on: false },
        'it lets go at the last ply'
      )
      assert.equal(room.fronts.reel, 3)
      assert.equal(room.play(fake(), 'reel', true, 3), false, 'a stranger plays nothing')
    } finally {
      mock.timers.reset()
    }
  })

  it('a late joiner is told when he is back', () => {
    const room = createRoom()
    const a = fake()
    room.join(a)
    room.squish(a, 5000)
    const c = fake()
    room.join(c)
    assert.equal(c.msgs()[0].squish, 5000 + SQUISH_MS)
  })

  it('a stranger to the room cannot squish him', () => {
    const room = createRoom()
    const a = fake()
    room.join(a)
    a.sent.length = 0
    assert.equal(room.squish(fake(), 1000), false, 'a socket that never joined')
    assert.equal(room.squishUntil, 0)
    assert.deepEqual(a.msgs(), [], 'a dropped squish is silent')
  })

  it('spectators watch Maurice and never squish him', () => {
    const room = createRoom()
    const socks = []
    for (let i = 0; i < PARTICIPANT_CAP + 1; i++) {
      const s = fake()
      room.join(s)
      socks.push(s)
    }
    const spectator = socks[socks.length - 1]
    // (the backstop is bigger than the cap, so the last one in is a
    // spectator, not refused)
    assert.equal(room.size, PARTICIPANT_CAP + 1)
    assert.equal(room.participants, PARTICIPANT_CAP)
    spectator.sent.length = 0
    assert.equal(room.squish(spectator, 1000), false)
    assert.equal(room.squishUntil, 0)
    // but hears every squish a participant makes
    room.squish(socks[0], 1000)
    assert.deepEqual(spectator.msgs(), [{ type: 'squish', until: 1000 + SQUISH_MS }])
  })
})

describe('presence room: the data push reaches every open tab exactly once', () => {
  it('serialises one string for the whole fan-out, not one per recipient', () => {
    const room = createRoom()
    const socks = [fake(), fake(), fake()]
    for (const s of socks) room.join(s)
    for (const s of socks) s.sent.length = 0

    // toJSON runs once per JSON.stringify call, so it counts serialisations
    let serialised = 0
    room.broadcastAll({
      toJSON() {
        serialised++
        return { type: 'stale', keys: ['weather'] }
      },
    })

    assert.equal(serialised, 1, 'three recipients, one stringify')
    for (const s of socks) assert.deepEqual(s.msgs(), [{ type: 'stale', keys: ['weather'] }])
    // every recipient got the identical bytes: this IS the idempotency claim
    assert.equal(new Set(socks.map((s) => s.sent[0])).size, 1)
  })

  it('reaches spectators, who never earn a participant slot but still see data', () => {
    const room = createRoom()
    for (let i = 0; i < PARTICIPANT_CAP; i++) room.join(fake())
    const late = fake()
    const me = room.join(late)
    assert.equal(me.spectator, true, 'the connection past the cap spectates')
    assert.equal(late.msgs()[0].spectator, true)

    late.sent.length = 0
    room.broadcastAll({ type: 'stale', keys: ['reel'] })
    assert.deepEqual(late.msgs(), [{ type: 'stale', keys: ['reel'] }])
  })

  it('skips a closed socket instead of throwing the whole fan-out', () => {
    const room = createRoom()
    const live = fake()
    const dead = fake()
    room.join(live)
    room.join(dead)
    dead.readyState = 3 // CLOSED
    live.sent.length = 0
    dead.sent.length = 0

    room.broadcastAll({ type: 'stale', keys: ['track'] })
    assert.deepEqual(live.typed('stale'), [{ type: 'stale', keys: ['track'] }])
    assert.deepEqual(dead.sent, [])
  })

  it('accumulates nothing across refreshes: same room size, same recipients', () => {
    const room = createRoom()
    const socks = [fake(), fake()]
    for (const s of socks) room.join(s)
    for (let i = 0; i < 50; i++) room.broadcastAll({ type: 'stale', keys: ['gh'] })

    assert.equal(room.size, 2, 'publishing does not add peers')
    for (const s of socks) assert.equal(s.typed('stale').length, 50, 'one frame per push, no fan')
  })
})

describe('presence room: the heartbeat is one timer, started and stopped by the room', () => {
  it('sweeps while someone is connected, stops when the room empties, never stacks', async () => {
    const room = createRoom({ pingMs: 10 })
    const socks = []
    for (let i = 0; i < 5; i++) {
      const s = fake()
      s.ping = () => {
        s.pings++
        room.alive(s) // a live client pongs back, so the sweep never reaps it
      }
      socks.push(s)
      room.join(s)
    }
    // Four leave and one stays, so the room never empties. A heartbeat started
    // per join would leave four orphaned intervals sweeping the survivor, and
    // nothing would ever clear them: that is the unbounded growth this guards.
    for (let i = 0; i < 4; i++) room.leave(socks[i])
    const lonely = socks[4]
    lonely.pings = 0
    await sleep(120)
    const swept = lonely.pings
    assert.ok(swept >= 1, `the heartbeat runs (${swept} pings in 120ms at 10ms)`)
    assert.ok(swept <= 30, `one timer, not five stacked (${swept} pings)`)

    room.leave(lonely)
    const parked = lonely.pings
    await sleep(60)
    assert.equal(lonely.pings, parked, 'an empty room holds no timer')
  })
})

// Every upstream down except the weather, so the refresh moves exactly one key
// off the checked-in snapshot and nothing here touches the network. Reused
// verbatim by the second refresh, which is the point of that test: the same
// inputs must produce silence.
const LOADERS = {
  music: async () => {
    throw new Error('upstream down')
  },
  reel: async () => {
    throw new Error('upstream down')
  },
  gh: async () => {
    throw new Error('upstream down')
  },
  weather: async () => ({
    tempF: 41,
    condition: 'drizzle',
    city: 'Ithaca',
    isDay: false,
    highF: 44,
    lowF: 33,
  }),
}

describe('presence over the wire: one refresh, one message, one payload', () => {
  let app
  let url

  before(async () => {
    // The suite never reaches the network (issue #273). test/env.js keeps
    // build() from refreshing at boot: a boot refresh lands in cached() inside
    // its TTL, real weather or an offline null alike, and then the refresh
    // below never runs its own loader, so nothing "moved". The mock covers
    // what is left: /api/canvas reads the default loaders for anything not
    // cached, so the floor is proved against the same warm cache the push
    // named, not against whatever the real upstreams are doing today.
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('offline')
    })
    app = await build({ logger: false })
    await app.listen({ port: 0, host: '127.0.0.1' })
    url = `ws://127.0.0.1:${app.server.address().port}/ws/cursors`
  })

  after(async () => {
    await app.close()
    mock.restoreAll()
  })

  // Every socket a test opened closes here, pass or fail. The room is the
  // process's one room, so a test that threw before its own close() used to
  // leave participants behind and fail the spectator test after it: one
  // broken guard read as two (issue #273).
  const opened = []
  // It also waits for the server to see each close: an unawaited close lets
  // the room's `leave` fan-out land inside the next test's quiet window
  // (issue #349).
  afterEach(async () => {
    const mine = opened.splice(0)
    await Promise.all(
      mine.map(
        (ws) =>
          new Promise((res) => {
            if (ws.readyState === WebSocket.CLOSED) return res()
            ws.addEventListener('close', res, { once: true })
            ws.close()
          })
      )
    )
    for (let i = 0; presenceRoom.participants > 0 && i < 100; i++) await sleep(10)
  })

  // Minimal client over Node's own WebSocket: collects frames, waits for one
  // by type. No polling on the socket itself, just on the collected list.
  function client() {
    const ws = new WebSocket(url)
    opened.push(ws)
    const seen = []
    ws.addEventListener('message', (ev) => seen.push(JSON.parse(ev.data)))
    return {
      ws,
      seen,
      open: new Promise((res, rej) => {
        ws.addEventListener('open', res)
        ws.addEventListener('error', rej)
      }),
      async next(type, ms = 5000) {
        const until = Date.now() + ms
        for (;;) {
          const hit = seen.find((m) => m.type === type)
          if (hit) return hit
          if (Date.now() > until) throw new Error(`no ${type} frame in ${ms}ms`)
          await sleep(20)
        }
      },
      close: () => ws.close(),
    }
  }

  it('cursors still join, move and leave over the real socket', async () => {
    const a = client()
    await a.open
    await a.next('welcome')
    const b = client()
    await b.open
    const hello = await b.next('welcome')

    assert.equal(hello.spectator, false)
    const joined = await a.next('join')
    assert.equal(joined.id, hello.id)

    // a move goes IN as a move and comes back OUT inside a snapshot: the
    // inbound vocabulary is untouched, only the fan-out changed
    b.ws.send(JSON.stringify({ type: 'move', fx: 0.5, fy: 0.125, k: 'reel', d: true }))
    const moved = await a.next('moves')
    assert.deepEqual(moved, {
      type: 'moves',
      m: [[hello.id, Math.round(0.5 * 4096), Math.round(0.125 * 4096), 1, 'reel']],
    })

    b.close()
    const left = await a.next('leave')
    assert.equal(left.id, hello.id)
    a.close()
  })

  it('a squish over the real socket reaches both tabs, and the shell bakes it', async () => {
    const a = client()
    const b = client()
    await Promise.all([a.open, b.open])
    const [ha, hb] = await Promise.all([a.next('welcome'), b.next('welcome')])
    assert.equal(typeof ha.squish, 'number')
    const before = Date.now()
    b.ws.send(JSON.stringify({ type: 'squish' }))
    const [fa, fb] = await Promise.all([a.next('squish'), b.next('squish')])
    assert.equal(fa.type, 'squish')
    assert.ok(fa.until >= before + SQUISH_MS - 5 && fa.until <= Date.now() + SQUISH_MS + 5)
    assert.deepEqual(fb, fa, 'sender and bystander hear the same instant')
    // the shell bakes the instant: a fresh tab opens on the shared bug
    const home = await app.inject({ method: 'GET', url: '/' })
    const boot = /<script[^>]*id="boot"[^>]*>([\s\S]*?)<\/script>/.exec(home.body)
    assert.ok(boot, 'the shell bakes a boot payload')
    assert.equal(JSON.parse(boot[1]).maurice.until, fa.until, 'the shell says when he is back')
    // a second stamp inside the five minutes is not a second squish
    b.ws.send(JSON.stringify({ type: 'squish' }))
    await sleep(300)
    assert.equal(a.seen.filter((m) => m.type === 'squish').length, 1)
    assert.equal(hb.spectator, false)
    a.close()
    b.close()
  })

  it('a refresh that changes data pushes the same nudge to both clients', async () => {
    const a = client()
    const b = client()
    await Promise.all([a.open, b.open])
    await Promise.all([a.next('welcome'), b.next('welcome')])

    const keys = await refreshCanvasAndPublish(app.config, LOADERS)
    assert.deepEqual(keys, ['weather'], 'only the key that moved is published')

    const [pa, pb] = await Promise.all([a.next('stale'), b.next('stale')])
    assert.deepEqual(pa, { type: 'stale', keys: ['weather'] })
    assert.deepEqual(pb, pa, 'two clients, one payload: the idempotency claim')

    // and the nudge is a nudge: it names the key, it does not carry the data
    assert.deepEqual(Object.keys(pa).sort(), ['keys', 'type'])
    assert.ok(JSON.stringify(pa).length < 512, 'a push is smaller than one inbound frame')

    // the floor: a client with no socket at all reads the same fresh payload
    const polled = await app.inject({ method: 'GET', url: '/api/canvas' })
    assert.equal(polled.statusCode, 200)
    assert.equal(polled.headers['cache-control'], 'no-cache')
    assert.equal(JSON.parse(polled.body).weather.tempF, 41)

    a.close()
    b.close()
  })

  it('publishes nothing when the refresh finds the same data', async () => {
    const a = client()
    await a.open
    await a.next('welcome')
    const before = a.seen.length

    // same loaders, still inside the per-key cache window: nothing moved
    const keys = await refreshCanvasAndPublish(app.config, LOADERS)
    assert.deepEqual(keys, [], 'an unchanged refresh is silent')
    await sleep(150)
    assert.equal(
      a.seen.length,
      before,
      `no frame reached the client: ${JSON.stringify(a.seen.slice(before))}`
    )
    a.close()
  })

  it('a spectator over the real socket feeds, squishes and turns nothing (issue #260)', async () => {
    // The room is the process's own singleton, and the tests above close
    // their sockets without waiting for the server to notice; wait for the
    // last of them to leave, or a straggler would hold the slot this test
    // frees later and the participant contrast below would spectate.
    for (let i = 0; presenceRoom.participants > 0 && i < 100; i++) await sleep(20)
    assert.equal(presenceRoom.participants, 0, 'a socket from an earlier test never left')
    // The room forced full: PARTICIPANT_CAP stand-ins take every broadcasting
    // slot, so the next real socket in spectates.
    const fakes = []
    for (let i = 0; i < PARTICIPANT_CAP; i++) {
      const s = fake()
      presenceRoom.join(s)
      fakes.push(s)
    }
    try {
      const spec = client()
      await spec.open
      const hello = await spec.next('welcome')
      assert.equal(hello.spectator, true, 'the room was not full')

      // a cell with no food on it, so a pellet landing would be seen. Found,
      // not fixed: the dish is the process's one dish and other tests have fed
      // it. The service is NOT ticked here: its spawn clock would fire on a
      // wall-clock tick and could drop a pellet of its own anywhere, and the
      // frame it would send is encode(state), which is what is read directly.
      const st = _slime.state
      let cx = DISH / 2
      let cy = DISH / 2
      for (let d = 0; st.food[cy * DISH + cx] > 0 && d < DISH / 2 - 4; d++) {
        cx = DISH / 2 + d
        cy = DISH / 2 - d
      }
      const at = cy * DISH + cx
      assert.equal(st.food[at], 0, 'the dish is covered in food; no cell to test on')
      const squish0 = presenceRoom.squishUntil
      const fronts0 = presenceRoom.fronts

      spec.ws.send(JSON.stringify({ type: 'feed', x: cx, y: cy }))
      spec.ws.send(JSON.stringify({ type: 'squish' }))
      spec.ws.send(JSON.stringify({ type: 'front', stack: 'hero', i: 3 }))
      await sleep(150)
      assert.equal(st.food[at], 0, "a spectator's tap fed the dish")
      assert.equal(presenceRoom.squishUntil, squish0, "a spectator's click squished Maurice")
      assert.deepEqual(presenceRoom.fronts, fronts0, "a spectator's click turned a pile")
      assert.equal(spec.seen.filter((m) => m.type === 'squish').length, 0)
      assert.equal(spec.seen.filter((m) => m.type === 'front').length, 0)

      // refuse a vacuous pass: the same feed from a participant lands
      presenceRoom.leave(fakes.pop())
      const part = client()
      await part.open
      const hp = await part.next('welcome')
      assert.equal(hp.spectator, false, 'the freed slot was not handed on')
      part.ws.send(JSON.stringify({ type: 'feed', x: cx, y: cy }))
      await sleep(50)
      assert.ok(st.food[at] > 0, "a participant's tap did not feed the dish")
      spec.close()
      part.close()
    } finally {
      for (const s of fakes) presenceRoom.leave(s)
    }
  })
})

describe('the client keeps the same fact its sends are gated on (issue #260)', () => {
  // initPresence under a stub socket and the least DOM it touches: a scene
  // to append the cursor layer to, and a document that hands out inert
  // elements. The welcome is fed in by hand, the way the server would.
  function harness() {
    const saved = {
      WebSocket: globalThis.WebSocket,
      document: globalThis.document,
      location: globalThis.location,
      addEventListener: globalThis.addEventListener,
    }
    const el = () => ({
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild() {},
      remove() {},
      setAttribute() {},
    })
    const sockets = []
    class StubSocket {
      static OPEN = 1
      constructor() {
        this.readyState = 1
        this.sent = []
        sockets.push(this)
      }
      send(t) {
        this.sent.push(JSON.parse(t))
      }
      close() {}
    }
    globalThis.WebSocket = StubSocket
    // the watch (#259) subscribes to visibilitychange at init; the stub takes it
    globalThis.document = { createElement: el, hidden: false, addEventListener() {} }
    globalThis.location = { protocol: 'http:', host: 'test' }
    globalThis.addEventListener = () => {}
    const api = initPresence({ scene: el(), wrapPos: () => null })
    const ws = sockets[0]
    const welcome = (spectator) =>
      ws.onmessage({
        data: JSON.stringify({
          type: 'welcome',
          id: 7,
          spectator,
          t: Date.now(),
          squish: 0,
          fronts: {},
          peers: [],
        }),
      })
    const restore = () => Object.assign(globalThis, saved)
    return { api, ws, welcome, restore }
  }

  it('mayAct is true until the room says otherwise, then false, and the sends agree with it', () => {
    const { api, ws, welcome, restore } = harness()
    try {
      const roles = []
      api.onSpectate((s) => roles.push(s))
      assert.equal(api.mayAct(), true, 'a tab that has not been seated is not a spectator')
      welcome(true)
      assert.equal(api.mayAct(), false)
      assert.deepEqual(roles, [true], 'onSpectate did not fire on the welcome')
      api.feed(51, 51)
      api.squish()
      api.front('hero', 2)
      assert.deepEqual(ws.sent, [], 'a spectator put a mutation on the wire')

      // a reconnect that lands a participant slot gives the hand back
      welcome(false)
      assert.equal(api.mayAct(), true)
      assert.deepEqual(roles, [true, false])
      api.feed(51, 51)
      assert.deepEqual(ws.sent, [{ type: 'feed', x: 51, y: 51 }])
    } finally {
      restore()
    }
  })

  it('the no-socket API may act: alone, nothing outranks the tab', () => {
    const real = globalThis.WebSocket
    delete globalThis.WebSocket
    try {
      const api = initPresence({ scene: null, wrapPos: () => null })
      assert.equal(api.mayAct(), true)
      assert.doesNotThrow(() => api.onSpectate(() => {}))
    } finally {
      globalThis.WebSocket = real
    }
  })

  // mutation: presence.drop-paints-for-spectator, presence.dots-turn-for-spectator, presence.hero-asks-after-paint
  it('every optimistic paint in app.js asks mayAct before it paints', () => {
    // The claim is an order: between where a handler starts and its first
    // paint, it asks presence.mayAct(). Spacing and the shape of the early
    // return are the author's. The old dots check compared indexOf against
    // -1, so deleting the guard outright passed it.
    const asksBefore = (start, paint, why) => {
      const at = APP.indexOf(start)
      assert.ok(at > -1, `${start} is gone from app.js`)
      const to = APP.indexOf(paint, at)
      assert.ok(to > at, `${start} no longer paints with ${paint}`)
      assert.match(APP.slice(at, to), /!\s*presence\.mayAct\(\)/, why)
    }
    // the dish: the guess is not made, not made-then-erased
    asksBefore('const drop = ', 'slimeFood(', "the dish paints a spectator's pellet")
    // Maurice: the local squish would never be answered
    asksBefore('const squish = ', 'setMaurice(', "Maurice squishes on a spectator's screen alone")
    // the piles and the hero: a turn nobody echoes would stay turned
    asksBefore(
      'function setFront(',
      'paintFront(',
      "a spectator's hand turns a pile on their tab alone"
    )
    asksBefore('const turnHero = ', 'showHero(', "a spectator's hand turns the hero")
    // the statement's snap scrollbar (#336): its commit asks too, and puts
    // the thumb back for a spectator rather than turning anything
    asksBefore(
      'const heroBar = wireScroll(',
      'showHero(',
      "the hero's scrollbar turns it for a spectator"
    )
  })
})
