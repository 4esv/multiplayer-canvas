// The case-study figures, drawn on the cell.
//
//   node scripts/img/figures.mjs          rewrite every figure in content/
//   node scripts/img/figures.mjs --check  exit 1 if a figure is stale
//
// A figure is composed from the toolkit, never hand-written SVG (BIBLE.md section 10): every mark is
// a whole number of HALF CELLS, the lattice the label hand already rides,
// and every box edge lands on a whole cell. What comes out is one inline
// <svg> of axis-aligned rectangles, crispEdges, with no curve, no circle, no
// rotation and no opacity: off-cell.mjs's own on-the-cell test. It
// composes the sprite rows; it adds no row.
//
// Words are the type face: the pixel
// face is for hero titles and the logo glyph, and a figure is read with the
// prose it sits in. A word is an svg <text> with no face of its own;
// case-study.css sets it in DotGothic16 at 16px, the ladder's first rung.
// Where a word goes is worked out here from the face's own advance widths,
// read from the woff2 the page serves, so a wrap, a chip and a button still
// hold their words, and the browser guard (scripts/verify/figure-fit.mjs)
// measures what actually painted.
//
// Colour is a letter a mark, the sprite alphabet (pixel-sprite.js): k ink,
// p ground, m mute, b brick, s sage, r recess, x a quoted host's button blue
// and y the label set on it. The class is the letter behind f- (f-k, f-p):
// a bare .k is the kit's. case-study.css paints the letters from the
// tokens, for the white page a case study stands on: p is the white there.
// There is no lavender: a mark that stood out in it
// stands out in ink, with its words in the sheet.
//
// A figure's aria-label is READ from the markdown and written back as it
// was, and every label in the old drawing is in the new one: a figure is
// redrawn, never cut. Wrapping a long label onto two lines is the only
// liberty taken with its words.
//
// Size. A narrow figure is at most 76 cells (304 px) wide: with the figure's
// own padding and edge that is the 342 px column a 390 px phone leaves, so it
// draws at one to one there. The two screen redraws (the board, the builder)
// are wider than any phone, and a screen scrolled sideways in a box is a
// figure a phone cannot read. So each is drawn twice,
// the screen and the same screen stood up in a narrow figure's width, and
// case-study.css shows the one its box has room for. Nothing scrolls; a
// drawing only ever scales down, to the width its box has.
import { readFileSync, writeFileSync } from 'node:fs'
import { brotliDecompressSync } from 'node:zlib'

const NARROW = 152 // half cells: 76 cells, 304 px

// ---- the body face's widths ------------------------------------------------------
// The type face's advance widths (DotGothic16, the face the kit vendors),
// read from its woff2's cmap and hmtx. WOFF 2 keeps every table in one
// brotli stream behind a packed directory; glyf and loca may be transformed,
// and hmtx may be too, but a transformed hmtx still leads with the advances
// (after one flags byte), which is all this reads. Kerning (GPOS) is left
// out: a word measures a hair wider than it paints, which is the safe side.
const WOFF2_TAGS = (
  'cmap head hhea hmtx maxp name OS/2 post cvt  fpgm glyf loca prep CFF  VORG EBDT ' +
  'EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH ' +
  'CBDT CBLC COLR CPAL SVG  sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar ' +
  'gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill'
)
  .match(/.{4}\s?/g)
  .map((t) => t.slice(0, 4))
function woff2Tables(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('figures: the face is not a woff2')
  if (buf.readUInt32BE(4) === 0x74746366) throw new Error('figures: a font collection is not read')
  let at = 48
  const base128 = () => {
    let n = 0
    for (let i = 0; i < 5; i++) {
      const b = buf[at++]
      n = n * 128 + (b & 0x7f)
      if (!(b & 0x80)) return n
    }
    throw new Error('figures: a bad UIntBase128')
  }
  const dir = []
  for (let i = 0; i < buf.readUInt16BE(12); i++) {
    const flags = buf[at++]
    let tag = WOFF2_TAGS[flags & 0x3f]
    if ((flags & 0x3f) === 63) ((tag = buf.toString('latin1', at, at + 4)), (at += 4))
    const version = flags >> 6
    const orig = base128()
    // glyf and loca are transformed at version 0; every other table at 1..3
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0
    dir.push({ tag, transformed, length: transformed ? base128() : orig })
  }
  const data = brotliDecompressSync(buf.subarray(at, at + buf.readUInt32BE(20)))
  const t = {}
  let o = 0
  for (const { tag, transformed, length } of dir) {
    t[tag] = data.subarray(o, o + length)
    t[tag].transformed = transformed
    o += length
  }
  return t
}
const FACE = (() => {
  const t = woff2Tables(
    readFileSync(new URL('../../src/static/fonts/dotgothic16-regular.woff2', import.meta.url))
  )
  const upem = t.head.readUInt16BE(18)
  const metrics = t.hhea.readUInt16BE(34)
  // untransformed: (advance, lsb) pairs; transformed: a flags byte, then advances
  const advance = t.hmtx.transformed
    ? (g) => t.hmtx.readUInt16BE(1 + 2 * Math.min(g, metrics - 1))
    : (g) => t.hmtx.readUInt16BE(4 * Math.min(g, metrics - 1))
  // cmap: the Windows Unicode BMP subtable, format 4
  const { cmap } = t
  let sub = -1
  for (let i = 0; i < cmap.readUInt16BE(2); i++) {
    const o = 4 + i * 8
    if (cmap.readUInt16BE(o) === 3 && cmap.readUInt16BE(o + 2) === 1) sub = cmap.readUInt32BE(o + 4)
  }
  if (sub < 0 || cmap.readUInt16BE(sub) !== 4) throw new Error('figures: no format 4 cmap')
  const segs = cmap.readUInt16BE(sub + 6) / 2
  const ends = sub + 14
  const starts = ends + segs * 2 + 2
  const deltas = starts + segs * 2
  const ranges = deltas + segs * 2
  const glyph = (code) => {
    for (let i = 0; i < segs; i++) {
      if (cmap.readUInt16BE(ends + i * 2) < code) continue
      const start = cmap.readUInt16BE(starts + i * 2)
      if (start > code) return 0
      const delta = cmap.readUInt16BE(deltas + i * 2)
      const range = cmap.readUInt16BE(ranges + i * 2)
      if (!range) return (code + delta) & 0xffff
      const g = cmap.readUInt16BE(ranges + i * 2 + range + (code - start) * 2)
      return g && (g + delta) & 0xffff
    }
    return 0
  }
  return {
    // in em
    width: (s) => [...s].reduce((w, ch) => w + advance(glyph(ch.codePointAt(0))) / upem, 0),
    // the line box a browser gives a word: the face's ascent over its descent
    ascent: t.hhea.readInt16BE(4) / upem,
    descent: -t.hhea.readInt16BE(6) / upem,
  }
})()
// a face is a size in half cells and the line it stands on: the label at the
// type face's 16px, the name too (case-study.css sets both): 16 is the
// ladder's first rung, and DotGothic16 is crisp there and at nothing smaller
const FACES = { label: { size: 8, line: 12 }, display: { size: 8, line: 12 } }

// ---- the drawing -------------------------------------------------------------
class Fig {
  constructor(w) {
    this.w = w
    this.h = 0
    this.marks = [] // [cls, d] a path, or [cls, null, word] a word
  }
  grow(y) {
    this.h = Math.max(this.h, y)
  }
  rect(x, y, w, h, cls) {
    if (w <= 0 || h <= 0) return
    this.marks.push([cls, `M${x} ${y}h${w}v${h}h-${w}z`])
    this.grow(y + h)
  }
  // an edge one half cell deep, inside the box; `dash` breaks it into runs
  frame(x, y, w, h, cls, dash = 0) {
    const run = (x0, y0, len, horiz) => {
      if (!dash) return horiz ? this.rect(x0, y0, len, 1, cls) : this.rect(x0, y0, 1, len, cls)
      for (let i = 0; i < len; i += dash * 2) {
        const n = Math.min(dash, len - i)
        horiz ? this.rect(x0 + i, y0, n, 1, cls) : this.rect(x0, y0 + i, 1, n, cls)
      }
    }
    run(x, y, w, true)
    run(x, y + h - 1, w, true)
    run(x, y + 1, h - 2, false)
    run(x + w - 1, y + 1, h - 2, false)
  }
  box(x, y, w, h, { fill = 'p', edge = 'k', dash = 0 } = {}) {
    if (fill) this.rect(x, y, w, h, fill)
    if (edge) this.frame(x, y, w, h, edge, dash)
  }
  // `y` is the top of the word's line; its box sits centred on the line
  text(x, y, s, cls = 'k', face = 'label', anchor = 'start') {
    const w = width(s, face)
    const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x
    // a word past the drawing's edge is a label cut off: refuse it
    if (left < 0 || left + w > this.w) throw new Error(`figures: "${s}" leaves the drawing`)
    const { size, line } = FACES[face]
    // the word's box (ascent to descent, what a browser measures) centred on
    // its line, so no word pokes past the line it was given
    const base = Math.round((y + line / 2 + ((FACE.ascent - FACE.descent) * size) / 2) * 10) / 10
    const attrs = `x="${x}" y="${base}"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}`
    const word = s.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    this.marks.push([
      cls,
      null,
      `<text class="f-${cls}${face === 'display' ? ' n' : ''}" ${attrs}>${word}</text>`,
    ])
    this.grow(y + line)
  }
  textC(cx, y, s, cls = 'k', face = 'label') {
    this.text(cx, y, s, cls, face, 'middle')
  }
  textR(rx, y, s, cls = 'k', face = 'label') {
    this.text(rx, y, s, cls, face, 'end')
  }
  sprite(rows, x, y) {
    rows.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        if (ch !== '.') this.rect(x + dx, y + dy, 1, 1, ch)
      })
    )
  }
  svg(label, cls = 'cellfig') {
    const W = even(this.w)
    const H = even(this.h)
    // draw order is paint order; a run of marks in one colour is one path
    const runs = []
    for (const [c, d, word] of this.marks) {
      const last = runs[runs.length - 1]
      if (d === null) runs.push([c, null, word])
      else if (last && last[0] === c && last[1] !== null) last[1] += d
      else runs.push([c, d])
    }
    const marks = runs.map(([c, d, word]) => word ?? `<path class="f-${c}" d="${d}"/>`).join('')
    return (
      `<svg class="${cls}" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}" ` +
      `shape-rendering="crispEdges" role="img" aria-label="${label}">${marks}</svg>`
    )
  }
}
const even = (n) => n + (n % 2)
// a word's width in half cells, rounded up to the next one
const width = (s, face = 'label') => Math.ceil(FACE.width(s) * FACES[face].size)
// words onto lines no wider than `max`, breaking only at spaces
function wrapText(s, face, max) {
  const lines = []
  for (const word of s.split(' ')) {
    const last = lines[lines.length - 1]
    if (last !== undefined && width(`${last} ${word}`, face) <= max)
      lines[lines.length - 1] += ` ${word}`
    else lines.push(word)
  }
  return lines
}
const LINE = FACES.label.line
const LEAD = 2
// a box of wrapped label lines, centred, sized to hold them
function stepBox(f, x, y, w, s, { fill = 'p', edge = 'k', ink = 'k', dash = 0, pad = 5 } = {}) {
  const lines = wrapText(s, 'label', w - 12)
  const h = even(pad * 2 + lines.length * LINE + (lines.length - 1) * LEAD)
  f.box(x, y, w, h, { fill, edge, dash })
  lines.forEach((ln, i) => f.textC(x + w / 2, y + pad + i * (LINE + LEAD), ln, ink))
  return h
}
// a connector straight down, ending in an arrowhead when asked
function down(f, cx, y, len, { cls = 'k', head = false, dash = 0 } = {}) {
  if (dash)
    for (let i = 0; i < len; i += dash * 2) f.rect(cx, y + i, 1, Math.min(dash, len - i), cls)
  else f.rect(cx, y, 1, len - (head ? 3 : 0), cls)
  if (head)
    f.sprite(
      ARROW.map((r) => r.replaceAll('k', cls)),
      cx - 3,
      y + len - 4
    )
}

// ---- sprites (half cells) -----------------------------------------------------
const ARROW = ['kkkkkkk', '.kkkkk.', '..kkk..', '...k...']

// ---- the figures ---------------------------------------------------------------
const FIGURES = [
  {
    file: 'example-case-study',
    title: 'The flow',
    size: 'fig-narrow',
    draw() {
      const f = new Fig(NARROW)
      const steps = ['an order arrives by email', 'read it off the PDF', 'file it in the system']
      let y = 0
      steps.forEach((s, i) => {
        y += stepBox(f, 0, y, NARROW, s)
        if (i < steps.length - 1) {
          down(f, NARROW / 2, y, 8, { head: true })
          y += 8
        }
      })
      y += 8
      stepBox(f, 0, y, NARROW, 'any step fails: the order waits for a person', {
        fill: 'b',
        ink: 'p',
      })
      return f
    },
  },
]

// ---- into the markdown ------------------------------------------------------------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function render(src, fig) {
  const re = new RegExp(
    `(<(?:section|figure) class="figure )(fig-\\w+)(">\\s*<p class="figure-title">${esc(fig.title)}</p>\\s*)(<svg\\b[\\s\\S]*?</svg>)(<svg class="cellfig(?: cf-ui)? cf-narrow"[\\s\\S]*?</svg>)?`
  )
  const m = re.exec(src)
  if (!m) throw new Error(`figures: no figure titled "${fig.title}" in ${fig.file}.md`)
  const label = /aria-label="([^"]*)"/.exec(m[4])?.[1]
  if (!label) throw new Error(`figures: "${fig.title}" has no aria-label to keep`)
  // A UI STANDS AS ITSELF: a figure that is a screen is marked cf-ui, and the page shows
  // it with no box round it and no "the board" over it (canvas-home.css).
  const ui = fig.ui ? ' cf-ui' : ''
  const svg = fig.narrow
    ? fig.draw().svg(label, `cellfig${ui} cf-wide`) +
      fig.narrow().svg(label, `cellfig${ui} cf-narrow`)
    : fig.draw().svg(label, `cellfig${ui}`)
  return src.replace(re, () => `${m[1]}${fig.size}${m[3]}${svg}`)
}

const check = process.argv.includes('--check')
if (import.meta.url === `file://${process.argv[1]}`) {
  let stale = 0
  const files = [...new Set(FIGURES.map((f) => f.file))]
  for (const file of files) {
    const path = new URL(`../../content/feed/${file}.md`, import.meta.url)
    const before = readFileSync(path, 'utf8')
    let after = before
    for (const fig of FIGURES.filter((f) => f.file === file)) after = render(after, fig)
    if (after === before) continue
    stale++
    if (check) console.error(`stale: content/feed/${file}.md`)
    else writeFileSync(path, after)
  }
  if (check && stale) process.exit(1)
  console.log(check ? 'figures: all current' : `figures: rewrote ${stale} file(s)`)
}
