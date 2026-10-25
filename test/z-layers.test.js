// test/z-layers.test.js
// BIBLE.md section 8: one layer scale. Every z-index reads a --cv-z-* token
// from canvas-tokens.css, and no stylesheet or script writes a number of its
// own. The scale was derived from what the declarations it replaced actually
// stacked (thirty-four in the stylesheets, one in a script, eighteen different
// numbers from -1 to 100), folded to the fewest names that keep every pair
// that meets in a stacking context in the same order: five that order the
// parts of one box and seven that are the screen's.
//
// A raw number is not wrong on the day it is written; it is wrong the day
// somebody needs a layer between two others and has to read every stylesheet
// to learn what 74 and 75 were for.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { cssFiles, cssPath, cssRel } from './lib/stylesheets.js'

const ROOT = join(import.meta.dirname, '..')
const TOKENS = cssRel('canvas-tokens.css')
const sheets = cssFiles().sort()
const scripts = execFileSync(
  'git',
  ['ls-files', '-co', '--exclude-standard', 'src', 'primitives'],
  {
    cwd: ROOT,
    encoding: 'utf8',
  }
)
  .split('\n')
  .filter((f) => /\.(m?js|njk)$/.test(f) && !/(^|\/)vendor\//.test(f))

const TOKEN_SRC = readFileSync(join(ROOT, TOKENS), 'utf8')
// the scale, in the order the token file declares it
const LAYERS = [...TOKEN_SRC.matchAll(/^\s*--cv-z-([a-z-]+):\s*([^;]+);/gm)].map((m) => ({
  name: m[1],
  value: m[2].trim(),
}))
const NAMES = new Set(LAYERS.map((l) => l.name))

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

describe('one layer scale (BIBLE.md section 8)', () => {
  // mutation: z-layers.scale-out-of-order
  it('the scale is whole numbers, low to high, in the order it is written', () => {
    assert.ok(LAYERS.length >= 2, `only ${LAYERS.length} layers read from ${TOKENS}`)
    const off = []
    LAYERS.forEach((l, i) => {
      if (!/^-?\d+$/.test(l.value)) off.push(`--cv-z-${l.name}: ${l.value} is not a whole number`)
      else if (i && Number(l.value) <= Number(LAYERS[i - 1].value))
        off.push(`--cv-z-${l.name}: ${l.value} is not above --cv-z-${LAYERS[i - 1].name}`)
    })
    assert.deepEqual(off, [], `${TOKENS}:\n  ${off.join('\n  ')}`)
  })

  for (const file of sheets) {
    const css = readFileSync(cssPath(file), 'utf8')
    // mutation: z-layers.raw-number
    it(`${file}: every z-index is a layer`, () => {
      const hits = []
      strip(css)
        .split('\n')
        .forEach((line, i) => {
          for (const m of line.matchAll(/(?:^|[;{\s])z-index\s*:\s*([^;}]+)/g)) {
            const v = m[1].trim()
            const tok = v.match(/^var\(--cv-z-([a-z-]+)\)$/)
            if (v === 'auto' || (tok && NAMES.has(tok[1]))) continue
            hits.push(`${cssRel(file)}:${i + 1}: z-index: ${v}`)
          }
        })
      assert.deepEqual(
        hits,
        [],
        `a raw layer:\n  ${hits.join('\n  ')}\n` +
          `Read one of ${[...NAMES].map((n) => `--cv-z-${n}`).join(', ')}.`
      )
    })
  }

  // mutation: z-layers.script-raw-number
  it('no script or template writes a raw z-index', () => {
    const hits = []
    for (const f of scripts)
      readFileSync(join(ROOT, f), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/z-index\s*:\s*-?\d|zIndex\s*=\s*['"`]?-?\d/.test(line))
            hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`)
        })
    assert.deepEqual(
      hits,
      [],
      `a raw layer in a script:\n  ${hits.join('\n  ')}\n` +
        `Write var(--cv-z-<layer>) into the style, the same token a stylesheet reads.`
    )
  })
})
