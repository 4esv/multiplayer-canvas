// test/ink-chrome.test.js
// BIBLE.md section 1, mechanized: no shadow of any kind, no radii on the
// canvas; the only circles are the snippet light and round content
// pictograms; and a line (a border or an outline) is a whole cell, or the
// ground cut, or not there.
//
// NO SHADOWS (#313). A control is a picture of its state, lit and dithered
// (the baked parts), never a thing with a cast. The soft key, the per-card
// lamp, the one-cell hard cast, the inset recess cast and the inset ring are
// all retired, so there is nothing left to allowlist: `box-shadow: none` is
// the only box-shadow that passes, a drop-shadow() filter never does, and no
// escape comment reaches a shadow. A ring where a border would shift layout
// is an outline with a negative offset.
//
// THE ONE NAMED EXCEPTION is the smear (Lo-Hi tech): dark on light is smear
// bold, the glyph drawn again one dot to the right, which a dot-matrix face
// needs because it has one weight. It is a glyph weight, not a shadow, so
// `text-shadow` passes exactly two values: `none` and `var(--cv-smear)`, and
// the token itself is pinned here to the one-dot offset with no blur.
//
// A LINE IS A WHOLE CELL (the snap; BIBLE.md section 12 retires the
// hairline pass). A border or an outline is one cell thick (var(--cv-px)),
// a whole number of cells (calc(n * var(--cv-px))), one of the line tokens
// whole (--cv-bd, --cv-bd-ink, and the ground cut --cv-bd-cut, the one named
// half), or nothing. This used to pass 1, 2 and 3px as hairlines, which is
// how a three-pixel focus ring and a two-pixel board frame stood beside the
// cell. A width typed in px is off even at the cell's own 4, because it
// stops following the cell the day the cell moves, and a shorthand that
// names a style and no width is `medium`, three pixels. A transparent
// border passes (the border-drawn triangle).
//
// What passes without an escape: a radius of 0 or 50% or the radius tokens,
// and the lines above. Anything else needs an `/* ink-ok: reason */` on its
// own line within the two above the declaration: the escape documents a
// sanctioned frame-identity or content-illustration treatment (BIBLE.md
// sections 5 and 7), or a line that is not on the ground's cell at all (the
// seam's forced stitch, drawn in screen px through the camera).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cssFiles, cssPath } from './lib/stylesheets.js'

const EXEMPT = new Set(['highlight.css'])

const files = cssFiles().filter((f) => f.endsWith('.css') && !EXEMPT.has(f))

// keep line structure so the ink-ok escape can look one line up; strip
// comment BODIES except the escape marker itself
function lines(css) {
  return css.replace(/\/\*(?!\s*ink-ok:)[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split('\n')
}

function violations(css, matcher) {
  const ls = lines(css)
  const out = []
  ls.forEach((line, i) => {
    const hit = matcher(line)
    if (!hit) return
    // same line or up to two above (an ink-ok and a px-ok may stack)
    const esc = (l) => /\/\*\s*ink-ok:.+\*\//.test(l || '')
    const escaped = esc(line) || esc(ls[i - 1]) || esc(ls[i - 2])
    if (!escaped) out.push(`${i + 1}: ${hit}`)
  })
  return out
}

// every border and outline that says how thick it is: the shorthands and the
// width longhands, read whole (a value the formatter wraps is one value)
const LINE_PROP =
  /(^|[;{\s])((?:border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|outline)(-width)?)\s*:\s*([^;{}]+)/g
const WHOLE = new Set(['0', 'none', 'inherit', 'initial', 'unset'])
// a line token taken whole: the cell's line, the ink's, and the ground cut
const TOKEN_LINE = /^var\(--cv-bd(?:-ink|-cut)?\)$/
// a whole cell, or a whole number of them
const CELLS = /^(?:var\(--cv-px\)|calc\(\s*[1-9]\d*\s*\*\s*var\(--cv-px\)\s*\))$/
const STYLE = /^(?:solid|dashed|dotted|double|groove|ridge|inset|outset|none|hidden)$/
// a part that is a thickness rather than a colour: a number, arithmetic, a
// size token, or a width keyword (a colour is everything else)
const LENGTH =
  /^(?:-?\d*\.?\d+[a-z%]*|(?:calc|min|max|clamp)\(.*\)|var\(--cv-(?:px|sp-[\w-]+|module|gutter|air)[,)].*|thin|medium|thick)$/
// split on top-level spaces (a calc() or a var() with a fallback is one part)
function parts(value) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of value) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}
const offCell = (w) => (w === '0' || CELLS.test(w) ? null : w)
function lineViolations(css) {
  const ls = lines(css)
  const src = ls.join('\n')
  const esc = (l) => /\/\*\s*ink-ok:.+\*\//.test(l || '')
  const out = []
  for (const m of src.matchAll(LINE_PROP)) {
    const line = src.slice(0, m.index + m[1].length).split('\n').length
    if (esc(ls[line - 1]) || esc(ls[line - 2]) || esc(ls[line - 3])) continue
    const prop = m[2]
    const value = m[4].replace(/\s*!important\s*$/, '').trim()
    if (WHOLE.has(value) || TOKEN_LINE.test(value)) continue
    const ps = parts(value)
    let bad
    if (m[3]) bad = ps.map(offCell).filter(Boolean).join(' ')
    else {
      if (ps.includes('transparent')) continue // the border-drawn triangle
      const style = ps.find((x) => STYLE.test(x))
      if (style === 'none' || style === 'hidden') continue
      const widths = ps.filter((x) => LENGTH.test(x))
      bad =
        !widths.length && style
          ? 'no width, so medium, 3px'
          : widths.map(offCell).filter(Boolean).join(' ')
    }
    if (bad) out.push(`${line}: ${prop}: ${value} (${bad})`)
  }
  return out
}

describe('two-ink chrome (no shadows, no radii)', () => {
  for (const file of files) {
    const css = readFileSync(cssPath(file), 'utf8')

    // mutation: ink-chrome.raw-elevation-shadow, ink-chrome.pixel-cast-returns, ink-chrome.inset-ring-returns, ink-chrome.drop-shadow-filter, ink-chrome.text-shadow, ink-chrome.smear-retyped
    it(`${file}: no shadow of any kind, and the smear only by its token`, () => {
      // no ink-ok escape here: the law has one exception and it is named
      const hits = []
      lines(css).forEach((line, i) => {
        for (const m of line.matchAll(/\b(box-shadow|text-shadow)\s*:\s*([^;}]+)/g)) {
          const v = m[2].trim()
          const ok =
            v === 'none' || (m[1] === 'text-shadow' && (v === 'var(--cv-smear)' || v === 'inherit'))
          if (!ok) hits.push(`${i + 1}: ${m[1]}: ${v}`)
        }
        if (/drop-shadow\s*\(/.test(line)) hits.push(`${i + 1}: ${line.trim()}`)
      })
      assert.deepEqual(hits, [], `${file} paints a shadow: ${hits.join(' | ')}`)
    })

    // mutation: ink-chrome.raw-radius
    it(`${file}: radii only through the radius tokens or the circle allowlist`, () => {
      // the soft skin rounds through tokens (--cv-r for cards and
      // controls, --cv-r-sheet for the sheet's shoulders); a circle stays
      // 50% (the circle token went with its last reader). Every part of a
      // shorthand must be sanctioned, so a corner cannot smuggle a raw radius
      // past the token.
      const OK = new Set(['0', '50%', 'var(--cv-r)', 'var(--cv-r-sheet)'])
      const hits = violations(css, (line) => {
        const m = line.match(/border-radius\s*:\s*([^;}]+)/)
        if (!m) return null
        const v = m[1].trim()
        return v.split(/\s+/).every((part) => OK.has(part)) ? null : v
      })
      assert.deepEqual(hits, [], `${file} rounds corners off the tokens: ${hits.join(' | ')}`)
    })

    // mutation: ink-chrome.four-px-border, ink-chrome.hairline-border, ink-chrome.half-cell-line, ink-chrome.medium-by-default
    it(`${file}: a line is a whole cell, the ground cut, or none`, () => {
      const hits = lineViolations(css)
      assert.deepEqual(
        hits,
        [],
        `${file} draws a line off the cell:\n  ${hits.join('\n  ')}\n` +
          `A border or outline is var(--cv-px), calc(n * var(--cv-px)), a line token ` +
          `(var(--cv-bd), var(--cv-bd-ink), var(--cv-bd-cut)), 0 or none.`
      )
    })
  }
})

// The stylesheets are not the only place a shadow can be written: a script
// can set one on an element, a template or an entry can carry it inline, and
// an SVG can filter one in. Same law, same no-escape.
const ROOT = join(import.meta.dirname, '..')
const SHADOW_SOURCES = ['src/static/canvas', 'src/static/js', 'src/templates', 'content']
function sourceFiles() {
  const out = []
  for (const dir of SHADOW_SOURCES) {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true, recursive: true })) {
      if (!e.isFile() || !/\.(js|njk|md|svg)$/.test(e.name)) continue
      if (e.parentPath.includes('vendor')) continue // third party, not ours to rule
      const abs = join(e.parentPath, e.name)
      out.push([abs.slice(ROOT.length + 1), readFileSync(abs, 'utf8')])
    }
  }
  return out
}

describe('the smear is a glyph weight', () => {
  // mutation: ink-chrome.smear-blurred
  it('--cv-smear is one dot to the right, no blur, in the ink of the text', () => {
    const tokens = readFileSync(cssPath('canvas-tokens.css'), 'utf8')
    const m = tokens.match(/--cv-smear:\s*([^;]+);/)
    assert.ok(m, 'the smear token is gone')
    assert.equal(m[1].trim(), 'calc(1em / 16) 0 0 currentColor')
  })
})

describe('no shadows outside the stylesheets', () => {
  // mutation: ink-chrome.script-shadow
  it('no script, template or entry writes a shadow', () => {
    const SHADOW =
      /\b(?:boxShadow|textShadow|shadowBlur|feDropShadow)\b|(?:box|text)-shadow\s*:\s*(?!none\b)[^;"'`]|drop-shadow\s*\(/
    const hits = []
    for (const [rel, src] of sourceFiles()) {
      src.split('\n').forEach((line, i) => {
        // prose about the retired shadows is allowed; code is not
        if (/^\s*(\/\/|\*|\/\*|\{#)/.test(line)) return
        if (SHADOW.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`)
      })
    }
    assert.deepEqual(hits, [], `a shadow outside the stylesheets:\n  ${hits.join('\n  ')}`)
  })
})
