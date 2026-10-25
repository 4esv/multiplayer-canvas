// test/zoom-keys.test.js
// THE KEYS THAT ZOOM (BIBLE.md section 2, the pixel ladder, and section 6, the
// bar): a press of + or - is a rung of the ladder, and a key held with Ctrl,
// Cmd or Alt is the browser's.
//
// Before it, a press multiplied the zoom by 1.15 and the camera then rested on
// the nearest rung. On a 1x screen a rung is a quarter, and 15% of 0.75 is
// under half of that, so the camera grew for the instant before it rested and
// went back to where it was: the key did nothing, in both directions, at the
// zoom the page opens on. Measured in a real browser at 1440x900 and 1x, three
// presses of + each way, a second apart: 0.75 every time.
//
// What is held: from every rung on every display a press moves the camera one
// rung at least (the property the old step broke), lands on the ladder, and a
// run of presses reaches an end and does not stall; and the handler is the one
// that reads the keys: the zoom keys ask stepZoom, and a chord is answered
// before any single key is read.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { PX, stepZoom, snapZoom, zoomStep } from '../src/static/canvas/layout.js'

const APP = readFileSync(join(import.meta.dirname, '..', 'src/static/canvas/app.js'), 'utf8')
const start = APP.indexOf("addEventListener('keydown', e=>{\n  if(e.key==='Escape'){")
const HANDLER = APP.slice(start, APP.indexOf('\n});', start))

// the displays a page is seen on: 1x, a 1.5x laptop, 2x, a phone's 2.625 and 3x
const DPRS = [1, 1.5, 2, 2.625, 3]
const MAXZ = 1.5
const clamp = (z, lo) => Math.max(lo, Math.min(MAXZ, z))
const onLadder = (z, dpr) => {
  const cell = PX * z * dpr
  return Math.abs(cell - Math.round(cell)) < 1e-6
}
// every rung from the first up to the ceiling
const rungs = (dpr) => {
  const s = zoomStep(dpr)
  const out = []
  for (let k = 1; k * s <= MAXZ + 1e-9; k++) out.push(k * s)
  return out
}

describe('a press of a zoom key is a rung', () => {
  // mutation: zoom-keys.step-in-is-a-fraction
  it('moves the camera in from every rung that is not the ceiling, onto a rung', () => {
    for (const dpr of DPRS)
      for (const z of rungs(dpr)) {
        if (z >= MAXZ - 1e-9) continue
        const up = stepZoom(z, 1, dpr)
        assert.ok(up >= z + zoomStep(dpr) - 1e-9, `${dpr}x: + at ${z} gave ${up}, under a rung`)
        assert.ok(onLadder(up, dpr), `${dpr}x: + at ${z} gave ${up}, off the ladder`)
      }
  })

  // mutation: zoom-keys.step-out-is-a-fraction
  it('moves the camera out from every rung but the first, onto a rung', () => {
    for (const dpr of DPRS)
      for (const z of rungs(dpr).slice(1)) {
        const down = stepZoom(z, -1, dpr)
        assert.ok(down <= z - zoomStep(dpr) + 1e-9, `${dpr}x: - at ${z} gave ${down}, under a rung`)
        assert.ok(onLadder(down, dpr), `${dpr}x: - at ${z} gave ${down}, off the ladder`)
      }
  })

  it('is no less than the 15% the keys always took, and goes no further than it must', () => {
    for (const dpr of DPRS) {
      const s = zoomStep(dpr)
      for (const z of rungs(dpr)) {
        const up = stepZoom(z, 1, dpr)
        // the fraction's own nearest rung is the floor of the step...
        assert.ok(up >= snapZoom(z * 1.15, dpr) - 1e-9, `${dpr}x: + at ${z} is under 15%`)
        // ...and one rung past it is already too far
        assert.ok(
          up <= Math.max(snapZoom(z * 1.15, dpr), z + s) + 1e-9,
          `${dpr}x: + at ${z} overshoots`
        )
      }
    }
  })

  it('from between two rungs lands past it on the rung that way, never short of it', () => {
    for (const dpr of DPRS) {
      const s = zoomStep(dpr)
      for (const z of rungs(dpr).slice(2, -2)) {
        const off = z + 0.4 * s
        const up = stepZoom(off, 1, dpr)
        const down = stepZoom(off, -1, dpr)
        assert.ok(up > off && onLadder(up, dpr), `${dpr}x: + at ${off} gave ${up}`)
        assert.ok(down < off && onLadder(down, dpr), `${dpr}x: - at ${off} gave ${down}`)
      }
    }
  })

  it('is the fraction below the first rung, where there is no ladder to step', () => {
    // a watch zoomed out past one device pixel to the cell: out is the fraction,
    // in is the first rung (nothing there is crisp, so nothing is snapped to)
    assert.equal(stepZoom(0.2, -1, 1), 0.2 / 1.15)
    assert.equal(stepZoom(0.2, 1, 1), zoomStep(1))
    assert.equal(stepZoom(zoomStep(1), -1, 1), zoomStep(1) / 1.15)
  })

  it('runs from the opening rung to the ceiling and back to the floor, a press at a time', () => {
    for (const dpr of DPRS) {
      const floor = snapZoom(0.4, dpr, 'up')
      let z = floor
      let presses = 0
      while (z < MAXZ - 1e-9 && presses < 40) {
        const next = clamp(stepZoom(z, 1, dpr), floor)
        assert.ok(next > z, `${dpr}x: + stalled at ${z}`)
        z = next
        presses++
      }
      assert.equal(z, MAXZ, `${dpr}x: + never reached the ceiling`)
      assert.ok(presses <= 14, `${dpr}x: ${presses} presses from floor to ceiling`)
      presses = 0
      while (z > floor + 1e-9 && presses < 40) {
        const next = clamp(stepZoom(z, -1, dpr), floor)
        assert.ok(next < z, `${dpr}x: - stalled at ${z}`)
        z = next
        presses++
      }
      assert.ok(z <= floor + 1e-9, `${dpr}x: - never reached the floor`)
    }
  })

  it('is what the opening view of a 1x laptop does: 0.75 goes to 1, and back to a half', () => {
    // the case that was measured: three presses each way, a second apart,
    // 0.75 every time
    assert.equal(stepZoom(0.75, 1, 1), 1)
    assert.equal(stepZoom(0.75, -1, 1), 0.5)
    // and the displays that already stepped keep their step
    assert.equal(stepZoom(0.875, 1, 2), 1)
    assert.equal(stepZoom(1, -1, 2), 0.875)
    assert.ok(Math.abs(stepZoom(1, 1, 3) - 14 / 12) < 1e-9)
  })
})

describe('the keys read by the page', () => {
  // mutation: zoom-keys.press-is-a-fraction
  it('send the zoom keys through stepZoom, with no fraction of their own', () => {
    const at = HANDLER.indexOf("['+','=','-','_'].includes(e.key)")
    assert.ok(at > -1, 'the zoom keys are not in the global key handler')
    const body = HANDLER.slice(at, at + 400)
    assert.match(body, /zoomAt\(stepZoom\(Z, /)
    assert.doesNotMatch(body, /1\.15/)
  })

  // mutation: keys.chords-answered
  it('leave a chord to the browser before any single key is read', () => {
    const typing = HANDLER.indexOf("if(e.target.closest?.('input,textarea')) return;")
    const chord = HANDLER.indexOf('if((e.ctrlKey || e.metaKey || e.altKey)')
    const slash = HANDLER.indexOf("if(e.key==='/')")
    assert.ok(typing > -1 && slash > -1, 'the handler is not the one this reads')
    assert.ok(chord > typing && chord < slash, 'a chord is read as a bare key')
    // and the one key that is meant to work held down still does: Escape is read first
    assert.ok(HANDLER.indexOf("if(e.key==='Escape')") < chord)
  })

  // mutation: keys.altgr-swallowed
  it('lets AltGr through: a layout that types a / or a ? with it is typing, not a chord', () => {
    assert.match(
      HANDLER,
      /\(e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey\) && !e\.getModifierState\('AltGraph'\)\) return;/
    )
  })
})
