// test/canvas-never-half-built.test.js
// A canvas that did not finish booting must not be what you are left with.
//
// The failure, reported from a watch across four rounds: work and about
// sitting on top of an entry, at 1:1 size, taking :active but doing nothing
// when pressed. That combination has one cause. Every tile is
// position:absolute and gets its world place from a transform render()
// applies, so a scene that never rendered stacks the ENTIRE world into its
// top-left corner on top of itself, with the doors row (z-index 3) over
// whatever tile is under it. The buttons darken because :active is pure CSS.
// Nothing happens on release because the boot that wires the router never
// finished.
//
// Two things made that state reachable and both are fixed here:
//
//   1. boot() was called bare. Any throw inside it became an unhandled
//      rejection: the page simply stopped, mid-build, and said nothing.
//   2. boot() removed #prelude, the server-rendered fallback, BEFORE
//      layout() and render(). So by the time anything could throw, the thing
//      that would have covered for it was already deleted.
//
// The order is the fix: paint first, then retire the fallback.
//
// Neither of those closed the hole, and the reason is worth keeping. Both are
// written INSIDE app.js, and app.js builds tiles at module scope and installs
// its handler at the bottom. Anything that throws in between is past the tiles
// and short of the catch, so the page ships the pile with nobody left to say
// so. A script cannot be the thing that reports it never ran.
//
// So the state is inverted and the SERVER owns it. canvas-pending is on <html>
// from the moment the document is parsed, and app.js clears it in exactly one
// place: after render() has seated the world. Every failure now ends at the
// server-rendered document by DEFAULT, including the ones nobody has named,
// because doing nothing at all leaves the class where it is. canvas-failed
// stays as the caught case, which only buys the stand-in its 600ms back.
//
// This still does not diagnose WHY a given engine throws. It makes every way
// of throwing survivable, which is the part that can be guaranteed from here.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { etchedBox } from '../src/static/canvas/layout.js'

const ROOT = join(import.meta.dirname, '..')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')
const CSS = readFileSync(join(ROOT, 'src/static/css/canvas-home.css'), 'utf8')
// the dust is its own module now (primitives/dust.js): the scatter lives there
const DUST = readFileSync(join(ROOT, 'primitives/dust.js'), 'utf8')
const NJK = readFileSync(join(ROOT, 'src/templates/canvas/home.njk'), 'utf8')

// One top-level function out of app.js, as source, from its `function name(`
// line to the first closing brace at column 0 (or the one-line form).
function fnSource(name) {
  const at = APP.indexOf(`function ${name}(`)
  assert.notEqual(at, -1, `app.js has no ${name}()`)
  const line = APP.slice(at, APP.indexOf('\n', at))
  if (line.trimEnd().endsWith('}')) return line
  return APP.slice(at, APP.indexOf('\n}', at) + 2)
}

// A seat is DERIVED or it is not a seat.
//
// The report was "work and about landing on top of an entry", four rounds of
// it from an Apple Watch, and it was read as a canvas-geometry failure every
// time. It was not. The doors row and the etched mark were the only two nodes
// in the world whose seat came out of the DOM:
//
//   if (o.n.offsetWidth > 0) { optM.w = o.n.offsetWidth; ... }
//   if (!optM.w) return
//
// offsetWidth is 0 on any display:none subtree, and the hero system hides
// when it is panned off screen, so the read really does come back 0. The
// early return then left wx/wy at their initialised 0,0. That is not an
// unplaced node, it is a node placed at the WORLD ORIGIN, most of a world
// from the hero, on top of whatever tile the shells seated there.
//
// The two furniture rows were exactly the two nodes the doors decoupling
// created. Everything else takes its coordinates from layout.js, which is
// pure by contract, so this failure was never available to any of them.
describe('nothing in the world is seated by a measurement', () => {
  // mutation: canvas-never-half-built.etched-measured
  it('the furniture asks layout.js for its box, like every other node', () => {
    // Run positionEtched against a node whose DOM size cannot be read (it
    // throws, the way a display:none subtree would lie) and check it lands
    // exactly where layout.js says, off the hero's box.
    const hero = { wx: 1200, wy: 800, w: 640, h: 180 }
    const node = {}
    for (const k of ['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight']) {
      Object.defineProperty(node, k, {
        get() {
          throw new Error(`positionEtched read ${k}`)
        },
      })
    }
    node.getBoundingClientRect = () => {
      throw new Error('positionEtched measured the page')
    }
    const nodes = { hero: { ...hero, n: {} }, etched: { n: node, wx: 0, wy: 0 } }
    let seated = null
    const run = new Function(
      'nodes',
      'etchedBox',
      'heroBox',
      'seat',
      `${fnSource('positionEtched')}; positionEtched()`
    )
    run(
      nodes,
      etchedBox,
      () => ({ x: hero.wx, y: hero.wy, w: hero.w, h: hero.h }),
      (o, box) => {
        seated = { o, box }
      }
    )
    assert.ok(seated, 'positionEtched never seated the mark')
    assert.equal(seated.o, nodes.etched)
    assert.deepEqual(seated.box, etchedBox({ x: hero.wx, y: hero.wy, w: hero.w, h: hero.h }))
  })

  // mutation: canvas-never-half-built.etched-measured
  it('no seating function reads the DOM for a size', () => {
    // The whole class, not the two instances: any offsetWidth/offsetHeight
    // read inside app.js is a seat waiting to fail the same way. getBoundingClientRect
    // is deliberately NOT in this list, since the chrome legitimately measures
    // screen space (the minimap reads its own rect) and that is not a world seat.
    // `void el.offsetWidth` is exempt and is not an exception to the rule: it
    // discards the value, so it is a forced reflow, not a measurement anyone
    // can seat a node with.
    const offenders = [...APP.matchAll(/^.*\boffset(?:Width|Height)\b.*$/gm)]
      .map((m) => m[0].trim())
      .filter((line) => !/^void\s+[\w.]+\.offset(?:Width|Height);/.test(line))
    assert.deepEqual(offenders, [], 'a world seat is being measured off the page again')
  })

  // mutation: canvas-never-half-built.seat-bails-on-empty
  it('a node can never be left sitting at the world origin', () => {
    // The failure mode in one line: an early return that leaves wx/wy at the
    // initialiser. Run seat() on the box a hidden subtree would have produced
    // (no size) and on a real one: both must take the box's place.
    const seat = new Function(`let renderDirty = false; ${fnSource('seat')}; return seat`)()
    for (const box of [
      { x: 5120, y: 2048, w: 0, h: 0 },
      { x: 96, y: 40, w: 320, h: 88 },
    ]) {
      const o = { n: { style: {} }, wx: 0, wy: 0, w: 0, h: 0 }
      seat(o, box)
      assert.deepEqual(
        { x: o.wx, y: o.wy, w: o.w, h: o.h },
        box,
        'seat() left a node at the initialiser, which is the whole bug coming back'
      )
    }
  })
})

describe('the canvas is never left half built', () => {
  // mutation: canvas-never-half-built.shell-not-pending
  it('the document says "not painted" before any script can be asked', () => {
    // The class rides the <html> tag the server writes, so it is true during
    // parse, ahead of the stylesheet, the module, and anything either of them
    // could fail at.
    assert.match(
      NJK,
      /<html lang="en" class="canvas-pending/,
      'the shell no longer ships canvas-pending: the fallback is opt-in again, and a script that never runs cannot opt in'
    )
  })

  // mutation: canvas-never-half-built.pending-cleared-before-paint
  it('only the paint clears it, and nothing in the script sets it', () => {
    const off = APP.match(/classList\.remove\('canvas-pending'\)/g) || []
    assert.equal(off.length, 1, 'canvas-pending is cleared in more or fewer than one place')
    assert.doesNotMatch(
      APP,
      /classList\.add\('canvas-pending'\)/,
      'app.js sets canvas-pending itself: then a page where app.js never ran is not pending, which is the one case it exists for'
    )
    // and it comes off on the far side of the paint, with the flag
    const boot = APP.slice(APP.indexOf('async function boot()'))
    const paint = boot.indexOf('\n  render();')
    const clear = boot.indexOf("classList.remove('canvas-pending')")
    assert.ok(clear !== -1, 'canvas-pending is not cleared inside boot()')
    assert.ok(clear > paint, 'canvas-pending comes off before the canvas paints')
  })

  // mutation: canvas-never-half-built.boot-bare
  it('boot() is caught, not called bare', () => {
    assert.doesNotMatch(
      APP,
      /^boot\(\);\s*$/m,
      'boot() is called bare again: a throw inside it becomes an unhandled rejection and the page stops mid-build'
    )
    assert.match(APP, /boot\(\)\s*\.catch\(/, 'boot() has no failure path')
  })

  // mutation: canvas-never-half-built.boot-bare, canvas-never-half-built.fails-after-paint
  it('the failure path marks the document so the stylesheet can answer', () => {
    // Run the handler boot() is caught with, against a stand-in document,
    // on both sides of the first paint.
    const at = APP.indexOf('boot().catch(')
    assert.notEqual(at, -1, 'boot() has no failure path')
    const handler = APP.slice(at + 'boot().catch('.length, APP.indexOf('\n});', at) + 2)
    const fail = (painted) => {
      const classes = new Set()
      const document = { documentElement: { classList: { add: (c) => classes.add(c) } } }
      const quiet = { error() {} }
      new Function('painted', 'document', 'console', `return (${handler})`)(
        painted,
        document,
        quiet
      )(new Error('boom'))
      return [...classes]
    }
    assert.deepEqual(fail(false), ['canvas-failed'], 'a boot that threw does not mark the document')
    // and only before the first paint: a stumble in a widget an hour later
    // must not tear down a working canvas
    assert.deepEqual(fail(true), [], 'a stumble after the first paint tears down a working canvas')
  })

  // mutation: canvas-never-half-built.prelude-dropped-early
  it('the fallback is retired only AFTER the first paint, never before', () => {
    // The whole bug in one ordering. Assert the positions rather than the
    // text: prelude removal must follow a render() call inside boot.
    const boot = APP.slice(APP.indexOf('async function boot()'))
    const paint = boot.indexOf('\n  render();')
    const drop = boot.indexOf("getElementById('prelude')?.remove()")
    assert.ok(paint !== -1, 'boot no longer calls render()')
    assert.ok(drop !== -1, 'boot no longer retires the prelude')
    assert.ok(
      drop > paint,
      'the prelude is removed BEFORE the canvas paints: a throw in between leaves no page at all'
    )
    // and the flag is set on the same side of that line
    const flag = boot.indexOf('painted = true')
    assert.ok(flag > paint && flag < drop + 200, 'painted is not set at the first paint')
  })

  // mutation: canvas-never-half-built.reduced-skips-mount, canvas-never-half-built.scatter-assumes-dust
  it('the statement cannot be shown without being mounted', () => {
    // THE SAME BUG CLASS, restated for a hero that is no longer typed.
    //
    // The lines used to be built by mountLines and written by paintTyped, and
    // pairing them was every caller's job. A caller that painted a phrase
    // nobody had mounted wrote into an empty array, threw inside boot, and
    // left the visitor on the server-rendered prelude: the exact half-built
    // canvas this file exists to prevent. It shipped for about an hour and
    // fired on the one load in nine where the room's shared schedule happened
    // to be on the phrase the typer was seeded with, which is precisely the
    // kind of odds a suite of static checks will not feel.
    //
    // There is no paint step any more: mountHero builds the lines and IS the
    // whole of showing a phrase, so the two cannot come apart. What has to
    // hold instead is that every path to a new phrase goes through it, and
    // that the scatter (which reads the mounted lines) can survive being
    // handed nothing.
    const show = APP.slice(APP.indexOf('function showHero('))
    const body = show.slice(0, show.indexOf('\n}'))
    assert.match(
      body,
      /mountHero\(PHRASES\[next\]\)/,
      'showHero can change the statement without mounting it'
    )
    // both branches: the animated one and the one a reduced-motion or bare
    // visitor takes. An early return that skipped the mount is the bug.
    assert.equal(
      (body.match(/mountHero\(/g) || []).length,
      2,
      'showHero has a path that changes the index without mounting'
    )
    assert.match(
      APP,
      /function remountHero\(\)\{ mountHero\(PHRASES\[heroIndex\]\); \}/,
      'the re-mount no longer rebuilds from the index it claims to'
    )
    // and the scatter is total: handed an svg the dust never wired, it
    // returns rather than reaching into an undefined grid
    const sc = DUST.slice(DUST.indexOf('function scatter('))
    assert.match(
      sc.slice(0, sc.indexOf('\n  }')),
      /const d = dust\.get\(svg\)\n\s+if \(!d\) return\n/,
      'scatter assumes the svg is wired for dust'
    )
  })

  // The cascade, not the rule text: for each selector, the LAST rule that
  // sets the property is the one that holds, so a rule appended further down
  // the sheet that undoes the fallback turns this red. Specificity is not
  // modelled; the override that matters is the same selector said again.
  const norm = (sel) =>
    sel
      .replace(/\s+/g, ' ')
      .replace(/\s*>\s*/g, ' > ')
      .trim()
  function last(selector, prop) {
    const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    let value
    for (const [, sels, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!sels.split(',').map(norm).includes(selector)) continue
      for (const decl of body.split(';')) {
        const [k, ...v] = decl.split(':')
        if (k.trim() === prop) value = v.join(':').trim()
      }
    }
    return value
  }

  // mutation: canvas-never-half-built.pending-hides-scene, canvas-never-half-built.prelude-hidden-later
  it('the stylesheet hides the unplaced world and shows the server page', () => {
    // BOTH states answer, or the default one is decoration. canvas-pending is
    // the one that actually covers an unnamed failure; canvas-failed is the
    // named one. They share every declaration on purpose.
    for (const state of ['canvas-failed', 'canvas-pending']) {
      // the tiles must go, and #prelude must NOT (it is inside #scene, so a
      // blanket hide of the scene would take the fallback with it)
      assert.equal(
        last(`html.${state} #scene > *:not(#prelude)`, 'display'),
        'none',
        `${state} leaves the unplaced tiles on the screen`
      )
      assert.equal(
        last(`html.${state} #prelude`, 'display'),
        'block',
        `${state} does not show the server-rendered page`
      )
      for (const [prop, gone] of [
        ['display', 'none'],
        ['visibility', 'hidden'],
      ]) {
        assert.notEqual(
          last(`html.${state} #scene`, prop),
          gone,
          'hiding #scene outright would hide the fallback with it'
        )
      }
    }
    // and the stand-in waits on a CSS timer, not a JS one: the case it covers
    // is a script that is not running
    assert.match(
      last('html.canvas-pending #prelude', 'animation') || '',
      /\b\d+m?s\b.*\b\d+m?s\b/,
      'the anti-flash delay is not in the stylesheet, so it cannot survive the failure it exists for'
    )
  })
})
