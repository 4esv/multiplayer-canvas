// test/wire.test.js
// canvas/wire.js states the words both ends of the socket say, once, where
// the browser can load them and the server can import them. A word stated
// twice agrees until the day one copy is edited, and for these nothing else
// would notice that day:
//
//   - The move floor. The tab paces its moves to RATE_MS and the room drops
//     what comes sooner. A tab that kept its own number would send moves the
//     room throws away, or crawl under a floor the room had lowered, and
//     every other test would still pass.
//   - The live diff. The server asks it whether a refresh is news (the
//     stale push) and a tab asks it which tiles to rebuild. A tab diffing on
//     its own terms could skip what the push announced, or rebuild what it
//     did not.
//   - The push words. The server's tests pin what it sends, but a tab that
//     listened for another word would hear nothing and say nothing: planting
//     that for front, slime or stale failed no test before this one.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { RATE_MS, SERVER_PUSH, changedKeys } from '../primitives/presence/wire.js'
import { changedKeys as serverDiff } from '../src/services/canvas-data.js'
import { initPresence } from '../primitives/presence/presence.js'

const ROOT = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
// the code without its comments (whole comment lines, and a ` // ...` tail):
// prose may say a number, a gate may not
const code = (text) =>
  text
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .map((l) => l.replace(/\s\/\/\s.*$/, ''))
    .join('\n')

describe('the wire says each word once (primitives/presence/wire.js)', () => {
  // mutation: wire.rate-restated-tab, wire.rate-restated-room
  it('the move floor is one number, the pace the tab keeps and the room takes', () => {
    const literal = new RegExp(`(?<![\\w.])${RATE_MS}(?![\\w.])`)
    for (const rel of ['primitives/presence/presence.js', 'src/routes/presence.js']) {
      const src = code(read(rel))
      assert.match(
        src,
        /import \{[^}]*\bRATE_MS\b[^}]*\} from '(?:\.\/wire\.js|multiplayer-canvas\/presence\/wire)'/,
        `${rel} does not take RATE_MS from the wire (primitives/presence/wire.js)`
      )
      const line = src.split('\n').find((l) => literal.test(l))
      assert.equal(
        line,
        undefined,
        `${rel} states the move floor as a number of its own: ${line?.trim()}`
      )
    }
  })

  // mutation: wire.diff-restated-tab, wire.diff-restated-server
  it('the live diff is one diff, the push and the repaint ask the same one', () => {
    assert.equal(serverDiff, changedKeys, 'services/canvas-data.js diffs a payload its own way')
    const app = read('src/static/canvas/app.js')
    const at = app.indexOf('async function refreshCanvas(')
    assert.ok(at >= 0, 'app.js has no refreshCanvas: this reads nothing')
    const body = code(app.slice(at, app.indexOf('\n}\n', at)))
    assert.match(body, /\bchangedKeys\(/, 'refreshCanvas does not ask the wire what moved')
    assert.doesNotMatch(
      body,
      /JSON\.stringify/,
      'refreshCanvas compares a payload its own way instead of asking changedKeys'
    )
  })

  // mutation: wire.push-word-drifts
  it('the tab hears each push by the word the server sends it with', () => {
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
        sockets.push(this)
      }
      send() {}
      close() {}
    }
    try {
      globalThis.WebSocket = StubSocket
      globalThis.document = { createElement: el, hidden: false, addEventListener() {} }
      globalThis.location = { protocol: 'http:', host: 'test' }
      globalThis.addEventListener = () => {}
      const api = initPresence({ scene: el(), wrapPos: () => null })
      const heard = []
      api.onFront((stack, i) => heard.push(['front', stack, i]))
      api.onSlime((m) => heard.push(['slime', m.d]))
      api.onSky((m) => heard.push(['sky', m.x, m.y]))
      api.onData((keys) => heard.push(['stale', ...keys]))
      const say = (m) => sockets[0].onmessage({ data: JSON.stringify(m) })
      say({ type: SERVER_PUSH.front, stack: 'hero', i: 3 })
      say({ type: SERVER_PUSH.slime, t: 2, b: 1, d: 'AA' })
      say({ type: SERVER_PUSH.sky, x: 1, y: 0 })
      say({ type: SERVER_PUSH.stale, keys: ['weather'] })
      assert.deepEqual(heard, [
        ['front', 'hero', 3],
        ['slime', 'AA'],
        ['sky', 1, 0],
        ['stale', 'weather'],
      ])
    } finally {
      Object.assign(globalThis, saved)
    }
  })
})
