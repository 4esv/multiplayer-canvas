// test/canvas-chrome-kit.test.js
// The canvas chrome speaks the kit (#336, group c). The author approved the
// kit and asked for it everywhere: "GLOBAL, CONSISTENT and INTUITIVE UI".
// The doors, the desk and the page bar moved first; this holds the canvas's
// own chrome to it: the field, the command roster, the finder's line and its
// selection mark, the toggles and the close, the skip link, the loader and
// its retry, the fan's head, the watchdog line and the diag overlay are the
// kit's parts; the statement's pager is the snap scrollbar every other
// collection is walked with; the hands on the canvas are the drawn ones; no
// bare `button {}` rule hands a kit button a second button under its own;
// and nothing on the canvas takes the kit's bare prefix `.k` as a class.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cssRules } from './lib/cascade.js'
import { pixelSprite } from '../src/static/canvas/pixel-sprite.js'

const ROOT = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const HOME_CSS = read('src/static/css/canvas-home.css')
const HOME = read('src/templates/canvas/home.njk')
const APP = read('src/static/canvas/app.js')
const SHEETS = read('src/lib/canvas-sheets.js')
const WATCHDOG = read('src/static/canvas/watchdog.js')
const RULES = cssRules(HOME_CSS)

describe('the canvas chrome speaks the kit', () => {
  // mutation: canvas-chrome-kit.system-pointer, canvas-chrome-kit.map-crosshair
  it("no hand on the canvas is the system's: no pointer, no crosshair", () => {
    // the drawn hands own the cursor (js/kit.js, presence.js cursorImage);
    // a system pointer or crosshair anywhere in the shell, a fallback
    // included, is a second hand
    const own = RULES.flatMap((r) =>
      r.decls
        .filter((d) => d.prop === 'cursor' && /\b(pointer|crosshair)\b/.test(d.value))
        .map((d) => `${r.selectors.join(', ')}: cursor: ${d.value}`)
    )
    assert.deepEqual(own, [], `the system's hand is back:\n  ${own.join('\n  ')}`)
  })

  // mutation: canvas-chrome-kit.close-off-kit, canvas-chrome-kit.roster-off-kit, canvas-chrome-kit.field-off-kit, canvas-chrome-kit.skip-off-kit
  it('the bar, the roster and the skip link are kit parts in the shell', () => {
    for (const [what, re] of [
      ['the close', /<button id="close" class="k-btn k-ico"/],
      ['the map toggle', /<button id="mapBtn" class="k-btn k-ico"/],
      ['the find toggle', /<button id="findBtn" class="k-btn k-ico"/],
      // the field: the kit's boxed field and block caret around the one input
      [
        'the field',
        /<div class="k-field k-sm k-boxed" id="searchField"><input id="search"[^>]*><span class="k-caret"><\/span><\/div>/,
      ],
      ['the command roster', /<div id="cmds" class="k-menu k-up" role="listbox"/],
      ['the skip link', /<a class="skip k-btn k-solid" href=/],
    ])
      assert.match(HOME, re, `${what} is off the kit`)
  })

  // mutation: canvas-chrome-kit.field-unboxed, canvas-chrome-kit.boxed-field-unlined
  it('the search field is boxed, and the roster stands flush on the box', () => {
    // the author: "Give the search bar a border, it's blending in". A rule
    // under the words alone read as one more line of the world under the bar.
    assert.match(HOME, /<div class="k-field k-sm k-boxed" id="searchField">/)
    const box = cssRules(read('primitives/kit/kit.css')).find((r) =>
      r.selectors.some((s) => s.trim() === '.k-field.k-boxed')
    )
    assert.equal(
      box?.decls.find((d) => d.prop === 'border')?.value,
      'var(--cv-px) solid var(--cv-ink)',
      "the kit's boxed field draws no box of one cell"
    )
    // the roster's bottom line is the box's top line: one cell shared
    const cmds = RULES.find((r) => r.selectors.some((s) => s.trim() === '#cmds'))
    assert.equal(
      cmds?.decls.find((d) => d.prop === 'bottom')?.value,
      'calc(100% - var(--cv-px))',
      'the roster floats off the field'
    )
  })

  // mutation: canvas-chrome-kit.owner-border-resizes, canvas-chrome-kit.owner-border-off-brick, canvas-chrome-kit.owner-class-elsewhere
  it("the owner's field is the guest's box with its line in brick, and nothing else moves", () => {
    // the author: "just give me a special border". Brick is the one accent
    // chrome may wear (armed or live, BIBLE.md section 1), and a colour is
    // the one thing that can change without the box changing size: the bar,
    // the map and CHROME.searchW are measured off the guest's field.
    const own = RULES.filter((r) => r.selectors.some((s) => /\.is-owner\b/.test(s)))
    assert.ok(own.length, "the owner's field has no rule")
    for (const r of own) {
      assert.deepEqual(
        r.selectors.map((s) => s.trim()),
        ['#searchField.is-owner'],
        `the owner's mode reaches past the field: ${r.selectors.join(', ')}`
      )
      assert.deepEqual(
        r.decls.map((d) => d.prop),
        ['border-color'],
        `the owner's field changes more than its line's colour: ${r.decls.map((d) => d.prop)}`
      )
    }
    const screen = own.find((r) => !r.media.length)
    assert.equal(screen?.decls[0].value, 'var(--cv-brick)', "the owner's line is not brick")
    // and the script marks the field and nothing else
    assert.match(APP, /\$\('#searchField'\)\.classList\.toggle\('is-owner', on\)/)
    assert.equal(APP.match(/'is-owner'/g).length, 1, 'the owner class is set on something else too')
  })

  // mutation: canvas-chrome-kit.finder-off-kit, canvas-chrome-kit.loader-off-kit, canvas-chrome-kit.sel-off-kit
  it('what the script paints into the chrome is kit parts too', () => {
    for (const [what, re] of [
      // the finder: the kit's icon buttons wearing the kit's chevrons, and
      // the line in the type face (the pixel face is for the hero alone)
      ['a finder stepper', /class="k-btn k-ico fstep prev"[^>]*>\$\{LEFT_GLYPH\}/],
      ['a finder stepper', /class="k-btn k-ico fstep next"[^>]*>\$\{RIGHT_GLYPH\}/],
      ['the finder line', /<span class="fsay k-meta">\$\{esc\(/],
      // what the finder lit: the kit's selection mark, ink, no glow
      ['the selection mark', /m\.className = 'k-sel aura';/],
      ['the roster rows', /<button type="button" class="k-btn r\$\{/],
      ['the fan head', /<h1 id="fanTitle" class="k-meta"><\/h1><span class="fancount k-meta">/],
      ['the loader', /<p class="sheetLoading k-meta" role="status"><span class="k-load"><\/span>/],
      ['the retry', /<button type="button" class="k-btn retry">retry<\/button>/],
      ['the diag overlay', /d\.className = 'k-meta';/],
    ])
      assert.match(APP, re, `${what} is off the kit`)
    assert.match(WATCHDOG, /p\.className = 'why k-meta'/, 'the watchdog line is off the kit')
    // and none of the old hand: the self-animating loader picture, the ochre
    // frame, the drawn chevrons in their own boxes, a pixel-face finder line
    for (const dead of ["imgSrc('icon/loader.svg')", 'STEP_SVG', 'fanarrow'])
      assert.ok(!APP.includes(dead), `app.js still carries ${dead}`)
    const mark = APP.slice(APP.indexOf('function aura(node'), APP.indexOf('// ---- quick commands'))
    assert.doesNotMatch(
      mark,
      /getPropertyValue|getContext/,
      'the selection mark paints its own colour'
    )
  })

  // mutation: canvas-chrome-kit.bare-k-class
  it("nothing on the canvas takes the kit's bare prefix as a class", () => {
    // `.k` is the prefix every kit class hangs off (kit.css); a rule for a
    // bare `.k` reads as a kit part and would catch any element that used it
    const bare = RULES.filter((r) => r.selectors.some((s) => /\.k(?![\w-])/.test(s)))
    assert.deepEqual(
      bare.map((r) => r.selectors.join(', ')),
      [],
      'canvas-home.css styles a bare .k'
    )
    for (const [file, text] of [
      ['home.njk', HOME],
      ['app.js', APP],
      ['canvas-sheets.js', SHEETS],
    ])
      for (const m of text.matchAll(/class="([^"$]*)"/g))
        assert.ok(!m[1].split(/\s+/).includes('k'), `${file} writes class="${m[1]}"`)
    // the sprite's ink cells were the one bare .k on the canvas (Maurice)
    assert.doesNotMatch(pixelSprite(['k.'], 'probe'), /class="k"/, 'a sprite cell is a bare .k')
  })

  // mutation: canvas-chrome-kit.hero-dots-back
  it("the statement's pager is the snap scrollbar, as the piles' is", () => {
    assert.match(
      APP,
      /hdotsN\.innerHTML = scrollMarkup\(\{ titles: PHRASES,/,
      'the hero pager is not the kit scrollbar'
    )
    assert.match(APP, /const heroBar = wireScroll\(hdotsN\.querySelector\('\.k-scroll'\)/)
    assert.doesNotMatch(APP, /class="dot/, 'the dots came back')
    // world furniture: eight cells a stepper (on its side the bar's lines
    // come off its height), the pad grows it to the floor
    const bar = RULES.find((r) => r.selectors.includes('.hero-dots .k-scroll'))
    assert.equal(bar?.decls.find((d) => d.prop === '--k-step')?.value, 'calc(8 * var(--cv-px))')
  })

  // mutation: canvas-chrome-kit.second-button
  it('no second button: a bare button rule draws nothing', () => {
    // A `button {}` that fills, pads, rules or fades every button put a
    // second button under each kit one. The shell may hand a button the
    // page's face and a ring; the picture is the kit's or the widget's.
    const DRAWS =
      /^(background|background-color|border|padding|color|opacity|transition|box-shadow)$/
    const drawn = RULES.filter((r) =>
      r.selectors.some((s) => /^button(:(active|hover|disabled)(:active)?)?$/.test(s.trim()))
    ).flatMap((r) =>
      r.decls.filter((d) => DRAWS.test(d.prop)).map((d) => `${r.selectors.join(', ')}: ${d.prop}`)
    )
    assert.deepEqual(drawn, [], `a bare button rule draws:\n  ${drawn.join('\n  ')}`)
  })
})
