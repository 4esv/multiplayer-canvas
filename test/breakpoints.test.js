// test/breakpoints.test.js
// BIBLE.md section 8, the density law. A device is one of three densities,
// and layout.js owns the edges between them: the watch under BAR_MIN_W wide
// or BAR_MIN_H tall, the desktop from DESKTOP_MIN_W. Every @media width or
// height in every stylesheet is one of those edges, a `min-` on the edge and
// a `max-` a hair under it (the way canvas-home.css already spells the watch,
// which test/chrome-fit.test.js pins). Anything that reflows INSIDE a page
// does it with @container, at a Fibonacci number of modules: five, eight,
// thirteen or twenty-one. Nothing else.
//
// Before this the stylesheets held private widths of their own (560, 600,
// 640, 720, 1100, a 62rem), each one a fourth density nobody had named, and
// a change to one page's reflow could not be reasoned about from any other.
// Read live from layout.js, so the law moves when the geometry does and
// never from a list kept here.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { M, BAR_MIN_W, BAR_MIN_H, DESKTOP_MIN_W } from '../src/static/canvas/layout.js'

const CSS_DIR = join(import.meta.dirname, '../src/static/css')
const files = readdirSync(CSS_DIR)
  .filter((f) => f.endsWith('.css'))
  .sort()

// an exclusive bound is spelled a hair under the edge: max-width 359.98px is
// "under 360" without landing on a fractional device pixel of its own
const HAIR = 0.02
const MODULES = [5, 8, 13, 21]
const EDGES = {
  media: { width: [BAR_MIN_W, DESKTOP_MIN_W], height: [BAR_MIN_H] },
  // a container reflows on its own inline size; a block-size query would be
  // a page reflowing on its own height, which nothing here does
  container: { width: MODULES.map((k) => k * M), 'inline-size': MODULES.map((k) => k * M) },
}
const same = (a, b) => Math.abs(a - b) < 1e-6

// keep line structure, drop comment bodies (a query named in prose is not a
// query)
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

// every @media and @container prelude, with the line it starts on
function queries(css) {
  const src = strip(css)
  const out = []
  for (const m of src.matchAll(/@(media|container)\b([^{;]*)\{/g)) {
    out.push({
      kind: m[1],
      prelude: m[2].replace(/\s+/g, ' ').trim(),
      line: src.slice(0, m.index).split('\n').length,
    })
  }
  return out
}

const AXIS = '(width|height|inline-size|block-size)'
const NUM = '(\\d*\\.?\\d+)([a-z%]*)'
// what one size feature asks for: the edge it names, as a lower bound (the
// size is at least this) or an upper bound (the size is under this)
function features(prelude) {
  const out = []
  for (const m of prelude.matchAll(
    new RegExp(`\\(\\s*(min|max)-${AXIS}\\s*:\\s*${NUM}\\s*\\)`, 'g')
  ))
    out.push({ text: m[0], axis: m[2], bound: m[1], value: Number(m[3]), unit: m[4] })
  // range syntax, either way round: (width < 360px), (360px <= width)
  for (const m of prelude.matchAll(new RegExp(`\\b${AXIS}\\s*(<=?|>=?)\\s*${NUM}`, 'g'))) {
    const [, axis, op, value, unit] = m
    out.push({
      text: m[0],
      axis,
      bound: op[0] === '<' ? 'max' : 'min',
      value: Number(value),
      unit,
      strict: op.length === 1,
    })
  }
  for (const m of prelude.matchAll(new RegExp(`${NUM}\\s*(<=?|>=?)\\s*${AXIS}\\b`, 'g'))) {
    const [, value, unit, op, axis] = m
    out.push({
      text: m[0],
      axis,
      bound: op[0] === '<' ? 'min' : 'max',
      value: Number(value),
      unit,
      strict: op.length === 1,
    })
  }
  return out
}

// null when the feature is on the law, else why not
function offLaw(kind, f) {
  const edges = EDGES[kind][f.axis]
  if (!edges) return `a ${kind} query on ${f.axis}`
  if (f.unit !== 'px') return `a ${f.unit || 'unitless'} edge`
  // min-width: 360px and (width >= 360px) sit ON the edge; max-width:
  // 359.98px and (width <= 359.98px) sit a hair under it; a strict range
  // (width < 360px) names the edge itself
  const under = f.bound === 'max' && !f.strict
  const over = f.bound === 'min' && f.strict
  const want = edges.map((e) => (under || over ? e - HAIR : e))
  if (want.some((w) => same(w, f.value))) return null
  return `${f.value}${f.unit} is not ${want.join(' or ')}`
}

function violations(css) {
  const hits = []
  for (const q of queries(css)) {
    for (const f of features(q.prelude)) {
      const why = offLaw(q.kind, f)
      if (why) hits.push(`${q.line}: @${q.kind} ${f.text} (${why})`)
    }
  }
  return hits
}

describe('every breakpoint is a density or a module count (BIBLE.md section 8)', () => {
  it('the edges are the densities layout.js owns and the Fibonacci modules', () => {
    // the prose names twenty-one modules as the desktop's own edge
    assert.equal(DESKTOP_MIN_W, 21 * M, 'the desktop edge is no longer twenty-one modules')
    assert.deepEqual(
      EDGES.container.width,
      MODULES.map((k) => k * M)
    )
    for (let i = 2; i < MODULES.length; i++)
      assert.equal(MODULES[i], MODULES[i - 1] + MODULES[i - 2], 'the container steps are Fibonacci')
  })

  for (const file of files) {
    // mutation: breakpoints.private-width, breakpoints.private-container
    it(`${file}: every width and height query is a density edge or a module count`, () => {
      const hits = violations(readFileSync(join(CSS_DIR, file), 'utf8'))
      assert.deepEqual(
        hits,
        [],
        `off-law breakpoints:\n  ${hits.map((h) => `src/static/css/${file}:${h}`).join('\n  ')}\n` +
          `@media: min- on ${BAR_MIN_W}/${DESKTOP_MIN_W} (width) or ${BAR_MIN_H} (height), ` +
          `max- a hair under. @container: ${EDGES.container.width.join('/')}px.`
      )
    })
  }
})
