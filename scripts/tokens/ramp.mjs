// The tone ramps: every ink as a run of the same colour, the way an old game
// or system UI told a raised thing from a sunken one without a shadow.
//
//   node scripts/tokens/ramp.mjs           print the ramps and exit
//   node scripts/tokens/ramp.mjs --write   rewrite the generated blocks in
//                                          canvas-tokens.css and BIBLE.md
//
// A ramp is COMPUTED, not picked. From the base token it takes fixed
// lightness steps in OKLab, where equal steps look equal, and keeps the hue:
// a step that lands outside sRGB pulls its chroma in until it fits, rather
// than clipping a channel and turning the hue. Five tones, named for what
// they do on a control:
//
//   deep       two steps down: the floor of a well, the LCD's dead segments
//   shade      one step down: the bottom-right edge of a raised thing
//   (base)     the token itself, never restated
//   light      one step up: the face under a hand (hover)
//   highlight  two steps up: the top-left edge of a raised thing
//
// Fewer if fewer is enough, and "enough" is computed too: a step that comes
// out the same colour as the step before it is not a tone, so it is dropped.
// White has nothing above it, so its ramp is deep and shade only.
//
// The bases are READ from canvas-tokens.css, so a retuned ink takes its ramp
// with it the next time this runs, and test/bible-sync.test.js recomputes
// every ramp from the file and fails if the written one is stale.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const TOKENS = join(ROOT, 'primitives/kit/canvas-tokens.css')
const BIBLE = join(ROOT, 'BIBLE.md')

// the step, in OKLab lightness (0 black to 1 white). 0.08 is the smallest
// step at which the ground's highlight reads as a lit edge at one cell; the
// deep of the ground then lands one cut under the recess.
const STEP = 0.08
const TONES = [
  ['deep', -2],
  ['shade', -1],
  ['light', 1],
  ['highlight', 2],
]
// which inks get a ramp. sage is not here: the kit has no sage consumer, and
// its second tone is already a hand-set accent named sage-deep.
// seam: test/bible-sync.test.js
export const RAMPED = ['ink', 'ground', 'white', 'brick', 'ochre']

// ---- sRGB <-> OKLab (Björn Ottosson's matrices) ----
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function hexToOklab(hex) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => toLinear(c / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const inGamut = (rgb) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4)
const toHex = (rgb) =>
  '#' +
  rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, c))))) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')

// one tone: the base moved `dL` in lightness, chroma pulled in 1% at a time
// until the colour exists in sRGB
function shift(hex, dL) {
  const [L, a, b] = hexToOklab(hex)
  const L2 = Math.min(1, Math.max(0, L + dL))
  for (let k = 100; k >= 0; k--) {
    const rgb = oklabToLinear([L2, (a * k) / 100, (b * k) / 100])
    if (inGamut(rgb)) return toHex(rgb)
  }
  return toHex(oklabToLinear([L2, 0, 0]))
}

// seam: test/bible-sync.test.js
export function ramp(hex) {
  const base = hex.toLowerCase()
  const out = {}
  // walk outward from the base each way, so "the same as the step before"
  // means the neighbour nearer the base
  for (const dir of [-1, 1]) {
    let prev = base
    for (const [name, n] of TONES.filter(([, n]) => Math.sign(n) === dir).sort(
      (x, y) => Math.abs(x[1]) - Math.abs(y[1])
    )) {
      const tone = shift(base, n * STEP)
      if (tone === prev) break
      out[name] = tone
      prev = tone
    }
  }
  return Object.fromEntries(TONES.filter(([name]) => out[name]).map(([name]) => [name, out[name]]))
}

// the bases, read off the token file's first :root block
// seam: test/bible-sync.test.js
export function readBases(css = readFileSync(TOKENS, 'utf8')) {
  const bases = {}
  for (const name of RAMPED) {
    const m = css.match(new RegExp(`--cv-${name}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'))
    if (!m) throw new Error(`ramp: canvas-tokens.css has no hex --cv-${name}`)
    bases[name] = m[1].toLowerCase()
  }
  return bases
}

// seam: test/bible-sync.test.js
export function rampTable(bases = readBases()) {
  return Object.fromEntries(RAMPED.map((name) => [name, ramp(bases[name])]))
}

const CSS_BEGIN = '/* ramp:begin (scripts/tokens/ramp.mjs --write; never edit by hand) */'
const CSS_END = '/* ramp:end */'
const YAML_BEGIN = '  # ramp:begin (scripts/tokens/ramp.mjs --write; never edit by hand)'
const YAML_END = '  # ramp:end'

function cssBlock(table) {
  const lines = [CSS_BEGIN]
  for (const [name, tones] of Object.entries(table))
    for (const [tone, hex] of Object.entries(tones)) lines.push(`  --cv-${name}-${tone}: ${hex};`)
  lines.push(`  ${CSS_END}`)
  return '  ' + lines.join('\n')
}

function yamlBlock(table) {
  const lines = [YAML_BEGIN]
  for (const [name, tones] of Object.entries(table))
    for (const [tone, hex] of Object.entries(tones)) lines.push(`  ${name}-${tone}: '${hex}'`)
  lines.push(YAML_END)
  return lines.join('\n')
}

function splice(text, begin, end, block, file) {
  const i = text.indexOf(begin.trim())
  const j = text.indexOf(end.trim())
  if (i < 0 || j < i) throw new Error(`ramp: ${file} has no ramp:begin/ramp:end markers`)
  const lineStart = text.lastIndexOf('\n', i) + 1
  return text.slice(0, lineStart) + block + text.slice(j + end.trim().length)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const table = rampTable()
  if (!process.argv.includes('--write')) {
    for (const [name, tones] of Object.entries(table))
      console.log(
        name.padEnd(9),
        Object.entries(tones)
          .map(([t, h]) => `${t} ${h}`)
          .join('  ')
      )
  } else {
    const css = readFileSync(TOKENS, 'utf8')
    const nextCss = splice(css, CSS_BEGIN, CSS_END, cssBlock(table), 'canvas-tokens.css')
    const bible = readFileSync(BIBLE, 'utf8')
    const nextBible = splice(bible, YAML_BEGIN, YAML_END, yamlBlock(table), 'BIBLE.md')
    writeFileSync(TOKENS, nextCss)
    writeFileSync(BIBLE, nextBible)
    const n = Object.values(table).reduce((s, t) => s + Object.keys(t).length, 0)
    console.log(`ramp: wrote ${n} tones for ${RAMPED.length} inks`)
  }
}
