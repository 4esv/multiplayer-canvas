// test/font-rule.test.js
// BIBLE.md section 1: one face for everything, Hasklig for code and only
// code, no third face. Mechanized here because the rule is invisible to a reader
// (a wrong typeface still renders, it just looks slightly off, which is how
// Hasklig sat on a readout and Times New Roman on a music staff
// without anyone noticing).
//
// A font declaration must resolve through a token: `var(--cv-font)`,
// `var(--cv-font-code)`, another `var(--...)` that itself resolves to one, or
// `inherit` (the correct reset for form controls, which otherwise take the
// UA's own stack). Anything naming a family outright needs a
// `/* font-ok: reason */` on its own line directly above, the same escape
// idiom as ink-ok and px-ok. The one exempt file is canvas-tokens.css, which
// is where the two @font-face blocks and the two tokens are DEFINED.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CSS_DIR = join(ROOT, 'src/static/css')

// canvas-tokens.css defines the faces
const EXEMPT_FILES = new Set(['canvas-tokens.css'])

// a literal family name: a quoted string, or one of the CSS generics
const NAMES_A_FAMILY =
  /'[^']+'|"[^"]+"|\b(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-monospace|-apple-system)\b/

function violations(css) {
  // blank out comments EXCEPT the font-ok escapes, keeping line structure so
  // the escape can be found one or two lines above its declaration
  const lines = css
    .replace(/\/\*(?!\s*font-ok:)[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
  const out = []
  lines.forEach((line, i) => {
    // font-family:, the `font:` shorthand, and custom properties holding faces
    if (!/(?:^|[\s;{])(?:font-family|font)\s*:|--font[\w-]*\s*:/.test(line)) return
    if (!NAMES_A_FAMILY.test(line)) return
    const esc = (l) => /\/\*\s*font-ok:.+\*\//.test(l || '')
    if (esc(line) || esc(lines[i - 1]) || esc(lines[i - 2]) || esc(lines[i - 3])) return
    out.push(`${i + 1}: ${line.trim()}`)
  })
  return out
}

describe('one typeface, and code is the only exception', () => {
  const files = readdirSync(CSS_DIR)
    .filter((f) => f.endsWith('.css') && !EXEMPT_FILES.has(f))
    .sort()

  for (const f of files) {
    // mutation: font-rule.stack-retyped
    it(f, () => {
      const hits = violations(readFileSync(join(CSS_DIR, f), 'utf8'))
      assert.deepEqual(
        hits,
        [],
        `names a typeface outright instead of reading a token.\n` +
          `Use var(--cv-font) / var(--cv-font-code), or add /* font-ok: reason */ above:\n  ${hits.join('\n  ')}`
      )
    })
  }

  // The canvas measured the hero with pretext, which forwards the string to
  // ctx.font, until the statement became the mark's own pixels. Anything that
  // measures text again must take that string from the token: a hand-copied
  // stack measures one face while the page paints another, and nothing would
  // catch the drift until a centred line visibly broke.
  // mutation: font-rule.measure-retyped
  it('canvas JS measures text with the token, never a re-typed stack', () => {
    const app = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')
    const bad = app
      .split('\n')
      .map((l, i) => [i + 1, l])
      // naming the face to LOAD it is required by the FontFaceSet API, and a
      // comment mentioning it is not a declaration; only a measurement stack
      // is the drift risk
      .filter(([, l]) => !/^\s*(?:\/\/|\*)/.test(l))
      .filter(([, l]) => !/fonts\s*\??\.\s*(?:load|check)/.test(l))
      .filter(([, l]) => /px\s+DotGothic16|font\s*=\s*[`'"].*DotGothic16/.test(l))
    assert.deepEqual(
      bad.map(([n, l]) => `${n}: ${l.trim()}`),
      [],
      'hard-codes a face; read --cv-font from the computed style instead'
    )
  })
})
