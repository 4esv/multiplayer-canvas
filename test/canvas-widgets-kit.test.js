// test/canvas-widgets-kit.test.js
// The canvas widgets speak the kit (#336, group c, "Canvas widgets"). The
// author approved the kit and asked for it everywhere: "GLOBAL, CONSISTENT
// and INTUITIVE UI". The doors, the desk, the page bar and the canvas
// chrome moved first (test/canvas-chrome-kit.test.js); this holds the
// widgets on the ground to it: lines are one cell; the pixel face is for the
// hero titles and the logo glyph alone, and every other string is the type
// face; nothing shakes, strobes or flashes.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cssRules } from './lib/cascade.js'
import { TILES, MEMBERS } from '../src/static/canvas/layout.js'

const ROOT = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const APP = read('src/static/canvas/app.js')
const CARDS = read('src/static/canvas/quote-cards.js')
const HOME_CSS = read('src/static/css/canvas-home.css')
const RULES = cssRules(HOME_CSS)
// the declarations of every rule whose selector list holds `sel` exactly
const decls = (sel) =>
  RULES.filter((r) => r.selectors.some((s) => s.trim() === sel)).flatMap((r) => r.decls)
const decl = (sel, prop) => decls(sel).find((d) => d.prop === prop)?.value
// a tile builder's branch in mkTile, from its test to the next one
const branch = (type) => {
  const at = APP.indexOf(`} else if(t.type==='${type}'){`)
  assert.ok(at > -1, `mkTile has no ${type} branch`)
  // the last branch runs to where mkTile seats the node
  const next = APP.indexOf('} else if(t.type==', at + 10)
  return APP.slice(at, next > -1 ? next : APP.indexOf('\n  if(seat) addNode', at))
}
// a top-level function's source
const fn = (open) => {
  const i = APP.indexOf(open)
  assert.ok(i > -1, `${open} is gone`)
  return APP.slice(i, APP.indexOf('\n}\n', i))
}

describe('the canvas widgets speak the kit', () => {
  // mutation: widgets-kit.counter-own-flaps, widgets-kit.counter-touches, widgets-kit.counter-pixel-face, widgets-kit.counter-ember
  it("the tally is the kit's split flaps, a cell's air off its words, all in the type face", () => {
    const at = APP.indexOf('etchedN.innerHTML = `')
    assert.ok(at > -1, 'the etched line is gone')
    const etched = APP.slice(at, APP.indexOf('`;', at))
    assert.match(etched, /<span class="k-flaps k-sm">\$\{'<span class="k-flap" data-d="0">/)
    assert.match(etched, /<span class="olbl k-meta">others here<\/span>/)
    assert.equal((etched.match(/class="line k-meta"/g) || []).length, 2, 'the instruction lines')
    assert.doesNotMatch(etched, /pixelLabel|pixelText/, 'the etched line is set in the pixel face')
    const set = fn('function setOthers(count){')
    assert.match(set, /querySelectorAll\('\.k-flap'\)/)
    assert.doesNotMatch(
      set,
      /pixelLabel|pixelText|ember/,
      'the tally draws in the pixel face or burns'
    )
    // the digits stand off the words by a cell or more
    const gap = decl('.etched .others', 'gap') || ''
    const cells = /^calc\((\d+) \* var\(--cv-px\)\)$/.exec(gap)
    assert.ok(cells && Number(cells[1]) >= 1, `the digits touch their words (gap: ${gap})`)
    assert.doesNotMatch(
      HOME_CSS,
      /\.etched \.flap|cv-ember|\.ember\b/,
      'the bespoke flaps are back'
    )
  })

  // mutation: widgets-kit.name-pixel-face, widgets-kit.slime-name-pixel-face, widgets-kit.sky-unnamed
  it("a thing's name under it is the type face, never the pixel face", () => {
    // the pixel face is for hero titles and the logo glyph alone; an
    // experiment, a glyph, Maurice, the slime, a pile and the sky each
    // say what they are in the kit's label (ink: a name is what a thing IS)
    for (const type of ['web', 'icon', 'bug', 'slime', 'weather']) {
      const b = branch(type)
      assert.match(b, /class="name k-lbl"/, `${type}: the name is off the kit's label`)
      assert.doesNotMatch(b, /pixelLabel|pixelText/, `${type}: a name is set in the pixel face`)
    }
    const stack = fn('function buildStack(t, n){')
    assert.match(stack, /<div class="name k-lbl">\$\{esc\(t\.label\)\}<\/div>/)
    assert.doesNotMatch(stack, /pixelLabel/)
    assert.doesNotMatch(APP, /\bpixelLabel\b/, 'app.js sets a label in the pixel face again')
    // Maurice's name is no longer a pixel drawing scaled down to fit
    assert.equal(decl('.t-bug .name', 'transform'), undefined)
  })

  // mutation: widgets-kit.slime-sage, widgets-kit.slime-ochre-food
  it('the slime is drawn on the grey ramp, and its food is brick because food is live', () => {
    const paint = fn('function paintSlime(prev = null, prevFood = []){')
    assert.match(paint, /\['', '--cv-mid', '--cv-mute', '--cv-ink'\]/)
    assert.match(paint, /getPropertyValue\('--cv-brick'\)/)
    assert.doesNotMatch(paint, /sage|ochre/, 'an old accent is back in the dish')
    // the rim is a line of one cell over the dish, wired to the dust
    assert.match(branch('slime'), /wireDust\(n\.querySelector\('\.rim'\), rim\);/)
  })

  // mutation: widgets-kit.dock-name-rides-glyph
  it('every name in a dock row sits on one line: the mark slot is the row, not the glyph (#339)', () => {
    // the icon's column is centred, so a mark that took its glyph's height
    // lifted the name by half the difference: the key and the envelope
    // (42px, on the 21 lattice) sat three px over their 48px neighbours.
    // One slot height for every mark, and no glyph taller than it.
    const slot = decl('.t-icon .mark', 'height')
    assert.equal(slot, 'calc(12 * var(--cv-px))', 'the mark takes its glyph height again')
    assert.equal(decl('.t-icon .cell', 'justify-content'), 'center')
    for (const sel of ['.t-icon .mark svg', '.t-icon .mark svg.g21']) {
      const h = Number.parseInt(decl(sel, 'height'), 10)
      assert.ok(h > 0 && h <= 12 * 4, `${sel} is taller than the slot`)
    }
  })

  // mutation: widgets-kit.icon-dim-tooltip
  it('a social glyph has no native tooltip and no faded state that reads as disabled', () => {
    const icon = branch('icon')
    assert.doesNotMatch(icon, /\.title\s*=|classList\.add\('dim'\)/)
    assert.doesNotMatch(HOME_CSS, /\.t-icon\.dim/)
    assert.match(icon, /n\.addEventListener\('click', gosocial\); keyable\(n, name, gosocial\);/)
  })

  // mutation: widgets-kit.card-lift, widgets-kit.card-chip-block, widgets-kit.card-tag-unkitted, widgets-kit.card-tags-two-rows
  it("a card's tags are the kit's tag, and it never lifts", () => {
    // the tags are the kit's (kit.css .k-tag, js/tags.js), drawn by nobody here
    assert.match(APP, /s\.className='k-tag';/)
    assert.equal((CARDS.match(/<div class="k-tags">\$\{tagList\(tags\)\}<\/div>/g) || []).length, 1)
    assert.equal(decl('.t-article .k-tag', 'background'), undefined, 'the tag is drawn on its own')
    // one row: a tag that does not fit is cut off whole, never the summary
    assert.equal(decl('.t-article .k-tags', 'overflow'), 'hidden')
    assert.equal(
      decl('.t-article .k-tags', 'max-height'),
      'calc(8 * var(--cv-px) + var(--cv-sp-3))'
    )
    // nothing lifts: no card state moves the card
    const moved = RULES.filter((r) => r.selectors.some((s) => /^\.openable[:.]/.test(s.trim())))
      .filter((r) => r.decls.some((d) => d.prop === 'transform'))
      .map((r) => r.selectors.join(', '))
    assert.deepEqual(moved, [], 'a card lifts or sets down under the hand')
    // the hand rings it in one cell of ink, a press rings it brick
    assert.equal(decl('.openable:hover .cell', 'outline'), 'var(--cv-px) solid var(--cv-ink)')
    assert.equal(decl('.openable:active .cell', 'outline-color'), 'var(--cv-brick)')
  })

  // mutation: widgets-kit.dead-tile-back, widgets-kit.dead-primitive-back
  it('no dead styling rides along to be ported: every tile builder has a tile, every primitive a use', () => {
    // a builder in mkTile for a kind nothing on the ground or in a pile is
    const kinds = new Set([...TILES, ...MEMBERS].map((t) => t.type))
    const built = [
      ...APP.matchAll(/\} else if\(t\.type==='(\w+)'\)\{|if\(t\.type==='(\w+)'\)\{/g),
    ].map((m) => m[1] || m[2])
    assert.ok(built.length >= 7, 'the builders moved; move this guard with them')
    assert.deepEqual(
      built.filter((k) => !kinds.has(k)),
      [],
      'mkTile builds a kind no tile is'
    )
    // the case-study primitives #336 listed, gone unless a study uses them
    const CS_CSS = read('src/static/css/case-study.css')
    const feed = readdirSync(join(ROOT, 'content/feed'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => read(`content/feed/${f}`))
      .join('\n')
    for (const cls of [
      'unit-pict',
      'inline-token',
      'pipeline-step',
      'aphorism',
      'sweep-legend',
      'fn-claim',
    ])
      if (!feed.includes(cls))
        assert.ok(
          !new RegExp(`\\.${cls}\\b`).test(CS_CSS),
          `case-study.css styles .${cls}, which no study uses`
        )
    // the self-animating loader picture and its emitter went with the kit loader
    for (const rel of ['src/static/img/icon/loader.svg', 'scripts/icon/loader.mjs'])
      assert.ok(!existsSync(join(ROOT, rel)), `${rel} is back`)
  })
})
