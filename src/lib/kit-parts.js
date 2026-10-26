// The kit's parts: every control that is a picture of its state, as a
// shading function.
//
// A part is a function from a point to a grey, 0 dark to 1 light, or null
// where there is no part (the ground shows through). That is the whole
// drawing: a knob is a knurled skirt under a domed cap with a pointer cut
// into it, a lamp is a jewel in a ring, and each is lit by the one light,
// high and to the left. Nothing here is a picture file and nothing is an
// SVG: a new part is a new function in PARTS, baked like the rest.
//
// The bake (scripts/img/bake-parts.mjs) samples each function at the pixel
// centres of its spec, averages every 2x2 of them into one CELL of the site
// (four CSS px), and hands the cells to textmode, which draws each as a 4x4
// Bayer glyph between the two nearest greys of the ramp. The ramp is read
// off canvas-tokens.css by name, so a retuned grey rebakes into every part.
// The PNG under src/static/img/kit/ is one px per dot and one cell per 4 px,
// shown 1:1, so a part sits on the cell by construction.
//
// Ported from a specimen drawn in its own units; what changed is the canvas of the
// radio button and the thin cap, each widened one px to a whole cell, and
// every rim and ring, each widened to a whole cell (two px of a spec, four
// on the page): a kit line is 4px, drawn or baked.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const TOKENS = join(import.meta.dirname, '../../primitives/kit/canvas-tokens.css')

// The two ramps, darkest first, as token names. Grey is what a part is made
// of; brick is what a lit jewel is made of (brick means armed or live).
// seam: test/kit.test.js
export const RAMPS = Object.freeze({
  grey: Object.freeze(['deep', 'ink', 'mute', 'mid', 'ground', 'bright']),
  brick: Object.freeze(['brick-deep', 'brick', 'brick-fixed', 'brick-light']),
})

/** The ramps as hex, read off the token file: { grey: [...], brick: [...] }. */
// seam: test/kit.test.js
export function readRamps(css = readFileSync(TOKENS, 'utf8')) {
  const out = {}
  for (const [ramp, names] of Object.entries(RAMPS))
    out[ramp] = names.map((name) => {
      const m = new RegExp(`--cv-${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css)
      if (!m) throw new Error(`canvas-tokens.css has no six-digit --cv-${name}`)
      return m[1].toLowerCase()
    })
  return out
}

// ---- the light and the grain ----
const L = (() => {
  const v = [-0.5, -0.65, 0.58]
  const n = Math.hypot(...v)
  return v.map((a) => a / n)
})()
const lit = (nx, ny, nz) => Math.max(0, nx * L[0] + ny * L[1] + nz * L[2])
const hash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
const noise = (x, y) => {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const w = yf * yf * (3 - 2 * yf)
  return (
    (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - w) +
    (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * w
  )
}

// a bevelled face on a W x H canvas: the top-left edges lit when up, the
// bottom-right lit when down, inside a rim one cell wide; the push button,
// the radio button
const bevel = (W, H, up, base) => (x, y) => {
  const e = Math.min(x, y, W - x, H - y)
  if (e < 2) return { v: 0.02 }
  const face = base + 0.12 * (1 - y / H) * (up ? 1 : -1) + 0.04 * (noise(x * 0.5, y * 0.5) - 0.5)
  if (e < 4.5) {
    const topLeft = e === x || e === y
    const light = up ? topLeft : !topLeft
    return { v: light ? face + 0.3 : face - 0.35 }
  }
  return { v: up ? face : face - 0.12 }
}

// ---- the parts ----
// name, the states it has (one PNG each), the spec's canvas in px (twice the
// cells), the ramp it is made of, and the shading function per state
const parts = []
const part = (name, states, w, h, shade) => parts.push({ name, states, w, h, shade })

// knob: knurled skirt, domed cap, an engraved pointer; eight angles
part('knob', ['0', '1', '2', '3', '4', '5', '6', '7'], 44, 44, (state) => {
  const a = ((-135 + Number(state) * (270 / 7)) * Math.PI) / 180
  return (x, y) => {
    const dx = x - 22
    const dy = y - 22
    const r = Math.hypot(dx, dy)
    const t = Math.atan2(dy, dx)
    if (r > 21) return null
    if (r > 15) {
      const k = Math.sin(t * 28) > 0 ? 0.12 : -0.12
      const nx = dx / r
      const ny = dy / r
      return { v: 0.18 + 0.55 * lit(nx * 0.8, ny * 0.8, 0.6) + k - (r > 19 ? 0.2 : 0) }
    }
    const q = r / 15
    const nz = Math.sqrt(1 - q * q * 0.7)
    let v =
      0.25 +
      0.8 * lit((dx / 15) * 0.55, (dy / 15) * 0.55, nz) +
      0.05 * (noise(x * 0.8, y * 0.8) - 0.5)
    const proj = dx * Math.sin(a) + -dy * Math.cos(a)
    const perp = Math.abs(dx * Math.cos(a) + dy * Math.sin(a))
    if (proj > 4 && proj < 13.5 && perp < 1.3) return { v: 0.02 }
    if (r > 14) v -= 0.25
    return { v }
  }
})

// push button: raised, pressed, and armed (the brick face)
part('btn', ['up', 'down', 'hot'], 72, 36, (state) => {
  const up = state === 'up'
  const ramp = state === 'hot' ? 'brick' : 'grey'
  const face = bevel(72, 36, up, ramp === 'grey' ? 0.66 : 0.55)
  return (x, y) => {
    const s = face(x, y)
    // the rim stays grey on the armed face: the ring says "a thing", the
    // brick says "live"
    return s.v < 0.05 ? s : { ...s, ramp }
  }
})

// radio push-button: the same bevel on a tall face, so a row of them
// stops stretching the 2:1 button
part('rbtn', ['up', 'down'], 28, 32, (state) => bevel(28, 32, state === 'up', 0.66))

// the labelled radio push-button: the same bevel, wide and short, so a word
// sits on the face at 16 ("snowball" is 64px of the
// 70 inside the bevel) and the face still clears the tap floor
part('rbtnw', ['up', 'down'], 44, 24, (state) => bevel(44, 24, state === 'up', 0.66))

// bat toggle: a hex nut, the lever up or down
part('toggle', ['up', 'down'], 36, 60, (state) => {
  const dir = state === 'up' ? -1 : 1
  return (x, y) => {
    const dx = x - 18
    const dy = y - 30
    const hex = Math.max(Math.abs(dx) * 0.866 + Math.abs(dy) * 0.5, Math.abs(dy))
    const ly = dy * dir * -1
    if (ly > 0 && ly < 26 && Math.abs(dx) < 4 + ly * 0.08) {
      const nx = dx / (4 + ly * 0.08)
      return { v: 0.3 + 0.7 * lit(nx, -0.3, Math.sqrt(Math.max(0, 1 - nx * nx))) }
    }
    if (ly >= 24 && ly < 29 && Math.hypot(dx, ly - 26) < 5.5) {
      const nx = dx / 5.5
      const ny = ((ly - 26) / 5.5) * -dir
      return { v: 0.2 + 0.85 * lit(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))) }
    }
    if (hex < 11) {
      const facet =
        Math.abs(dx) * 0.866 + Math.abs(dy) * 0.5 > Math.abs(dy)
          ? dx < 0
            ? 0.62
            : 0.3
          : dy < 0
            ? 0.75
            : 0.22
      return { v: hex < 6 ? 0.08 : facet + 0.05 * (noise(x, y) - 0.5) }
    }
    return null
  }
})

// a thin fader cap: a ridged block with a centre line, in a rim one cell
// wide, for the track
part('cap', ['thin'], 16, 24, () => (x, y) => {
  const e = Math.min(x, y, 16 - x, 24 - y)
  if (e < 2) return { v: 0.02 }
  if (Math.abs(y - 12) < 1) return { v: 0.02 }
  return { v: 0.75 - 0.4 * (y / 24) + (x < 3 ? 0.2 : 0) - (x > 13 ? 0.25 : 0) }
})

// lamp: a brick jewel in a grey ring, dark or lit
part('lamp', ['off', 'on'], 16, 16, (state) => {
  const on = state === 'on'
  return (x, y) => {
    const dx = x - 8
    const dy = y - 8
    const r = Math.hypot(dx, dy)
    if (r > 7.5) return null
    if (r > 5.5) return { v: 0.1 }
    const nz = Math.sqrt(1 - (r / 5.5) ** 2)
    return {
      v: (on ? 0.45 : 0.08) + (on ? 0.6 : 0.35) * lit(dx / 5.5, dy / 5.5, nz),
      ramp: 'brick',
    }
  }
})

// call button: a round cap in a bezel, dark or lit
part('call', ['off', 'on'], 32, 32, (state) => {
  const on = state === 'on'
  return (x, y) => {
    const dx = x - 16
    const dy = y - 16
    const r = Math.hypot(dx, dy)
    if (r > 15) return null
    if (r > 13) return { v: 0.04 }
    if (r > 10.5) return { v: 0.55 + 0.35 * lit(-dx / r, -dy / r, 0.4) }
    const nz = Math.sqrt(Math.max(0, 1 - (r / 10.5) ** 2))
    return on
      ? { v: 0.5 + 0.5 * lit(dx / 10.5, dy / 10.5, nz), ramp: 'brick' }
      : { v: 0.35 + 0.4 * lit((dx / 10.5) * 0.5, (dy / 10.5) * 0.5, nz) }
  }
})

// keycap: a round cap on a ring, up and pressed
part('key', ['up', 'down'], 28, 28, (state) => {
  const up = state === 'up'
  return (x, y) => {
    const dx = x - 14
    const dy = y - 14 - (up ? 0 : 1)
    const r = Math.hypot(dx, dy)
    if (r > 13) return null
    if (r > 11.5) return { v: 0.6 - (dy > 0 ? 0.3 : -0.2) }
    if (r > 9.5) return { v: 0.04 }
    const nz = Math.sqrt(Math.max(0, 1 - (r / 9.5) ** 2))
    return { v: (up ? 0.72 : 0.5) + 0.25 * lit((dx / 9.5) * 0.5, (dy / 9.5) * 0.5, nz) }
  }
})

// piano keys, the taller ones on the Synth board:
// a white key is the panel's own tone
// (never white) with a lit left edge, a shaded right edge and a dark front
// lip that sinks when pressed; its left column is the gap to its neighbour,
// its top row the fallboard's shadow. A black key is a near-ink block with
// lit top-left edges and a front lip, both gone when pressed. The board's
// black key is 54 tall; it is 56 here, the nearest whole pair of cells.
const WK_H = 88
const BK_H = 56
part('white', ['up', 'down'], 44, WK_H, (state) => {
  const up = state === 'up'
  return (x, y) => {
    if (x < 2 || y < 2) return { v: 0.02 }
    const lipH = up ? 6 : 2
    if (y >= WK_H - lipH) return { v: (up ? 0.36 : 0.5) + (x < 4 ? 0.15 : 0) }
    let v = (up ? 0.8 : 0.64) + 0.03 * (noise(x * 0.5, y * 0.5) - 0.5) - 0.06 * (y / WK_H)
    if (x < 4) v += up ? 0.22 : 0.1
    else if (x > 41) v -= up ? 0.25 : 0.12
    if (y < 4) v -= 0.12
    return { v }
  }
})
part('black', ['up', 'down'], 24, BK_H, (state) => {
  const up = state === 'up'
  return (x, y) => {
    if (x < 2 || x > 21 || y < 2 || y > BK_H - 3) return { v: 0.02 }
    const lipH = up ? 4 : 2
    if (y >= BK_H - 2 - lipH) return { v: 0.06 }
    let v = (up ? 0.26 : 0.16) + 0.03 * (noise(x * 0.6, y * 0.6) - 0.5)
    if (up && (x < 4 || y < 4)) v += 0.22
    if (x > 19) v -= 0.1
    return { v }
  }
})

// patch pin: a jack in its washer, out (the bore is dark) or in (a plug's
// head sits in it, lit like a cap)
part('pin', ['out', 'in'], 32, 32, (state) => {
  const on = state === 'in'
  return (x, y) => {
    const dx = x - 16
    const dy = y - 16
    const r = Math.hypot(dx, dy)
    if (r > 15) return null
    if (r > 13) return { v: 0.04 }
    if (r > 9) {
      const nx = dx / r
      const ny = dy / r
      return { v: 0.3 + 0.45 * lit(nx * 0.7, ny * 0.7, 0.7) + 0.04 * (noise(x, y) - 0.5) }
    }
    if (r > 7) return { v: 0.04 }
    if (!on) return { v: 0.02 + 0.1 * (1 - r / 7) }
    const nz = Math.sqrt(Math.max(0, 1 - (r / 7) ** 2))
    return { v: 0.5 + 0.45 * lit(dx / 7, dy / 7, nz) }
  }
})

// the page tab: the same bevel on a strip long enough to be cut, for the
// page bar, where a tab is as wide as its nearness earns (canvas-home.css).
// A page of the ring is one of many, so a tab is a radio push-button: the
// page you are on is down, the rest stand up. kit.css wears it as a nine
// slice, the corners and the rim whole and the face between them repeated
// along the strip, so a tab of any width is this picture and never this
// picture stretched. It is shown at its own height (twelve cells, 48 on
// the page, the first whole pair of cells over the tap floor), so it is
// never stretched up and down either.
// The tab that is down is darker than a pushed radio button: its words are
// bright at 16 and read on every dot of the face, so the face is dithered
// between ink and mute (bright on mute is 6.9:1) rather than mute and mid,
// where the mid dots gave the words 3:1 (measured on the bake, 2026-09-25).
part('tab', ['up', 'down'], 64, 24, (state) =>
  state === 'up' ? bevel(64, 24, true, 0.66) : bevel(64, 24, false, 0.5)
)

// (last on the sheet: a part's dither phase is its place on the sheet,
// so a new part goes after every other and moves none of them)
// the flip switch: the toggle's own nut and lever at a third of its size,
// so a setting in a row of words (a page's Dark Mode, a room's pin, a pass
// in textmode) wears the same switch the instruments do, standing inside
// the tap floor. A panel's convention: the lever thrown up is on.
part('flip', ['off', 'on'], 12, 20, (state) => {
  const dir = state === 'on' ? 1 : -1
  return (x, y) => {
    const dx = x - 6
    const dy = y - 10
    const hex = Math.max(Math.abs(dx) * 0.866 + Math.abs(dy) * 0.5, Math.abs(dy))
    const ly = dy * dir * -1
    if (ly > 0 && ly < 8 && Math.abs(dx) < 1.4 + ly * 0.04) {
      const nx = dx / (1.4 + ly * 0.04)
      return { v: 0.3 + 0.7 * lit(nx, -0.3, Math.sqrt(Math.max(0, 1 - nx * nx))) }
    }
    if (ly >= 6.5 && ly < 10 && Math.hypot(dx, ly - 8) < 2) {
      const nx = dx / 2
      const ny = ((ly - 8) / 2) * -dir
      return { v: 0.2 + 0.85 * lit(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))) }
    }
    if (hex < 3.8) {
      const facet =
        Math.abs(dx) * 0.866 + Math.abs(dy) * 0.5 > Math.abs(dy)
          ? dx < 0
            ? 0.62
            : 0.3
          : dy < 0
            ? 0.75
            : 0.22
      return { v: hex < 2 ? 0.08 : facet }
    }
    return null
  }
})

// seam: test/kit.test.js
export const PARTS = Object.freeze(parts.map((p) => Object.freeze(p)))

/** Every PNG the kit has: `${name}-${state}`, in bake order. */
// seam: test/kit.test.js
export const PART_FILES = Object.freeze(PARTS.flatMap((p) => p.states.map((s) => `${p.name}-${s}`)))

// One state of one part, as cells: the function sampled at the four pixel
// centres of each 2x2 of its canvas, a cell being covered when at least half
// of them are on the part, its grey their mean, its ramp the one most of
// them named. `cols` and `rows` are whole cells.
// seam: test/kit.test.js
export function cellsOf(p, state) {
  const f = p.shade(state)
  const cols = p.w / 2
  const rows = p.h / 2
  const cells = []
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      let n = 0
      let sum = 0
      let brick = 0
      for (const [ox, oy] of [
        [0.5, 0.5],
        [1.5, 0.5],
        [0.5, 1.5],
        [1.5, 1.5],
      ]) {
        const s = f(cx * 2 + ox, cy * 2 + oy)
        if (!s) continue
        n++
        sum += Math.max(0, Math.min(1, s.v))
        if (s.ramp === 'brick') brick++
      }
      cells.push(n < 2 ? null : { v: sum / n, ramp: brick * 2 > n ? 'brick' : 'grey' })
    }
  return { cols, rows, cells }
}
