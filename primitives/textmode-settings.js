// multiplayer-canvas/dither: ordered (Bayer) dither and the textmode settings shape.
// Inputs: a level, a value 0..1 and a pixel position, or a settings object to validate.
// Outputs: BAYER4, bayer(n) rows, bayerLit(t, x, y) -> boolean, bayerGlyph(level),
//   normalize(settings) -> a valid settings object. Pure.
//
// The textmode settings contract: one shape, validated in one place, used by
// the store (services/textmode.js), the API (routes/textmode.js) and the
// browser (js/textmode.js).
//
// It lives in the static tree so both sides import the same file rather than
// a copy of it: node reaches it by path, the browser by URL. routes/home.js
// and static/canvas/layout.js are the same arrangement. Keep it pure and
// dependency-free, since anything it imports ships to the browser too.
//
// The field names are not invented here. They are the ones the Safari
// extension (humanbydefinition/textmode-browser-extension, MIT) feeds to
// textmode.js, so a preset tuned in the extension and a preset tuned on the
// desk describe the same picture and a pipeline can read either. What is
// dropped is what only makes sense over a live page: `enabled` (this tool
// always renders) and `opacity` (there is nothing underneath to blend with).
//
// Everything here is pure and total: normalize() takes anything at all and
// returns a complete, in-range settings object. An out-of-range number is
// clamped and a nonsense value falls back to the default rather than
// erroring, because the caller is a slider or a JSON body, not a programmer.

// seam: test/textmode.test.js
export const COLOR_MODES = Object.freeze(['sampled', 'fixed'])

// The fonts textmode.js can parse that this site already serves. Hasklig is
// the monospace face the code blocks use; `default` is textmode.js's own
// built-in, which needs no URL. A .woff2 is not offered: textmode.js reads
// the file itself (its bundled Typr parser) and takes .ttf, .otf and .woff.
// `bayer` is not a file: it is the ordered-dither tileset below, drawn at
// load (js/textmode-draw.js).
export const FONTS = Object.freeze([
  Object.freeze({ id: 'default', label: 'built-in', src: null }),
  Object.freeze({ id: 'hasklig', label: 'hasklig', src: '/fonts/hasklig-regular.woff' }),
  Object.freeze({ id: 'bayer', label: 'bayer 4x4', src: null }),
])

// seam: test/textmode.test.js
export const FONT_IDS = Object.freeze(FONTS.map((f) => f.id))

// The 18 GPU effects textmode.filters.js installs, in its own catalog order.
// Each is applied as `t.filter(name, amount)`; the ones that take no
// parameter ignore the amount, which is why one slider covers all of them
// instead of a per-filter parameter schema.
export const POST_FX = Object.freeze([
  'invert',
  'grayscale',
  'sepia',
  'threshold',
  'brightness',
  'contrast',
  'saturation',
  'hueRotate',
  'posterize',
  'chromaticAberration',
  'pixelate',
  'gridDistortion',
  'glitch',
  'crtMattias',
  'scanlines',
  'vignette',
  'bloom',
  'filmGrain',
])

// THE ORDERED DITHER. The built-in font cannot make one: its map names the
// CP437 shade blocks, but the sheet draws other pictures in their cells, and
// no glyph in it is solid or a quarter pattern. So the dither is a tileset of
// its own, seventeen 4x4 cells, one per level of the 4x4 Bayer threshold map
// (the one the DitheringShader reference thresholds against): level k lights
// the pixels whose threshold is under k. The glyph for level k is the k-th
// character of BAYER_MAP, so a ramp over them reads most ink first.
// seam: test/textmode.test.js
export const BAYER4 = Object.freeze([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5])
export const BAYER_MAP = '0123456789abcdefg'

/** The 16 pixels (row-major, 1 = lit) of the Bayer glyph for `level` 0..16. */
export function bayerGlyph(level) {
  return BAYER4.map((threshold) => (threshold < level ? 1 : 0))
}

/**
 * Whether the pixel at (x, y) takes the lighter of two inks, for a value `t`
 * 0..1 of the way from the darker to the lighter: the glyph above, asked one
 * pixel at a time, so a picture dithered here and one drawn from the glyphs
 * agree dot for dot.
 */
export function bayerLit(t, x, y) {
  return t > (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16
}

/**
 * The same order at a larger power-of-two side, as rows, grown from BAYER4
 * by the standard doubling: each quadrant is the smaller order times four,
 * plus that quadrant's rank in the 2x2 order (BAYER4's own even corners,
 * 0 2 / 3 1). bayer(4) is BAYER4; the dither frames tile bayer(8).
 */
export function bayer(n) {
  if (!(n >= 4 && (n & (n - 1)) === 0)) throw new RangeError(`no Bayer order of side ${n}`)
  let m = [0, 4, 8, 12].map((i) => BAYER4.slice(i, i + 4))
  while (m.length < n) {
    const s = m.length
    m = Array.from({ length: 2 * s }, (_, y) =>
      Array.from(
        { length: 2 * s },
        (_, x) => 4 * m[y % s][x % s] + BAYER4[8 * (y >= s) + 2 * (x >= s)]
      )
    )
  }
  return m
}

export const LIMITS = Object.freeze({
  fontSize: Object.freeze({ min: 1, max: 64, step: 1 }),
  threshold: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  colorSensitivity: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  amount: Object.freeze({ min: 0, max: 1, step: 0.01 }),
})

const COLOR_RE = /^#[0-9a-f]{6}$/i
// A ramp is ordered dark to light, so a space is meaningful and must survive.
// The cap is generous; the point is to bound a pasted novel, not to style.
const RAMP_MAX = 256
const POST_FX_MAX = 8

// The starting picture: white glyphs on black, the ramp textmode.js ships
// with. These hexes are literals on purpose and are not UI colours. They are
// handed to textmode.js, which takes a concrete string and writes it into a
// WebGL uniform, so a custom property cannot reach them; and they describe
// the artwork, which a person then repaints with the colour inputs. The two
// inks are not the right starting point for a picture: a photo converted
// against #111 comes out muddy where the same photo against black does not.
export function defaults() {
  return {
    fontSize: 8,
    fontId: 'default',
    background: '#000000',
    glyphRamp: ' .:-=+*#%@',
    brightnessEnabled: true,
    invert: false,
    charColorMode: 'sampled',
    charColor: '#ffffff',
    cellColorMode: 'fixed',
    cellColor: '#000000',
    contour: contourDefaults(),
    postFx: [],
  }
}

// The looks a page renders with. Same shape, same validator as any settings
// object `normalize` accepts.
export const PRESETS = Object.freeze({
  // parts: the kit's controls (src/lib/kit-parts.js), rendered in grey from
  // their shading functions and dithered here in the Bayer face at the
  // site cell: 4px, a 4x4 glyph of 1px dots. The full Bayer ramp
  // darkest first and no blank tail, so a grey walks every level. The two
  // colours are placeholders: a part is dithered one band of its ramp at a
  // time, and the bake (scripts/img/bake-parts.mjs) sets the band's two
  // greys, read off canvas-tokens.css, in their place. Nothing else about
  // the look is the bake's to choose.
  parts: Object.freeze(
    normalize({
      fontSize: 4,
      fontId: 'bayer',
      background: '#000000',
      glyphRamp: [...BAYER_MAP].reverse().join(''),
      charColorMode: 'fixed',
      charColor: '#ffffff',
      cellColorMode: 'fixed',
      cellColor: '#000000',
    })
  ),
})

function contourDefaults() {
  return {
    enabled: false,
    invert: false,
    threshold: 0.12,
    colorSensitivity: 0.75,
    charColorMode: 'sampled',
    charColor: '#ffffff',
    cellColorMode: 'fixed',
    cellColor: '#000000',
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function num(value, fallback, min, max) {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function color(value, fallback) {
  return typeof value === 'string' && COLOR_RE.test(value) ? value.toLowerCase() : fallback
}

function mode(value, fallback) {
  return COLOR_MODES.includes(value) ? value : fallback
}

function ramp(value, fallback) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.slice(0, RAMP_MAX)
  // Only whitespace is no ramp at all: every cell would draw a blank and the
  // picture would be a rectangle of background.
  return trimmed.trim() ? trimmed : fallback
}

function normalizeContour(value, fallback = contourDefaults()) {
  const c = isRecord(value) ? value : {}
  return {
    enabled: bool(c.enabled, fallback.enabled),
    invert: bool(c.invert, fallback.invert),
    threshold: num(c.threshold, fallback.threshold, LIMITS.threshold.min, LIMITS.threshold.max),
    colorSensitivity: num(
      c.colorSensitivity,
      fallback.colorSensitivity,
      LIMITS.colorSensitivity.min,
      LIMITS.colorSensitivity.max
    ),
    charColorMode: mode(c.charColorMode, fallback.charColorMode),
    charColor: color(c.charColor, fallback.charColor),
    cellColorMode: mode(c.cellColorMode, fallback.cellColorMode),
    cellColor: color(c.cellColor, fallback.cellColor),
  }
}

// An unknown filter name is dropped rather than defaulted: there is no
// sensible substitute for "glitch", and silently applying a different effect
// would be worse than applying none. The same filter twice is allowed, since
// stacking two passes of one effect is a real thing to want.
function normalizePostFx(value) {
  if (!Array.isArray(value)) return []
  const items = []
  for (const raw of value) {
    if (!isRecord(raw)) continue
    if (!POST_FX.includes(raw.filter)) continue
    items.push({
      filter: raw.filter,
      enabled: bool(raw.enabled, true),
      amount: num(raw.amount, 0.5, LIMITS.amount.min, LIMITS.amount.max),
    })
    if (items.length === POST_FX_MAX) break
  }
  return items
}

// Anything in, complete settings out. `base` is what a partial patch falls
// back to, so PATCH over a stored preset keeps the fields it did not name.
export function normalize(value, base = defaults()) {
  const v = isRecord(value) ? value : {}
  return {
    fontSize: Math.round(num(v.fontSize, base.fontSize, LIMITS.fontSize.min, LIMITS.fontSize.max)),
    fontId: FONT_IDS.includes(v.fontId) ? v.fontId : base.fontId,
    background: color(v.background, base.background),
    glyphRamp: ramp(v.glyphRamp, base.glyphRamp),
    brightnessEnabled: bool(v.brightnessEnabled, base.brightnessEnabled),
    invert: bool(v.invert, base.invert),
    charColorMode: mode(v.charColorMode, base.charColorMode),
    charColor: color(v.charColor, base.charColor),
    cellColorMode: mode(v.cellColorMode, base.cellColorMode),
    cellColor: color(v.cellColor, base.cellColor),
    contour: normalizeContour(v.contour, base.contour),
    postFx: v.postFx === undefined ? base.postFx : normalizePostFx(v.postFx),
  }
}

export function fontSrc(fontId) {
  return FONTS.find((f) => f.id === fontId)?.src ?? null
}
