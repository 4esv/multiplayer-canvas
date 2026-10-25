// The field's caret stands at the insertion point (js/kit-caret.js, kit.css
// .k-field). It used to be a flex sibling after a flex:1 input and sat at
// the far end of the rule whatever was typed: every field on the site had
// a caret stuck to the end of the line (2026-09-26).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cssRules, computed } from './lib/cascade.js'
import { caretX, caretMode } from '../primitives/kit/kit-caret.js'

const ROOT = join(import.meta.dirname, '..')
const KIT = readFileSync(join(ROOT, 'primitives/kit/kit.css'), 'utf8')
const RULES = cssRules(KIT)
const field = (...classes) => ({ tag: 'span', classes: ['k-field', ...classes], attrs: {} })
const caret = { tag: 'span', classes: ['k-caret'], attrs: {} }
const input = { tag: 'input', classes: [], attrs: {} }

describe('the caret stands where the next letter goes', () => {
  it('the words before the insertion point, less the scroll, inside the box', () => {
    const at = (textWidth, scrollLeft = 0) =>
      caretX({ inputLeft: 8, inputWidth: 200, textWidth, scrollLeft, caretWidth: 8 })
    assert.equal(at(0), 8, 'an empty field: the caret at the start')
    assert.equal(at(40), 48, 'after 40px of words')
    assert.equal(at(300, 108), 200, 'a scrolled field: the words that scrolled away do not count')
    assert.equal(at(900), 200, 'never past the field, less its own width')
    assert.equal(at(10, 50), 8, 'never before it')
  })

  it('a block after the words, a bar inside them, nothing over a range', () => {
    assert.equal(caretMode({ start: 5, end: 5, length: 5 }), 'block')
    assert.equal(caretMode({ start: 0, end: 0, length: 0 }), 'block')
    assert.equal(caretMode({ start: 2, end: 2, length: 5 }), 'bar')
    assert.equal(caretMode({ start: 1, end: 4, length: 5 }), 'none')
    assert.equal(caretMode({ start: null, end: null, length: 5 }), 'none')
  })

  // mutation: kit-caret.in-the-row
  it('the drawn caret is out of the row, placed by the measure, never a flex sibling', () => {
    assert.equal(computed(RULES, [field(), caret], 'position', 1024), 'absolute')
    assert.match(computed(RULES, [field(), caret], 'translate', 1024), /var\(--k-caret-x/)
    assert.equal(computed(RULES, [field()], 'position', 1024), 'relative')
  })

  // mutation: kit-caret.native-hidden-untracked
  it('until the script has measured, the platform caret shows in ink', () => {
    assert.equal(computed(RULES, [field(), input], 'caret-color', 1024), 'var(--cv-ink)')
    assert.equal(computed(RULES, [field('k-tracked'), input], 'caret-color', 1024), 'transparent')
  })

  // mutation: kit-caret.input-one-line-tall
  it('the whole height of the field takes a tap, not one line of words', () => {
    assert.equal(computed(RULES, [field('k-sm'), input], 'align-self', 390), 'stretch')
  })

  // mutation: kit-caret.unwired-bar, kit-caret.unwired-doors
  it('both bundles that carry a field wire it: the doors (kit.js) and the bar (canvas/app.js)', () => {
    for (const f of ['src/static/js/kit.js', 'src/static/canvas/app.js']) {
      const src = readFileSync(join(ROOT, f), 'utf8')
      assert.match(
        src,
        /import \{ wireCarets \} from 'multiplayer-canvas\/kit\/caret'/,
        `${f} imports it`
      )
      assert.match(src, /^\s*wireCarets\(\);?$/m, `${f} calls it`)
    }
  })
})
