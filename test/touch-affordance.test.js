// test/touch-affordance.test.js
// A finger can only do three things on this site: pan the world, scroll a
// sheet, or press something. Every one of those was quietly broken on a
// phone by a rule nobody was reading as a touch decision.
//
// A 3D viewport was once a 428px hole in the middle of a scrolling sheet:
// three.js OrbitControls stamps `touchAction: none` on its element as it
// connects, and the experiment held an OrbitControls with rotate, pan and
// zoom ALL disabled purely for a lookAt. A control that owned no gesture
// claimed every gesture, and the page below it could only be reached by
// finding the narrow strip of ground the canvas did not cover. Nothing in the
// stylesheet said `none`, so nothing anyone could grep said it either.
//
// The sheet's `user-select: text` was the same shape of mistake: written for
// prose, inherited by every drawing, photograph, video and WebGL surface in
// the sheet, so a long press on a figure started a selection the finger then
// dragged.
//
// And the world's own furniture is drawn in WORLD px, which the camera then
// scales: at the phone's opening frame the two hero doors that ARE the
// navigation land 22 screen px tall, half the floor a thumb needs. The fix
// separates the hit area from the drawing (app.js publishes the inverse
// camera scale, the controls pad out to --cv-ctrl-h in screen space), which
// only works while both halves stay wired together.
//
// The fifth is the other side of the first: the frame that once swallowed the
// page by accident then gave every drag back to it on purpose, and a marker
// that cannot be dragged is not a marker. A frame you play in owns the
// finger, by ONE stated class the entry declares, and the sheet's own gestures
// stand down for it.
//
// All five checks are text over the source: a browser proves the outcome
// (scripts/verify/frame-gesture.mjs: a drag in the frame draws and the sheet
// stays put, a drag beside it scrolls), this proves nobody can put the cause
// back.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CSS_DIR = join(ROOT, 'src/static/css')
const JS_DIRS = ['src/static/js', 'src/static/canvas']

// touch-action values that forbid a vertical pan, i.e. that can swallow a
// scroll. pan-y, manipulation and auto all leave the page its scroll.
const BLOCKING = /touch-action:\s*(none|pan-x|pinch-zoom)\b/

function jsFiles(dir) {
  const out = []
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...jsFiles(join(dir, e.name)))
    else if (e.name.endsWith('.js')) out.push(join(dir, e.name))
  }
  return out
}

describe('touch affordances', () => {
  // ---- 1. no script may claim the gesture behind the stylesheet's back ----
  // mutation: touch-affordance.script-sets-touch-action
  it('nothing assigns style.touchAction from JavaScript', () => {
    const hits = []
    for (const rel of JS_DIRS.flatMap(jsFiles)) {
      readFileSync(join(ROOT, rel), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/\.style\.touchAction\s*=/.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`)
        })
    }
    assert.deepEqual(
      hits,
      [],
      'a script is setting touch-action, so which gestures the page owns is no ' +
        'longer answerable by reading the stylesheet:\n  ' +
        hits.join('\n  ') +
        '\nThis is how a 3D viewport once became unscrollable. Put the ' +
        'decision in CSS where the rest of the touch contract lives, and if a ' +
        'vendored library does it, stop letting the library do it.'
    )
  })

  // ---- 2. a scroll blocker in a sheet has to argue for itself -------------
  // mutation: touch-affordance.blocker-unreasoned
  it('every scroll-blocking touch-action carries a touch-ok reason', () => {
    const hits = []
    for (const name of readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'))) {
      // blank every comment that is not itself a reason, so prose ABOUT
      // touch-action (of which this codebase writes plenty) is not mistaken
      // for a declaration. Line numbers survive: only the characters go.
      const lines = readFileSync(join(CSS_DIR, name), 'utf8')
        .replace(/\/\*(?!\s*touch-ok:)[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .split('\n')
      lines.forEach((line, i) => {
        if (!BLOCKING.test(line)) return
        // the reason may sit on the line or anywhere in the comment block
        // directly above it (these reasons run to a few lines)
        const window = [line, ...lines.slice(Math.max(0, i - 6), i)]
        if (!window.some((l) => /touch-ok:/.test(l))) hits.push(`${name}:${i + 1}: ${line.trim()}`)
      })
    }
    assert.deepEqual(
      hits,
      [],
      'these rules take a scroll gesture away from the page with no stated ' +
        'reason:\n  ' +
        hits.join('\n  ') +
        '\nContent in the sheet lives inside a pan-y scroller (#mscroll); a ' +
        'block that refuses to pan is a region a thumb cannot scroll past. ' +
        'Either use pan-y/manipulation, or mark it /* touch-ok: reason */.'
    )
  })

  // ---- 3. the sheet grants selection to a document, not to drawings ------
  // mutation: touch-affordance.video-selectable
  it('the sheet takes its selection grant back for everything that is not text', () => {
    const css = readFileSync(join(CSS_DIR, 'canvas-home.css'), 'utf8')
    assert.match(
      css,
      /#modal,\s*input,\s*textarea\s*\{[^}]*user-select:\s*text/,
      'canvas-home.css no longer grants selection to #modal; if the grant moved, move this guard with it'
    )
    const takeback = css.match(/#modal\s*:is\(([^)]*)\)\s*\{[^}]*user-select:\s*none/)
    assert.ok(takeback, '#modal grants user-select: text and never takes it back for non-text')
    for (const tag of ['canvas', 'svg', 'img', 'video'])
      assert.ok(
        takeback[1].includes(tag),
        `<${tag}> in the sheet is still selectable: a long press starts a ` +
          `selection the finger then drags. Add it to the #modal :is(...) takeback.`
      )
  })

  // ---- 5. a frame you play in owns the finger, in one stated place ---------
  // mutation: touch-affordance.pull-ignores-frame
  it('interactive frames declare .owns-touch and the sheet stands down for it', () => {
    const css = readFileSync(join(CSS_DIR, 'canvas-home.css'), 'utf8')
    assert.match(
      css,
      /\.owns-touch\s*\{[^}]*touch-ok:[^}]*touch-action:\s*none/,
      'canvas-home.css no longer answers .owns-touch with a reasoned touch-action: none'
    )
    // one state: nobody else defines the class or restyles it per experiment
    for (const name of readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'))) {
      if (name === 'canvas-home.css') continue
      const body = readFileSync(join(CSS_DIR, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      assert.doesNotMatch(
        body,
        /\.owns-touch/,
        `${name} styles .owns-touch; the state lives once, in canvas-home.css`
      )
    }
    // the entry declares it, on the frame itself
    const FRAMES = { 'web-instruments.md': 'carousel-viewport' }
    for (const [file, frame] of Object.entries(FRAMES)) {
      const md = readFileSync(join(ROOT, 'content/feed', file), 'utf8')
      const tag = md.match(new RegExp(`<div class="([^"]*\\b${frame}\\b[^"]*)"`))
      assert.ok(tag, `${file} lost its ${frame}`)
      assert.match(
        tag[1],
        /\bowns-touch\b/,
        `${file}: .${frame} is played with drags and does not declare owns-touch, so every ` +
          'drag in it is also the sheet scrolling, swiping to the next page, or closing'
      )
    }
    // both of the sheet's gesture starts consult it
    const app = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')
    assert.match(app, /closest\('\.owns-touch'\)/, 'app.js no longer looks for .owns-touch')
    for (const [what, re] of [
      [
        'pull-down dismiss',
        /mscroll\.addEventListener\('touchstart',[^]*?\}, \{passive: true\}\);/,
      ],
      [
        'page swipe',
        /\$\('#sheet'\)\.addEventListener\('pointerdown',[^]*?\}, \{passive: true\}\);/,
      ],
    ]) {
      const fn = app.match(re)
      assert.ok(fn, `the ${what} listener moved; move this guard with it`)
      assert.match(
        fn[0],
        /ownsTouch\(e\.target\)/,
        `the ${what} still arms for a finger that started inside a frame`
      )
    }
  })

  // ---- 4. the tap floor is two halves and both have to be there ----------
  // mutation: touch-affordance.pad-hardcoded
  it('the world publishes its scale and the world controls spend it', () => {
    const app = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')
    const css = readFileSync(join(CSS_DIR, 'canvas-home.css'), 'utf8')
    assert.match(
      app,
      /setProperty\('--cv-world-k'/,
      'app.js stopped publishing --cv-world-k, so every hit pad in the world ' +
        'silently falls back to 1 and the hero doors go back to being 22px tall'
    )
    const pad = css.match(/\.t-icon::after\s*\{([^}]*)\}/)
    assert.ok(pad, 'the world tap-floor pad is gone from canvas-home.css')
    assert.match(pad[1], /--cv-world-k/, 'the hit pad is not sized against the camera scale')
    assert.match(pad[1], /--cv-ctrl-h/, 'the hit pad is not sized against the control-height token')
  })
})
