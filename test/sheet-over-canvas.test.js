// test/sheet-over-canvas.test.js
// The watch has ONE layer, and the phone and desktop keep their overlay.
//
// The report, over three rounds with photos: work and about landing on top of
// an entry on an Apple Watch Ultra. Two fixes went out aimed at the wrong
// cause, so this one is built on what was measured rather than on a theory.
//
// What the canvas does, measured on the live site at four viewports and two
// zooms each: the doors row was 332 world px at x=1730 EVERY time, including a
// 205px screen at zoom 1.42 where the visible scene is 144 world px. The world
// does not move. So nothing placed in the world can pile onto anything else,
// and every explanation that blamed canvas geometry was wrong.
//
// That measurement was true and the conclusion drawn from it was not. It
// sampled the row on a page where the measurement SUCCEEDED. When offsetWidth
// came back 0 the seating function returned early and left the row at 0,0, and
// nothing in a run that reproduces can show you the run that does not. The row
// is derived now (layout.js optionsBox, x=1440 w=912 hero-wide, centred in
// CSS, same centre line as the measured 332 at 1730), so there is no longer a
// success case to sample. See test/canvas-never-half-built.js.
//
// That leaves the only other thing on the page: #modal, a position:fixed
// overlay. Two overlapping fixed layers are the sole way absolutely-placed
// boxes can land on each other, and watchOS is documented (in this repo, at
// 88004c4) to break position:fixed under its adapted layout, which puts the
// sheet BESIDE the canvas instead of over it.
//
// So on the watch there is no second layer. The sheet stops being an overlay
// and becomes the document: no position:fixed, no transform, no compositing,
// nothing to sort. A fixed-positioning failure cannot reach a page that is not
// using fixed positioning. That is a fix by construction, which is the honest
// kind to ship for a failure that will not reproduce off-device.
//
// Source-level on purpose: a headless engine that honours position:fixed
// cannot fail the real thing, which is exactly how this reached a wrist.
// The browser-side facts were checked separately in WebKit at 205x251,
// 205x156 and 390x844: zero fixed and zero transformed layer boxes on the
// watch, the sheet at y=0 full width, the document scrolling, no sideways
// scroll, the "canvas" backlink reachable, and the round trip back to a
// pannable canvas working (1006 and 1323 world px of drag). The hero
// furniture also stays seated (options at y=1976, etched at y=2072) when the
// page BOOTS into a sheet. That used to depend on positionOptions running
// inside layout() before openChrome added the class; it is now unconditional,
// since a derived seat does not care whether the subtree is displayed.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveTokens } from './lib/css-tokens.js'

const ROOT = join(import.meta.dirname, '..')
const HOME = readFileSync(join(ROOT, 'src/static/css/canvas-home.css'), 'utf8')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')
const NJK = readFileSync(join(ROOT, 'src/templates/canvas/home.njk'), 'utf8')
// a layer is named by its --cv-z-* token (BIBLE.md section 8), so an order
// compares what the names resolve to, not the words
const TOKENS = resolveTokens(
  readFileSync(join(ROOT, 'primitives/kit/canvas-tokens.css'), 'utf8')
).light
const layer = (v) => {
  const token = /^var\((--[\w-]+)\)$/.exec(v)?.[1]
  return Number(token ? TOKENS[token] : v)
}

const css = HOME.replace(/\/\*[\s\S]*?\*\//g, '')
// every rule for a selector in `text`, in source order, as one block: the
// cascade is the fact, so a later rule for the same selector has to answer
// rather than the first one found
const rulesFor = (text, head, sel) => {
  const out = []
  for (let i = text.indexOf(head); i !== -1; i = text.indexOf(head, i + 1)) {
    const open = i + head.length
    out.push(text.slice(open, text.indexOf('}', open)))
  }
  assert.ok(out.length, `no rule for ${sel}`)
  return out.join(';')
}
// A TOP-LEVEL rule: anchored to the line start, so `#modal.open` cannot match
// the `html.sheet-open #modal.open` inside the watch block, which sits earlier
// in the file and silently answered for the base rule.
const blockFor = (sel) => rulesFor(css, '\n' + sel + ' {', sel)
// the LAST declaration of a property wins, same as the engine
const decl = (block, prop) => {
  const all = [...block.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;!]+)`, 'gm'))]
  return all.length ? all.at(-1)[1].trim() : null
}
// the watch density block, by its own prelude
const watchBlock = (() => {
  const p = /@media \(max-width: [\d.]+px\), \(max-height: [\d.]+px\) \{/.exec(css)
  assert.ok(p, 'no watch density block')
  return css.slice(p.index, css.indexOf('\n}\n', p.index))
})()
const inWatch = (sel) => rulesFor(watchBlock, sel + ' {', `${sel} in the watch density`)

describe('the watch has one layer, everything else keeps its overlay', () => {
  // mutation: sheet-over-canvas.modal-moved-above-scene
  it('the canvas is still an earlier sibling than the sheet', () => {
    // The premise the .sheet-open class exists for: CSS cannot select
    // backwards, so the state has to be written somewhere both can see.
    const scene = NJK.indexOf('id="scene"')
    const modal = NJK.indexOf('id="modal"')
    assert.ok(scene !== -1 && modal !== -1)
    assert.ok(scene < modal, '#modal now precedes #scene: use a sibling selector instead')
  })

  // mutation: sheet-over-canvas.modal-z-override-later
  it('off the watch, both layers still name an index rather than implying one', () => {
    // Phone and desktop keep the overlay, so they keep needing an explicit
    // order: #scene is a transformed position:fixed box (a composited layer
    // everywhere) and #modal is its later sibling, which otherwise leaves the
    // compositor to promote #modal by overlap detection to paint it above.
    const sceneZ = decl(blockFor('#scene'), 'z-index')
    const modalZ = decl(blockFor('#modal'), 'z-index')
    assert.ok(sceneZ && sceneZ !== 'auto', '#scene leaves its layer index to the compositor')
    assert.ok(modalZ && modalZ !== 'auto', '#modal leaves its layer index to the compositor')
    assert.ok(
      layer(modalZ) > layer(sceneZ),
      `#modal (${modalZ}) does not outrank #scene (${sceneZ})`
    )
    const open = blockFor('#modal.open')
    assert.equal(decl(open, 'isolation'), 'isolate')
    assert.ok(decl(open, 'will-change'))
  })

  // mutation: sheet-over-canvas.scroller-loses-specificity
  it('on the watch NOTHING in the sheet chain is fixed or transformed', () => {
    // The whole claim. Each of these was a fixed box or a transformed one,
    // and each is named here so a future change has to come back and say what
    // the watch does with it.
    assert.equal(decl(inWatch('html.sheet-open #stage'), 'position'), 'static')
    assert.equal(decl(inWatch('html.sheet-open #modal.open'), 'position'), 'static')
    const scroll = inWatch('html.sheet-open #modal.open #mscroll')
    assert.equal(decl(scroll, 'position'), 'static')
    assert.equal(decl(scroll, 'transform'), 'none')
    // and it must outrank #modal.open #mscroll's slide transform, which is
    // two IDs. Naming only html.sheet-open #mscroll loses that race silently
    // and the scroller keeps a composited layer.
    assert.match(
      watchBlock,
      /html\.sheet-open #modal\.open #mscroll \{/,
      'the scroller rule does not name #modal.open, so it loses the specificity race'
    )
    // the modal itself must drop the compositing hints it carries off-watch
    const openW = inWatch('html.sheet-open #modal.open')
    assert.equal(decl(openW, 'will-change'), 'auto')
    assert.equal(decl(openW, 'isolation'), 'auto')
  })

  // mutation: sheet-over-canvas.stage-size-not-important
  it('on the watch the document does its own scrolling', () => {
    // #stage is a fixed viewport-sized box whose width and height app.js
    // writes INLINE, so only !important hands the page back its scroll.
    const stage = inWatch('html.sheet-open #stage')
    assert.match(stage, /width:\s*auto\s*!important/)
    assert.match(stage, /height:\s*auto\s*!important/)
    const root = inWatch('html.sheet-open,\n  html.sheet-open body')
    assert.equal(decl(root, 'overflow'), 'visible')
    assert.equal(decl(root, 'height'), 'auto')
  })

  // mutation: sheet-over-canvas.scene-hidden-by-visibility, sheet-over-canvas.fan-over-page
  it('on the watch the canvas and the overlay furniture are gone entirely', () => {
    // display, not visibility: visibility keeps a fixed box in the layout and
    // the point is that no fixed box survives. Safe because positionEtched
    // derives its seat from layout.js, so the hidden subtree is never measured.
    const hidden = inWatch(
      'html.sheet-open #scene,\n  html.sheet-open #backdrop,\n  html.sheet-open #gap,\n  html.sheet-open #fan'
    )
    assert.equal(decl(hidden, 'display'), 'none')
  })

  // mutation: sheet-over-canvas.backlink-only-with-collection
  it('the sheet still carries a way back, since the pull-down went with the transform', () => {
    // The pull-down dismiss rides #mscroll's transform, which the watch no
    // longer has. Every sheet must therefore name its own exit; 88004c4 added
    // the canvas backlink for exactly this reason and it is now load-bearing.
    assert.match(APP, /class="backlink"/, 'sheets no longer render a backlink')
    assert.match(APP, /←\s*canvas/, 'the experiment backlink no longer names the canvas')
  })

  // mutation: sheet-over-canvas.sheet-open-never-cleared
  it('app.js both sets and clears the state the stylesheet reads', () => {
    // A one-way add would leave the page permanently unscrollable and the
    // canvas permanently gone: strictly worse than the bug being fixed.
    // a two-argument toggle is both halves in one call
    const both = /documentElement\.classList\.toggle\('sheet-open',/.test(APP)
    const add = both || /documentElement\.classList\.add\('sheet-open'\)/.test(APP)
    const rm = both || /documentElement\.classList\.remove\('sheet-open'\)/.test(APP)
    assert.ok(add, 'sheet-open is never set')
    assert.ok(rm, 'sheet-open is set and never cleared')
  })
})
