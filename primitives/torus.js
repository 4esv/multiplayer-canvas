// multiplayer-canvas/torus: the camera on a wrapped world, on a ladder of crisp zooms.
//
// Pure functions, no DOM. Inputs are numbers in world px (a position, a
// camera corner, the world's size, the view's size) and a device pixel
// ratio. Outputs: where a span shows in a view that wraps (wrapPos,
// wrapSpots, seamAt), the copy of a point nearest the camera (nearestWrap),
// zooms snapped so one cell is whole device pixels (zoomStep, snapZoom,
// stepZoom, snapCam), and a smooth pan-and-zoom flight (flightPath,
// flightAt, van Wijk and Nuij 2003).
//
// import { wrapPos, snapZoom, nearestWrap } from 'multiplayer-canvas/torus'

import { PX } from './grid.js'

// ---- the zoom ladder (BIBLE.md section 2) -----------------------------------
// A pixel is only a pixel at an integer number of DEVICE pixels; at any other
// scale the browser blends its edges and the whole grammar (grid, mark, type,
// the 24-grid icons) goes soft. So the camera RESTS on the ladder where one
// cell is a whole number of device pixels, z = k / (PX x dpr), and moves
// freely between steps while a gesture is live. On a 2x display the steps are
// an eighth apart, on a phone a twelfth: fine enough to feel continuous, exact
// enough to be crisp. `mode` says which way to go when the value is between
// steps: 'down' for a fit (never overflow the frame it fits), 'up' for a
// floor (never show past the ground), nearest for a gesture at rest.
// seam: test/chrome-fit.test.js, test/zoom-floor.test.js
export const zoomStep = (dpr = 1) => 1 / (PX * Math.max(1, dpr))
export function snapZoom(z, dpr = 1, mode = 'near') {
  const s = zoomStep(dpr)
  const q = z / s
  // under one device pixel per cell there is no ladder to rest on: nothing
  // at that scale can be crisp, so a fit or a gesture keeps its own value
  // (snapping a 1x watch's 0.20 fit UP to 0.25 would overflow the frame it
  // fits). A floor still climbs to the first step, since a floor may rise.
  if (q < 1) return mode === 'up' ? s : z
  const k =
    mode === 'down' ? Math.floor(q + 1e-9) : mode === 'up' ? Math.ceil(q - 1e-9) : Math.round(q)
  return k * s
}
// A press of a zoom key is a rung, never less. A fixed fraction is under half
// a rung on a 1x screen (15% of 0.75 is 0.11 and a rung is 0.25), so the rung
// the camera settles onto after it would be the one it left, and the key
// would do nothing. The step is the fraction's nearest rung, and at least the next one
// that way: from a rung, the neighbour; from between two (a gesture just let
// go), the rung on that side. Below the first rung there is no ladder, and a
// step out is the fraction itself.
// seam: test/zoom-keys.test.js
const KEY_ZOOM = 1.15
export function stepZoom(z, dir, dpr = 1) {
  const s = zoomStep(dpr)
  const q = z / s
  if (dir < 0 && q <= 1 + 1e-6) return z / KEY_ZOOM
  const want = (dir > 0 ? z * KEY_ZOOM : z / KEY_ZOOM) / s
  const k =
    dir > 0
      ? Math.max(Math.round(want), Math.floor(q + 1e-6) + 1)
      : Math.min(Math.round(want), Math.ceil(q - 1e-6) - 1)
  return k * s
}
// a camera corner that lands the world origin on a device pixel, so the
// lattice and everything seated on it paint whole
export const snapCam = (c, z, dpr = 1) => Math.round(c * z * dpr) / (z * dpr)

// Where a span lands in a view, as an offset from the camera, or null when
// it is off screen: its own copy, the one the renderer places the node at
// and every presence cursor rides.
// seam: test/canvas-layout.test.js
export function wrapPos(pos, cam, worldSize, viewSize, size) {
  const p = (((pos - cam) % worldSize) + worldSize) % worldSize
  for (const c of [p, p - worldSize]) if (c < viewSize && c + size > 0) return c
  return null
}
// Every spot a span shows at in a view NO LONGER THAN THE WORLD, its own copy
// first. There is a second only when the view's edge cuts the span: its
// start runs off the far edge while its end comes back in at the near one,
// and the two show disjoint parts of it (the part past the far edge is
// exactly the part at the near one). A view longer than the world is the
// one thing this refuses to describe.
// seam: test/canvas-layout.test.js
export function wrapSpots(pos, cam, worldSize, viewSize, size) {
  if (viewSize > worldSize + 1e-6) throw new RangeError('a view longer than the world')
  const p = (((pos - cam) % worldSize) + worldSize) % worldSize
  const out = []
  if (p < viewSize) out.push(p)
  if (p - worldSize + size > 0) out.push(p - worldSize)
  return out
}
// Where the world's edge (world coordinate 0) falls in a view no longer than
// the world, or null: p + k * world lands in [0, view) for k = 0 alone, so
// the edge is on screen once at most and the seam is one line per axis.
// seam: test/canvas-layout.test.js
export function seamAt(cam, worldSize, viewSize) {
  const p = ((-cam % worldSize) + worldSize) % worldSize
  return p < viewSize ? p : null
}

const RHO = Math.SQRT2
export function flightPath(w0, w1, u1) {
  if (u1 < 1) {
    return { zoom: Math.sign(Math.log(w1 / w0)) || 1, S: Math.abs(Math.log(w1 / w0)) / RHO }
  }
  // eq 9: b_i carries (-1)^i, so b0 rides plus and b1 minus
  const b = (wi, sgn) =>
    (w1 * w1 - w0 * w0 + sgn * Math.pow(RHO, 4) * u1 * u1) / (2 * wi * RHO * RHO * u1)
  const r = (bi) => Math.log(-bi + Math.sqrt(bi * bi + 1))
  const r0 = r(b(w0, 1))
  return { r0, S: (r(b(w1, -1)) - r0) / RHO }
}
// position on the path at arc length s: u along the pan line, w the zoom
export function flightAt(f, w0, s) {
  if (f.zoom !== undefined) return { u: 0, w: w0 * Math.exp(f.zoom * RHO * s) }
  const k = w0 / (RHO * RHO)
  return {
    u: k * Math.cosh(f.r0) * Math.tanh(RHO * s + f.r0) - k * Math.sinh(f.r0),
    w: (w0 * Math.cosh(f.r0)) / Math.cosh(RHO * s + f.r0),
  }
}
// The world is a TORUS, so a world coordinate names infinitely many points:
// the tile at wx also stands at wx +- world, +- 2*world, forever. Which copy
// a flight aims at is the whole difference between a hop across the seam and
// a tour of the entire world, so every deliberate move resolves its target
// to the copy nearest the camera it is leaving. Ties (exactly half a world)
// go forward; there is no shorter side to prefer.
export function nearestWrap(target, cur, world) {
  if (!world) return target
  let d = (((target - cur) % world) + world) % world
  if (d > world / 2) d -= world
  return cur + d
}
