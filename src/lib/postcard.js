// postcard.js: the world at a camera, drawn in two inks.
//
// ONE renderer, many outputs. A camera plus a size in, an SVG string out.
// The same function draws a 1200x630 social card, a shareable "here is this
// corner" postcard, and a poster of the whole ground: three call sites of one
// drawing instead of three drawings that drift apart.
//
// WHAT IT DEPICTS. A PLAN of the world, not a picture of it. Every tile's
// footprint at its true position and size, taken from the same solver the
// browser runs (placeWorld, in the canvas layout module), so the plan IS the
// world rather than a sketch of it. The hero sits where the hero sits and
// wears the site's name, and a footprint prints its name wherever the name
// fits the box whole.
//
// WHAT IT DOES NOT DEPICT. Anything INSIDE a tile. No weather, no slime,
// no live readings of any kind. A tile's interior
// is a browser rendering live data at request time; reproducing it here
// would be a second rendering engine, and a second engine starts rotting
// against the first the day it ships. So this draws the map and prints the
// names. It is not a screenshot and was never trying to be.
//
// Instruments measure, identity is pixels (BIBLE.md section 10): a plan is
// an instrument, so every mark here is stroke-drawn and the pixel hand
// stays out of it: a footprint is a box, never a drawing of what it holds.
//
// PURE. No DOM, no filesystem, no network, no clock, no randomness. The
// same camera and the same size always produce byte-identical output, which
// is what lets a card be cached forever and a poster be re-cut years later
// and match. Colour and typeface arrive as options defaulting to the site
// tokens, the same contract the pixel icon primitive keeps: this module
// states no colour of its own.
import site from '../../site.config.js'
import {
  TILES,
  M,
  LADDER,
  lineHeightFor,
  dims,
  heroFixed,
  placeWorld,
  openFrame,
} from '../static/canvas/layout.js'

// The reference card. Line weights are drawn for this width and scale with
// the output, so a poster is a true enlargement and not the same hairlines
// on a bigger sheet.
// seam: test/postcard.test.js
export const CARD = { w: 1200, h: 630 }

// The site's own name, printed in the hero box. The identity line proper
// belongs to the page, not to a map of it.
const SITE = new URL(site.url).host

// Card-space line weights, the two the material has: the hairline that
// structures a card (--cv-bd) and the strong line reserved for the things
// that read from across the room (--cv-bd-ink), here the hero and the
// card's own edge.
const HAIRLINE = 1.5
const STRONG = 3
// The card corner, mirroring --cv-r. It scales with the camera, exactly as
// a 6px radius does under the canvas transform.
const RADIUS = 6

// Advance width estimate for the one typeface, as a fraction of the type
// size. Measured in a browser rather than guessed: across the names this
// plan actually prints, the face runs to 0.55em per character for a
// mixed-case string and 0.72em for an all-caps word, so the estimate sits
// above the mixed-case ceiling with room for a caps prefix inside a line.
// Only label fitting reads it, and the cost of being wrong is a label a
// little wide or a little shy, never a broken drawing.
const ADVANCE = 0.62

// Every tile the canvas seats.
const LIVE = TILES

// NOTE: the exact input app.js hands the solver, so the plan and the canvas
// settle the same world. The chrome reservation is the one field in flight
// (a camera fit is replacing the world-space band), and it is read HERE and
// nowhere else in this file so that change costs one line.
// NOTE: the bar does not reserve world space. Clearance is a camera
// property (the opening camera fits above the bar), so the plan draws
// the whole world and owes the chrome nothing.

// What a footprint answers to on the plan. Names come off the tile record
// wherever the record holds one, so nothing here can drift from the world:
// an article carries its own title, an icon its network.
// The widgets have no title of their own, so this map names them, and it
// names the TILE rather than its contents (the contents are live and this
// drawing has none).
const WIDGET_NAME = {
  weather: 'weather',
}

function nameOf(tile) {
  if (tile.type === 'icon') return tile.s || ''
  return tile.label || WIDGET_NAME[tile.type] || tile.type
}

// The settled world as flat data. Deterministic, so it is solved once and
// shared; frozen so a consumer cannot edit the map out from under the next
// one.
let plan = null

// seam: test/postcard.test.js
export function worldPlan() {
  if (plan) return plan
  const hero = heroFixed()
  const out = placeWorld({ tiles: LIVE, hero })
  const marks = LIVE.map((t) => {
    const d = dims(t)
    const at = out.tiles[t.id]
    return Object.freeze({
      id: t.id,
      x: at.x,
      y: at.y,
      w: d.w,
      h: d.h,
      name: nameOf(t),
    })
  })
  plan = Object.freeze({
    world: Object.freeze({ ...out.world }),
    hero: Object.freeze({ x: out.hero.x, y: out.hero.y, w: hero.w, h: hero.h, name: SITE }),
    marks: Object.freeze(marks),
  })
  return plan
}

// The zoom at which the frame exactly covers the world on its binding axis.
// The camera floors here, the same rule the canvas keeps: you cannot back
// off far enough to see the ground end.
// seam: test/postcard.test.js
export function coverZoom(width = CARD.w, height = CARD.h) {
  const { world } = worldPlan()
  return Math.max(width / world.w, height / world.h)
}

// The view the site opens on, for a caller that wants a picture of the
// place rather than a picture of one corner: the hero centred at the zoom
// that fits the derived opening frame. There is no ceiling here on purpose;
// a poster is allowed to be closer than a browser can get.
// seam: test/postcard.test.js
export function homeCamera(width = CARD.w, height = CARD.h) {
  const { hero } = worldPlan()
  const frame = openFrame()
  return {
    x: hero.x + hero.w / 2,
    y: hero.y + hero.h / 2,
    zoom: Math.max(Math.min(width / frame.w, height / frame.h), coverZoom(width, height)),
  }
}

// ---- type ------------------------------------------------------------------

// the largest ladder step at or under a card-space size, 0 if the size is
// under the ladder's floor
function ladderAtMost(px) {
  let fs = 0
  for (const step of LADDER) if (step <= px) fs = step
  return fs
}

// greedy wrap to a character budget; null when a single word cannot fit,
// because a label that has to be broken mid-word does not fit at all
function wrapWords(text, perLine) {
  if (perLine < 1) return null
  const out = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > perLine) return null
    if (!line) line = word
    else if (line.length + 1 + word.length <= perLine) line += ' ' + word
    else {
      out.push(line)
      line = word
    }
  }
  if (line) out.push(line)
  return out.length ? out : null
}

// A label prints WHOLE or not at all: no ellipsis, no mid-word break. That
// is the cartographic rule, and it is what lets the same drawing be a
// footprint plan on a small card and a named plan on a poster without a
// second mode.
function fitLines(text, fs, boxW, boxH) {
  if (!fs || !text) return null
  const pad = fs * 0.5
  const lines = wrapWords(text, Math.floor((boxW - 2 * pad) / (fs * ADVANCE)))
  if (!lines) return null
  return lines.length * lineHeightFor(fs) <= boxH - 2 * pad ? lines : null
}

// the hero is the anchor of the map, so it takes the largest step its box
// can hold rather than the drawing's common size
function fitHero(text, boxW, boxH) {
  for (let i = LADDER.length - 1; i >= 0; i--) {
    const lines = fitLines(text, LADDER[i], boxW, boxH)
    if (lines) return { fs: LADDER[i], lines }
  }
  return null
}

// ---- emit ------------------------------------------------------------------

// two decimals, and -0 prints as 0: the output is a cache key, so the same
// geometry must never spell itself two ways
const n = (v) => String(Math.round(v * 100) / 100)

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// Every copy of a body that meets the frame on one axis. The world wraps,
// so a footprint near the seam is legitimately on the card twice; the
// camera floors at cover, so this returns at most two positions.
function repeats(pos, size, min, span, period) {
  const out = []
  const from = Math.ceil((min - pos - size) / period)
  const to = Math.floor((min + span - pos) / period)
  for (let k = from; k <= to; k++) out.push(pos + k * period)
  return out
}

function textBlock(lines, fs, cx, cy) {
  const lh = lineHeightFor(fs)
  // the block is centred on the box, and a line's baseline sits at roughly
  // its cap height inside the line box
  const top = cy - (lines.length * lh) / 2
  return lines
    .map(
      (line, i) =>
        `<text x="${n(cx)}" y="${n(top + i * lh + lh * 0.72)}" font-size="${n(fs)}">` +
        `${escapeXml(line)}</text>`
    )
    .join('')
}

// The camera is `{x, y, zoom}`: x and y are the world point at the CENTRE
// of the frame, and zoom is world units to card pixels, the canvas's own Z.
// Centre rather than corner because a centre is the one thing that survives
// a change of sheet, so a card and a poster of one camera are the same view
// at two crops. Zoom floors at cover and has no ceiling: a poster is
// allowed closer than a browser can get, and a bigger sheet at one zoom
// shows MORE world rather than the same world larger, which is what makes a
// print the explorer's own view rather than a picture of it.
// seam: test/postcard.test.js
export function renderPostcard({
  camera,
  width = CARD.w,
  height = CARD.h,
  ink = 'var(--cv-ink)',
  ground = 'var(--cv-ground)',
  font = 'var(--cv-font)',
} = {}) {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const { world, hero, marks } = worldPlan()
  const cam = camera || homeCamera(w, h)
  const z = Math.max(Number(cam.zoom) || 0, coverZoom(w, h))
  // the frame in world units, hung off the camera's CENTRE: a centre is the
  // one thing that means the same at both sizes, so a card and a poster of
  // one camera are the same view at two crops
  const vw = w / z
  const vh = h / z
  const x0 = (Number(cam.x) || 0) - vw / 2
  const y0 = (Number(cam.y) || 0) - vh / 2
  // weights scale with the sheet, never with the zoom: the plan keeps one
  // hand whether the camera is on one tile or on the whole world
  const k = w / CARD.w
  const hair = HAIRLINE * k
  const strong = STRONG * k
  const toX = (wx) => (wx - x0) * z
  const toY = (wy) => (wy - y0) * z

  const boxes = []
  const labels = []
  // ONE label size for the whole drawing, so the plan reads as a map and
  // not as a pile of independently scaled boxes: half a module at the
  // current zoom, which lands on the 16 step at zoom 1 and carries a name
  // across the five modules a tile has for it. Under the ladder's floor
  // (about two thirds zoom) there is no honest size left, so the labels drop
  // out and the plan becomes a pure footprint drawing, which is what a map
  // does as it pulls back. The hero keeps its own size below.
  const bodyFs = ladderAtMost((M * z) / 2)

  const draw = (mark, isHero) => {
    const xs = repeats(mark.x, mark.w, x0, vw, world.w)
    const ys = repeats(mark.y, mark.h, y0, vh, world.h)
    if (!xs.length || !ys.length) return
    const bw = mark.w * z
    const bh = mark.h * z
    const sw = isHero ? strong : hair
    for (const wx of xs) {
      for (const wy of ys) {
        const x = toX(wx)
        const y = toY(wy)
        // the stroke is centred on the edge, so the rect is inset by half
        // of it to keep the footprint's true size
        boxes.push(
          `<rect x="${n(x + sw / 2)}" y="${n(y + sw / 2)}" width="${n(Math.max(0, bw - sw))}" ` +
            `height="${n(Math.max(0, bh - sw))}" rx="${n(RADIUS * z)}" stroke-width="${n(sw)}"/>`
        )
        // a name belongs to a mark you can see whole enough to point at,
        // so a footprint whose centre is off the sheet keeps quiet rather
        // than leaving half a word against the edge
        const cx = x + bw / 2
        const cy = y + bh / 2
        if (!mark.name || cx < 0 || cx > w || cy < 0 || cy > h) continue
        if (isHero) {
          const fit = fitHero(mark.name, bw, bh)
          if (fit) labels.push(textBlock(fit.lines, fit.fs, cx, cy))
        } else if (!bodyFs) {
          continue
        } else if (mark.w <= 2 * M) {
          // A footprint two modules or under is a POINT on the plan, and a
          // point says its name underneath, the way a map labels a place it
          // is too small to write inside. Always underneath, never
          // sometimes: the icon belt is nine of these in a ring and a belt
          // labelled half in and half out reads as a mistake. One line, so
          // it cannot land on a neighbour: a tile keeps AIR of clearance
          // and the longest of these names runs under 1.7 times that at the
          // body size, both scaling with the camera together.
          labels.push(textBlock([mark.name], bodyFs, cx, cy + bh / 2 + lineHeightFor(bodyFs) * 0.6))
        } else {
          const lines = fitLines(mark.name, bodyFs, bw, bh)
          if (lines) labels.push(textBlock(lines, bodyFs, cx, cy))
        }
      }
    }
  }

  for (const mark of marks) draw(mark, false)
  draw({ ...hero, name: hero.name }, true)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" ` +
    `viewBox="0 0 ${n(w)} ${n(h)}" role="img" ` +
    `aria-label="A plan of the ${SITE} canvas at one view.">` +
    `<rect x="0" y="0" width="${n(w)}" height="${n(h)}" fill="${escapeXml(ground)}"/>` +
    `<g fill="none" stroke="${escapeXml(ink)}">${boxes.join('')}</g>` +
    `<g fill="${escapeXml(ink)}" font-family="${escapeXml(font)}" text-anchor="middle">` +
    `${labels.join('')}</g>` +
    `<rect x="${n(strong / 2)}" y="${n(strong / 2)}" width="${n(w - strong)}" ` +
    `height="${n(h - strong)}" fill="none" stroke="${escapeXml(ink)}" ` +
    `stroke-width="${n(strong)}"/></svg>`
  )
}
