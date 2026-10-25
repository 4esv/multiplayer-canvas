// test/waste.test.js
// Issue #264: a node, a byte on the wire, an allocation per frame and a scan
// per tick are resources. The numbers were measured before and after the
// pass (scripts/verify/waste.mjs prints the dish's; scripts/verify/boot-dom.mjs
// holds the DOM node count at boot in a real browser); this holds the ones a
// unit test can:
//   - IDLE WIRE: a socket in a room where nobody moves and nobody watches
//     the dish is sent nothing, measured in TCP bytes the server wrote, so
//     framing and pings count too
//   - THE DELTA PAINT: paintDish on a delta leaves the canvas pixel-identical
//     to a full paint, and does it in no more calls than the cells that moved
//     (plus the food, which is repainted on top)
//   - THE COUNTER: pelletCount off the kept count agrees with a scan of the
//     dish across a long run of feeding and eating
//   - THE DECODE: heap bytes allocated per keyframe and per delta, under a ceiling
//     that the per-quad arrays of the old fromBase64 were far above
import './env.js' // first: no boot refresh over the network (issue #273)

import { describe, it, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

import {
  DISH,
  CELLS,
  createSlime,
  step,
  feed,
  randomCell,
  pelletCount,
  pelletCells,
  tones,
  foodCells,
  paintDish,
} from '../primitives/slime/slime.js'
import { build } from '../src/server.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

describe('idle wire: a socket nobody talks to costs nothing', () => {
  let app
  let url
  const tcp = new Set()

  before(async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('offline')
    })
    app = await build({ logger: false })
    app.server.on('connection', (s) => tcp.add(s))
    await app.listen({ port: 0, host: '127.0.0.1' })
    url = `ws://127.0.0.1:${app.server.address().port}/ws/cursors`
  })
  after(async () => {
    await app.close()
    mock.restoreAll()
  })

  // Measured 2026-09-23: 0 B/s per socket, before and after the pass. The
  // room snapshots only who moved, the dish is sent only to watchers, and
  // the heartbeat is one ping every 30s, outside this window by design: the
  // window is the steady state between beats.
  it('two open tabs, nobody moving, nobody watching: 0 bytes/s written to either', async () => {
    const open = (ws) =>
      new Promise((res, rej) => {
        ws.addEventListener('open', res)
        ws.addEventListener('error', rej)
      })
    const a = new WebSocket(url)
    const b = new WebSocket(url)
    try {
      await Promise.all([open(a), open(b)])
      // the welcome and the join are the price of arriving, not of idling
      await sleep(300)
      const live = [...tcp].filter((s) => !s.destroyed)
      assert.ok(live.length >= 2, `expected two server sockets, saw ${live.length}`)
      const before = live.map((s) => s.bytesWritten)
      const WINDOW_MS = 2000
      await sleep(WINDOW_MS)
      const perSocket = live.map((s, i) => (s.bytesWritten - before[i]) / (WINDOW_MS / 1000))
      for (const bps of perSocket) assert.equal(bps, 0, `an idle socket was written ${bps} B/s`)
    } finally {
      a.close()
      b.close()
    }
  })
})

// a 2D context that is a pixel array: fillRect/clearRect on whole cells
function pixels() {
  const px = new Array(DISH * DISH).fill('')
  const ctx = { fillStyle: '', calls: 0 }
  ctx.fillRect = (x, y, w, h) => {
    ctx.calls++
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px[j * DISH + i] = ctx.fillStyle
  }
  ctx.clearRect = (x, y, w, h) => {
    ctx.calls++
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px[j * DISH + i] = ''
  }
  return { px, ctx }
}
const INK = ['', 'sage', 'mute', 'ink']

describe('the delta paint', () => {
  it('paints the same picture as a full paint, frame after frame, food moving included', () => {
    const s = createSlime(264)
    for (let i = 0; i < 3; i++) feed(s, ...randomCell(s.rand))
    for (let i = 0; i < 600; i++) step(s)
    const live = pixels()
    let prev = tones(s)
    let prevFood = foodCells(s)
    paintDish(live.ctx, prev, prevFood, INK, 'ochre')
    let moved = 0
    for (let f = 0; f < 120; f++) {
      for (let i = 0; i < 3; i++) step(s)
      // food arrives mid-run and gets eaten, so the food list moves under
      // the delta the way it does on the wire
      if (f % 20 === 7) feed(s, ...randomCell(s.rand))
      const cur = tones(s)
      const food = foodCells(s)
      let changed = 0
      for (let k = 0; k < cur.length; k++) if (cur[k] !== prev[k]) changed++
      live.ctx.calls = 0
      paintDish(live.ctx, cur, food, INK, 'ochre', prev, prevFood)
      const foodMoved = food.join() !== prevFood.join()
      if (foodMoved) moved++
      const allowed = changed + food.length / 2 + (foodMoved ? prevFood.length / 2 : 0)
      assert.ok(
        live.ctx.calls <= allowed,
        `frame ${f}: ${live.ctx.calls} calls for ${changed} moved cells`
      )
      const fresh = pixels()
      paintDish(fresh.ctx, cur, food, INK, 'ochre')
      assert.deepEqual(live.px, fresh.px, `frame ${f}: the delta paint drew a different dish`)
      prev = cur
      prevFood = food
    }
    assert.ok(moved > 0, 'the food never moved, so the food half was never exercised')
  })
})

describe('the pellet count', () => {
  it('agrees with a scan of the dish across feeding and eating', () => {
    const scan = (s) => {
      let n = 0
      for (let k = 0; k < CELLS.length; k++) if (s.food[CELLS[k]] > 0) n++
      return n / pelletCells(s)
    }
    const s = createSlime(7)
    let fed = 0
    let ate = false
    for (let i = 0; i < 3000; i++) {
      if (i % 150 === 0) feed(s, ...randomCell(s.rand))
      // a drop on food already there covers cells that are already counted
      if (i % 450 === 1) feed(s, DISH >> 1, DISH >> 1)
      // between a feed and the next step the count is feed()'s alone
      assert.equal(pelletCount(s), scan(s), `tick ${i}, before the step`)
      step(s)
      const before = pelletCount(s)
      assert.equal(before, scan(s), `tick ${i}`)
      if (fed > before) ate = true
      fed = before
    }
    assert.ok(ate, 'no pellet was ever eaten, so the counter never counted down')
  })
})

describe('the decode', () => {
  // Measured 2026-09-23 on node 24 (scripts/verify/waste.mjs), JS heap
  // bytes (a typed array's backing store lives off the heap, so the output
  // arrays themselves are not in either number): before this pass 60-74 KB
  // per keyframe decode and 36 KB per delta; after, ~1.1 KB and 420 B. The
  // ceilings sit an order of magnitude under the old numbers, so a per-quad
  // array coming back fails here.
  it('allocates the output and not an array per four characters', () => {
    const r = spawnSync(
      process.execPath,
      [
        '--expose-gc',
        '--max-semi-space-size=256',
        '--input-type=module',
        '-e',
        `
        const S = await import(${JSON.stringify(new URL('../primitives/slime/slime.js', import.meta.url).href)})
        const s = S.createSlime(264)
        for (let i = 0; i < 3; i++) S.feed(s, ...S.randomCell(s.rand))
        for (let i = 0; i < 1500; i++) S.step(s)
        const keys = [], deltas = [], bases = []
        let prev = S.tones(s)
        for (let f = 0; f < 100; f++) {
          for (let i = 0; i < 3; i++) S.step(s)
          const cur = S.tones(s)
          keys.push(S.encode(s)); deltas.push(S.encodeDelta(prev, cur)); bases.push(prev)
          prev = cur
        }
        for (let i = 0; i < 100; i++) { S.decode(keys[i].g, keys[i].f); S.applyDelta(bases[i], deltas[i]) }
        const per = (fn) => { gc(); const h = process.memoryUsage().heapUsed; for (let i = 0; i < 100; i++) fn(i); return (process.memoryUsage().heapUsed - h) / 100 }
        const key = per((i) => S.decode(keys[i].g, keys[i].f))
        const delta = per((i) => S.applyDelta(bases[i], deltas[i]))
        console.log(JSON.stringify({ key, delta }))
        `,
      ],
      { encoding: 'utf8' }
    )
    assert.equal(r.status, 0, r.stderr)
    const { key, delta } = JSON.parse(r.stdout.trim())
    assert.ok(key < 6000, `a keyframe decode allocated ${key.toFixed(0)} B of heap`)
    assert.ok(delta < 3000, `a delta allocated ${delta.toFixed(0)} B of heap`)
  })
})
