// test/kit-chip-bank.test.js
// Two pieces the sheet found missing and the kit now has (BIBLE.md section 1):
//
//   the chip   a word a panel reads out. The desk drew its own (.od-state, an
//              ink block when a state was bad) and so did the sheet's plate
//              numbers; both are the kit's now, so a status is one thing.
//   the bank   keys in a row, every one the same width in whole cells, one
//              cell of rule between neighbours however the row wraps. The
//              404 offered four buttons of four widths, none on the cell,
//              and on a phone a frame with an orphan and a doubled edge.
//
// What is held is the contract the pictures rest on: the chip's word stays
// where it is when it is raised, the bank's pitch and overlap are whole cells
// and agree, and the surfaces that had their own use the kit's. The painted
// half (all four keys 116 wide on the lattice at 1440, 390 and 320) is
// measured in a browser, because a stylesheet cannot say where a box lands.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cssRules } from './lib/cascade.js'

const ROOT = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const KIT = cssRules(read('primitives/kit/kit.css'))
const ADMIN = cssRules(read('src/static/css/admin.css'))
const decl = (rules, sel, prop) =>
  rules
    .filter((r) => r.selectors.some((s) => s.trim() === sel))
    .flatMap((r) => r.decls)
    .find((d) => d.prop === prop)?.value

describe('the chip', () => {
  // mutation: kit-chip.raise-moves-word
  it('raised or not, its word stays where it is: the padding is the chip’s, not the state’s', () => {
    assert.equal(decl(KIT, '.k-chip', 'padding'), '0 var(--cv-sp-1)')
    assert.equal(decl(KIT, '.k-chip.is-on', 'padding'), undefined)
    assert.equal(decl(KIT, '.k-chip.is-on', 'background'), 'var(--cv-ink)')
    assert.equal(decl(KIT, '.k-chip.is-on', 'color'), 'var(--cv-bright)')
    assert.equal(decl(KIT, '.k-chip.is-on', 'text-shadow'), 'none', 'light on dark stays regular')
  })

  // mutation: kit-chip.desk-own-rule, kit-chip.desk-drops-chip
  it('the desk’s states are the kit’s chip and the desk draws none of its own', () => {
    assert.match(
      read('src/templates/admin/index.njk'),
      /<span class="k-chip od-state\{% if r\.bad %\} is-on\{% endif %\}">\{\{ r\.state \}\}<\/span>/
    )
    assert.equal(decl(ADMIN, '.od-state.is-bad', 'background'), undefined)
    assert.equal(decl(ADMIN, '.od-state', 'white-space'), undefined, 'the chip does not wrap')
  })

  // mutation: kit-chip.plate-number-own-rule
  it('the sheet’s plate numbers are the same chip', () => {
    assert.match(
      read('src/templates/kit/plates.njk'),
      /<span class="k-chip is-on">\{\{ p\.no \}\}<\/span>/
    )
    assert.equal(
      decl(cssRules(read('src/static/css/sheet.css')), '.ks-no', 'background'),
      undefined
    )
  })
})

describe('the bank', () => {
  // mutation: kit-bank.pitch-fractional, kit-bank.rules-double
  it('its keys are whole cells wide and overlap by exactly their rule', () => {
    const cols = decl(KIT, '.k-bank', 'grid-template-columns')
    const pitch = cols.match(/^repeat\(auto-fit, calc\((\d+) \* var\(--cv-px\)\)\)$/)
    assert.ok(pitch, `the tracks are a whole number of cells: ${cols}`)
    // a key hangs one cell past its track onto the next key's rule, and the
    // grid keeps that cell for the last key's edge
    assert.equal(
      decl(KIT, '.k-bank .k-btn', 'margin'),
      '0 calc(-1 * var(--cv-px)) calc(-1 * var(--cv-px)) 0'
    )
    assert.equal(decl(KIT, '.k-bank', 'padding'), '0 var(--cv-px) var(--cv-px) 0')
    assert.equal(
      decl(KIT, '.k-bank', 'width'),
      '100%',
      'a bank fills its row, so the tracks are counted'
    )
    assert.equal(decl(KIT, '.k-bank', 'justify-content'), 'center')
    assert.ok(Number(pitch[1]) >= 24, 'a key holds its label')
  })

  // mutation: kit-bank.404-back-to-dock
  it('the not-found page offers its four ways out as a bank, and the doors’ other row is left a dock', () => {
    const nf = read('src/templates/pages/404.njk')
    assert.match(nf, /<nav class="k-bank" aria-label="somewhere real">/)
    assert.equal((nf.match(/<a class="k-btn/g) || []).length, 4)
    // two unlike actions (home, and a way to write) are a dock of two, whose
    // second key is longer than any bank key holds
    assert.match(
      read('src/templates/pages/500.njk'),
      /<nav class="k-dock" aria-label="somewhere real">/
    )
  })
})
