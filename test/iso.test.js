// test/iso.test.js
// BIBLE.md section 3, the third axis: pixel isometric on the cell lattice.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { UNIT, project, unproject, boxFaces, boxBounds, isoBox } from '../src/static/canvas/iso.js'

describe('iso: the projection', () => {
  // mutation: iso.height-falls
  it('steps two cells across per unit (x rising, y falling), and two up per unit of height', () => {
    assert.deepEqual(project(1, 0, 0), { u: UNIT, v: -UNIT / 2 })
    assert.deepEqual(project(0, 1, 0), { u: UNIT, v: UNIT / 2 })
    assert.deepEqual(project(0, 0, 1), { u: 0, v: -UNIT })
  })
  it('lands every vertex on a whole cell', () => {
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        for (let z = 0; z < 5; z++) {
          const p = project(x, y, z)
          assert.ok(
            Number.isInteger(p.u) && Number.isInteger(p.v),
            `${x},${y},${z} -> ${p.u},${p.v}`
          )
        }
  })
  it('unproject is the exact inverse on the ground', () => {
    for (let x = -3; x <= 3; x++)
      for (let y = -3; y <= 3; y++) {
        const p = project(x, y, 0)
        const q = unproject(p.u, p.v)
        assert.equal(q.x, x)
        assert.equal(q.y, y)
      }
  })
})

describe('iso: the box', () => {
  it('has three faces of four corners each, and the top sits h units above the floor', () => {
    const f = boxFaces(2, 3, 1)
    for (const face of Object.values(f)) assert.equal(face.length, 4)
    // the top face's back corner is the projected (0,0,h)
    assert.deepEqual(f.top[0], [0, -UNIT])
    // the left wall stands under the x = 0 edge, its far corner on the ground
    assert.deepEqual(f.left[3], [0, 0])
    assert.deepEqual(f.left[2], [3 * UNIT, 3 * (UNIT / 2)])
  })
  it('bounds a unit cube at 4 cells wide and 4 tall', () => {
    const b = boxBounds(1, 1, 1)
    assert.equal(b.w, 2 * UNIT)
    assert.equal(b.h, UNIT + UNIT)
  })
  it('sets the faces as three densities: checker, ink, and an outlined top', () => {
    const { svg, w, h } = isoBox(1, 1, 1)
    assert.match(svg, /shape-rendering="crispEdges"/)
    assert.match(svg, /<pattern id="iso-checker-1-1-1"/)
    assert.match(svg, /fill="url\(#iso-checker-1-1-1\)"/)
    assert.match(svg, /fill="currentColor"\/><polygon/)
    assert.match(svg, /fill="none" stroke="currentColor"/)
    assert.equal(w, 2 * UNIT * 4)
    assert.equal(h, (UNIT + UNIT) * 4)
    assert.equal(isoBox(1, 1, 1).svg, svg, 'pure: same input, same output')
  })
})
