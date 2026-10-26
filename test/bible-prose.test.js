// test/bible-prose.test.js
// BIBLE.md is a consistency contract, not a lab notebook. The prose
// states what must stay consistent and names the guard that holds it. The
// story of how a value was chosen lives in a comment beside the value, the
// measurement lives in the test that holds it. bible-sync reads the
// frontmatter and layout.js, never the prose, so a number typed into a
// sentence rots the day the value moves and nothing notices. This does:
// a numeral in the body passes only if it IS a value bible-sync holds.
//
// Not numerals for this purpose: code spans that name something (a token,
// a path, a constant), heading numbers, "section N" cross-references, and
// digits glued to a word (h1, woff2, V1). A code span that is only a number
// is still a number, so wrapping one in backticks does not launder it.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { PX, M, GUTTER, AIR, LADDER, HERO_STEPS, CHROME } from '../src/static/canvas/layout.js'

const ROOT = join(import.meta.dirname, '..')
const { data, content } = matter(readFileSync(join(ROOT, 'BIBLE.md'), 'utf8'))

// Every number the sync guard reads: the frontmatter leaves that are a
// plain quantity (13px, 120ms, '700'; not the arguments inside an easing
// function) and the layout.js constants it compares.
function leaves(node, out = []) {
  if (node && typeof node === 'object') for (const v of Object.values(node)) leaves(v, out)
  else if (node != null) out.push(String(node))
  return out
}
const HELD = new Set(
  [
    ...leaves(data).flatMap((v) => v.match(/^\d+(?:\.\d+)?(?=[a-z]*$)/) || []),
    ...[PX, M, GUTTER, AIR, ...LADDER, ...HERO_STEPS, ...Object.values(CHROME)].map(String),
  ].map(Number)
)

const SECTIONS = new Set([...content.matchAll(/^## (\d+)\./gm)].map((m) => m[1]))
const COLORS = new Set(Object.values(data.colors).map((c) => c.toLowerCase()))
const NUMERAL = /(?<![\w./]|[a-z]-)\d+(?:[.,]\d+)*/gi
const SECTION_REF = /\bsections?\s+(?:\d+\s*(?:,|and|or|to)?\s*)*$/i
const BARE_NUMBER_SPAN = /^[~≈±<>+-]?\s*\d[\d.,:x/ ]*(px|ms|s|%|ch|em|rem|fps|kb|mb|b)?$/i

// Line-numbered numerals in the body that bible-sync does not hold.
export function strayNumerals(body) {
  const hits = []
  body.split('\n').forEach((line, i) => {
    if (/^#{1,6} /.test(line)) return
    const spans = []
    const prose = line
      .replace(/`([^`]*)`/g, (_, code) => {
        if (BARE_NUMBER_SPAN.test(code.trim())) spans.push(code)
        return ' '
      })
      .replace(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi, (hex) =>
        COLORS.has(hex.toLowerCase()) ? ' ' : hex
      )
    for (const code of spans) {
      const n = Number(code.match(/\d+(?:\.\d+)?/)[0])
      if (!HELD.has(n)) hits.push(`${i + 1}: \`${code}\``)
    }
    for (const m of prose.matchAll(NUMERAL)) {
      if (SECTIONS.has(m[0]) && SECTION_REF.test(prose.slice(0, m.index))) continue
      if (HELD.has(Number(m[0].replace(/,/g, '')))) continue
      hits.push(`${i + 1}: ${m[0]} in "${line.trim().slice(0, 90)}"`)
    }
  })
  return hits
}

describe('BIBLE.md prose carries no numbers the sync guard cannot read', () => {
  it('every numeral in the body is a held token value', () => {
    const hits = strayNumerals(content)
    assert.deepEqual(hits, [], `stray numerals in BIBLE.md prose:\n${hits.join('\n')}`)
  })

  it('the lint bites (a guard that never failed is a guess)', () => {
    assert.equal(strayNumerals('found in about 7 seconds').length, 1)
    assert.equal(strayNumerals('retired 2026-09-17').length, 3)
    assert.equal(strayNumerals('see 227').length, 1)
    assert.equal(strayNumerals('laundered as `102`').length, 1)
    assert.equal(strayNumerals('ratio 4.5:1').length, 2)
    assert.equal(strayNumerals('ink is #18181b, not #111').length, 1)
    assert.deepEqual(strayNumerals('the module is 48px, the cell 4px'), [])
    assert.deepEqual(strayNumerals('`--cv-fs-1` and `src/lib/kit-parts.js`, an h1 in woff2'), [])
    assert.deepEqual(strayNumerals('see section 5 and sections 9 and 11'), [])
    assert.equal(strayNumerals('see section 99').length, 1)
  })
})
