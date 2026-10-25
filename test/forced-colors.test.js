// test/forced-colors.test.js
// BIBLE.md section 13, mechanized: the site has to survive the user taking
// the palette away. In forced colors mode (Windows High Contrast and its
// kin) the browser repaints every colour the page states, drops box-shadow
// and text-shadow to none, and drops any background-image that is not a
// url(). Anything the design DRAWS with a fill therefore disappears, and a
// screenshot taken on a Mac cannot see it happen. So this guard is
// structural, not visual: it reads the stylesheets and fails on the shapes
// that are known to vanish.
//
// Engines, stated plainly because the rule is not universal: Chromium and
// Gecko implement forced colors. WebKit shipped the media query as a
// hardcoded stub that always answers `none` (bug 225281) and supports no
// forced-color-adjust at all, so Safari neither enters the mode nor honours
// the fixes. This is a two-engine guard for a two-engine feature.
//
// Four rules, each with the same escape as the other chrome guards: a
// `/* forced-ok: reason */` on the declaration's own line or up to two lines
// above the selector.
//
//   1. focus rings   a :focus-visible rule may not signal focus with paint
//                    alone, and may not switch its outline off. Colour is
//                    the one thing the OS takes; outline-color is remapped
//                    to a system colour and keeps working.
//   2. elevation     a block whose only boundary is a box-shadow has no
//                    boundary at all once the shadow is dropped. Draw the
//                    edge with a border or an outline.
//   3. gradients     a background-image with no url() is dropped outright,
//                    so a seam, hatch or plate drawn as a gradient goes with
//                    it.
//   4. opt-outs      forced-color-adjust also disables the text backplate on
//                    the subtree it lands on, so every use states its reason.
//
// Rules 1 to 3 skip declarations already inside `@media (forced-colors:
// active)`: that block IS the fallback, and forcing it to guard itself would
// be circular. Rule 4 runs everywhere, because an opt-out inside the media
// query is still an opt-out.
//
// Known limit, recorded rather than hidden: rule 1 covers `:focus-visible`
// only. A bare `X:focus { outline: none }` paired with an `X:focus-visible`
// rule below it is the intended pattern here, and flagging the pair would
// cost an escape on every control while saying nothing.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const CSS_DIR = join(import.meta.dirname, '../src/static/css')
// highlight.css is a vendored third-party syntax theme, out of our hands.
const EXEMPT = new Set(['highlight.css'])
const files = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css') && !EXEMPT.has(f))

// Keep line structure so the escape can be looked up by line, and strip
// comment BODIES except the escape marker itself (the same shape as
// test/ink-chrome.test.js, so one idiom covers every chrome guard).
function stripComments(css) {
  return css.replace(/\/\*(?!\s*forced-ok:)[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

// A brace-aware walk: every `{ ... }` comes back with its prelude (selector
// or at-rule), the line the prelude starts on, its declarations with nested
// blocks removed, and the at-rules it sits inside. Regex over raw lines
// cannot tell a `box-shadow` declaration from the word box-shadow inside a
// transition list, nor a rule inside the forced-colors block from one
// outside it.
function parseBlocks(css) {
  const out = []
  const stack = []
  let buf = ''
  let line = 1
  let bufLine = 1
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') {
      stack.push({ prelude: buf.trim().replace(/\s+/g, ' '), line: bufLine, start: i + 1 })
      buf = ''
      bufLine = line
    } else if (ch === '}') {
      const top = stack.pop()
      if (top) {
        out.push({
          prelude: top.prelude,
          line: top.line,
          // nested blocks (keyframe steps, rules inside an at-rule) are their
          // own entries; a block's declarations are what is left without them
          decls: css.slice(top.start, i).replace(/\{[^{}]*\}/g, ''),
          ancestors: stack.map((s) => s.prelude),
        })
      }
      buf = ''
      bufLine = line
    } else {
      if (buf.trim() === '') bufLine = line
      buf += ch
    }
    if (ch === '\n') line++
  }
  return out
}

const FORCED_AT = /@media[^{]*forced-colors\s*:\s*active/i
const inForcedBlock = (b) => b.ancestors.some((a) => FORCED_AT.test(a))
const isRule = (b) => b.prelude !== '' && !b.prelude.startsWith('@')

// One declaration's value, or null. Longhands beat the shorthand only when
// they come later, which is what `at` tracks.
function decl(decls, prop) {
  const re = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, 'gi')
  let last = null
  for (const m of decls.matchAll(re)) last = m[1].trim()
  return last
}

function escaped(lines, blockLine) {
  const esc = (l) => /\/\*\s*forced-ok:.+\*\//.test(l || '')
  // the selector's own line, or up to two above it (room for another guard's
  // escape to stack with this one)
  return esc(lines[blockLine - 1]) || esc(lines[blockLine - 2]) || esc(lines[blockLine - 3])
}

// Properties that paint. A focus rule built only from these says "focused"
// in colour, and colour is exactly what forced colors takes away.
const PAINT = ['background', 'background-color', 'color', 'fill', 'stroke', 'filter']

function report(hits) {
  return hits.map((h) => `  ${h.line}: ${h.prelude} (${h.why})`).join('\n')
}

describe('forced colors: nothing meaningful is drawn in a colour the OS can take', () => {
  for (const file of files) {
    const raw = readFileSync(join(CSS_DIR, file), 'utf8')
    const css = stripComments(raw)
    const lines = css.split('\n')
    const blocks = parseBlocks(css).filter(isRule)
    const shipped = blocks.filter((b) => !inForcedBlock(b))

    // mutation: forced-colors.focus-paint-only
    it(`${file}: every :focus-visible keeps a ring`, () => {
      const hits = []
      for (const b of shipped) {
        if (!/:focus-visible/.test(b.prelude)) continue
        const outline = decl(b.decls, 'outline') ?? decl(b.decls, 'outline-style')
        const width = decl(b.decls, 'outline-width')
        const rings = outline && !/^(none|0)$/i.test(outline) && !/^0(px)?\s/.test(outline)
        if (rings && !/^0(px)?$/.test(width || '')) continue
        const off = outline !== null || width !== null
        const paints = PAINT.some((p) => decl(b.decls, p) !== null)
        if (!off && !paints) continue // a pure transform cue leans on a ring elsewhere; fine
        if (escaped(lines, b.line)) continue
        hits.push({ ...b, why: off ? 'outline switched off' : 'focus signalled in paint only' })
      }
      assert.equal(
        hits.length,
        0,
        `${file}: focus goes invisible under a forced palette:\n${report(hits)}\n` +
          `Set an outline (its colour is remapped, so it survives), or restore the ` +
          `state in system colours inside @media (forced-colors: active), then mark the ` +
          `shipped rule /* forced-ok: reason */.`
      )
    })

    // mutation: forced-colors.edge-by-shadow
    it(`${file}: no boundary drawn with elevation alone`, () => {
      const hits = []
      // A selector may drop its border by design and draw it again inside the
      // forced-colors block: that IS the fallback, so it counts as covered.
      // Verified rather than asserted in a comment, because the alternative
      // (a `forced-ok` escape naming a fallback) is a promise nothing checks.
      const rescued = new Set()
      for (const b of blocks) {
        if (!inForcedBlock(b) || !isRule(b)) continue
        const draws = (v) => v !== null && !/^(0(px|em|rem)?|none)$/i.test(v.trim())
        const any = ['border', 'border-width', 'outline', 'outline-width'].some((prop) =>
          draws(decl(b.decls, prop))
        )
        if (any) for (const sel of b.prelude.split(',')) rescued.add(sel.trim())
      }
      for (const b of shipped) {
        if (b.prelude.split(',').every((sel) => rescued.has(sel.trim()))) continue
        const shadow = decl(b.decls, 'box-shadow')
        if (!shadow || /^none$/i.test(shadow)) continue
        // A border that is not there draws nothing. This used to accept any
        // block that so much as MENTIONED a border property, which let
        // `border: 0; box-shadow: var(--cv-shadow)` through: on 2026-09-15
        // every tile on the canvas dropped its border for a block-and-cast
        // edge and this guard reported green while the whole world lost its
        // boundary under a forced palette. A zero, a `none` and a zero width
        // are all nothing.
        const draws = (v) => v !== null && !/^(0(px|em|rem)?|none)$/i.test(v.trim())
        const bordered = [
          'border',
          'border-width',
          'border-top',
          'border-right',
          'border-bottom',
          'border-left',
          'outline',
          'outline-width',
        ].some((p) => draws(decl(b.decls, p)))
        if (bordered) continue
        if (escaped(lines, b.line)) continue
        hits.push({ ...b, why: `box-shadow: ${shadow.replace(/\s+/g, ' ')}` })
      }
      assert.equal(
        hits.length,
        0,
        `${file}: box-shadow is forced to none, so these edges vanish:\n${report(hits)}\n` +
          `Draw the boundary with a border or an outline, or mark it /* forced-ok: reason */.`
      )
    })

    // mutation: forced-colors.gradient-plate
    it(`${file}: no seam or plate drawn as a gradient`, () => {
      const hits = []
      for (const b of shipped) {
        for (const prop of ['background', 'background-image']) {
          const v = decl(b.decls, prop)
          if (!v || !/gradient\(/i.test(v) || /url\(/i.test(v)) continue
          if (escaped(lines, b.line)) continue
          hits.push({ ...b, why: `${prop} is a gradient` })
        }
      }
      assert.equal(
        hits.length,
        0,
        `${file}: a background-image without a url() is forced to none:\n${report(hits)}\n` +
          `Draw it with a border, restore it in system colours inside @media ` +
          `(forced-colors: active), or mark it /* forced-ok: reason */.`
      )
    })

    // mutation: forced-colors.opt-out-unexplained
    it(`${file}: every forced-color-adjust states its reason`, () => {
      const hits = []
      for (const b of blocks) {
        const v = decl(b.decls, 'forced-color-adjust')
        if (v === null) continue
        if (escaped(lines, b.line)) continue
        hits.push({ ...b, why: `forced-color-adjust: ${v}` })
      }
      assert.equal(
        hits.length,
        0,
        `${file}: opting out of the forced palette also kills the text backplate ` +
          `on that subtree, so it may never wrap text:\n${report(hits)}\n` +
          `Mark it /* forced-ok: reason */ naming what artwork needs its own colours.`
      )
    })
  }
})
