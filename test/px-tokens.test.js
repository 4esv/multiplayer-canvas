// test/px-tokens.test.js
// BIBLE.md sections 1 and 3: no stylesheet sets a size the system does not
// have. Every px literal in EVERY stylesheet under src/static/css must be 0,
// a token value (resolved live from canvas-tokens.css), or carry an explicit
// `/* px-ok: reason */` on its own line directly above (a sanctioned
// one-off: a content figure's drawing dimension, a border technique, a
// third-party constraint). A media or container query is not a size, it is a
// density or a module count, and test/breakpoints.test.js holds those.
//
// THE HAIRLINE PASS IS RETIRED (the snap, BIBLE.md section 12). This used to
// wave 1px and 3px through beside the cell, so a one-pixel rule and a
// three-pixel focus ring were legal everywhere the camera made them fuzz. A
// line is a whole cell (--cv-px) or nothing, and the ground cut (--cv-bd-cut,
// the sp-hair 2px) is the one named half, which the token scale already
// carries. It covered two stylesheets; it covers all of them.
//
// The scale comes off the shared token resolver rather than a `: <n>px` regex
// over the raw text. That regex could only see a literal sitting right after
// the colon, so the day a token became calc() or light-dark() its size dropped
// out of the scale and every consumer line in the file under test went red,
// with a message pointing at the wrong file.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveTokens, asPx } from './lib/css-tokens.js'

const ROOT = join(import.meta.dirname, '..')
const TOKENS = 'primitives/kit/canvas-tokens.css'
const CSS_DIR = 'src/static/css'
const FILES = readdirSync(join(ROOT, CSS_DIR))
  .filter((f) => f.endsWith('.css'))
  .sort()
  .map((f) => `${CSS_DIR}/${f}`)

const tokens = resolveTokens(readFileSync(join(ROOT, TOKENS), 'utf8'))
// zero, then every token whose WHOLE value is a length: a size the system
// has. A shorthand that merely contains a px (the border, the cut) is not a
// size anything may re-type.
const ALLOWED = new Set([0])
// The resolver still hands back a light map and a dark one. They are
// IDENTICAL today and test/one-ground.test.js proves it rather than
// assuming it: there is one ground (2026-09-15) and nothing shipped
// declares a dark context. Reading both is kept anyway, because it
// costs nothing and is the correct reading the day that changes; what
// is NOT kept is describing it as two-theme coverage, which is a claim
// this suite cannot currently make.
for (const name of tokens.names) {
  for (const view of [tokens.light, tokens.dark]) {
    const n = asPx(view[name])
    if (n !== null) ALLOWED.add(n)
  }
}
const SCALE = [...ALLOWED].sort((a, b) => a - b).join(', ')

function violations(css) {
  const lines = css
    .replace(/\/\*(?!\s*px-ok:)[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
  const out = []
  lines.forEach((line, i) => {
    if (/@media|@container/.test(line)) return
    const bad = [...line.matchAll(/(\d*\.?\d+)px/g)]
      .map((m) => Number(m[1]))
      .filter((v) => !ALLOWED.has(v))
    if (!bad.length) return
    // the escape covers a width/height pair: same line or up to two above
    const esc = (l) => /\/\*\s*px-ok:.+\*\//.test(l || '')
    const escaped = esc(line) || esc(lines[i - 1]) || esc(lines[i - 2])
    if (!escaped) out.push(`${i + 1}: ${line.trim()} (${bad.join(', ')})`)
  })
  return out
}

describe('px literals ride the token scale', () => {
  // tripwire: pending audit
  it('the scale is the token file, not a hand-kept list', () => {
    // If this set ever comes back near-empty the guard has stopped reading the
    // tokens, and every consumer line below would fail for the wrong reason.
    // (Sixteen sizes since the snap: the hairlines, the jumbo rung and the
    // circle left the scale.)
    assert.ok(ALLOWED.size > 12, `only ${ALLOWED.size} sizes resolved from ${TOKENS}: ${SCALE}`)
  })

  for (const rel of FILES) {
    // mutation: px-tokens.hand-typed-size, px-tokens.hairline-back, px-tokens.off-scale-anywhere
    it(rel.split('/').pop(), () => {
      const hits = violations(readFileSync(join(ROOT, rel), 'utf8'))
      assert.deepEqual(
        hits,
        [],
        `off-scale px in ${rel}:\n  ${hits.map((h) => `${rel}:${h}`).join('\n  ')}\n` +
          `allowed (0 plus every length token in ${TOKENS}): ${SCALE}\n` +
          `Fix the line, or add the size to ${TOKENS}, or mark it /* px-ok: reason */.`
      )
    })
  }
})
