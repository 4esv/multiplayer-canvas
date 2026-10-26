// test/contrast.test.js
// Contrast, measured on the tokens rather than on the fourteen component pairs
// the design contract happens to declare.
//
// `design.md lint BIBLE.md` reads the frontmatter, and the frontmatter is a
// hand-kept summary: sixteen colors, fourteen component pairs. It passed with
// zero findings while a real failure shipped: --cv-brick had no dark
// counterpart at all, so nothing described the 3.17:1 it rendered at night
// under a 20px pull-quote and a 13px figure label. And the --guest-* tokens,
// the whole quotation law, are not in the frontmatter and are matched
// by no other guard: test/bible-sync.test.js filters on `--cv-`, so a guest ink
// is invisible to it by construction.
//
// This guard reads canvas-tokens.css through the shared resolver and takes the
// census. Every token lands in exactly one of three states, and the difference
// between the last two is the whole point of the file:
//
//   GATED       the standard covers this use and we meet it. Breaking it fails
//               the build.
//   OUT OF THE  the standard does not reach this use at all. SC 1.4.3 governs
//   STANDARD    text; SC 1.4.11 governs UI components and graphical objects
//               REQUIRED to understand the content. A cut-out illustration
//               fill is neither, and neither is a hairline on a card that its
//               own type and shadow already identify. Measured and printed so
//               the number stays visible, never gated. `scope: 'none'`, and the
//               reason says which clause fails to reach it.
//   DEBT        the standard DOES cover this use and we do not meet it yet.
//               Frozen in KNOWN_CONTRAST_DEBT, asserted exactly, so it cannot
//               grow. The reason says what the fix is and why it is not here.
//
// Those are different states and they used to be one list. A guard that fails
// on things the standard does not require is a guard people learn to override,
// and an exemption that does not say WHY is indistinguishable from a bug that
// nobody got to.
//
// Every scope call below was traced to its consumers rather than guessed: which
// property the token is painted with, and for an SVG `fill` whether the element
// is a <text> (which is text) or a shape (which is not). Where the answer moved
// a token, the consumer is named in the reason.
//
// A color token with no classification fails here, which is the property the
// frontmatter could not have.
//
// APCA Lc rides along as a second opinion and never fails anything. The apca-w3
// package is deliberately not a dependency: its licence expired 2022-12-31 and
// forbids commercial use, and it pulls an AGPL dependency into an MIT repo. The
// formula below is the published SAPC-APCA 0.1.9 constants, checked in the
// first test against the reference values.
//
// Native pairs have no allowlist: a --cv-* pair the standard covers must pass,
// full stop. Only the guests, whose colors are citations of somebody else's UI,
// can carry debt, because raising one amends the quotation law rather than a
// token.
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveTokens, parseColorMix, isColorMix } from './lib/css-tokens.js'

const ROOT = join(import.meta.dirname, '..')
const TOKENS = 'primitives/kit/canvas-tokens.css'
const css = readFileSync(join(ROOT, TOKENS), 'utf8')
const cv = resolveTokens(css, { prefix: '--cv-' })
const guest = resolveTokens(css, { prefix: '--guest-' })

// ------------------------------------------------------------------ color

const HEX = /^#([0-9a-f]{3,8})$/i
const RGB_FN = /^rgba?\(([^)]*)\)$/i

// { r, g, b, a } for any color the token file can hold, or null when the value
// is not a color at all (a length, a duration, a face stack, the border
// shorthand). null is the census signal, not an error.
export function toRgba(value) {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  const hex = HEX.exec(v)
  if (hex) {
    const h = hex[1]
    const wide = h.length <= 4 ? [...h].map((c) => c + c).join('') : h
    if (wide.length !== 6 && wide.length !== 8) return null
    const n = (i) => parseInt(wide.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: wide.length === 8 ? n(6) / 255 : 1 }
  }
  const fn = RGB_FN.exec(v)
  if (fn) {
    // both spellings: rgb(a, b, c) and the modern rgb(a b c / d)
    const parts = fn[1]
      .replace('/', ' ')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
    if (parts.length < 3 || parts.some(Number.isNaN)) return null
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }
  if (isColorMix(v)) return mixToRgba(v)
  return null
}

// color-mix() is the browser's job, so the resolver hands it back as a string.
// srgb is the only space the token file mixes in.
//
// WARNING: the blend is PREMULTIPLIED, which is the whole point when one stop
// is `transparent`. Averaging the raw channels instead makes
// `color-mix(in srgb, #edefe8 26%, transparent)` come out near-black at 26%
// alpha, so the site's own hairline reads as a dark line on dark ground and
// every number computed from it is wrong in the flattering direction.
function mixToRgba(value) {
  const mix = parseColorMix(value)
  if (!mix || !/^srgb$/i.test(mix.space) || mix.stops.length !== 2) return null
  const stops = mix.stops.map((s) => ({ rgba: toRgba(s.color), percent: s.percent }))
  if (stops.some((s) => !s.rgba)) return null
  const [a, b] = stops
  const pa = a.percent ?? (b.percent === null ? 50 : 100 - b.percent)
  const pb = b.percent ?? 100 - pa
  const total = pa + pb
  if (!total) return null
  const alpha = (a.rgba.a * pa + b.rgba.a * pb) / total
  // premultiply, average, un-premultiply
  const chan = (k) =>
    alpha === 0 ? 0 : (a.rgba[k] * a.rgba.a * pa + b.rgba[k] * b.rgba.a * pb) / total / alpha
  return { r: chan('r'), g: chan('g'), b: chan('b'), a: alpha }
}

// Source-over composite. A translucent ink is only ever seen against the ground
// it sits on, so contrast is computed on what the eye receives.
const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
})

const hexOf = ({ r, g, b }) =>
  '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')

// ----------------------------------------------------------------- WCAG 2

// WCAG 2.x relative luminance: the sRGB transfer curve undone, then the
// 0.2126/0.7152/0.0722 coefficients.
const channel = (c) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const luminance = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

export function wcag(fg, bg) {
  const a = luminance(fg)
  const b = luminance(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

// -------------------------------------------------------------------- APCA

// SAPC-APCA 0.1.9 (the W3C draft's published constants), reimplemented here
// because the reference package's licence does not permit this use. Reported,
// never gated: it reads perceptual lightness contrast, so it disagrees with
// WCAG 2 on exactly the mid-tone hues this palette is made of, and a second
// opinion is worth having next to the number that gates.
const apcaY = ({ r, g, b }) => {
  const y =
    0.2126729 * Math.pow(r / 255, 2.4) +
    0.7151522 * Math.pow(g / 255, 2.4) +
    0.072175 * Math.pow(b / 255, 2.4)
  // soft black clamp: near-black loses contrast faster than the curve says
  return y < 0.022 ? y + Math.pow(0.022 - y, 1.414) : y
}

export function apcaLc(text, bg) {
  const yt = apcaY(text)
  const yb = apcaY(bg)
  if (Math.abs(yb - yt) < 0.0005) return 0
  if (yb > yt) {
    // normal polarity: dark text on light ground
    const s = (Math.pow(yb, 0.56) - Math.pow(yt, 0.57)) * 1.14
    return s < 0.1 ? 0 : (s - 0.027) * 100
  }
  // reverse polarity: light text on dark ground, reported negative
  const s = (Math.pow(yb, 0.65) - Math.pow(yt, 0.62)) * 1.14
  return s > -0.1 ? 0 : (s + 0.027) * 100
}

// ------------------------------------------------------------------- pairs

// `scope` is what the standard says about the pair, not how badly we want it to
// pass. Every value here was traced to the token's consumers.
//
//   'text'    SC 1.4.3 at AA, 4.5:1.
//   'large'   SC 1.4.3's own allowance for text at 24px or 19px bold, 3:1.
//   'graphic' SC 1.4.11, 3:1: a UI component boundary, or a mark carrying
//             information no adjacent text carries.
//   'none'    neither clause reaches this use. Measured and printed, never
//             gated, and the reason says which clause fails to reach it.
const BAR = { text: 4.5, large: 3, graphic: 3, none: 0 }

const NATIVE = [
  {
    fg: 'ink',
    bg: 'ground',
    scope: 'text',
    why: '33 `color:` rules across the canvas, the sheet and the entry chain',
  },
  {
    fg: 'ground',
    bg: 'ink',
    scope: 'text',
    why: 'the inverted pair: 28 `color:` rules (hero doors, chips, pressed controls)',
  },
  {
    fg: 'mute',
    bg: 'ground',
    scope: 'text',
    why: '40 `color:` rules, plus 12 and 13px <text> labels in the study figures',
  },
  {
    fg: 'ink',
    bg: 'surface',
    scope: 'text',
    why: 'every card, control and sheet stands on the surface (canvas-home.css .cell, #sheet, #search, #cmds) and sets its type in ink',
  },
  {
    fg: 'mute',
    bg: 'surface',
    scope: 'text',
    why: 'the meta line inside a card (.lbl, .summary dates, the tag chips, the status rows) is mute on the surface',
  },
  {
    fg: 'surface',
    bg: 'ground',
    scope: 'none',
    why: 'NOT COVERED: the surface is one tonal step off the ground, a ground and not an ink. The card is identified by its hairline and its own type; SC 1.4.11 does not ask the ground to contrast with the ground under it',
  },
  {
    fg: 'brick',
    bg: 'ground',
    scope: 'text',
    why: 'entry links and every aphorism strong at 20px (entry.css, case-study.css, since lavender was retired) and :208 `.num.bad` at 26px; footnote refs are ink since the kit',
  },
  {
    fg: 'sage',
    bg: 'ground',
    scope: 'large',
    why: 'its live `color:` consumer is the 26px readout at case-study.css:205, which case-study.css already documents as clearing the large-text bar in place. DEBT-ADJACENT: :125 `.aphorism-sage strong` would set it at 20px where 4.5:1 applies and sage is 3.62:1, but no content uses that selector, so nothing renders it today',
  },
  {
    fg: 'code-ink',
    bg: 'code-bg',
    scope: 'text',
    why: 'canvas-home.css:2127, One Dark quoted verbatim',
  },
  {
    fg: 'ink-fixed',
    bg: 'ground-fixed',
    scope: 'text',
    why: 'the print anchors, entry.css:212-214 inside @media print',
  },
  {
    fg: 'brick-fixed',
    bg: 'ground',
    scope: 'none',
    why: 'NOT COVERED: a sprite fill, not text and not a component state. Its one consumer is Maurice the ladybug (canvas-home.css .t-bug .mark .b), a content sprite that keeps his daylight red both ways the way BIBLE section 13 keeps the illustrations in theirs; his name under him is set in the ink like every label',
  },

  {
    fg: 'ink',
    bg: 'recess',
    scope: 'text',
    why: 'the about and work zones are cut INTO the ground (canvas-home.css .t-zone .cell.zonecell): their title, their block heads and every word of their copy are set in the ink on the recess floor',
  },

  // ---- the second ground and the kit. The parts are
  // dithered pictures (src/lib/kit-parts.js) on the grey ramp deep, ink,
  // mute, mid, ground, bright and the brick ramp; each row names the face of
  // kit.css that sets the pair.
  {
    fg: 'ink',
    bg: 'white',
    scope: 'text',
    why: 'the second ground by decision: case-study pages set their prose in the ink on white (BIBLE section 6)',
  },
  {
    fg: 'mute',
    bg: 'white',
    scope: 'text',
    why: 'the meta line of a case-study page, on the white ground',
  },
  {
    fg: 'bright',
    bg: 'ink',
    scope: 'text',
    why: 'kit.css .k-btn:hover, .k-solid, .k-flap: light on dark, regular weight',
  },
  {
    fg: 'bright',
    bg: 'brick',
    scope: 'text',
    why: 'kit.css .k-btn:active and .k-solid:hover: the armed face carries its label in bright',
  },
  {
    fg: 'bright',
    bg: 'mute',
    scope: 'text',
    why: 'kit.css .k-hw.is-down and .k-rk.is-down: the label on the pressed face, whose ground is the mute grey of the btn-down part',
  },
  {
    fg: 'deep',
    bg: 'ground',
    scope: 'text',
    why: 'kit.css .k-hw:hover, .k-rk:hover, .k-key:hover: the label steps to the deep on the lit face, whose ground is the ground grey of the btn-up part',
  },
  {
    fg: 'ink',
    bg: 'bright',
    scope: 'graphic',
    why: 'kit.css .k-scope: an ink cell on the bright screen is the drawing; .k-check:hover: the box on its lit ground',
  },
  {
    fg: 'brick',
    bg: 'bright',
    scope: 'graphic',
    why: 'kit.css .k-scope .is-live: the live trace on the bright screen',
  },
  {
    fg: 'brick-light',
    bg: 'brick-deep',
    scope: 'graphic',
    why: 'kit-parts.js lamp and call: the lit jewel against the dark one, the one bit a lamp carries',
  },
  {
    fg: 'mid',
    bg: 'bright',
    scope: 'none',
    why: 'NOT COVERED: the dot ground of the scope and the turned half of a part face. Texture, not information: the trace and the pointer carry the state',
  },

  // ---- out of the standard's reach. Each reason names the clause that misses.
  {
    fg: 'ochre',
    bg: 'ground',
    scope: 'none',
    why: 'NOT COVERED, not unfixed: no text and no UI component. Its one consumer is a `fill:` on illustration cells (the `.o` sprite cell in instruments.css: the ukulele body and the cymbals, always inside an ink outline) and there is not one `color:` use in the tree. SC 1.4.3 governs text; SC 1.4.11 governs components and graphical objects required to understand content. A decorative illustration fill is neither, and the ink outline every sprite is closed in (BIBLE section 10) is what carries the shape',
  },
  {
    fg: 'line',
    bg: 'ground',
    scope: 'none',
    why: 'NOT COVERED: a separator, not identifying information. All nine uses are a rule between rows or an edge on a card that its own type, background and shadow already identify (canvas-home.css 351, 440, 520, 896, 915, 986, 2145, 2254, 2365). SC 1.4.11 asks for the visual information REQUIRED to identify a component or its state; none of these carry it. Raising it to 3:1 is the slab border the reskin removed on purpose',
  },
  {
    fg: 'grid',
    bg: 'ground',
    scope: 'none',
    why: 'NOT COVERED: texture, not information. The module lattice drawn on the ground (canvas-home.css #grid, BIBLE section 2), one device pixel at 9% ink. Nothing is identified by it: every tile edge it coincides with is drawn by the tile. SC 1.4.11 does not reach a background pattern, and a forced palette drops it outright (forced-ok in the stylesheet) with nothing lost',
  },
  {
    fg: 'grid-fine',
    bg: 'ground',
    scope: 'none',
    why: 'NOT COVERED: the cell lattice under the module lattice, 5% ink, faded in only where a cell is wide enough on the device to hold a line and ground on both sides (app.js renderGrid). Same status as grid: a texture the design survives without, which is what a forced palette gets',
  },
  {
    fg: 'scrim',
    bg: 'ground',
    scope: 'none',
    why: 'NOT COVERED: the sheet dimmer is the ground being contrasted against, not an ink on it',
  },
]

// The quotation law's inks, against the ground each is actually painted on.
// Most are consumed by REBINDING a native chrome token inside a .q-* rule
// (canvas-home.css 224-257), so a guest ink inherits the scope of the --cv-*
// token it stands in for: *-ink becomes --cv-ink, *-mute becomes --cv-mute,
// *-line becomes --cv-line. The accents are painted directly and were checked
// one at a time.
const GUESTS = [
  // ---- out of the standard's reach, for the same reasons their native
  // counterparts are. A guest hairline is a hairline.
  {
    fg: 'sky-day-1',
    bg: 'sky-day-2',
    scope: 'none',
    why: 'NOT COVERED: the day sky in the weather window (primitives/sky/outlook.js) is a picture, not a ground. Nothing is written on it (the reading sits on the ground plate in the frame, ink on ground, covered natively). SC 1.4.3 and 1.4.11 reach neither',
  },
  {
    fg: 'sky-night-1',
    bg: 'sky-night-2',
    scope: 'none',
    why: 'NOT COVERED: the night half of the same pictured sky, for the same reason: no text and no component is drawn on it',
  },
  {
    fg: 'sky-rose',
    bg: 'sky-glow',
    scope: 'none',
    why: "NOT COVERED: the low sun's horizon bands at dawn and sunset in the same pictured sky; no text and no component is drawn on them",
  },
  {
    fg: 'sky-sun',
    bg: 'sky-day-1',
    scope: 'none',
    why: "NOT COVERED: the sun's face in the same pictured sky, a picture of the sun rather than information SC 1.4.11 requires; the condition is in the tile's label",
  },
]

// One Dark, quoted whole with its own ground (the syntax theme block of the
// tokens). Its names are --cv-*, but its values are its creator's, the way a
// guest's are its host's: highlight.css paints every highlight.js class with
// them, 13px Hasklig on the code ground, which is text, so every hue is
// scoped 'text' and measured, and a miss is quotation debt, not a native
// failure.
const SYNTAX = [
  {
    fg: 'code-comment',
    bg: 'code-bg',
    scope: 'text',
    why: 'comments and quotes (.hljs-comment, .hljs-quote)',
  },
  {
    fg: 'code-keyword',
    bg: 'code-bg',
    scope: 'text',
    why: 'keywords, doc tags, formulas (.hljs-keyword)',
  },
  {
    fg: 'code-name',
    bg: 'code-bg',
    scope: 'text',
    why: 'names, sections, selector tags, substitutions, deletions (.hljs-name)',
  },
  {
    fg: 'code-literal',
    bg: 'code-bg',
    scope: 'text',
    why: 'literals (.hljs-literal) on the code ground',
  },
  {
    fg: 'code-string',
    bg: 'code-bg',
    scope: 'text',
    why: 'strings, regexps, attributes, additions (.hljs-string)',
  },
  {
    fg: 'code-number',
    bg: 'code-bg',
    scope: 'text',
    why: 'numbers, types, variables, selector classes (.hljs-number)',
  },
  {
    fg: 'code-title',
    bg: 'code-bg',
    scope: 'text',
    why: 'titles, links, symbols, bullets, meta (.hljs-title)',
  },
  {
    fg: 'code-class',
    bg: 'code-bg',
    scope: 'text',
    why: 'built-ins and class names (.hljs-built_in, .hljs-title.class_)',
  },
]

// DEBT: the standard DOES cover these and we do not meet them. Frozen and
// asserted exactly, so a new one breaks the build and a fixed one has to be
// struck off deliberately. Only quotations may appear here (the guests, and
// One Dark): a native pair the standard covers has no allowlist and must
// simply pass.
//
// Every entry is somebody else's published UI quoted verbatim (BIBLE.md
// section 1). The fix is one amendment to the quotation law, deriving the ink
// with contrast-color() against the host's own ground, which is a decision
// about how faithful a quotation has to be. It is not a value edit here.
const KNOWN_CONTRAST_DEBT = {
  // measured when One Dark moved out of highlight.css into the tokens: the
  // hex had always shipped, it was only ever out of this census's sight
  'both  code-comment on code-bg':
    "One Dark's comment grey on its own ground, 2.32:1. The theme's comments are meant to recede",
  'both  code-name on code-bg':
    "One Dark's red on its own ground, 4.38:1, a hair under the text minimum",
}

// ------------------------------------------------------------------- rows

function colorOf(tokens, name, theme) {
  const value = tokens[theme][name]
  assert.ok(value !== undefined, `contrast: no token --${name} (${theme})`)
  const rgba = toRgba(value)
  assert.ok(rgba, `contrast: --${name} (${theme}) is not a color: ${JSON.stringify(value)}`)
  return rgba
}

// One measured row per pair per theme, collapsed to a single "both" row when
// the pair resolves identically light and dark (every pinned guest, and the
// code block). Keeps the table and the frozen list readable.
function measure(tokens, pairs) {
  const out = []
  for (const pair of pairs) {
    const per = ['light', 'dark'].map((theme) => {
      const fg = colorOf(tokens, pair.fg, theme)
      const bg = colorOf(tokens, pair.bg, theme)
      const seen = over(fg, bg)
      return {
        theme,
        pair,
        fg: hexOf(seen),
        bg: hexOf(bg),
        ratio: wcag(seen, bg),
        lc: apcaLc(seen, bg),
      }
    })
    const same = per[0].fg === per[1].fg && per[0].bg === per[1].bg
    out.push(...(same ? [{ ...per[0], theme: 'both' }] : per))
  }
  return out.map((row) => {
    const bar = BAR[row.pair.scope]
    assert.ok(bar !== undefined, `contrast: unknown scope ${JSON.stringify(row.pair.scope)}`)
    return {
      ...row,
      bar,
      gated: row.pair.scope !== 'none',
      label: `${row.theme.padEnd(5)} ${row.pair.fg} on ${row.pair.bg}`,
      pass: row.ratio >= bar,
    }
  })
}

const nativeRows = measure(cv, NATIVE)
const guestRows = measure(guest, GUESTS)
const syntaxRows = measure(cv, SYNTAX)
const quotedRows = [...guestRows, ...syntaxRows]
const allRows = [...nativeRows, ...quotedRows]

const table = (rows) =>
  rows
    .map(
      (r) =>
        '  ' +
        r.label.padEnd(29) +
        r.fg.padEnd(9) +
        'on ' +
        r.bg.padEnd(10) +
        r.ratio.toFixed(2).padStart(6) +
        ':1  ' +
        r.pair.scope.padEnd(8) +
        (r.gated ? `need ${r.bar.toFixed(1)}` : 'not gated') +
        '  Lc ' +
        r.lc.toFixed(1).padStart(6) +
        (r.gated ? (r.pass ? '  pass' : '  DEBT') : '')
    )
    .join('\n')

// ------------------------------------------------------------------- tests

describe('contrast, measured on the tokens', () => {
  it('the APCA implementation matches the published reference values', () => {
    // The guard against a typo in a constant: if these drift the Lc column is
    // decoration. Reference pairs from the APCA-W3 documentation.
    const at = (t, b) => Number(apcaLc(toRgba(t), toRgba(b)).toFixed(2))
    assert.equal(at('#000000', '#ffffff'), 106.04)
    assert.equal(at('#ffffff', '#000000'), -107.88)
    assert.equal(at('#888888', '#ffffff'), 63.06)
    // and the WCAG side, whose reference is arithmetic: black on white is 21:1
    assert.equal(Number(wcag(toRgba('#000000'), toRgba('#ffffff')).toFixed(2)), 21)
    assert.equal(Number(wcag(toRgba('#777777'), toRgba('#ffffff')).toFixed(2)), 4.48)
  })

  // mutation: contrast.unclassified-color
  it('every color token is classified (the census)', () => {
    // The property the frontmatter could not have: a color added to
    // canvas-tokens.css with no row here is unclassified, and unclassified is
    // how the dark brick shipped at 3.17:1. A token that is not a color (a
    // length, a duration, a face, the border and shadow shorthands) is out of
    // scope by its own value, not by a hand-kept list.
    const classified = new Set()
    for (const p of [...NATIVE, ...SYNTAX]) {
      classified.add(p.fg)
      classified.add(p.bg)
    }
    const unclassified = cv.names.filter(
      (n) => !classified.has(n) && (toRgba(cv.light[n]) || toRgba(cv.dark[n]))
    )
    assert.deepEqual(
      unclassified,
      [],
      `--cv-* colors with no contrast row: ${unclassified.join(', ')}.\n` +
        "Give each a scope: 'text'/'large'/'graphic' if the standard reaches its use, " +
        "or 'none' with the reason it does not."
    )
  })

  // mutation: contrast.unclassified-guest
  it('every guest token is classified (the census)', () => {
    // test/bible-sync.test.js matches --cv- only, so without this line the
    // quotation law's forty-two inks are in no test at all.
    const classified = new Set()
    for (const p of GUESTS) {
      classified.add(p.fg)
      classified.add(p.bg)
    }
    const unclassified = guest.names.filter((n) => !classified.has(n))
    assert.deepEqual(
      unclassified,
      [],
      `--guest-* tokens with no contrast row: ${unclassified.join(', ')}`
    )
    // (seven: the pictured sky in the weather window)
    assert.equal(guest.names.length, 7, 'the guest ink count moved; the quotation law changed')
  })

  it('every scope decision carries a reason', () => {
    // A scope of 'none' is the load-bearing one: it says the standard does not
    // reach this use, which is a claim, and a claim with no reason is
    // indistinguishable from a failure nobody got to. Debt entries carry theirs
    // in KNOWN_CONTRAST_DEBT.
    const thin = allRows.filter((r) => !r.pair.why || r.pair.why.length < 20).map((r) => r.label)
    assert.deepEqual(thin, [], `pairs with no usable reason: ${thin.join(', ')}`)
    const unexplainedExemptions = allRows
      .filter((r) => !r.gated && !/NOT COVERED/.test(r.pair.why))
      .map((r) => r.label)
    assert.deepEqual(
      unexplainedExemptions,
      [],
      'an ungated pair must say NOT COVERED and name the clause that misses it, ' +
        `so it cannot be mistaken for unfixed debt: ${unexplainedExemptions.join(', ')}`
    )
  })

  // mutation: contrast.mute-too-light
  it('the native palette clears WCAG 2, with no allowlist', () => {
    // Native pairs have no debt list on purpose. We own these values.
    // ONE ground since 2026-09-15, so this is one census, not two: the pairs
    // used to be measured light and dark and half of them were only ever
    // right in one of them.
    const failures = nativeRows
      .filter((r) => r.gated && !r.pass)
      .map(
        (r) =>
          `${r.label}: ${r.fg} on ${r.bg} is ${r.ratio.toFixed(2)}:1, needs ${r.bar}:1 ` +
          `(scope ${r.pair.scope}, APCA Lc ${r.lc.toFixed(1)})\n      ${r.pair.why}`
      )
    assert.deepEqual(failures, [], `native contrast failures:\n    ${failures.join('\n    ')}`)
  })

  // mutation: contrast.guest-retuned-unstruck
  it('the quotation debt is exactly the frozen list', () => {
    const failing = quotedRows
      .filter((r) => r.gated && !r.pass)
      .map((r) => r.label)
      .sort()
    const known = Object.keys(KNOWN_CONTRAST_DEBT).sort()
    const added = failing.filter((f) => !known.includes(f))
    const fixed = known.filter((k) => !failing.includes(k))
    assert.deepEqual(
      failing,
      known,
      (added.length
        ? `NEW guest contrast debt (the list must not grow):\n    ${added.join('\n    ')}\n`
        : '') +
        (fixed.length
          ? `guest pairs that now pass: strike them from KNOWN_CONTRAST_DEBT:\n    ${fixed.join('\n    ')}\n`
          : '')
    )
  })

  // The report, printed on every run: a guard whose findings are behind a
  // flag is a guard nobody reads. A hook, not a test: it prints the census
  // and asserts nothing the tests above do not already hold.
  after(() => {
    const gated = allRows.filter((r) => r.gated)
    const debt = gated.filter((r) => !r.pass)
    const lines = [
      '',
      `  --cv-* palette (${cv.names.length} tokens, ${nativeRows.length} pairs, ` +
        `${nativeRows.filter((r) => r.gated).length} gated)`,
      table(nativeRows),
      '',
      `  --guest-* quotations (${guest.names.length} tokens, ${guestRows.length} pairs, ` +
        `${guestRows.filter((r) => r.gated).length} gated)`,
      table(guestRows),
      '',
      `  One Dark, quoted (${syntaxRows.length} pairs)`,
      table(syntaxRows),
      '',
      `  ${gated.length} gated, ${allRows.length - gated.length} out of the standard's reach, ` +
        `${debt.length} frozen as debt (all quotations)`,
      '',
    ]
    console.log(lines.join('\n'))
  })
})
