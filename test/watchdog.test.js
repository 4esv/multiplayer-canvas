// test/watchdog.test.js
// The fallback page says why it is the fallback page.
//
// canvas-pending made a failed boot survivable. It did not make it legible,
// and three deploys went out guessing at a watchOS failure that reproduces
// nowhere else. Each guess cost a merge and a look at a wrist. The watchdog
// is the end of that: the page that is already on the screen carries the
// reason it is on the screen.
//
// Verified in a browser at 205x251, all three states:
//   throws  -> "the canvas threw: Cannot read properties of null (reading
//              'boom') (/canvas/app.js:809:6)"
//   hangs   -> "the canvas never finished, and nothing threw"
//   healthy -> no line at all, prelude removed, 35 tiles placed
//
// The last one is the one that matters most: an instrument that cries on a
// working page is worse than no instrument.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { build } from '../src/server.js'

const ROOT = join(import.meta.dirname, '..')
const WD = readFileSync(join(ROOT, 'src/static/canvas/watchdog.js'), 'utf8')

// watchdog.js run as the browser runs it: a classic script against a window
// with listeners, a clock this test turns by hand, and the least DOM it
// touches. Every way off the device is a spy, so a call is seen, not thrown.
function watch({ pending = true, before = [] } = {}) {
  const listeners = {}
  const timers = []
  const phoned = []
  const el = (textContent = '') => ({ className: '', textContent })
  const prelude = {
    children: before.map((t) => el(t)),
    get firstChild() {
      return this.children[0] ?? null
    },
    insertBefore(node, ref) {
      const at = ref ? this.children.indexOf(ref) : this.children.length
      this.children.splice(at, 0, node)
    },
  }
  const document = {
    documentElement: { classList: { contains: (c) => c === 'canvas-pending' && pending } },
    getElementById: (id) => (id === 'prelude' ? prelude : null),
    createElement: () => el(),
  }
  const spy =
    (name) =>
    (...a) =>
      phoned.push([name, ...a])
  const sandbox = {
    document,
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    fetch: spy('fetch'),
    navigator: { sendBeacon: spy('sendBeacon') },
    XMLHttpRequest: function () {
      phoned.push(['XMLHttpRequest'])
    },
    WebSocket: function () {
      phoned.push(['WebSocket'])
    },
    String,
  }
  sandbox.window = sandbox
  runInNewContext(WD, sandbox)
  // the window as the script sees it: the context's global, not this object
  const win = runInNewContext('window', sandbox)
  return {
    prelude,
    phoned,
    fire(type, e) {
      for (const fn of listeners[type] ?? []) fn({ target: win, ...e })
    },
    wait() {
      for (const t of timers.splice(0)) t.fn()
    },
    line: () => prelude.firstChild?.textContent ?? null,
  }
}

let app
before(async () => {
  app = await build({ logger: false })
})
after(async () => {
  await app.close()
})

describe('the failure state explains itself', () => {
  it('runs before the module it is watching', async () => {
    // A throw at app.js module scope is earlier than anything app.js can
    // install, which is the whole reason this is a separate classic script in
    // the head rather than a few lines inside the canvas.
    const r = await app.inject({ method: 'GET', url: '/' })
    const wd = r.body.indexOf('/canvas/watchdog')
    const mod = r.body.indexOf('type="module"')
    assert.ok(wd !== -1, 'the shell does not load the watchdog')
    assert.ok(wd < mod, 'the watchdog loads after the module, so it cannot see it fail')
    assert.doesNotMatch(
      r.body,
      /<script[^>]*watchdog[^>]*\b(defer|async)\b/,
      'a deferred watchdog misses the module evaluation it exists to catch'
    )
  })

  // mutation: watchdog.accuses-a-painted-canvas
  it('speaks only when the canvas did not paint', () => {
    // The guard is the same class app.js clears at its first paint, so a
    // working canvas can never be accused. And a slow one corrects itself:
    // the line is written INTO #prelude, which boot() removes when it lands,
    // so a late paint takes the accusation with it.
    const painted = watch({ pending: false })
    painted.fire('error', { error: new Error('boom') })
    painted.wait()
    assert.equal(painted.prelude.children.length, 0, 'a painted canvas was accused')
    const stuck = watch()
    stuck.wait()
    assert.equal(stuck.prelude.children.length, 1)
    assert.equal(stuck.prelude.firstChild.className, 'why k-meta')
    // and it goes in first, above the fallback copy, inside the prelude
    const late = watch({ before: ['the fallback copy'] })
    late.wait()
    assert.deepEqual(
      late.prelude.children.map((c) => c.textContent),
      ['the canvas never finished, and nothing threw', 'the fallback copy'],
      'the line must live inside the prelude, first, to be retractable'
    )
  })

  // mutation: watchdog.deaf-to-rejections
  it('separates a throw from a hang, because they are different bugs', () => {
    // "Nothing threw and it still did not paint" is an answer, not an absence
    // of one: it says boot is waiting rather than broken, which is the fork
    // no amount of source reading settles from here.
    const hang = watch()
    hang.wait()
    assert.equal(hang.line(), 'the canvas never finished, and nothing threw')
    const threw = watch()
    threw.fire('error', {
      error: {
        message: 'boom',
        stack: 'Error: boom\n    at https://example.com/canvas/app.js:9:6',
      },
    })
    threw.wait()
    assert.equal(threw.line(), 'the canvas threw: boom (/canvas/app.js:9:6)')
    const rejected = watch()
    rejected.fire('unhandledrejection', { reason: new TypeError('no socket') })
    rejected.wait()
    assert.match(rejected.line(), /^the canvas rejected: no socket/)
    // a failed <img> fires error on the element, not the window: not a throw
    const img = watch()
    img.fire('error', { target: { tagName: 'IMG' }, message: 'load' })
    img.wait()
    assert.equal(img.line(), 'the canvas never finished, and nothing threw')
  })

  // mutation: watchdog.keeps-the-last
  it('keeps the first failure, not the last', () => {
    // Everything after the first is its wake, and on a watch there is room
    // for one line.
    const w = watch()
    w.fire('error', { error: new Error('the cause') })
    w.fire('error', { error: new Error('its wake') })
    w.fire('unhandledrejection', { reason: new Error('more wake') })
    w.wait()
    assert.match(w.line(), /^the canvas threw: the cause/)
  })

  // mutation: watchdog.phones-home
  it('reports to the person holding the device, never off it', () => {
    // No endpoint and no beacon: the reader is the one who can see the
    // screen. This also keeps the diagnostic out of the privacy conversation
    // entirely, which is why it can ship permanently rather than as a probe.
    for (const fail of [null, ['error', { error: new Error('boom') }]]) {
      const w = watch()
      if (fail) w.fire(...fail)
      w.wait()
      assert.deepEqual(w.phoned, [], 'the watchdog phoned home')
    }
  })
})
