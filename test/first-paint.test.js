// test/first-paint.test.js
// BIBLE.md section 2: THE PAGE SAYS WHERE THE ROOM STANDS, THE WIRE SAYS WHAT
// MOVES. What the server holds about the room is in the document it sends
// (#boot), and the first frame is painted from it, so the welcome that
// follows has nothing to correct.
//
// It did not hold. The server baked Maurice, the piles' fronts and the dish,
// and the tab threw most of it away: the statement opened on its first phrase
// and then blew apart to become the room's, Maurice stood alive for a frame
// after the page had said he was squished, and the tally was three zeros that
// turned into the head count once the socket spoke. Measured in a real
// browser against a room with three others in it, the hero on its third
// phrase and Maurice squished: the first painted frame disagreed with the
// room on three things and the welcome corrected each.
//
// Three halves, one claim:
//   - the server says it: the boot payload carries the head count beside the
//     fronts and Maurice, for every route that boots the canvas
//   - the client holds the head count honestly: the tally is told the page's
//     word, then the roster's, holds it through a drop, and is told nothing
//     (null) rather than zero wherever it has not heard (the
//     principle, for the windows it did not cover)
//   - app.js paints the first frame from the page, and a count that appears
//     is born on its digits instead of turning from a zero
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from '../src/server.js'
import { presenceRoom } from '../primitives/presence/presence-room.js'
import { initPresence } from '../primitives/presence/presence.js'
import { PHRASES } from '../src/static/canvas/hero-cycle.js'

const APP = readFileSync(join(import.meta.dirname, '..', 'src/static/canvas/app.js'), 'utf8')

// a socket stand-in with the two properties the room reads and a record of
// everything written to it (test/presence.test.js has the same)
function fake() {
  const s = {
    OPEN: 1,
    readyState: 1,
    sent: [],
    send: (text) => s.sent.push(text),
    ping() {},
    terminate() {
      s.readyState = 3
    },
  }
  return s
}

describe('the server says where the room stands', () => {
  let app
  before(async () => {
    app = await build({ logger: false })
  })
  after(async () => {
    await app.close()
  })

  const bootOf = async (url) => {
    const r = await app.inject({ method: 'GET', url })
    const m = /<script[^>]*id="boot"[^>]*>([\s\S]*?)<\/script>/.exec(r.body)
    assert.ok(m, `${url} bakes a boot payload`)
    return { boot: JSON.parse(m[1]), body: r.body }
  }

  // mutation: first-paint.boot-drops-head-count
  it('the boot payload carries the head count beside the fronts and Maurice', async () => {
    assert.equal(presenceRoom.participants, 0, 'a socket from an earlier test never left')
    const a = fake()
    const b = fake()
    presenceRoom.join(a)
    presenceRoom.join(b)
    try {
      presenceRoom.front(a, 'hero', 2)
      presenceRoom.squish(a, Date.now())
      // the home page and a door share the canvas shell, so both say it
      for (const url of ['/', '/work']) {
        const { boot } = await bootOf(url)
        assert.equal(boot.others, 2, `${url}: the page does not say how many are here`)
        assert.equal(boot.fronts.hero, 2, `${url}: the page does not say where the statement is`)
        assert.equal(boot.maurice.until, presenceRoom.squishUntil, `${url}: Maurice is not said`)
      }
      presenceRoom.leave(b)
      assert.equal((await bootOf('/')).boot.others, 1, 'the count is the room now, not a snapshot')
    } finally {
      presenceRoom.leave(a)
      presenceRoom.leave(b)
    }
    assert.equal(
      (await bootOf('/')).boot.others,
      0,
      'an empty room says zero: that one is measured'
    )
  })

  it("the document's own h1 stays on the first phrase whatever the room is on", async () => {
    // the canvas opens on the room's phrase (boot.fronts), and a crawler is no
    // room's: the document a crawler reads says the same sentence every time
    const a = fake()
    presenceRoom.join(a)
    try {
      presenceRoom.front(a, 'hero', 2)
      const { body } = await bootOf('/')
      assert.ok(body.includes(`<h1>${PHRASES[0]}</h1>`), 'the prelude h1 followed the room')
      assert.ok(!body.includes(`<h1>${PHRASES[2]}</h1>`))
    } finally {
      presenceRoom.leave(a)
    }
  })
})

// presence.js under a stub socket and the least DOM it touches (the same
// shape as test/presence.test.js's harness for the dish), with a roster the
// welcome can fill and the retry timers held rather than fired. Every value
// the tally is told is kept, in order.
function harness({ others, room } = {}) {
  const saved = {
    WebSocket: globalThis.WebSocket,
    document: globalThis.document,
    location: globalThis.location,
    addEventListener: globalThis.addEventListener,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  }
  const el = () => ({
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {},
    addEventListener() {},
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
  const retries = []
  globalThis.WebSocket = StubSocket
  globalThis.document = { createElement: el, hidden: false, addEventListener() {} }
  globalThis.location = { protocol: 'http:', host: 'test' }
  globalThis.addEventListener = () => {}
  globalThis.setTimeout = (fn) => retries.push(fn)
  globalThis.clearTimeout = () => {}
  const api = initPresence({ scene: el(), wrapPos: () => null, room, others })
  const told = []
  api.onCount((n) => told.push(n))
  const welcome = (ws, n) =>
    ws.onmessage({
      data: JSON.stringify({
        type: 'welcome',
        id: 99,
        spectator: false,
        t: Date.now(),
        squish: 0,
        fronts: {},
        peers: Array.from({ length: n }, (_, i) => ({ id: i + 1, fx: -1, fy: -1, k: null })),
      }),
    })
  const restore = () => Object.assign(globalThis, saved)
  return { api, sockets, told, retries, welcome, restore }
}

describe('the tally is never told a zero nobody took', () => {
  // mutation: first-paint.count-zero-until-heard
  it("opens on the page's word, then the roster's, and never on an empty one", () => {
    const { sockets, told, welcome, restore } = harness({ others: 3 })
    try {
      assert.deepEqual(told, [3], 'the tally opened on something other than what the page said')
      welcome(sockets[0], 2)
      assert.equal(told.at(-1), 2, 'the roster did not replace the page')
      assert.ok(!told.includes(0), `the tally was told a zero before it was one: ${told}`)
    } finally {
      restore()
    }
  })

  // mutation: first-paint.count-zero-until-heard
  it('is told nothing, not zero, where the page said nothing', () => {
    const { sockets, told, welcome, restore } = harness()
    try {
      assert.deepEqual(told, [null], 'no word at all must read as unknown, not zero')
      welcome(sockets[0], 0)
      assert.equal(told.at(-1), 0, 'a heard, empty room is a measured zero and says so')
    } finally {
      restore()
    }
  })

  // mutation: first-paint.named-room-takes-public-count
  it("ignores the public room's count when the address names a room", () => {
    const { told, restore } = harness({ others: 3, room: { code: 'jam', kind: 'session' } })
    try {
      assert.deepEqual(told, [null], "a session opened on the public room's head count")
    } finally {
      restore()
    }
  })

  // mutation: first-paint.drop-lands-on-zero
  it('holds the last count through a dropped socket and corrects on the next welcome', () => {
    const { sockets, told, retries, welcome, restore } = harness({ others: 3 })
    try {
      welcome(sockets[0], 4)
      sockets[0].onclose({ code: 1006 })
      assert.equal(told.at(-1), 4, 'a drop took the cursors and the tally with them')
      assert.ok(!told.includes(0), `a drop told the tally zero: ${told}`)
      assert.equal(retries.length, 1, 'the drop schedules its reconnect')
      retries[0]()
      welcome(sockets[1], 5)
      assert.equal(told.at(-1), 5, 'the next welcome did not say the room as it is')
    } finally {
      restore()
    }
  })

  // mutation: first-paint.room-switch-keeps-count
  it("drops the last room's count when the tab goes to another", () => {
    const { api, sockets, told, welcome, restore } = harness({ others: 3 })
    try {
      welcome(sockets[0], 4)
      api.goRoom({ code: 'jam', kind: 'session' })
      assert.equal(told.at(-1), null, "the next room was shown the last room's count")
    } finally {
      restore()
    }
  })

  // mutation: first-paint.refusal-keeps-count
  it("drops the room's count when the room is gone", () => {
    const { sockets, told, welcome, restore } = harness({ others: 3 })
    try {
      welcome(sockets[0], 4)
      // 4404: the room ended, and the tab falls back to a public room it has
      // not heard from
      sockets[0].onclose({ code: 4404 })
      assert.equal(told.at(-1), null, "the public room was shown the ended room's count")
    } finally {
      restore()
    }
  })
})

// a function or constant of app.js, as source: app.js is a module with a
// world of side effects, so what it holds is run from its own text, the way
// test/presence-optional.test.js runs setOthers
function sourceOf(start) {
  const at = APP.indexOf(start)
  assert.ok(at > -1, `app.js no longer has ${start}`)
  let depth = 0
  let end = APP.indexOf('{', at)
  do {
    if (APP[end] === '{') depth++
    else if (APP[end] === '}') depth--
    end++
  } while (depth)
  return APP.slice(at, end)
}

describe('the first frame is painted from the page', () => {
  const bootFront = (BOOT) =>
    new Function('BOOT', `${sourceOf('const bootFront = ')}; return bootFront`)(BOOT)

  // mutation: first-paint.front-unchecked
  it('a front is the room around a pile or the fallback, never a number the tab cannot index', () => {
    const f = bootFront({ fronts: { hero: 2, work: 3, last: 8, first: 0, neg: -1, frac: 2.5 } })
    assert.equal(f('hero', 8, 0), 2)
    assert.equal(f('work', 13, 13), 3)
    assert.equal(f('first', 8, 4), 0, 'a room on the first member is a room on it')
    assert.equal(f('last', 8, 0), 8, 'the last index is an index')
    assert.equal(f('turned-by-nobody', 8, 4), 4, 'a pile nobody turned keeps its fallback')
    assert.equal(f('neg', 8, 4), 4)
    assert.equal(f('frac', 8, 4), 4)
    assert.equal(f('hero', 1, 4), 4, 'a front past the pile this tab holds is not an index into it')
    assert.equal(bootFront(null)('hero', 8, 4), 4, 'a page with no payload keeps the fallback')
    assert.equal(bootFront({ fronts: { hero: '2' } })('hero', 8, 4), 4, 'a string is not an index')
  })

  // mutation: first-paint.hero-opens-on-first
  it("the statement opens on the room's phrase, not the first", () => {
    assert.match(
      APP,
      /let heroIndex = bootFront\('hero', PHRASES\.length - 1, 0\);/,
      "the hero opens on the first phrase and blows apart to become the room's"
    )
  })

  // mutation: first-paint.maurice-deferred
  it('Maurice stands where the page says before the first frame, not a task later', () => {
    assert.match(APP, /^setMaurice\(mauriceUntil\);$/m, 'Maurice is not seated at module scope')
    assert.doesNotMatch(
      APP,
      /setTimeout\(\(\)\s*=>\s*setMaurice\(mauriceUntil\),\s*0\)/,
      'Maurice is seated a task after boot has painted him alive'
    )
  })

  // mutation: first-paint.page-count-unsaid
  it("the page's head count reaches the tally", () => {
    assert.match(
      APP,
      /initPresence\(\{[^}]*\bothers:\s*BOOT\?\.others\b[^}]*\}\)/,
      "app.js does not hand presence the page's head count"
    )
  })

  // mutation: first-paint.tally-born-visible
  it('the tally is born hidden, so its placeholder zeros never paint as a count', () => {
    assert.match(
      APP,
      /<span class="others" aria-live="polite" hidden>/,
      'the tally is born showing three zeros nobody counted'
    )
  })

  // mutation: first-paint.appearing-count-turns
  it('a count that appears is born on its digits; only one already showing turns', () => {
    const setOthers = new Function(
      'etchedN',
      'REDUCED',
      `${sourceOf('function setOthers(count){')}; return setOthers`
    )
    // a flap with the few things setOthers touches; `burned` is whether its
    // card was told to burn (the turn), and a fresh card clears it
    const flap = (d) => {
      const f = {
        dataset: { d },
        burned: false,
        html: `<span class="card">${d}</span>`,
        querySelector: (sel) => (sel === '.card' ? f.card : null),
        querySelectorAll: () => [],
      }
      Object.defineProperty(f, 'innerHTML', {
        set(html) {
          f.html = html
          f.burned = false
        },
      })
      f.card = {
        classList: { add: (c) => c === 'burn' && (f.burned = true), remove() {} },
        addEventListener() {},
      }
      return f
    }
    const others = { hidden: true }
    const label = { textContent: '' }
    const flaps = ['0', '0', '0'].map(flap)
    const etchedN = {
      querySelector: (sel) => (sel === '.others' ? others : label),
      querySelectorAll: () => flaps,
    }
    const set = setOthers(etchedN, false)

    set(3)
    assert.equal(others.hidden, false)
    assert.deepEqual(
      flaps.map((f) => f.dataset.d),
      ['0', '0', '3']
    )
    assert.ok(flaps[2].html.includes('>3<'), 'the digit was not set')
    assert.ok(
      flaps.every((f) => !f.burned),
      'a count turned from a zero it was only holding the place of'
    )

    set(4)
    assert.equal(flaps[2].burned, true, 'a change to a count already showing did not turn')

    set(null)
    assert.equal(others.hidden, true)
    set(7)
    assert.ok(flaps[2].html.includes('>7<'), 'the digit was not set')
    assert.ok(
      !flaps[2].burned,
      'a count that came back after being hidden turned instead of appearing'
    )
    assert.equal(label.textContent, 'others here')
    set(1)
    assert.equal(label.textContent, 'other here', 'one visitor is an other')
  })
})
