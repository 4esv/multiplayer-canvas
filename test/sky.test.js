// test/sky.test.js
// The weather window is shared. A hand pushes its
// clouds, the offset springs home, and every tab watching sees the same
// whole cells. Round seven: the sun and the moon never move under a hand,
// and a clear sky pushes nothing; a pushable disc fails the build here.
// Pinned: the spring both ends share (primitives/sky/outlook.js), what the picture
// does with the offset, the frames the wire accepts, the service's clock
// (nothing to a room that is not watching, nothing while the sky is at
// rest), and the client's side of the same watch the slime taught the wire.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  INKS,
  SIZE,
  PUSH_MAX,
  PUSH_IN,
  createPush,
  shove,
  settle,
  cellsOf,
  pushed,
  cloudCells,
  frame,
} from '../primitives/sky/outlook.js'
import { parseFrame, parsePush } from '../primitives/presence/presence-protocol.js'
import { presenceRoom } from '../primitives/presence/presence-room.js'
import { pushSky, watchSky, skyWatchers, TICK_MS, _sky } from '../primitives/sky/server.js'
import { initPresence } from '../primitives/presence/presence.js'

const ROOT = join(import.meta.dirname, '..')
const read = (f) => readFileSync(join(ROOT, f), 'utf8')
const APP = read('src/static/canvas/app.js')
const ROUTE = read('src/routes/presence.js')
const TOKENS = read('primitives/kit/canvas-tokens.css')
const tok = (name) => TOKENS.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`))[1]
const inks = Object.fromEntries(Object.entries(INKS).map(([k, v]) => [k, tok(v)]))

const run = (p, n) => {
  for (let i = 0; i < n; i++) settle(p)
}
const atRest = (p) => p.x === 0 && p.y === 0 && p.vx === 0 && p.vy === 0

describe('sky: the spring both ends step', () => {
  // mutation: sky.no-spring, sky.no-snap
  it('a push throws the offset and it comes home to exact rest within seven seconds', () => {
    for (const n of [1, 5, 40]) {
      const p = createPush()
      for (let i = 0; i < n; i++) {
        shove(p, PUSH_IN, -PUSH_IN)
        settle(p)
      }
      assert.ok(Math.abs(p.x) >= 1, `${n} pushes did not move the sky`)
      let steps = 0
      while (!atRest(p) && steps < 1000) {
        settle(p)
        steps++
        assert.ok(Math.abs(p.x) <= PUSH_MAX && Math.abs(p.y) <= PUSH_MAX, 'the sky left the tile')
      }
      assert.ok(atRest(p), `${n} pushes never came to rest`)
      assert.ok(steps * TICK_MS <= 7000, `${n} pushes took ${steps * TICK_MS} ms to settle`)
    }
  })

  it('at rest it stays at rest, and whole cells are what a tab draws', () => {
    const p = createPush()
    run(p, 50)
    assert.ok(atRest(p))
    assert.deepEqual(cellsOf({ x: 2.4, y: -0.4 }), [2, 0])
    assert.deepEqual(cellsOf({ x: -0.2, y: 0.2 }), [0, 0], 'a negative zero rode the wire')
  })

  // mutation: sky.push-uncapped
  it('one push says at most PUSH_IN either way', () => {
    const a = createPush()
    const b = createPush()
    shove(a, 1000, -1000)
    shove(b, PUSH_IN, -PUSH_IN)
    assert.deepEqual(a, b)
  })

  // mutation: sky.fine-pushes-clouds
  it('the touchable layer is the clouds, and a clear sky has none', () => {
    assert.equal(pushed('fine'), null)
    for (const r of ['clouds', 'overcast', 'rain', 'snow', 'fog']) assert.equal(pushed(r), 'clouds')
  })
})

describe('sky: the picture takes the offset', () => {
  // mutation: sky.clouds-ignore-push
  it('pushed clouds are the same field, slid by whole cells', () => {
    // clouds drift one cell every eight steps, so a push of k cells is the
    // field k drifts later
    for (const row of ['clouds', 'overcast']) {
      assert.deepEqual(cloudCells(row, 80, 3, 0), cloudCells(row, 80 + 3 * 8), row)
      assert.notDeepEqual(cloudCells(row, 80, 0, 4), cloudCells(row, 80), `${row} did not rise`)
    }
    const w = { cond: 'Partly cloudy', day: true }
    assert.notDeepEqual(
      frame(w, 0, 80, inks, [5, 0]),
      frame(w, 0, 80, inks),
      'the frame ignores the push'
    )
    assert.deepEqual(frame(w, 0, 80, inks, [0, 0]), frame(w, 0, 80, inks))
  })

  // mutation: sky.disc-pushable
  it('the sun and the moon never move under a hand: a clear sky ignores the push, byte for byte', () => {
    // noon and midnight on a real day (2026-09-23, Ithaca's sunrise and
    // sunset in the payload), so both discs are well inside the window and
    // any nudge at all would show
    const rise = 1758624000 + 6 * 3600 + 50 * 60
    const set = rise + 12 * 3600 + 10 * 60
    for (const [w, at] of [
      [{ cond: 'Clear sky', day: true, rise, set }, (rise + set) / 2],
      [{ cond: 'Clear sky', day: false, rise, set }, set + 6 * 3600],
    ]) {
      const home = frame(w, at * 1000, 0, inks)
      for (const push of [
        [PUSH_MAX, -PUSH_MAX],
        [-PUSH_MAX, PUSH_MAX],
        [999, 0],
        [1, 1],
      ])
        assert.deepEqual(
          frame(w, at * 1000, 0, inks, push),
          home,
          `${w.day ? 'sun' : 'moon'} moved under ${push}`
        )
    }
    // and a sun over a deck does not move with the deck either: the clouds
    // slide, the disc stays, so the two frames differ only where the cloud is
    const sun = tok(INKS.sun)
    const want = [1, 3, 5].map((i) => parseInt(sun.slice(i, i + 2), 16))
    const faceAt = (f) => {
      const cells = []
      for (let i = 0; i < f.length; i += 4)
        if (f[i] === want[0] && f[i + 1] === want[1] && f[i + 2] === want[2]) cells.push(i)
      return cells
    }
    const w = { cond: 'Partly cloudy', day: true, rise, set }
    const at = ((rise + set) / 2) * 1000
    const still = faceAt(frame(w, at, 80, inks))
    assert.ok(still.length > 20, 'no sun face found under fair cloud')
    const pushedFace = faceAt(frame(w, at, 80, inks, [PUSH_MAX, -PUSH_MAX]))
    // every sun pixel the push uncovered or covered is a cloud's doing, so
    // the pushed face lies inside the still face's bounding box
    const box = (cells) => {
      const xs = cells.map((i) => (i / 4) % SIZE)
      const ys = cells.map((i) => Math.floor(i / 4 / SIZE))
      return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    }
    const [x0, x1, y0, y1] = box(still)
    const [px0, px1, py0, py1] = box(pushedFace)
    assert.ok(
      px0 >= x0 && px1 <= x1 && py0 >= y0 && py1 <= y1,
      `the sun moved with the deck: ${[x0, x1, y0, y1]} to ${[px0, px1, py0, py1]}`
    )
  })
})

describe('sky: the wire', () => {
  // mutation: sky.push-out-of-range
  it('a push is two whole numbers within PUSH_IN, not both zero; a sky watch says so', () => {
    assert.deepEqual(parsePush(JSON.stringify({ type: 'push', dx: 3, dy: -PUSH_IN })), {
      dx: 3,
      dy: -PUSH_IN,
    })
    for (const junk of [
      { dx: PUSH_IN + 1, dy: 0 },
      { dx: 0, dy: -PUSH_IN - 1 },
      { dx: 1.5, dy: 0 },
      { dx: '2', dy: 0 },
      { dx: 0, dy: 0 },
      { dx: 2 },
    ])
      assert.equal(
        parseFrame(JSON.stringify({ type: 'push', ...junk })),
        null,
        JSON.stringify(junk)
      )
    assert.deepEqual(parseFrame(JSON.stringify({ type: 'push', dx: -1, dy: 2, x: 9 })), {
      kind: 'push',
      dx: -1,
      dy: 2,
    })
    assert.deepEqual(parseFrame(JSON.stringify({ type: 'watch', on: true, of: 'sky' })), {
      kind: 'watch',
      on: true,
      of: 'sky',
    })
    // anything else is the dish's watch, as it always was
    assert.deepEqual(parseFrame(JSON.stringify({ type: 'watch', on: true, of: 'moon' })), {
      kind: 'watch',
      on: true,
    })
  })

  // mutation: sky.spectator-pushes, sky.watch-goes-to-slime, sky.gone-keeps-watching
  it('the route takes the sky watch from anybody, a push from participants only, and forgets a closed socket', () => {
    assert.match(ROUTE, /if \(frame\.of === 'sky'\) watchSky\(socket, frame\.on\)/)
    const spectator = ROUTE.indexOf('if (me.spectator) return')
    assert.ok(spectator > 0)
    assert.ok(ROUTE.indexOf('pushSky(') > spectator, 'a spectator can push the sky')
    assert.match(ROUTE, /const gone = \(\) => \{[^}]*watchSky\(socket, false\)/)
  })
})

describe('sky: the service', () => {
  const fake = () => {
    const s = { OPEN: 1, readyState: 1, sent: [], ping() {}, terminate() {} }
    s.send = (t) => s.sent.push(JSON.parse(t))
    return s
  }
  const quiet = (now) => {
    // run the spring home so a test starts from rest
    for (let i = 0; i < 200; i++) _sky.tick(now + i)
  }

  // mutation: sky.sends-at-rest
  it('sends nothing to a room that is not watching, and nothing to a watcher while the sky is at rest', () => {
    const a = fake()
    const b = fake()
    presenceRoom.join(a)
    presenceRoom.join(b)
    try {
      a.sent.length = 0
      b.sent.length = 0
      let now = 3_000_000
      quiet(now)
      now += 1000
      pushSky(PUSH_IN, 0)
      for (let i = 0; i < 20; i++) _sky.tick((now += TICK_MS))
      assert.equal(a.sent.length + b.sent.length, 0, 'a tab that is not watching was sent the sky')
      quiet(now)
      watchSky(a, true, now)
      _sky.tick((now += TICK_MS))
      assert.deepEqual(a.sent, [{ type: 'sky', x: 0, y: 0 }], 'a fresh watcher is owed one frame')
      for (let i = 0; i < 100; i++) _sky.tick((now += TICK_MS))
      assert.equal(a.sent.length, 1, 'a sky at rest kept talking')
      assert.equal(b.sent.length, 0)
    } finally {
      watchSky(a, false)
      presenceRoom.leave(a)
      presenceRoom.leave(b)
    }
    assert.equal(skyWatchers(), 0)
  })

  it('a push reaches every watcher, spectators included, as the same cells, and ends at rest', () => {
    const a = fake()
    const s = fake()
    const away = fake()
    presenceRoom.join(a)
    presenceRoom.join(s)
    presenceRoom.join(away)
    try {
      away.sent.length = 0
      let now = 4_000_000
      quiet(now)
      now += 1000
      watchSky(a, true, now)
      watchSky(s, true, now)
      _sky.tick((now += TICK_MS))
      a.sent.length = 0
      s.sent.length = 0
      pushSky(PUSH_IN, -PUSH_IN)
      for (let i = 0; i < 100; i++) _sky.tick((now += TICK_MS))
      assert.ok(a.sent.length >= 2, 'the push never reached the watcher')
      assert.deepEqual(a.sent, s.sent, 'two watchers saw two skies')
      assert.equal(away.sent.length, 0)
      assert.ok(a.sent.every((m) => m.type === 'sky' && Number.isInteger(m.x)))
      assert.ok(
        a.sent.some((m) => m.x > 0 && m.y < 0),
        'the sky did not go where it was pushed'
      )
      assert.deepEqual(a.sent.at(-1), { type: 'sky', x: 0, y: 0 }, 'the last word is not home')
      // one frame per change of whole cells: no two in a row alike
      for (let i = 1; i < a.sent.length; i++)
        assert.notDeepEqual(a.sent[i], a.sent[i - 1], 'a frame that changed nothing went out')
      assert.ok(a.sent.length <= 40, `${a.sent.length} frames for one push`)
      // a tab that stops watching is sent nothing more
      watchSky(a, false)
      pushSky(PUSH_IN, 0)
      for (let i = 0; i < 20; i++) _sky.tick((now += TICK_MS))
      const n = a.sent.length
      assert.equal(a.sent.length, n)
      assert.ok(s.sent.length > a.sent.length)
    } finally {
      watchSky(a, false)
      watchSky(s, false)
      presenceRoom.leave(a)
      presenceRoom.leave(s)
      presenceRoom.leave(away)
    }
  })
})

describe('sky: the tab', () => {
  // mutation: sky.client-watch-every-frame, sky.client-spectator-pushes
  it('says its sky watch on change only, no when hidden, and never pushes as a spectator', () => {
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
    const onDoc = {}
    try {
      globalThis.WebSocket = StubSocket
      globalThis.document = {
        createElement: el,
        hidden: false,
        addEventListener: (type, fn) => (onDoc[type] = fn),
      }
      globalThis.location = { protocol: 'http:', host: 'test' }
      globalThis.addEventListener = () => {}
      const api = initPresence({ scene: el(), wrapPos: () => null })
      const ws = sockets[0]
      const got = []
      api.onSky((m) => got.push(m))
      const skies = () =>
        ws.sent.filter((m) => m.type === 'watch' && m.of === 'sky').map((m) => [m.on, m.of])
      api.watchSky(true)
      api.watchSky(true)
      assert.deepEqual(skies(), [[true, 'sky']])
      globalThis.document.hidden = true
      onDoc.visibilitychange()
      assert.deepEqual(skies(), [
        [true, 'sky'],
        [false, 'sky'],
      ])
      globalThis.document.hidden = false
      api.push(2, -1)
      assert.deepEqual(ws.sent.at(-1), { type: 'push', dx: 2, dy: -1 })
      ws.onmessage({ data: JSON.stringify({ type: 'sky', x: 4, y: 0 }) })
      assert.deepEqual(got, [{ type: 'sky', x: 4, y: 0 }])
      // a spectator is told so in the welcome, and its hand says nothing
      ws.onmessage({ data: JSON.stringify({ type: 'welcome', id: 7, spectator: true, peers: [] }) })
      const n = ws.sent.length
      api.push(3, 0)
      assert.equal(ws.sent.length, n, 'a spectator pushed the sky')
    } finally {
      Object.assign(globalThis, saved)
    }
  })

  // mutation: sky.still-watches, sky.still-draws-push, sky.spectator-gusts, sky.tab-clock
  it('a still sky neither watches nor draws the push, a spectator guesses nothing, and the step is the room clock', () => {
    assert.match(APP, /presence\.watchSky\([^)]*!nodes\.weather\.hidden && !outlookStillNow\)/)
    assert.match(APP, /const push = still \? \[0, 0\] : skyAt;/)
    assert.match(APP, /if\(outlookStillNow \|\| !presence\.mayAct\(\)\) return;/)
    assert.match(
      APP,
      /const now = presence\.now\(\);\n\s*const step = still \? 0 : Math\.floor\(now \/ OUTLOOK_STEP\);/
    )
  })
})
