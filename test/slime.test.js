// test/slime.test.js
// BIBLE.md section 5: the slime mould. The motion lab's physarum in a round
// dish on the northwest corner of the ring, alive on the server whether
// anyone watches, fed by whoever taps it. What is pinned here is the
// arithmetic both ends share (primitives/slime/slime.js), the dish's seat and measure,
// the rim as cell data, the wire's shape, and the service's clock: that a
// frame goes out only to a room with someone in it, that a feed lands on the
// next step, and that a pellet is found and eaten rather than kept.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  DISH,
  DISH_PX,
  TILE_M,
  LABEL_GAP,
  LINE_GAP,
  MASK,
  CELLS,
  FRAME_BYTES,
  PARAMS,
  TONES,
  inside,
  rimGrid,
  createSlime,
  step,
  feed,
  randomCell,
  tones,
  foodCells,
  pelletCount,
  pelletCells,
  PELLET_CELLS,
  encode,
  decode,
  encodeDelta,
  applyDelta,
  dishBox,
} from '../primitives/slime/slime.js'
import {
  PX,
  M,
  AIR,
  TILES,
  SLOTS,
  TYPE_LINE,
  placeWorld,
  heroFixed,
} from '../src/static/canvas/layout.js'
import { presenceRoom } from '../primitives/presence/presence-room.js'
import {
  slimeFrame,
  feedSlime,
  FRAME_MS,
  TICK_MS,
  STANDING,
  SPAWN_MAX_MS,
  KEY_GATE_MS,
  watchSlime,
  slimeWatchers,
  _slime,
} from '../primitives/slime/server.js'
import { parseFrame } from '../primitives/presence/presence-protocol.js'
import { initPresence } from '../primitives/presence/presence.js'

const ROOT = join(import.meta.dirname, '..')
const read = (f) => readFileSync(join(ROOT, f), 'utf8')
const centre = CELLS.indexOf((DISH / 2) * DISH + DISH / 2)

describe('the dish is the circle that circumscribes a 5x5 square, inside the 8x8 tile', () => {
  it('is the smallest even cell count that holds a 5x5 square on its diagonal', () => {
    const diag = 5 * M * Math.SQRT2
    assert.ok(DISH_PX >= diag, `${DISH_PX}px does not hold the 5x5 square's ${diag}px diagonal`)
    assert.ok(DISH_PX - 2 * PX < diag, 'two cells smaller would still hold it')
    assert.equal(DISH % 2, 0, 'an odd dish has no cell corner at its centre')
    assert.equal(DISH_PX, DISH * PX)
  })

  it('is a circle on the lattice: symmetric both ways, inside listed in row-major order', () => {
    for (let y = 0; y < DISH; y++)
      for (let x = 0; x < DISH; x++) {
        assert.equal(inside(x, y), inside(DISH - 1 - x, y), `${x},${y} east-west`)
        assert.equal(inside(x, y), inside(x, DISH - 1 - y), `${x},${y} north-south`)
        assert.equal(inside(x, y), inside(y, x), `${x},${y} across the diagonal`)
        assert.equal(!!MASK[y * DISH + x], inside(x, y))
      }
    for (let k = 1; k < CELLS.length; k++)
      assert.ok(CELLS[k] > CELLS[k - 1], 'CELLS is out of order')
    assert.equal(
      CELLS.length,
      MASK.reduce((a, b) => a + b, 0)
    )
    // a circle's area, within the staircase
    assert.ok(Math.abs(CELLS.length - Math.PI * (DISH / 2) ** 2) < DISH * 2)
    // the centre is in, the corner is out, and the 5x5 square (60 cells
    // across, centred) has its corners inside
    assert.ok(inside(DISH / 2, DISH / 2))
    assert.ok(!inside(0, 0))
    const c = (DISH - 60) / 2
    assert.ok(inside(c, c) && inside(DISH - 1 - c, DISH - 1 - c), 'the 5x5 square pokes out')
  })

  it('the rim is cell data: a closed ring of inside cells touching the outside', () => {
    const g = rimGrid()
    assert.equal(g.length, DISH)
    let n = 0
    for (let y = 0; y < DISH; y++)
      for (let x = 0; x < DISH; x++) {
        if (!g[y][x]) continue
        n++
        assert.ok(inside(x, y), `rim cell ${x},${y} is outside the dish`)
        const out = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ].some(([a, b]) => !inside(a, b))
        assert.ok(out, `rim cell ${x},${y} touches nothing outside`)
        // closed: every rim cell has at least two rim neighbours
        let nb = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue
            const yy = y + dy
            const xx = x + dx
            if (yy >= 0 && yy < DISH && xx >= 0 && xx < DISH && g[yy][xx]) nb++
          }
        assert.ok(nb >= 2, `rim cell ${x},${y} is a loose end`)
      }
    assert.ok(n > DISH * 2 && n < DISH * 4, `${n} rim cells for a ${DISH}-cell circle`)
  })

  // mutation: slime.dish-centred-across
  it('sits in the northwest corner of the ring, in the 8x8 square, with the label under it', () => {
    const t = TILES.find((t) => t.id === 'slime')
    assert.ok(t, 'no slime tile')
    assert.equal(t.type, 'slime')
    assert.deepEqual([t.mw, t.mh], [TILE_M, TILE_M])
    assert.equal(t.label.split('\n').length, 2, 'his name is two lines')
    assert.deepEqual(SLOTS.slime, [0, 0])
    const box = dishBox()
    assert.equal(box.x % PX, 0, 'the dish is off the cell')
    // the painted ring's top and left edges are the tile's (the top and left
    // line up with the top and left of the tile)
    assert.deepEqual([box.x, box.y], [0, 0], "the dish is off the tile's top left corner")
    const rim = rimGrid()
    assert.ok(rim[0].some(Boolean), 'the ring does not reach the top edge')
    assert.ok(
      rim.some((row) => row[0]),
      'the ring does not reach the left edge'
    )
    assert.equal(box.w, DISH_PX)
    assert.ok(box.x + box.w <= t.mw * M, 'the dish is wider than its tile')
    assert.ok(box.h <= t.mh * M, 'the dish overflows its tile')
    // his name is an overhang: it clears the tile's south edge and stays
    // inside the air below it (the lattice guard forbids a taller tile)
    const nameBottom = box.h + LABEL_GAP + 2 * TYPE_LINE + LINE_GAP
    assert.ok(nameBottom > t.mh * M, 'the name no longer overhangs; drop this clause')
    assert.ok(nameBottom <= t.mh * M + AIR, 'his name reaches the next row')
    const out = placeWorld({ tiles: TILES, hero: heroFixed() })
    assert.equal(out.violations, 0)
    assert.equal(out.tiles.slime.x % PX, 0)
    assert.equal(out.tiles.slime.y % PX, 0)
  })

  // mutation: slime.watch-ignores-visibility, slime.dish-smoothed, slime.name-centred-on-tile
  it('the tile builder draws the rim through the label hand and the dust, and reads the same numbers', () => {
    const app = read('src/static/canvas/app.js')
    assert.match(app, /pathFromGrid\(rim\)/, 'the rim is not drawn from the grid')
    assert.match(
      app,
      /wireDust\(n\.querySelector\('\.rim'\), rim\)/,
      'the rim is not wired to the dust'
    )
    assert.match(app, /presence\.feed\(/, 'a tap never reaches the wire')
    assert.match(app, /presence\.onSlime\(/, "the room's frames are never painted")
    // The tab says whether it can see the dish, every frame,
    // from the visibility and the render's own verdict on the tile; a
    // delta against a base this tab does not hold asks for a keyframe
    assert.match(
      app,
      /presence\.watch\(!document\.hidden && !!nodes\.slime && !nodes\.slime\.hidden\)/,
      'the watch is not visibility AND on-camera'
    )
    assert.match(app, /presence\.frame\([^\n]*watchSlime\(\)/, 'the watch is not said every frame')
    assert.match(
      app,
      /m\.b !== slimeTick\)\{ presence\.watch\(true, true\)/,
      'a missed base is not re-asked'
    )
    // (what presence.js does with the watch is run, not read: the next test)
    // one backing pixel a cell, the lab's way
    // the name is seated under the dish and as wide as it, so it centres on
    // the circle it names, not on the tile
    assert.match(
      app,
      /class="name k-lbl" style="left:\$\{box\.x\}px;width:\$\{box\.w\}px;top:\$\{box\.y \+ box\.h \+ /
    )
    assert.match(app, /<canvas class="dish" width="\$\{DISH\}" height="\$\{DISH\}"/)
    const css = read('src/static/css/canvas-home.css')
    assert.match(
      css,
      /\.t-slime \.dish \{[^}]*image-rendering: pixelated/s,
      'a smoothed dish is a blur'
    )
    assert.match(css, /\.t-slime \.rim \{[^}]*pointer-events: none/s, 'the rim eats the tap')
  })

  // mutation: slime.wakes-while-away, slime.asleep-fades
  it("an absent tab's dish loses life: asleep from the no that is sent, awake on the keyframe decoded", () => {
    const app = read('src/static/canvas/app.js')
    const css = read('src/static/css/canvas-home.css')
    // SET where the watch is sent (presence.js, run in the next test); here,
    // what app.js does with it
    assert.match(
      app,
      /presence\.onWatch\(\(on\)=>\{ slimeAway = !on; if\(!on\) slimeAsleep\(true\); \}\)/,
      'a no does not put the dish to sleep'
    )
    assert.match(
      app,
      /function slimeAsleep\(on\)\{[^}]*toggleAttribute\('data-asleep', on\)/,
      'the state is not on the tile'
    )
    // CLEARED where the keyframe is decoded, and only by a keyframe: a good
    // decode, while the last word said was yes
    assert.match(
      app,
      /if\(typeof m\.g === 'string'\)\{ if\(setSlime\(m\.g, m\.f\) && !slimeAway\) slimeAsleep\(false\);/,
      'a decoded keyframe does not wake the dish'
    )
    assert.match(
      app,
      /function setSlime\(g, f\)\{[^}]*if\(!d\) return false;[^}]*return true; \}/,
      'a frame that is not one wakes the dish'
    )
    assert.equal(
      app.match(/slimeAsleep\(false\)/g).length,
      1,
      'something other than a keyframe wakes the dish'
    )
    // the look: a filter on the dish, the rim following; at once going down,
    // in frames coming back (tokens, steps), never a fade
    assert.match(
      css,
      /\.t-slime\[data-asleep\] \.dish,\n\.t-slime\[data-asleep\] \.rim \{[^}]*filter: grayscale\(1\) opacity\([^)]+\);[^}]*transition: none/s,
      'the asleep dish is not desaturated and dimmed, rim and all'
    )
    assert.match(
      css,
      /\.t-slime \.dish,\n\.t-slime \.rim \{\s*transition: filter var\(--cv-dur-drift\) var\(--cv-ease-step\);/,
      'the colour does not come back in steps'
    )
    const tokens = read('primitives/kit/canvas-tokens.css')
    assert.match(tokens, /--cv-ease-step: steps\(/, 'the step token is a curve: that is a fade')
  })

  // mutation: slime.watch-resent-every-frame, slime.hidden-tab-keeps-yes, slime.reconnect-keeps-yes, slime.onwatch-hears-the-unsent
  it('the client says its watch on change only, says no when hidden, and hands on only what reached the wire', () => {
    // presence.js under a stub socket and the least DOM it touches, the way
    // test/presence.test.js seats it: sends are observed, not grepped
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
      const said = []
      api.onWatch((on) => said.push(on))
      const watches = () => ws.sent.filter((m) => m.type === 'watch').map((m) => m.on)

      // on change only: a yes every frame is one yes on the wire
      api.watch(true)
      api.watch(true)
      api.watch(true)
      assert.deepEqual(watches(), [true], 'the watch is not sent on change only')
      // `again` asks twice on purpose (a missed base wants a keyframe)
      api.watch(true, true)
      assert.deepEqual(watches(), [true, true])
      // a hidden tab stops its frames, so the no rides the event itself
      globalThis.document.hidden = true
      onDoc.visibilitychange()
      assert.deepEqual(watches(), [true, true, false], 'a hidden tab keeps its yes')
      globalThis.document.hidden = false
      // a new socket knows nothing of this tab: the same no is said again
      ws.onopen()
      api.watch(false)
      assert.deepEqual(watches(), [true, true, false, false], 'a new socket inherits the old no')
      // what was handed on is exactly what was sent, and a closed socket
      // hands on nothing: a no that never reached the wire marks nothing
      assert.deepEqual(said, [true, true, false, false])
      ws.readyState = 3
      api.watch(true)
      assert.deepEqual(said, [true, true, false, false], 'an unsent watch was handed on')
    } finally {
      Object.assign(globalThis, saved)
    }
    // and a tab with no socket still takes the subscription
    const real = globalThis.WebSocket
    delete globalThis.WebSocket
    try {
      const api = initPresence({ scene: null, wrapPos: () => null })
      assert.doesNotThrow(() => api.onWatch(() => {}), 'a tab with no socket throws on onWatch')
    } finally {
      globalThis.WebSocket = real
    }
  })

  // mutation: slime.spectator-keeps-tabstop
  it("a spectator's dish reads as not-tappable: aria, keyboard and cursor", () => {
    const app = read('src/static/canvas/app.js')
    const on = app.slice(app.indexOf('presence.onSpectate('))
    assert.ok(on.length > 0, 'the dish never hears its role')
    const block = on.slice(0, on.indexOf('});') + 3)
    assert.match(block, /o\.n\.setAttribute\('aria-disabled', String\(spectating\)\)/)
    assert.match(
      block,
      /o\.n\.tabIndex = spectating \? -1 : 0/,
      'a spectator keeps a tab stop that does nothing'
    )
    assert.match(block, /watching only/, 'the label still says feed him')
    const css = read('src/static/css/canvas-home.css')
    assert.match(
      css,
      /\.t-slime\[aria-disabled='true'\] \.dish \{\s*cursor: default;/,
      'the pointing hand still promises a tap'
    )
  })
})

describe('the mould is the lab’s: deterministic, walled in, and it finds its food', () => {
  it('replays: same seed, same steps, same picture; a different seed, a different one', () => {
    const a = createSlime(42)
    const b = createSlime(42)
    const c = createSlime(43)
    for (let i = 0; i < 80; i++) {
      step(a)
      step(b)
      step(c)
    }
    assert.deepEqual(encode(a), encode(b))
    assert.notEqual(encode(a).g, encode(c).g)
    assert.equal(a.tick, 80)
  })

  it('carries the lab’s numbers and its three tones, with the two measured departures', () => {
    // moves2.js physarum: SA 0.5, SD 5, turn 0.5, jitter 0.9, deposit 1.4,
    // tones at 2.4 / 1.1 / 0.45, a twelve-cell clump to start
    const { sensorAngle, sensorDist, turn, jitter, deposit, clump } = PARAMS
    assert.deepEqual(
      [sensorAngle, sensorDist, turn, jitter, deposit, clump],
      [0.5, 5, 0.5, 0.9, 1.4, 12]
    )
    assert.deepEqual([...TONES], [0.45, 1.1, 2.4])
    // the departures (primitives/slime/slime.js says why, with the measurement): the
    // trail forgets faster than the lab's 0.92 and the colony is thinner
    // than the lab's 12% of the cells
    assert.equal(PARAMS.decay, 0.85)
    assert.ok(PARAMS.agents / CELLS.length < 0.1 && PARAMS.agents / CELLS.length > 0.06)
  })

  it('stays a network, not a band: veins between standing pellets at tick 2000', () => {
    // the thinness metric the sweep was judged on: ink perimeter over ink
    // area. A band scores about a third; a network of veins over a half.
    const s = createSlime(5)
    for (const [x, y] of [
      [51, 21],
      [81, 51],
      [51, 81],
      [21, 51],
      [35, 35],
    ])
      feed(s, x, y)
    // pellets that last the test, so the shape is the network's and not a meal's
    s.p = { ...s.p, bite: 0.0005 }
    for (let i = 0; i < 2000; i++) step(s)
    const tn = tones(s)
    const ink = new Uint8Array(DISH * DISH)
    let area = 0
    for (let k = 0; k < CELLS.length; k++)
      if (tn[k] === 3) {
        ink[CELLS[k]] = 1
        area++
      }
    let perim = 0
    for (let k = 0; k < CELLS.length; k++) {
      const i = CELLS[k]
      if (!ink[i]) continue
      const x = i % DISH
      const y = (i - x) / DISH
      if (x === 0 || !ink[i - 1]) perim++
      if (x === DISH - 1 || !ink[i + 1]) perim++
      if (y === 0 || !ink[i - DISH]) perim++
      if (y === DISH - 1 || !ink[i + DISH]) perim++
    }
    const pct = (100 * area) / CELLS.length
    assert.ok(pct > 3 && pct < 15, `${pct.toFixed(1)}% of the dish is ink`)
    assert.ok(perim / area > 0.45, `thinness ${(perim / area).toFixed(2)}: a band, not veins`)
  })

  it('no agent ever leaves the dish', () => {
    const s = createSlime(7)
    for (let i = 0; i < 300; i++) {
      step(s)
      for (let k = 0; k < s.ax.length; k++) {
        const x = Math.floor(s.ax[k])
        const y = Math.floor(s.ay[k])
        assert.ok(inside(x, y), `agent ${k} at ${x},${y} is outside the dish after ${i + 1} steps`)
      }
    }
  })

  it('food lands inside the dish only and shows on the wire', () => {
    const s = createSlime(3)
    assert.equal(feed(s, 0, 0), false, 'the corner is outside the circle')
    assert.equal(feed(s, -1, 5), false)
    assert.equal(feed(s, 5.5, 5), false)
    assert.equal(feed(s, DISH, 5), false)
    assert.equal(feed(s, DISH / 2, DISH / 2), true)
    const f = foodCells(s)
    assert.ok(f.length >= 2 && f.length % 2 === 0)
    let hit = false
    for (let k = 0; k < f.length; k += 2) if (f[k] === DISH / 2 && f[k + 1] === DISH / 2) hit = true
    assert.ok(hit, 'the fed cell is not on the wire')
    for (let i = 0; i < 200; i++) {
      const [x, y] = randomCell(s.rand)
      assert.ok(inside(x, y))
    }
  })

  it('a pellet across the dish is found within a few hundred ticks and eaten within a couple of minutes', () => {
    // the colony starts as a clump at the centre; the pellet goes near the
    // wall, twenty-one cells in from the corner of the square
    const s = createSlime(5)
    for (let i = 0; i < 300; i++) step(s)
    feed(s, 30, 30)
    const mass = () => {
      let m = 0
      for (const i of CELLS) m += s.food[i]
      return m
    }
    const m0 = mass()
    assert.ok(m0 >= PARAMS.pellet)
    let found = -1
    let gone = -1
    for (let i = 1; i <= 4000 && gone < 0; i++) {
      step(s)
      const m = mass()
      if (found < 0 && m < m0 * 0.98) found = i
      if (m === 0) gone = i
    }
    assert.ok(found > 0 && found * TICK_MS < 30_000, `found after ${found} ticks`)
    assert.ok(gone > 0 && gone * TICK_MS < 150_000, `gone after ${gone} ticks`)
    assert.ok(gone - found > 200, 'a pellet is a meal, not a flash')
  })

  it('the wire is two bits a cell, the inside cells only, food as a list, and decodes to what was encoded', () => {
    const s = createSlime(11)
    for (let i = 0; i < 40; i++) step(s)
    feed(s, 40, 60)
    const tn = tones(s)
    assert.equal(tn.length, CELLS.length)
    for (const v of tn) assert.ok(v >= 0 && v <= 3)
    assert.ok(
      tn.some((v) => v > 0),
      'no trail on the wire after forty steps'
    )
    const { g, f } = encode(s)
    assert.equal(g.length, 4 * Math.ceil(FRAME_BYTES / 3))
    const d = decode(g, f)
    assert.deepEqual([...d.tones], [...tn])
    assert.deepEqual(d.food, foodCells(s))
    assert.equal(decode(g.slice(1), f), null, 'a short frame decoded')
    assert.equal(decode(g.replace(/[A-Za-z0-9+/]/, '!'), f), null, 'junk decoded')
    assert.equal(decode(42, f), null)
    assert.equal(decode(null), null)
    assert.equal(decode(g, [1]), null, 'a half coordinate decoded')
    assert.equal(decode(g, [0, 0]), null, 'food outside the dish decoded')
    assert.equal(decode(g, [1.5, 50]), null)
    assert.ok(decode(g), 'a frame with no food is a frame')
  })

  it('counts pellets by the shape the state paints, not the default', () => {
    const wide = createSlime(3, { pelletRadius: 2 })
    const plain = createSlime(3)
    assert.ok(pelletCells(wide) > PELLET_CELLS, 'a wider drop paints no more cells')
    assert.equal(pelletCells(plain), PELLET_CELLS)
    feed(wide, DISH / 2, DISH / 2)
    feed(plain, DISH / 2, DISH / 2)
    assert.equal(pelletCount(wide), 1, 'one wide drop is not one pellet')
    assert.equal(pelletCount(plain), 1)
    // a rim drop paints fewer cells and counts as the fraction it painted
    assert.ok(rimGrid()[0][DISH / 2], 'the top of the dish is not on the rim')
    feed(plain, DISH / 2, 0)
    assert.ok(pelletCount(plain) > 1 && pelletCount(plain) < 2, `${pelletCount(plain)} pellets`)
  })

  it('a delta is the changed cells, applies to its base and to nothing else, and is small', () => {
    const s = createSlime(7)
    for (let i = 0; i < 3; i++) feed(s, ...randomCell(s.rand))
    for (let i = 0; i < 2000; i++) step(s)
    let prev = tones(s)
    let bytes = 0
    let changed = 0
    const N = 200
    for (let f = 0; f < N; f++) {
      for (let i = 0; i < 3; i++) {
        step(s)
        if (pelletCount(s) < STANDING - 0.5) feed(s, ...randomCell(s.rand))
      }
      const cur = tones(s)
      const d = encodeDelta(prev, cur)
      bytes += d.length
      for (let k = 0; k < cur.length; k++) if (cur[k] !== prev[k]) changed++
      const back = applyDelta(prev, d)
      assert.deepEqual([...back], [...cur], `frame ${f} does not apply`)
      assert.notEqual(back, prev, 'the base was written in place')
      prev = cur
    }
    // the cost that motivated the delta: three frames a second of this
    // against a ~2.9 KB keyframe. The mean over a steady-state run is held
    // under a third of the keyframe (measured: 250 to 600 cells
    // change a frame, 300 to 700 bytes before base64)
    const key = encode(s).g.length
    assert.ok(
      bytes / N < key / 3,
      `a delta averages ${(bytes / N).toFixed(0)} chars against a ${key} keyframe`
    )
    assert.ok(
      changed / N > 50 && changed / N < 1000,
      `${(changed / N).toFixed(0)} cells change a frame`
    )
    // an empty delta is a frame too, and a delta touches only what changed
    assert.equal(encodeDelta(prev, prev), '')
    assert.deepEqual([...applyDelta(prev, '')], [...prev])
    const one = Uint8Array.from(prev)
    one[centre] = (one[centre] + 1) & 3
    const d1 = encodeDelta(prev, one)
    assert.deepEqual([...applyDelta(prev, d1)], [...one])
    // against the wrong base the picture is simply wrong, which is why the
    // wire carries the base tick and the client checks it (app.js)
    const other = createSlime(8)
    assert.notDeepEqual([...applyDelta(tones(other), d1)], [...one])
    // and junk is refused whole, the base untouched
    assert.equal(applyDelta(prev, 42), null)
    assert.equal(applyDelta(prev, 'abc'), null, 'a length off the base64 grid decoded')
    assert.equal(applyDelta(prev, '!!!!'), null)
    assert.equal(
      applyDelta(prev, toB64([0xff, 0xff, 0xff, 0xff, 0x7f])),
      null,
      'a five-byte varint decoded'
    )
    assert.equal(applyDelta(prev, toB64([0xff])), null, 'a varint cut off decoded')
    assert.equal(applyDelta(prev, toB64([0xff, 0xff, 0x7f])), null, 'a cell past the dish decoded')
  })
})
const toB64 = (bytes) => Buffer.from(bytes).toString('base64')

describe('the service: one dish, on its own clock, spoken to the room', () => {
  const fake = () => {
    const s = { OPEN: 1, readyState: 1, sent: [], ping() {}, terminate() {} }
    s.send = (t) => s.sent.push(JSON.parse(t))
    return s
  }

  it('bakes a frame for the boot, and the frame is the dish', () => {
    const f = slimeFrame()
    assert.equal(typeof f.t, 'number')
    assert.ok(decode(f.g, f.f), 'the boot frame does not decode')
  })

  // mutation: slime.pellet-skips-the-wait
  it('keeps its standing pellets: a dish short of them grows one after the wait, and no sooner', () => {
    const st = _slime.state
    // a full dish holds the clock: one tick with the standing count met
    // arms the wait, and only then is the food cleared
    feed(st, 51, 51)
    feed(st, 30, 30)
    feed(st, 70, 70)
    const t0 = 5_000_000
    _slime.tick(t0)
    st.food.fill(0)
    _slime.tick(t0 + 1000)
    assert.equal(pelletCount(st), 0, 'a pellet arrived inside the wait')
    _slime.tick(t0 + SPAWN_MAX_MS + 1)
    // a pellet, not a whole one: the drop lands at random and a drop on the
    // rim paints fewer cells, so it counts as the fraction it painted (the
    // seed is the clock, and this read >= 1 until a rim drop failed CI)
    assert.ok(pelletCount(st) > 0, 'no pellet arrived after the longest wait')
    // and not a second one at once: the clock restarts per pellet
    _slime.tick(t0 + SPAWN_MAX_MS + 2)
    assert.ok(pelletCount(st) < 2, 'two pellets arrived on one clock')
    assert.ok(STANDING >= 2)
  })

  it('steps with nobody watching and sends nothing; a tab in the room that is not watching is sent nothing either', () => {
    const before = presenceRoom.size
    const t0 = _slime.state.tick
    _slime.tick(1_000_000)
    assert.equal(_slime.state.tick, t0 + 1, 'the dish did not step')
    const a = fake()
    presenceRoom.join(a)
    try {
      a.sent.length = 0
      for (let i = 1; i <= 10; i++) _slime.tick(1_000_000 + i * FRAME_MS)
      assert.equal(
        a.sent.length,
        0,
        'a tab that never said it could see the dish was sent the dish'
      )
      assert.equal(slimeWatchers(), 0)
    } finally {
      presenceRoom.leave(a)
    }
    assert.equal(presenceRoom.size, before)
  })

  // the shared dish is the one seeded from the clock; these two borrow it,
  // put a known seed in its place and hand back what was there
  const borrow = (s, run) => {
    const st = _slime.state
    const orig = { ...st }
    Object.assign(st, s)
    try {
      run(st)
    } finally {
      Object.assign(st, orig)
    }
  }
  const STANDING_CELLS = [
    [51, 21],
    [81, 51],
    [51, 81],
  ]

  it('is one clock: while the dish is full the seam is `step`, byte for byte from one seed', () => {
    const a = createSlime(42, { bite: 0 })
    const b = createSlime(42, { bite: 0 })
    for (const s of [a, b]) for (const [x, y] of STANDING_CELLS) feed(s, x, y)
    borrow(a, (st) => {
      const t0 = 7_000_000
      for (let i = 0; i < 200; i++) {
        _slime.tick(t0 + i * TICK_MS)
        step(b)
      }
      assert.ok(pelletCount(st) >= STANDING - 0.5, 'the dish went short: this run holds no clock')
      assert.equal(st.tick, b.tick)
      assert.deepEqual(encode(st), encode(b), 'the pictures differ')
      assert.deepEqual([...st.ax], [...b.ax])
      assert.deepEqual([...st.ay], [...b.ay])
      assert.deepEqual([...st.ah], [...b.ah])
      assert.equal(st.rand(), b.rand(), 'the seam drew from the rng while the clock was held')
    })
  })

  it('never dies and never freezes: ten simulated minutes of the service loop', () => {
    // pellets count fractionally and a one-hour run was seen at 0.8; what
    // is held is that the dish is never EMPTY for longer than the longest
    // wait, and that the picture keeps changing
    const s = createSlime(2026)
    for (const [x, y] of STANDING_CELLS) feed(s, x, y)
    borrow(s, (st) => {
      const ticks = Math.round((10 * 60_000) / TICK_MS)
      const SAMPLE = 11 // a second of ticks
      let t = 9_000_000
      let zeroSince = -1
      let worstZero = 0
      let frozen = 0
      let worstFrozen = 0
      let last = null
      let drops = 0
      for (let i = 0; i < ticks; i++) {
        t += TICK_MS
        const before = foodCells(st).length
        _slime.tick(t)
        if (foodCells(st).length > before) drops++
        const c = pelletCount(st)
        if (c === 0) {
          if (zeroSince < 0) zeroSince = t
          worstZero = Math.max(worstZero, t - zeroSince)
        } else zeroSince = -1
        if (i % SAMPLE === 0) {
          const tn = tones(st).join('')
          if (tn === last) worstFrozen = Math.max(worstFrozen, ++frozen)
          else frozen = 0
          last = tn
        }
      }
      assert.ok(
        drops > 0,
        'the room never dropped a pellet: the meals were not eaten or the clock is dead'
      )
      assert.ok(
        worstZero <= SPAWN_MAX_MS + TICK_MS,
        `the dish sat empty for ${worstZero}ms, past the ${SPAWN_MAX_MS}ms ceiling`
      )
      assert.ok(worstFrozen < 10, `the picture froze for ${worstFrozen + 1} seconds`)
    })
  })

  it('a watching tab gets one keyframe, then deltas against it, on the frame clock; a feed lands on the next step', () => {
    const before = presenceRoom.size
    const a = fake()
    presenceRoom.join(a)
    try {
      let now = 2_000_000
      _slime.tick(now)
      a.sent.length = 0
      watchSlime(a, true, now)
      // the keyframe is news: it goes out on the next step, not the next frame
      _slime.tick(++now)
      assert.equal(a.sent.length, 1, 'no keyframe reached the watcher')
      const key = a.sent[0]
      assert.equal(key.type, 'slime')
      const held = decode(key.g, key.f)
      assert.ok(held, 'the keyframe does not decode')
      assert.equal(key.t, _slime.state.tick)
      assert.equal(key.d, undefined, 'a keyframe carries a delta')
      _slime.tick(++now)
      assert.equal(a.sent.length, 1, 'a frame went out inside the frame period')
      now += FRAME_MS
      _slime.tick(now)
      assert.equal(a.sent.length, 2, 'no frame on the frame clock')
      const d1 = a.sent[1]
      assert.equal(d1.g, undefined, 'a second keyframe went to a tab that holds the picture')
      assert.equal(d1.b, key.t, 'the delta names a base the tab does not hold')
      assert.equal(d1.t, _slime.state.tick)
      assert.equal(d1.f, undefined, 'unchanged food rode the delta')
      const tn = applyDelta(held.tones, d1.d)
      assert.deepEqual([...tn], [...tones(_slime.state)], 'the delta does not rebuild the dish')
      assert.ok(
        JSON.stringify(d1).length < JSON.stringify(key).length / 2,
        'a delta is not smaller than half a keyframe'
      )
      // a feed: on the next step, with the food, since the food moved
      assert.equal(feedSlime(0, 0), false, 'food landed outside the dish')
      assert.equal(feedSlime(DISH / 2, DISH / 2), true)
      _slime.tick(++now)
      assert.equal(a.sent.length, 3, 'the feed waited for the frame clock')
      const d2 = a.sent[2]
      assert.equal(d2.b, d1.t)
      assert.ok(Array.isArray(d2.f), 'the moved food did not ride the delta')
      let hit = false
      for (let k = 0; k < d2.f.length; k += 2)
        if (d2.f[k] === DISH / 2 && d2.f[k + 1] === DISH / 2) hit = true
      assert.ok(hit, 'the fed cell is not in the frame')
      assert.deepEqual([...applyDelta(tn, d2.d)], [...tones(_slime.state)])
      assert.ok(centre >= 0)
    } finally {
      watchSlime(a, false)
      presenceRoom.leave(a)
    }
    assert.equal(presenceRoom.size, before)
  })

  it('a tab that stops watching is sent nothing, and gets one keyframe on return; a fresh tab and a held tab share a tick', () => {
    const before = presenceRoom.size
    const a = fake()
    const b = fake()
    presenceRoom.join(a)
    presenceRoom.join(b)
    try {
      let now = 3_000_000
      watchSlime(a, true, now)
      _slime.tick(++now)
      a.sent.length = 0
      // hidden: the no takes it out at once
      watchSlime(a, false, now)
      for (let i = 0; i < 10; i++) _slime.tick((now += FRAME_MS))
      assert.equal(a.sent.length, 0, 'a tab that said no was sent frames')
      // back: one keyframe, and deltas after it
      watchSlime(a, true, now)
      _slime.tick(++now)
      assert.equal(a.sent.length, 1)
      assert.equal(typeof a.sent[0].g, 'string', 'the return frame is not a keyframe')
      // b joins the watch while a holds the picture: same tick, a keyframe
      // for b and a delta for a, cut from the same state
      watchSlime(b, true, now)
      b.sent.length = 0
      _slime.tick(++now)
      assert.equal(typeof b.sent[0].g, 'string')
      assert.equal(typeof a.sent[1].d, 'string')
      assert.equal(a.sent[1].t, b.sent[0].t)
      assert.deepEqual(
        [...applyDelta(decode(a.sent[0].g, a.sent[0].f).tones, a.sent[1].d)],
        [...decode(b.sent[0].g, b.sent[0].f).tones],
        'the two tabs hold different pictures'
      )
      // asking again inside the gate keeps the deltas; after it, a keyframe
      a.sent.length = 0
      watchSlime(a, true, now)
      _slime.tick((now += FRAME_MS))
      assert.equal(typeof a.sent[0].d, 'string', 'a re-ask inside the gate cost a keyframe')
      watchSlime(a, true, (now += KEY_GATE_MS))
      _slime.tick(++now)
      assert.equal(
        typeof a.sent[a.sent.length - 1].g,
        'string',
        'a re-ask after the gate got no keyframe'
      )
      assert.equal(slimeWatchers(), 2)
      // a socket that leaves the watch inside a tick is not sent to
      watchSlime(b, false)
      assert.equal(slimeWatchers(), 1)
    } finally {
      watchSlime(a, false)
      watchSlime(b, false)
      presenceRoom.leave(a)
      presenceRoom.leave(b)
    }
    assert.equal(presenceRoom.size, before)
    assert.equal(slimeWatchers(), 0)
  })

  // mutation: slime.spectators-cannot-unwatch, slime.closed-socket-watches
  it('the watch is a frame of the wire: one boolean about the sender, and the route takes it from spectators too', () => {
    assert.deepEqual(parseFrame(JSON.stringify({ type: 'watch', on: true })), {
      kind: 'watch',
      on: true,
    })
    assert.deepEqual(parseFrame(JSON.stringify({ type: 'watch', on: 'yes', t: 5 })), {
      kind: 'watch',
      on: false,
    })
    const route = read('src/routes/presence.js')
    assert.match(
      route,
      /frame\.kind === 'watch'[\s\S]{0,120}watchSlime\(socket, frame\.on\)[\s\S]{0,60}if \(me\.spectator\) return/
    )
    assert.match(
      route,
      /const gone = \(\) => \{\n\s*watchSlime\(socket, false\)/,
      'a closed socket stays a watcher'
    )
  })
})
