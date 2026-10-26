// test/presence-optional.test.js
// The canvas renders without a WebSocket, because company is the first thing
// you do without.
//
// This was load-bearing by accident for two weeks. initPresence is called at
// app.js MODULE SCOPE, after the tiles are built and before boot() installs
// its catch, so `new WebSocket(...)` throwing took the whole canvas down on
// any engine without the constructor. watchOS Safari is such an engine, and it
// said so itself the moment the page was asked why it had not painted:
//
//   the canvas threw: Can't find variable: WebSocket (K1@/canvas/app.js:4:32316)
//
// Four deploys were spent upstream of that line, on the doors, the viewport
// meta, the fixed layers and the seat derivation. Every one of those was a
// real bug and none of them was this one. The canvas shipped 2026-07-02 and
// was tested on the watch then; presence landed 2026-07-23. The regression was
// always visible in the dates.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as mod from '../primitives/presence/presence.js'
import { cssRules, computed } from './lib/cascade.js'

const ROOT = join(import.meta.dirname, '..')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')
const CSS = readFileSync(join(ROOT, 'src/static/css/canvas-home.css'), 'utf8')

describe('presence is optional, and the canvas is not', () => {
  // mutation: presence-optional.gate-after-dom
  it('initPresence returns an API on an engine with no WebSocket', () => {
    // watchOS, reproduced: delete the global and call it. node ships a
    // WebSocket of its own since 22, so this has to be taken away deliberately
    // rather than assumed absent (the first version of this test assumed, and
    // node handed it a real constructor and a ReferenceError on `document`).
    // There is no DOM here either, so a run that reaches document.createElement
    // fails loudly, which is exactly the coupling under test.
    const real = globalThis.WebSocket
    delete globalThis.WebSocket
    try {
      const api = mod.initPresence({ scene: null, wrapPos: () => null })
      for (const k of ['post', 'frame', 'onCount', 'onData'])
        assert.equal(typeof api[k], 'function', `the no-socket API is missing ${k}`)
      assert.doesNotThrow(() => {
        api.post(0.5, 0.5)
        api.frame({}, 0)
        api.onData(() => {})
      })
      let seen = 'never called'
      api.onCount((n) => (seen = n))
      assert.equal(seen, null, 'the tally was told a number nobody measured')
    } finally {
      globalThis.WebSocket = real
    }
  })

  it('and the same call DOES reach the DOM when a socket exists', () => {
    // Refuse a vacuous pass. If initPresence returned the no-op unconditionally
    // the test above would still be green and presence would be dead for
    // everyone, so pin that the real path is still on the other side of the
    // check. No DOM in node, so reaching it throws, and that throw is the
    // evidence.
    assert.throws(
      () => mod.initPresence({ scene: null, wrapPos: () => null }),
      /document is not defined/,
      'initPresence no longer takes the real path even where a socket exists'
    )
  })

  // mutation: presence-optional.unguarded-constructor, presence-optional.refused-count-zero
  it('a constructor that exists and still refuses is the same answer', () => {
    // Missing is one failure; blocked port, connect-src, a proxy that will not
    // upgrade are others, and they throw from the same expression. So give it
    // a constructor that throws and a DOM that takes anything: the real path
    // runs to the socket, and the refusal has to stop there.
    const stub = () =>
      new Proxy(function () {}, {
        get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : stub()),
        set: () => true,
        apply: () => stub(),
      })
    const saved = {}
    for (const k of ['WebSocket', 'document', 'location', 'addEventListener'])
      saved[k] = Object.getOwnPropertyDescriptor(globalThis, k)
    let tried = 0
    try {
      globalThis.WebSocket = class {
        constructor() {
          tried++
          throw new Error('refused')
        }
      }
      globalThis.document = stub()
      globalThis.location = { protocol: 'https:', host: 'example.com' }
      globalThis.addEventListener = () => {}
      let api
      assert.doesNotThrow(
        // the page said three, as it does when the server counted them: a tab
        // that can never hear the room must not wear a count it will never
        // update, and without a word from the page null alone would not tell a
        // refused socket from one that has not spoken yet
        () => (api = mod.initPresence({ scene: stub(), wrapPos: () => null, others: 3 })),
        'a refusing constructor reached the canvas'
      )
      assert.equal(tried, 1, 'the real path never reached the socket, so this proved nothing')
      assert.equal(typeof api.post, 'function')
      // the same answer on the tally too: a refused socket measured nothing,
      // so it says null like a missing one, not zero, and not
      // the page's count either
      let seen = 'never called'
      api.onCount((n) => (seen = n))
      assert.equal(seen, null, 'a refused socket told the tally a number nobody measured')
    } finally {
      for (const [k, d] of Object.entries(saved)) {
        if (d) Object.defineProperty(globalThis, k, d)
        else delete globalThis[k]
      }
    }
  })

  // mutation: presence-optional.null-count-shown-as-zero, presence-optional.hidden-tally-paints
  it('no company is reported as unknown, never as zero', () => {
    // Zero is a measurement this tab is in no position to take. The canvas is
    // as busy as ever; this engine just has no window onto it. presence.js
    // says null (the first test above); this is what app.js does with it,
    // run from its own source rather than matched against it.
    const at = APP.indexOf('function setOthers(count){')
    assert.ok(at > -1, 'app.js no longer has setOthers')
    let depth = 0
    let end = APP.indexOf('{', at)
    do {
      if (APP[end] === '{') depth++
      else if (APP[end] === '}') depth--
      end++
    } while (depth)
    const setOthers = new Function(
      'etchedN',
      'pixelLabel',
      `${APP.slice(at, end)}; return setOthers`
    )
    const others = { hidden: false }
    const label = { innerHTML: '' }
    const flaps = []
    const etchedN = {
      querySelector: (sel) => (sel === '.others' ? others : label),
      querySelectorAll: () => flaps,
    }
    const set = setOthers(etchedN, (s) => s)
    set(null)
    assert.equal(others.hidden, true, 'a count nobody took still shows')
    set(0)
    assert.equal(others.hidden, false, 'a measured zero is a count, and shows')

    // and the stylesheet has to agree, or [hidden] loses to display:inline-flex
    const rules = cssRules(CSS)
    const chain = [
      { tag: 'div', id: 'etched', classes: ['etched'], attrs: {} },
      { tag: 'span', classes: ['others'], attrs: { hidden: '' } },
    ]
    for (const width of [320, 1280])
      assert.equal(
        computed(rules, chain, 'display', width),
        'none',
        'a hidden tally still paints: any display declaration outranks the UA [hidden] rule'
      )
  })

  // mutation: presence-optional.poll-dropped
  it('fresh data does not depend on the socket either', () => {
    // The nudge is a push on top of a poll, not the only way data lands, so a
    // socketless canvas goes stale by minutes rather than forever.
    const polls = [...APP.matchAll(/setInterval\(\s*refreshCanvas\s*,\s*([^)]+)\)/g)].map((m) =>
      Function(`return (${m[1]})`)()
    )
    assert.equal(polls.length, 1, 'refreshCanvas is not on a timer of its own')
    assert.ok(polls[0] > 0 && polls[0] <= 10 * 60 * 1000, `a ${polls[0]}ms poll is not a floor`)
  })
})
