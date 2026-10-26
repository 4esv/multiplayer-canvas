// What you play on /web-instruments, and what its screens draw. PURE: sizes
// and samples in, rectangles and cells out, no DOM. The page puts one kit
// part on each rectangle (kit.css: the piano keys, the push buttons), so the
// keys, frets and pads are the same pictures of their state as every other
// control on the site, and nothing here draws.
//
// THE LATTICE IS HALF A CELL (U = PX / 2). Sizes are whole cells, and a
// black key centred on the seam between two whites lands on the cell too.
// Nothing to hit is smaller than --cv-ctrl-h (CTRL) on either axis: that is
// the kit's tap floor, and it holds here as drawn, not only in the hit area.
//
// A key or a pad is a baked part, so it is its own size at every width (a
// part is scaled by whole numbers only, U12); a fret grows with the column
// up to a cap. The RANGE never shrinks with the screen: where it does not
// fit, the board is wider than the card and scrolls sideways in it
// (instruments.css .scroll). A ZONE is a rectangle with the thing it plays
// (a note, a pad). The photograph above the card plays nothing.
import { PX, chromeDensity } from './layout.js'

// --cv-ctrl-h, the kit's tap floor (canvas-tokens.css), in css px
export const CTRL = 44

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
// down to the cell
const snap = (v) => Math.floor(v / PX) * PX

export const U = PX / 2

// ---------------------------------------------------------------- keybed

const WHITES = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
// a black key sits on the line between white key i and i + 1
const BLACKS = [
  ['C#', 1],
  ['D#', 2],
  ['F#', 4],
  ['G#', 5],
  ['A#', 6],
]

// two octaves, C4 to B5: enough to play a tune
export const OCTAVES = 2

// the kit's piano keys (kit.css .k-piano), the taller ones from the Synth
// board: a white 22 by 44 cells, a black 12 by 28
export const WHITE = Object.freeze({ w: 22 * PX, h: 44 * PX })
export const BLACK = Object.freeze({ w: 12 * PX, h: 28 * PX })

/**
 * `octaves` octaves of the kit's keys from C`octave` up.
 * @param {{ octave?: number, octaves?: number }} opts
 */
export function keybed({ octave = 4, octaves = OCTAVES } = {}) {
  const n = 7 * octaves
  const ww = WHITE.w
  const h = WHITE.h
  const bw = BLACK.w
  const bh = BLACK.h
  const zones = []
  for (let o = 0; o < octaves; o++)
    WHITES.forEach((name, i) =>
      zones.push({ note: name + (octave + o), x: (7 * o + i) * ww, y: 0, w: ww, h })
    )
  for (let o = 0; o < octaves; o++)
    for (const [name, at] of BLACKS) {
      const x = (7 * o + at) * ww - bw / 2
      zones.push({ note: name + (octave + o), x, y: 0, w: bw, h: bh, black: true })
    }
  return { w: n * ww, h, zones }
}

// ---------------------------------------------------------------- fretboard

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const PC = Object.fromEntries(NAMES.map((n, i) => [n, i]))
export const noteToMidi = (note) => {
  const m = /^([A-G]#?)(-?\d+)$/.exec(note)
  if (!m) throw new Error(`not a note: ${note}`)
  return PC[m[1]] + (Number(m[2]) + 1) * 12
}
export const midiToNote = (n) => NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1)

// The computer keyboard as a keybed, GarageBand's musical typing: the home
// row is the whites from C (a s d f g h j k l ; '), the row above the blacks
// (w e t y u o p), z and x shift the octave down and up. `typed(ch, octave)`
// is the note a key plays with the board at C`octave`, or null. The octave
// is the one control the board has for it (the `octave` radio row on the
// panel): the drawn keys, the typed keys and the sheet's window all move
// with it, so TYPING_OCTAVES is that row's range, C2 to C5, and z and x
// step the row.
export const TYPING = "awsedftgyhujkolp;'"
export const OCTAVE_DOWN = 'z'
export const OCTAVE_UP = 'x'
export const TYPING_OCTAVES = [2, 5]
export function typed(ch, octave) {
  const i = TYPING.indexOf(ch)
  return i < 0 ? null : midiToNote((octave + 1) * 12 + i)
}
export function shiftOctave(ch, octave) {
  const [lo, hi] = TYPING_OCTAVES
  if (ch === OCTAVE_DOWN) return Math.max(lo, octave - 1)
  if (ch === OCTAVE_UP) return Math.min(hi, octave + 1)
  return octave
}

export const FRETS = 9 // the open string and eight frets

/**
 * Strings run across, the open string in the first column, frets to the
 * right, a semitone a fret. One row a string, top string first.
 * @param {number} width css px available
 * @param {string[]} strings open notes, top string first
 */
export function fretboard(width, strings) {
  const cw = clamp(snap(width / FRETS), CTRL, 24 * PX)
  const zones = []
  strings.forEach((open, s) => {
    const base = noteToMidi(open)
    for (let f = 0; f < FRETS; f++)
      zones.push({
        note: midiToNote(base + f),
        string: s,
        fret: f,
        x: f * cw,
        y: s * CTRL,
        w: cw,
        h: CTRL,
      })
  })
  return { w: FRETS * cw, h: strings.length * CTRL, zones }
}

// ---------------------------------------------------------------- pads

// a pad is the kit's hardware push button (kit.css .k-hw), 36 by 18 cells
export const PAD = Object.freeze({ w: 36 * PX, h: 18 * PX })

/**
 * As many pads a row as the column holds, two at the least and all six on a
 * desk.
 * @param {number} width css px available
 * @param {{ id: string, name: string }[]} parts
 */
export function pads(width, parts) {
  const gap = 2 * PX
  const pw = PAD.w
  const ph = PAD.h
  const per = clamp(Math.floor((width + gap) / (pw + gap)), 2, parts.length)
  const zones = parts.map(({ id }, i) => ({
    part: id,
    x: (i % per) * (pw + gap),
    y: Math.floor(i / per) * (ph + gap),
    w: pw,
    h: ph,
  }))
  const rows = Math.ceil(parts.length / per)
  return { w: per * pw + (per - 1) * gap, h: rows * ph + (rows - 1) * gap, zones }
}

// ---------------------------------------------------------------- the picture

// A photograph is baked at PX a cell and shown at that, a CSS px an image
// px: never enlarged past its bake (a picture blown up to fill a column
// reads as a different, cruder drawing, and the five stop being one set).
// Where the room is short (a phone, a short window) it is shown at half.
// Where even half is wider than the column (a watch) it is shown at a
// quarter, a CSS px a cell, rather than squeezed to the column on one axis
// and not the other (measured on a watch: the Rhodes at 0.315 by 0.5). The
// scales are the divisors of PX, so every cell stays a whole number of CSS
// px on both axes; any other fraction would smear it. The result is what
// the bake is divided by.
export const SHOT_SCALES = Object.freeze([1, 2, 4])
export function shotScale(w, h, column, room = Infinity) {
  const [own, half, quarter] = SHOT_SCALES
  if (w <= column && h <= room) return own
  return w / half <= column ? half : quarter
}

// The rig's two layouts: a desk's, and the one a watch and a phone share,
// where what you play comes first and the panel pans (BIBLE.md section 8).
// The edge is the density layout.js owns; instruments.css says the same in
// its one media query.
export const onDesk = (vw, vh) => chromeDensity(vw, vh) === 'desktop'

// ---------------------------------------------------------------- the pan
// On a watch or a phone the panel keeps the desk's one row of sections and
// the card shows a window on it, walked by the kit's snap scrollbar under
// it (D7): nothing shrinks, so every control keeps the tap floor. A STOP is
// where the bar puts the row. Every thing narrower than the card (a control
// with its label, a screen that fits) is whole in some window, AIR in from
// its left where the card has room (the section's own inset, kit.css
// .k-strip > .k-sec), and never further left than its section's start one
// cell in, so the section's left rule sits under the card's edge instead of
// doubling it. The windows are the fewest that do that: taken in order of
// the latest start each thing allows, a window opens only for a thing no
// window holds yet. A thing wider than the card (a screen on a watch) then
// gets windows only for what no window shows yet, the last flush with its
// end. Each stop is named for the section of the thing that opened it.
const AIR = 4 * PX

/**
 * The stops a panel pans between, as scroll offsets from the row's start.
 * @param {{ x: number, w: number, name: string, units: { x: number, w: number }[] }[]} secs
 *   each section's left edge (its rule) and width, and the things in it, in
 *   css px from the row's start
 * @param {number} view how much of the row the card shows
 * @returns {{ x: number, name: string }[]} ascending, none past the row's end
 */
export function panStops(secs, view) {
  const end = Math.max(0, Math.max(0, ...secs.map((s) => s.x + s.w)) - view)
  const fit = (x) => Math.min(end, Math.max(0, x))
  const need = []
  const wide = []
  for (const s of secs)
    for (const u of s.units) {
      const lead = s.x + PX
      if (u.w > view) wide.push({ a: u.x, b: u.x + u.w, lead, name: s.name })
      else {
        // the starts that hold it whole, the latest with its air
        const lo = fit(u.x + u.w - view)
        need.push({
          lo,
          hi: Math.max(lo, fit(Math.min(u.x, Math.max(lead, u.x - AIR)))),
          name: s.name,
        })
      }
    }
  const stops = []
  for (const r of need.sort((p, q) => p.hi - q.hi || p.lo - q.lo))
    if (!stops.length || stops[stops.length - 1].x < r.lo) stops.push({ x: r.hi, name: r.name })
  for (const u of wide) {
    for (let x = u.a; x < u.b;) {
      const seen = stops.filter((s) => s.x <= x && x < s.x + view)
      if (seen.length) {
        x = Math.max(...seen.map((s) => s.x + view))
        continue
      }
      const at = fit(u.b - x <= view ? u.b - view : x === u.a ? Math.max(u.lead, x - AIR) : x)
      stops.push({ x: at, name: u.name })
      stops.sort((p, q) => p.x - q.x)
      x = Math.max(x + 1, at + view)
    }
  }
  const out = stops.filter((s, i) => !i || s.x > stops[i - 1].x)
  return out.length ? out : [{ x: 0, name: secs[0]?.name ?? '' }]
}

// ---------------------------------------------------------------- screens
// A screen is a grid of cells, lit or not (kit.css .k-scope). Every function
// here returns the lit cells as [x, y] pairs; the page draws them.

// a column of values (1 at the top, -1 at the bottom) as a trace H cells
// tall, each column joined to the last so the line never breaks
function traced(values, H) {
  const mid = (H - 1) / 2
  const amp = mid * 0.74
  const cells = []
  let prev = -1
  values.forEach((v, x) => {
    const row = clamp(Math.round(mid - v * amp), 0, H - 1)
    const lo = prev < 0 ? row : Math.min(prev, row)
    const hi = prev < 0 ? row : Math.max(prev, row)
    for (let y = lo; y <= hi; y++) cells.push([x, y])
    prev = row
  })
  return cells
}

export const WAVES = Object.freeze(['sine', 'sawtooth', 'square', 'noise'])

/**
 * The wave the synth is about to play, before a note is: the Synth board's
 * picture. Cycles across the width grow with the octave; a closing filter
 * widens a moving average that rounds the saw and the square; resonance
 * rings the edges with a damped sine. Noise is a seeded scatter, the same
 * picture every time.
 * @param {number} W columns
 * @param {number} H rows
 * @param {{ wave: string, octave: number, cutoff: number, resonance: number }} s
 *   the synth's switches: octave the board's (2..5, C2 to C5), cutoff and
 *   resonance 0..7
 */
export function previewTrace(W, H, { wave, octave, cutoff, resonance }) {
  // one cycle across the screen with the board at C2, doubling an octave
  const cycles = 2 ** (octave - 2)
  const raw = []
  let seed = 7
  for (let x = 0; x < W; x++) {
    const ph = ((x * cycles) / W) % 1
    if (wave === 'sine') raw.push(Math.sin(ph * 2 * Math.PI))
    else if (wave === 'sawtooth') raw.push(2 * ph - 1)
    else if (wave === 'square') raw.push(ph < 0.5 ? 1 : -1)
    else {
      seed = (seed * 1103515245 + 12345) >>> 0
      raw.push(((seed >>> 8) % 2001) / 1000 - 1)
    }
  }
  const w = 1 + 2 * (7 - cutoff)
  const half = (w - 1) / 2
  const sm = raw.map((_, x) => {
    let s = 0
    for (let k = -half; k <= half; k++) s += raw[(x + k + W) % W]
    return s / w
  })
  const g = (resonance / 7) * 0.3
  const tau = 3 + resonance
  const per = Math.max(4, 2 * w)
  const out = g
    ? sm.map((v, x) => {
        let r = 0
        for (let k = 1; k < W; k++) {
          const j = (x - k + W) % W
          r +=
            (sm[j] - sm[(j - 1 + W) % W]) * Math.exp(-k / tau) * Math.sin((2 * Math.PI * k) / per)
        }
        return v + g * r
      })
    : sm
  return traced(out, H)
}

/**
 * The real output, from an AnalyserNode's time-domain samples: from the
 * first rising zero crossing, about two and a half periods of the note last
 * played (a drum has none: a fixed window), scaled to the loudest sample so
 * a quiet note still reads. The same picture a scope's trigger holds still.
 * @param {Float32Array|number[]} samples
 * @param {number} sampleRate
 * @param {number|null} hz the note's pitch, or null
 */
export function liveTrace(W, H, samples, sampleRate, hz) {
  const n = samples.length
  // the crossing to a fraction of a sample, so a trace does not step a
  // column every time the wave lands between two samples
  let at = 0
  for (let i = 1; i < n / 2; i++)
    if (samples[i - 1] < 0 && samples[i] >= 0) {
      at = i - 1 + -samples[i - 1] / (samples[i] - samples[i - 1])
      break
    }
  const want = hz ? (2.5 * sampleRate) / hz : 512
  const span = clamp(want, W, n - 2 - at)
  const read = (p) => {
    const i = Math.floor(p)
    return samples[i] + (samples[i + 1] - samples[i]) * (p - i)
  }
  let peak = 0
  for (let i = Math.floor(at); i < at + span; i++) peak = Math.max(peak, Math.abs(samples[i]))
  const k = 1 / Math.max(peak, 0.05)
  const values = []
  for (let x = 0; x < W; x++) values.push(read(at + (x * span) / W) * k)
  return traced(values, H)
}

/**
 * The envelope as the faders set it: attack, decay and release take 1 to 9
 * columns each (a fader is 0..8), sustain is a level, the rest holds.
 */
export function envelopeCells(W, H, a, d, s, r) {
  const wa = 1 + a
  const wd = 1 + d
  const wr = 1 + r
  const ws = W - wa - wd - wr
  const ls = s / 8
  const cells = []
  let prev = H - 1
  for (let x = 0; x < W; x++) {
    let v
    if (x < wa) v = (x + 1) / wa
    else if (x < wa + wd) v = 1 - ((1 - ls) * (x - wa + 1)) / wd
    else if (x < wa + wd + ws) v = ls
    else v = ls * (1 - (x - wa - wd - ws + 1) / wr)
    const row = Math.round((1 - v) * (H - 1))
    for (let y = Math.min(prev, row); y <= Math.max(prev, row); y++) cells.push([x, y])
    prev = row
  }
  return cells
}

// ---- the sheet: a staff, a note a step (a line or a space) apart, written
// at its real pitch. A step is two cells, so the lines are four apart. The
// sheet is a window of 36 rows onto the great staff, and the octave control
// puts the window where the board is (WINDOWS): a low board gets the bass
// clef, a high one the treble, the staff placed so the board's two octaves
// have the most room. Steps count up from E4 (the treble's bottom line);
// the bass clef's bottom line is G2, twelve steps down.
const DIATONIC = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 }
export const STAFF = Object.freeze({
  cols: 48,
  rows: 36,
  // a note's column, a slot each; the clef takes the first columns
  slots: Object.freeze([14, 21, 28, 35, 42]),
})
/** The window on the great staff for a board starting at C`octave`:
 *  the clef, and the row of its bottom line. */
export const WINDOWS = Object.freeze({
  2: Object.freeze({ clef: 'bass', bottom: 22 }),
  3: Object.freeze({ clef: 'bass', bottom: 34 }),
  4: Object.freeze({ clef: 'treble', bottom: 26 }),
  5: Object.freeze({ clef: 'treble', bottom: 32 }),
})
export const windowFor = (octave) => WINDOWS[octave] || WINDOWS[4]
// the staff step of the clef's bottom line, from E4
const CLEF_BASE = { treble: 0, bass: -12 }
/** The rows the five lines run through, bottom first. */
export const staffLines = (win) => [0, 1, 2, 3, 4].map((k) => win.bottom - 4 * k)
/** The staff step of a note: 0 is E4, the treble's bottom line; C4 is -2. */
export function staffStep(note) {
  const m = /^([A-G])(#?)(-?\d+)$/.exec(note)
  if (!m) return null
  return DIATONIC[m[1]] + 7 * Number(m[3]) - (DIATONIC.E + 7 * 4)
}
// a sharp, drawn in cells: four wide, five tall
const SHARP = ['.#.#', '####', '.#.#', '####', '.#.#']
// the clefs, drawn in cells in the same hand as the notes. The treble's
// row 20 sits on the bottom line (E4) and its loop rings the G line; the
// bass's row 3 sits on the F line, its two dots in the spaces either side.
const TREBLE = Object.freeze([
  '....#...',
  '...##...',
  '...#.#..',
  '...#.#..',
  '...#.#..',
  '...#.#..',
  '..#..#..',
  '..#.#...',
  '..#.#...',
  '.#..#...',
  '.#.#....',
  '#..#....',
  '#..#....',
  '#.##....',
  '#.#.#...',
  '#.#..#..',
  '.##...#.',
  '..#...#.',
  '..##.#..',
  '...##...',
  '...#....',
  '...#....',
  '.#.#....',
  '..##....',
])
const BASS = Object.freeze([
  '..###...',
  '.#...#.#',
  '#....#..',
  '##...#..',
  '.....#..',
  '....#..#',
  '...#....',
  '..#.....',
  '.#......',
])
const CLEFS = { treble: { rows: TREBLE, on: 20, line: 0 }, bass: { rows: BASS, on: 3, line: 3 } }
/** The clef of a window as [x, y] cells, a column in from the edge. */
export function clefCells(win) {
  const { rows, on, line } = CLEFS[win.clef]
  const top = win.bottom - 4 * line - on
  const cells = []
  rows.forEach((r, dy) => [...r].forEach((c, dx) => c === '#' && cells.push([1 + dx, top + dy])))
  return cells.filter(([, y]) => y >= 0 && y < STAFF.rows)
}

/**
 * One note written at slot column `x` in a window: its head, its stem (up
 * below the middle line, down from it), a sharp before it, and the short
 * ledger rows it needs outside the staff. Cells as [x, y]; `ledgers` as
 * rows. Null for a note the window has no room for.
 */
export function noteGlyph(note, x, win = WINDOWS[4]) {
  const step = staffStep(note)
  if (step === null) return null
  const at = step - CLEF_BASE[win.clef]
  const row = win.bottom - 2 * at
  if (row < 2 || row > STAFF.rows - 3) return null
  const cells = []
  for (const [dx, dy] of [
    [1, -1],
    [2, -1],
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ])
    cells.push([x + dx, row + dy])
  if (at < 4) for (let y = row - 7; y < row; y++) cells.push([x + 3, y])
  else for (let y = row + 2; y <= row + 7; y++) cells.push([x, y])
  if (note.includes('#'))
    SHARP.forEach((line, dy) =>
      [...line].forEach((c, dx) => c === '#' && cells.push([x - 5 + dx, row - 2 + dy]))
    )
  const ledgers = []
  for (let s = -2; s >= at; s -= 2) ledgers.push(win.bottom - 2 * s)
  for (let s = 10; s <= at; s += 2) ledgers.push(win.bottom - 2 * s)
  return { cells: cells.filter(([cx, cy]) => cy >= 0 && cy < STAFF.rows && cx >= 0), ledgers }
}

// ---------------------------------------------------------------- the hit
// What a hit throws, back from main. A struck pad
// lights three sparks across its top while it is down (main's drum
// ripples: left low, the middle high, right low); a plucked ukulele lets a
// quaver go from the soundhole of its photograph. Both are ink cells, lit
// or not: nothing fades, nothing flashes.

/** The sparks of a pad `w` css px wide: [x, y] of each cell from its corner. */
export function sparks(w) {
  const at = (f) => Math.round((w / PX) * f) * PX
  return [
    [at(0.25), 2 * PX],
    [at(0.5), PX],
    [at(0.75), 2 * PX],
  ]
}

// the quaver, a cell a letter (main's instrument-sprites QUAVER)
export const QUAVER = Object.freeze(['..kk.', '..k.k', '..k..', '..k..', 'kkk..', 'kkk..'])
export const quaverCells = () =>
  QUAVER.flatMap((row, y) => [...row].flatMap((c, x) => (c === 'k' ? [[x * PX, y * PX]] : [])))
// where the soundhole is in the ukulele's photograph, as a share of it
export const SOUNDHOLE = Object.freeze({ x: 140 / 448, y: 76 / 152 })
// The flight: the quaver rises two cells a step, three steps, then goes.
// A step every 340 ms is under three a second, so it drifts, never
// flickers (the motion guard, WCAG 2.3.1); under reduced motion it stands
// where it was let go for as long, and goes. One is in the air at a time.
export const FLIGHT = Object.freeze({ steps: 3, cells: 2, ms: 340 })

/**
 * Where the quaver starts: over the soundhole of a photograph shown at
 * `shot` ({ x, y, w, h } in css px, from the stage's corner), its head a
 * cell clear of the body's top edge, on the ground, where ink reads (over
 * the dark wood it would not). On the cell.
 */
export function quaverAt(shot) {
  const x = shot.x + shot.w * SOUNDHOLE.x
  return { x: snap(x - PX), y: snap(shot.y) - (QUAVER.length + 1) * PX }
}

// ---------------------------------------------------------------- MIDI in

// a message a keyboard sends, as the page needs it: note on and note off
// (a note on at velocity 0 is a note off, per the spec), on any channel
export function midiMessage([status, data1, data2]) {
  const kind = status & 0xf0
  if (kind === 0x90 && data2 > 0)
    return { on: true, note: midiToNote(data1), velocity: data2 / 127 }
  if (kind === 0x80 || kind === 0x90) return { on: false, note: midiToNote(data1) }
  return null
}

// General MIDI's drum map, onto the six pads (channel 10 or not: a pad
// controller sends these numbers on whatever channel it is set to)
export const GM_DRUMS = {
  35: 'kick',
  36: 'kick',
  37: 'snare',
  38: 'snare',
  40: 'snare',
  42: 'hat',
  44: 'hat',
  46: 'hat',
  41: 'tom2',
  43: 'tom2',
  45: 'tom1',
  47: 'tom1',
  48: 'tom1',
  50: 'tom1',
  49: 'crash',
  51: 'crash',
  52: 'crash',
  55: 'crash',
  57: 'crash',
  59: 'crash',
}

// ---------------------------------------------------------------- the room
// A session plays together: what a visitor plays goes out on the page's
// `canvas:act` event and a peer's comes back on `canvas:peer-act`, which the
// page plays through its own voices without sending it on. What arrives is
// someone else's input, so it is read here, strictly, before the page lets
// it near a voice or a control: a payload that is not exactly one of the
// shapes below is dropped whole, never repaired.
//
//   note  {i, n, v}        a keyed instrument, a MIDI note, a velocity 0..1
//   note  {i:'drums', p, v} a pad by its part name
//   off   {i, n}           a key let go (a keyed instrument only)
//   patch {i, k, v}        one panel control; the page says which exist and
//                          what each can take (`controls`, below)

/** The instruments that play notes, as the wire names them. */
export const SOUNDING = Object.freeze(['rhodes', 'bass', 'ukulele', 'synth'])

// a plain object from any realm: not an array, a class instance or a box
const plain = (o) =>
  o !== null &&
  typeof o === 'object' &&
  !Array.isArray(o) &&
  Object.prototype.toString.call(o) === '[object Object]'
const exactly = (d, keys) =>
  Object.keys(d).length === keys.length && keys.every((k) => Object.hasOwn(d, k))
const isMidi = (n) => Number.isInteger(n) && n >= 0 && n <= 127
const isVelocity = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
// the peer's hue as presence makes it (hsl), or any plain colour; anything
// else lights the part in the kit's own live colour instead
const COLOR = /^(?:#[0-9a-f]{3,8}|(?:hsl|rgb)a?\([0-9., %/deg]{1,48}\))$/i

/**
 * What a control accepts, as the page describes it: `{kind: 'int', lo, hi}`
 * for a knob or a fader, `{kind: 'bool'}` for a toggle or a pin,
 * `{kind: 'one', of}` for a radio row (its values, compared strictly, so an
 * octave of '4' is not an octave of 4).
 */
export function fits(spec, v) {
  if (!spec) return false
  if (spec.kind === 'bool') return typeof v === 'boolean'
  if (spec.kind === 'int') return Number.isInteger(v) && v >= spec.lo && v <= spec.hi
  if (spec.kind === 'one') return Array.isArray(spec.of) && spec.of.includes(v)
  return false
}

/**
 * A peer's act, read: the event's detail in, a clean act out, or null.
 * `parts` is the pads' part names; `controls` is {instrument: {key: spec}}
 * for every control the page wired, so a key no control owns is refused.
 * The peer's id keys its held notes (0 when it has none) and its colour
 * is null unless it reads as a colour.
 */
export function peerAct(detail, { parts = [], controls = {} } = {}) {
  if (!plain(detail) || !plain(detail.d)) return null
  const { ch, d } = detail
  const id = Number.isInteger(detail.id) && detail.id > 0 ? detail.id : 0
  const color = typeof detail.color === 'string' && COLOR.test(detail.color) ? detail.color : null
  const out = (fields) => ({ ch, ...fields, id, color })
  if (ch === 'note' && d.i === 'drums')
    return exactly(d, ['i', 'p', 'v']) &&
      typeof d.p === 'string' &&
      parts.includes(d.p) &&
      isVelocity(d.v)
      ? out({ i: 'drums', p: d.p, v: d.v })
      : null
  if (ch === 'note')
    return exactly(d, ['i', 'n', 'v']) && SOUNDING.includes(d.i) && isMidi(d.n) && isVelocity(d.v)
      ? out({ i: d.i, n: d.n, v: d.v })
      : null
  if (ch === 'off')
    return exactly(d, ['i', 'n']) && SOUNDING.includes(d.i) && isMidi(d.n)
      ? out({ i: d.i, n: d.n })
      : null
  if (ch === 'patch') {
    if (!exactly(d, ['i', 'k', 'v']) || typeof d.i !== 'string' || typeof d.k !== 'string')
      return null
    const own = Object.hasOwn(controls, d.i) ? controls[d.i] : null
    const spec = own && Object.hasOwn(own, d.k) ? own[d.k] : null
    return fits(spec, d.v) ? out({ i: d.i, k: d.k, v: d.v }) : null
  }
  return null
}

/**
 * Where a peer's note lights a part `w` by `h`: the pad's three sparks, and
 * on a key (`lip`) the same three mirrored to its front edge, the one part
 * of a white key a black key never covers. [x, y] from the part's corner.
 */
export function peerCells(w, h, lip) {
  return sparks(w).map(([x, y]) => [x, lip ? h - y - PX : y])
}
