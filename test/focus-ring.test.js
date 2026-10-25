// test/focus-ring.test.js
// BIBLE.md section 1: one focus ring. A focused thing is ringed in the ink,
// one cell thick and one cell out: `outline: var(--cv-px) solid
// var(--cv-ink)` with `outline-offset: var(--cv-px)`. Where the ring would be
// clipped (a box that scrolls, a tab in a strip) it comes one cell IN,
// `calc(-1 * var(--cv-px))`, and nowhere else is there a third place for it.
// Under a forced palette it is the same ring in the system's own ink,
// `Highlight` or `CanvasText`.
//
// Before this there were four rings: the kit's cell, a three-pixel ring on
// the canvas and the photo sets (the hairline pass let it through, BIBLE.md
// section 12), a two-cell inset on the tab's buttons and the scrollbar, and
// a ring in currentColor. Each was right where it was written and together
// they said focus four ways.
//
// Every rule whose selector names :focus, :focus-visible or :focus-within is
// read, and every outline declaration in it has to be the ring or switch the
// UA's ring off (`none`; test/forced-colors.test.js holds a :focus-visible
// to keeping one). A rule that draws the ring states its offset beside it.
// No escape: a second ring is the thing this exists to stop.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cssFiles, cssPath, cssRel } from './lib/stylesheets.js'

// every stylesheet, the site's and the kit's (primitives/kit, where the
// controls and their rings live)
const files = cssFiles().sort()

const CELL = 'var(--cv-px)'
const OFFSETS = new Set([CELL, `calc(-1 * ${CELL})`])
const INK = new Set(['var(--cv-ink)'])
const FORCED_INK = new Set(['Highlight', 'CanvasText'])
const FORCED_AT = /@media[^{]*forced-colors\s*:\s*active/i
const OUTLINE = /^outline(-width|-style|-color|-offset)?$/

// A brace-aware walk (the shape of test/forced-colors.test.js parseBlocks),
// keeping each declaration's own line so a failure names it.
function rules(raw) {
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const out = []
  const stack = []
  let buf = ''
  let line = 1
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') {
      stack.push({ prelude: buf.trim().replace(/\s+/g, ' '), at: i + 1, atLine: line })
      buf = ''
    } else if (ch === '}') {
      const top = stack.pop()
      if (top && top.prelude && !top.prelude.startsWith('@')) {
        const body = css.slice(top.at, i)
        const decls = []
        let l = top.atLine
        // nested blocks never sit inside a style rule here; a declaration is
        // everything up to its semicolon, attributed to the line it starts on
        let start = 0
        for (let j = 0; j <= body.length; j++) {
          if (j === body.length || body[j] === ';') {
            const text = body.slice(start, j)
            const lead = text.match(/^\s*/)[0]
            const lineOf = l + (lead.match(/\n/g) || []).length
            const m = text.trim().match(/^([a-z-]+)\s*:\s*([\s\S]+)$/i)
            if (m)
              decls.push({
                prop: m[1].toLowerCase(),
                value: m[2].replace(/\s+/g, ' '),
                line: lineOf,
              })
            l += (text.match(/\n/g) || []).length
            start = j + 1
          }
        }
        out.push({
          prelude: top.prelude,
          decls,
          forced: stack.some((s) => FORCED_AT.test(s.prelude)),
        })
      }
      buf = ''
    } else {
      buf += ch
    }
    if (ch === '\n') line++
  }
  return out
}

function violations(raw) {
  const hits = []
  for (const r of rules(raw)) {
    if (!/:focus(-visible|-within)?\b/.test(r.prelude)) continue
    const ink = r.forced ? FORCED_INK : INK
    const outlines = r.decls.filter((d) => OUTLINE.test(d.prop))
    let rings = false
    let offset = false
    for (const d of outlines) {
      const v = d.value.trim()
      let bad = null
      if (d.prop === 'outline') {
        if (/^(none|0)$/.test(v)) continue
        rings = true
        const [width, style, color, ...rest] = v.split(' ')
        if (width !== CELL || style !== 'solid' || !ink.has(color) || rest.length)
          bad = `outline: ${v}`
      } else if (d.prop === 'outline-width') {
        if (v !== CELL) bad = `outline-width: ${v}`
      } else if (d.prop === 'outline-style') {
        if (!/^(solid|none)$/.test(v)) bad = `outline-style: ${v}`
      } else if (d.prop === 'outline-color') {
        if (!ink.has(v)) bad = `outline-color: ${v}`
      } else if (d.prop === 'outline-offset') {
        offset = true
        if (!OFFSETS.has(v)) bad = `outline-offset: ${v}`
      }
      if (bad) hits.push(`${d.line}: ${r.prelude.slice(0, 60)} { ${bad} }`)
    }
    if (rings && !offset) {
      const at = outlines.find((d) => d.prop === 'outline')
      hits.push(`${at.line}: ${r.prelude.slice(0, 60)} draws the ring with no offset beside it`)
    }
  }
  return hits
}

describe('one focus ring (BIBLE.md section 1)', () => {
  for (const file of files) {
    const raw = readFileSync(cssPath(file), 'utf8')
    // mutation: focus-ring.three-px-ring, focus-ring.ring-in-current-color, focus-ring.offset-two-cells
    it(`${file}: every focus ring is the ink, a cell thick, a cell out or in`, () => {
      const hits = violations(raw)
      assert.deepEqual(
        hits,
        [],
        `a second focus ring:\n  ${hits.map((h) => `${cssRel(file)}:${h}`).join('\n  ')}\n` +
          `The ring is outline: ${CELL} solid var(--cv-ink) with outline-offset ${CELL}, or ` +
          `calc(-1 * ${CELL}) where it would be clipped; under forced colors the same ring ` +
          `in Highlight or CanvasText.`
      )
    })
  }
})
