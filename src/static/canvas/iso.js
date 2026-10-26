// iso.js: the cell's third axis (BIBLE.md section 3).
//
// Pixel isometric is the same cell with depth: an edge along x steps two
// cells right and one UP, along y two cells right and one down, along z two
// cells up. (y runs from the top-left of the
// screen to the bottom-right and a line of text rises to the right.) Every vertex lands on a cell, every slope is 2:1, so a box drawn
// here rasterises to clean stairs at any integer scale and sits on the same
// lattice as a flat sprite, a glyph or a tile. That is what lets a thing on
// the canvas be flat or solid without anything else changing: the ground
// does not know which it is.
//
// In two inks a solid has no shading, it has DENSITY: the top face is ground
// inside an ink edge, the left face is the 50% checker, the right face is
// solid ink. Three faces, three dither levels, one light that is nowhere in
// particular. The mark's alphabet, the icons and this all draw on one grid.
//
// PURE. No DOM. project() and unproject() are exact inverses; boxFaces()
// hands back polygons in cell units; isoBox() sets them as SVG in the same
// crispEdges idiom as pixel-type.js. test/iso.test.js owns it.

// one iso unit is two cells: the smallest step that keeps a 2:1 slope on
// the lattice with every vertex on a whole cell
// seam: test/iso.test.js
export const UNIT = 2

// (x, y, z) in iso units -> (u, v) in cells. z rises.
// seam: test/iso.test.js
export function project(x, y, z = 0) {
  return { u: (x + y) * UNIT, v: (y - x) * (UNIT / 2) - z * UNIT }
}
// (u, v) in cells -> (x, y) on the ground plane (z = 0)
// seam: test/iso.test.js
export function unproject(u, v) {
  const a = u / UNIT
  const b = v / (UNIT / 2)
  return { x: (a - b) / 2, y: (a + b) / 2 }
}

// the three visible faces of a w x d x h box standing on the ground with its
// far corner at the origin: top, left (the x = 0 wall, the lower-left face
// on screen) and right (the y = d wall, the lower-right). Each is four
// [u, v] corners in cells, clockwise.
// seam: test/iso.test.js
export function boxFaces(w, d, h) {
  const P = (x, y, z) => {
    const p = project(x, y, z)
    return [p.u, p.v]
  }
  return {
    top: [P(0, 0, h), P(w, 0, h), P(w, d, h), P(0, d, h)],
    left: [P(0, 0, h), P(0, d, h), P(0, d, 0), P(0, 0, 0)],
    right: [P(0, d, h), P(w, d, h), P(w, d, 0), P(0, d, 0)],
  }
}

// the box's bounds in cells, so a caller can seat it
// seam: test/iso.test.js
export function boxBounds(w, d, h) {
  const f = boxFaces(w, d, h)
  const pts = [...f.top, ...f.left, ...f.right]
  const us = pts.map((p) => p[0])
  const vs = pts.map((p) => p[1])
  const minU = Math.min(...us)
  const minV = Math.min(...vs)
  return { minU, minV, w: Math.max(...us) - minU, h: Math.max(...vs) - minV }
}

const poly = (pts, dx, dy) => pts.map(([u, v]) => `${u + dx},${v + dy}`).join(' ')

// an isometric box as SVG, faces as dither densities, in world px at `px` a
// cell. The svg carries its own size so it seats like a glyph would.
// seam: test/iso.test.js
export function isoBox(w, d, h, { px = 4, className = 'iso' } = {}) {
  const f = boxFaces(w, d, h)
  const b = boxBounds(w, d, h)
  const dx = -b.minU
  const dy = -b.minV
  const W = b.w * px
  const H = b.h * px
  const id = `iso-checker-${w}-${d}-${h}`
  const svg =
    `<svg class="${className}" viewBox="0 0 ${b.w} ${b.h}" width="${W}" height="${H}" ` +
    `shape-rendering="crispEdges" aria-hidden="true" focusable="false">` +
    `<defs><pattern id="${id}" width="2" height="2" patternUnits="userSpaceOnUse">` +
    `<rect width="1" height="1" fill="currentColor"/><rect x="1" y="1" width="1" height="1" fill="currentColor"/></pattern></defs>` +
    `<polygon points="${poly(f.left, dx, dy)}" fill="url(#${id})"/>` +
    `<polygon points="${poly(f.right, dx, dy)}" fill="currentColor"/>` +
    `<polygon points="${poly(f.top, dx, dy)}" fill="none" stroke="currentColor" stroke-width="1"/>` +
    `</svg>`
  return { svg, w: W, h: H, cols: b.w, rows: b.h }
}
