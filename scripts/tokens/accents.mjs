// The accent inventory: every accent token, who reads it, and whether
// anything on the site still needs it.
//
//   node scripts/tokens/accents.mjs          print the table
//   node scripts/tokens/accents.mjs --json   the same, as JSON
//
// An accent is any colour token in canvas-tokens.css's first :root block
// that is not part of the ground (ink, ground, surface, white, mute and the
// ink-derived mixes), not a ramp tone, and not a guest ink. A CONSUMER is
// a file that names the token (`--cv-x`, never `--cv-x-something`) outside
// the places that only restate it: the token file, BIBLE.md, the ramp
// script and the tests that hold those in sync. A consumer is a NEED unless
// it is the kit specimen, which exists to show the palette rather than use
// it. "vestigial" means nothing needs it.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const TOKENS = join(ROOT, 'primitives/kit/canvas-tokens.css')

// the ground, and the structural names that are not colours
const GROUND = new Set([
  'ink',
  'ground',
  'surface',
  'white',
  'mute',
  'line',
  'grid',
  'grid-fine',
  'scrim',
  'hatch',
  'recess',
  // the parts ramp: greys a part is dithered onto, read
  // by name in src/lib/kit-parts.js, which is a consumer the regex below
  // cannot see because it builds the name
  'deep',
  'mid',
  'bright',
  'brick-deep',
  'brick-light',
])
// restating the token is not needing it
const RESTATES = [
  'primitives/kit/canvas-tokens.css',
  'BIBLE.md',
  'scripts/tokens/',
  'test/bible-sync.test.js',
  'test/contrast.test.js',
  'test/palette.test.js',
  // a mutation quotes a token to break a guard; it never paints with it
  'scripts/verify/mutations.json',
]
const SPECIMEN = [
  'src/templates/kit/',
  'src/static/css/kit',
  'src/static/js/kit.js',
  'src/lib/kit-parts.js',
  'test/kit.test.js',
]
const SCAN = ['src', 'scripts', 'test', 'content', 'BIBLE.md']
const EXT = /\.(css|js|mjs|njk|md|json|html)$/

// seam: test/accents.test.js
export function accentTokens(css = readFileSync(TOKENS, 'utf8')) {
  // the first :root block, less the generated ramp: a tone is its base's
  const start = css.indexOf(':root')
  const root = css
    .slice(start, css.indexOf('\n}', start))
    .replace(/\/\* ramp:begin[\s\S]*?ramp:end \*\//, '')
  const names = []
  for (const m of root.matchAll(/--cv-([a-z0-9-]+):\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*;/gi)) {
    const name = m[1]
    if (GROUND.has(name)) continue
    names.push({ name, value: m[2].toLowerCase() })
  }
  return names
}

function walk(p, out = []) {
  const abs = join(ROOT, p)
  let st
  try {
    st = statSync(abs)
  } catch {
    return out
  }
  if (st.isFile()) {
    if (EXT.test(p)) out.push(p)
    return out
  }
  for (const e of readdirSync(abs)) {
    if (e === 'node_modules' || e === 'vendor' || e.startsWith('.')) continue
    walk(join(p, e), out)
  }
  return out
}

// seam: test/accents.test.js
export function inventory() {
  const files = SCAN.flatMap((p) => walk(p)).map((f) => [f, readFileSync(join(ROOT, f), 'utf8')])
  return accentTokens().map(({ name, value }) => {
    // the custom property, or the bare name as a key in an accent map (the
    // pixel letters: pixelate.mjs ACCENTS, whose letter pixel-sprite.js paints)
    const re = new RegExp(
      `--cv-${name}(?![\\w-])|^\\s*(export const ACCENTS = \\{.*)?\\b${name}: '[a-z]'`,
      'm'
    )
    const consumers = files
      .filter(([f, text]) => re.test(text) && !RESTATES.some((r) => relative('.', f).startsWith(r)))
      .map(([f]) => f)
    const needs = consumers.filter((f) => !SPECIMEN.some((s) => f.startsWith(s)))
    return { name, value, consumers, needs, vestigial: needs.length === 0 }
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = inventory()
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2))
  else
    for (const r of rows)
      console.log(
        `${r.vestigial ? 'VESTIGIAL' : 'needed   '} --cv-${r.name.padEnd(12)} ${r.value.padEnd(9)} ${
          r.needs.join(', ') || '(specimen only: ' + (r.consumers.join(', ') || 'none') + ')'
        }`
      )
}
