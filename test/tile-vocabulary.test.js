// test/tile-vocabulary.test.js
// BIBLE.md section 3: φ lives in proportion, as Fibonacci on the module. A
// tile is one of exactly six shapes, in modules: eight by eight (the
// square), eight by five (the shelf), five by eight (the portrait), five by
// five (the small square), three by three, and two by two (the icon). A tile
// across several slots (`span`) takes its width from the slot arithmetic
// (the slots and the air between them) and its height from two, three, five
// or eight modules. Content refits to the shape, never the reverse. The
// cards a stack holds (MEMBERS) are held to the same six.
//
// Before this a tile was the size its content happened to measure, and the
// aspect vocabulary in section 3 was a list nothing checked.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TILES, MEMBERS, BENTO, M } from '../src/static/canvas/layout.js'

const LAYOUT = 'src/static/canvas/layout.js'
const SRC = readFileSync(join(import.meta.dirname, '..', LAYOUT), 'utf8')

const SHAPES = [
  [8, 8],
  [8, 5],
  [5, 8],
  [5, 5],
  [3, 3],
  [2, 2],
]
const SPAN_H = [2, 3, 5, 8]
// n slots and the n - 1 airs between them, in modules
const slotsW = (n) => (n * BENTO.unit + (n - 1) * BENTO.gap) / M

// the line a tile is declared on, so a failure points at it
const lineOf = (id) => SRC.slice(0, SRC.indexOf(`id: '${id}'`)).split('\n').length

function offVocabulary(t) {
  if (t.span) {
    const w = slotsW(t.span)
    const bad = []
    if (t.mw !== w) bad.push(`${t.mw} wide, and ${t.span} slots are ${w}`)
    if (!SPAN_H.includes(t.mh)) bad.push(`${t.mh} tall, not ${SPAN_H.join(', ')}`)
    return bad.length ? `a span of ${t.span}: ${bad.join('; ')}` : null
  }
  if (SHAPES.some(([w, h]) => w === t.mw && h === t.mh)) return null
  return `${t.mw}x${t.mh}, not one of ${SHAPES.map(([w, h]) => `${w}x${h}`).join(', ')}`
}

describe('every tile is one of the six shapes (BIBLE.md section 3)', () => {
  it('the vocabulary is Fibonacci on the module', () => {
    const FIB = [2, 3, 5, 8]
    for (const [w, h] of SHAPES) assert.ok(FIB.includes(w) && FIB.includes(h), `${w}x${h}`)
    assert.deepEqual(SPAN_H, FIB)
  })

  for (const t of TILES) {
    // mutation: tile-vocabulary.off-shape, tile-vocabulary.span-width
    it(`${t.id}: its footprint is in the vocabulary`, () => {
      const why = offVocabulary(t)
      assert.equal(
        why,
        null,
        `${LAYOUT}:${lineOf(t.id)}: ${t.id} is ${why}. Take the shape nearest its footprint, ` +
          `by aspect first and area second, and refit the content to it.`
      )
    })
  }

  // The cards the stacks hold are tiles too: the fan lays them out and the
  // pile shows the front one, so they take the same six shapes.
  // mutation: tile-vocabulary.member-off-shape
  it('every card a stack holds is in the vocabulary', () => {
    const cards = MEMBERS.map((m) => [m, `${LAYOUT}:${lineOf(m.id)}: ${m.id}`])
    for (const [c, at] of cards) {
      const why = offVocabulary(c)
      assert.equal(why, null, `${at} is ${why}. A card takes the shape nearest its footprint too.`)
    }
  })
})
