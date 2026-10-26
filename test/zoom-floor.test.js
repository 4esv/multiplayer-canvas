// test/zoom-floor.test.js
// How far out a screen may pull, and why a watch may not pull all the way.
//
// Cover is the floor everywhere else: zoom out until the world fills the
// screen and no further, so there is never void beyond the ground. On a watch
// that floor puts the ENTIRE world on a 1.9 inch display. Measured at 205x251
// against the real world (3888x3408):
//
//   floor        z        tiles on screen   view/world
//   fit        0.2034           9              10%
//   fit/1.5    0.1356          17              21%
//   fit/2      0.1017          28              38%
//   cover      0.0737          30              72%
//
// Cover is only 2.76x out from the opening frame there, because the world is
// nearly square and so is the watch. Every tile mounts, every image decodes,
// and the view height (3405) lands within three pixels of the world height
// (3408), which is exactly the condition under which the toroidal wrap emits
// a second copy of every tile. Safari reloads, then gives up. Reported as
// "reloads multiple times and crashes when I move around", and only ever with
// the camera all the way out.
//
// This is a CAMERA bound, not a world change: same tiles, same coordinates,
// same canvas a billboard sees. A wrist just does not get all of it at once.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  chromeBand,
  chromeDensity,
  dims,
  heroFixed,
  openFrame,
  placeWorld,
  TILES,
  WATCH_ZOOM_OUT,
  zoomFloor,
  cameraBounds,
  WATCH_SLOTS,
  BENTO,
  PX,
  zoomStep,
  snapZoom,
  snapCam,
} from '../src/static/canvas/layout.js'

const hero = heroFixed()
const solved = placeWorld({ tiles: TILES, hero: { w: hero.w, h: hero.h } })
const WORLD = solved.world
const cover = (vw, vh) => Math.max(vw / WORLD.w, vh / WORLD.h)
const fit = (vw, vh) => {
  const f = openFrame()
  return Math.min(vw / f.w, Math.max(1, vh - chromeBand(vw, vh)) / f.h)
}
// how many tiles intersect the view at a zoom, with the home camera and the
// toroidal wrap both honoured (the wrap is the part that doubles at cover)
const onScreen = (vw, vh, z) => {
  const w = vw / z,
    h = vh / z
  const cx = solved.hero.x + hero.w / 2 - w / 2
  const cy = solved.hero.y + hero.h / 2 - h / 2
  let n = 0
  for (const t of TILES) {
    const p = solved.tiles[t.id]
    const d = dims(t)
    const px = (((p.x - cx) % WORLD.w) + WORLD.w) % WORLD.w
    const py = (((p.y - cy) % WORLD.h) + WORLD.h) % WORLD.h
    if (
      [px, px - WORLD.w].some((x) => x < w && x + d.w > 0) &&
      [py, py - WORLD.h].some((y) => y < h && y + d.h > 0)
    )
      n++
  }
  return n
}

describe('the camera floor', () => {
  it('is cover on every screen that is not a watch', () => {
    for (const [vw, vh] of [
      [390, 844],
      [1440, 900],
      [2996, 1507],
      [360, 700],
    ]) {
      assert.notEqual(chromeDensity(vw, vh), 'watch', `${vw}x${vh} is not the tier under test`)
      assert.equal(zoomFloor(vw, vh, WORLD), cover(vw, vh), `${vw}x${vh} lost its cover floor`)
    }
  })

  it('holds a watch one step out from the opening frame', () => {
    for (const [vw, vh] of [
      [205, 251],
      [184, 224],
      [320, 390],
    ]) {
      assert.equal(chromeDensity(vw, vh), 'watch')
      const floor = zoomFloor(vw, vh, WORLD)
      assert.equal(floor, Math.max(cover(vw, vh), fit(vw, vh) / WATCH_ZOOM_OUT))
      assert.ok(floor > cover(vw, vh), `${vw}x${vh} can still pull all the way out`)
      // and it is a floor, not a cage: the opening frame stays reachable
      assert.ok(floor < fit(vw, vh), `${vw}x${vh} cannot zoom out from its own opening frame`)
    }
  })

  // mutation: zoom-floor.floor-below-cover
  it('never floors BELOW cover, which would show void beyond the ground', () => {
    // A very wide, very short viewport is the case where cover is the larger
    // of the two: the floor must take cover's side, not the frame's. The
    // first three alone would not do, since on the 16:9 ground cover is
    // the SMALLER side on every one of them, so a floor with no clamp at all
    // passed. The last ones are where the clamp actually decides.
    const cases = [
      [340, 200],
      [200, 200],
      [351, 239],
      [400, 120],
      [320, 100],
      [480, 90],
      [440, 60],
    ]
    for (const [vw, vh] of cases) {
      assert.equal(chromeDensity(vw, vh), 'watch', `${vw}x${vh} is not the tier under test`)
      assert.ok(zoomFloor(vw, vh, WORLD) >= cover(vw, vh), `${vw}x${vh} floors below cover`)
    }
    assert.ok(
      cases.some(([vw, vh]) => cover(vw, vh) > fit(vw, vh) / WATCH_ZOOM_OUT),
      'no case here has cover as the larger side, so the clamp is untested'
    )
  })

  it('keeps the tile count off the cliff on the reported device', () => {
    // The Ultra, which is where the crash came from. The numbers in the header
    // are the whole argument, so they are asserted rather than narrated.
    const [vw, vh] = [205, 251]
    // Cover is still the line the floor is held off: at cover the view spans
    // the world's HEIGHT exactly, which is the condition under which the wrap
    // emits a second copy of everything.
    assert.equal(Math.round(vh / cover(vw, vh)), WORLD.h, 'cover is no longer the doubling line')
    const floored = onScreen(vw, vh, zoomFloor(vw, vh, WORLD))
    // (the ground holds a handful of tiles; the floor still shows several)
    assert.ok(floored <= 20, `the floor still mounts ${floored} tiles at once`)
    assert.ok(floored >= 3, `the floor is now so tight there is no world left to see (${floored})`)
  })

  it('leaves the wrap unable to paint the world twice over', () => {
    // The doubling condition: a view as tall as the world puts every tile on
    // screen in two places at once. At the floor there has to be real slack.
    // (a quarter of the ground against the 2784-tall world; the 16:9 ground is
    // 624px shorter, so the same floor now holds a seventh of it off frame.
    // The thing that crashed is the tile count above, and that went DOWN.)
    const [vw, vh] = [205, 251]
    const viewH = vh / zoomFloor(vw, vh, WORLD)
    assert.ok(viewH < WORLD.h * 0.9, `the view still spans ${Math.round(viewH)} of ${WORLD.h}`)
    assert.ok(zoomFloor(vw, vh, WORLD) > cover(vw, vh), 'the floor sits on the doubling line')
  })
})

// ---- the pixel ladder (BIBLE.md section 2) -----------------------------------
// The camera rests only where a cell is a whole number of device pixels.
describe('the pixel ladder', () => {
  it('a step is one device pixel per cell', () => {
    for (const dpr of [1, 2, 3]) assert.equal(zoomStep(dpr), 1 / (PX * dpr))
    // a sub-1 ratio is a zoomed-out page, not a coarser display: the step
    // never grows past a device pixel per cell at 1x
    assert.equal(zoomStep(0.5), zoomStep(1))
  })

  it('snaps the way the caller needs: down for a fit, up for a floor, nearest at rest', () => {
    for (const dpr of [1, 2, 3]) {
      const s = zoomStep(dpr)
      for (const z of [0.31, 0.37, 0.387, 0.5, 0.83, 1, 1.2, 1.5]) {
        const down = snapZoom(z, dpr, 'down')
        const up = snapZoom(z, dpr, 'up')
        const near = snapZoom(z, dpr)
        assert.ok(down <= z + 1e-9 && z - down < s + 1e-9, `${dpr}x down ${z} -> ${down}`)
        assert.ok(up >= z - 1e-9 && up - z < s + 1e-9, `${dpr}x up ${z} -> ${up}`)
        assert.ok(Math.abs(near - z) <= s / 2 + 1e-9, `${dpr}x near ${z} -> ${near}`)
        for (const v of [down, up, near]) {
          if (v < s) continue // below the ladder, left as it was
          const cell = PX * v * dpr
          assert.ok(
            Math.abs(cell - Math.round(cell)) < 1e-6,
            `${dpr}x ${v}: cell is ${cell} device px`
          )
        }
      }
      // a value already on the ladder is left alone in every mode
      for (const k of [2, 3, 6])
        for (const mode of ['down', 'up', 'near']) assert.equal(snapZoom(k * s, dpr, mode), k * s)
      // under one device pixel per cell there is no ladder: a fit or a rest
      // keeps its value, a floor climbs to the first step
      assert.equal(snapZoom(0.0001, dpr, 'down'), 0.0001)
      assert.equal(snapZoom(0.0001, dpr, 'near'), 0.0001)
      assert.equal(snapZoom(0.0001, dpr, 'up'), s)
    }
  })

  it('a floor rested on the ladder never undershoots cover', () => {
    for (const [vw, vh] of [
      [184, 224],
      [205, 251],
      [390, 844],
      [1440, 900],
      [3840, 1100],
    ])
      for (const dpr of [1, 2, 3]) {
        const floor = zoomFloor(vw, vh, WORLD)
        assert.ok(
          snapZoom(floor, dpr, 'up') >= floor - 1e-9,
          `${vw}x${vh} at ${dpr}x rests below its floor`
        )
      }
  })

  it('a rested camera puts the world origin on a device pixel', () => {
    for (const dpr of [1, 2, 3])
      for (const z of [snapZoom(0.37, dpr, 'up'), snapZoom(0.83, dpr, 'down'), 1]) {
        for (const c of [-1234.567, 0, 17.3, 3887.99]) {
          const r = snapCam(c, z, dpr)
          const dev = r * z * dpr
          assert.ok(
            Math.abs(dev - Math.round(dev)) < 1e-6,
            `${c} at z ${z} ${dpr}x -> ${dev} device px`
          )
          assert.ok(
            Math.abs(r - c) <= 0.5 / (z * dpr) + 1e-9,
            'the rest moves the camera by half a device pixel at most'
          )
        }
      }
  })
})

// ---- the rested bounds: floor and fit on the same ladder ---------------------
describe('the rested camera bounds', () => {
  it('never floor above the rung the opening frame fits on', () => {
    for (const [vw, vh] of [
      [184, 224],
      [205, 251],
      [320, 392],
      [320, 568],
      [390, 844],
      [768, 1024],
      [1440, 900],
      [3840, 1100],
    ])
      for (const dpr of [1, 2, 3]) {
        const b = cameraBounds(vw, vh, WORLD, dpr)
        assert.ok(b.minZ <= b.fit + 1e-9, `${vw}x${vh} at ${dpr}x floors above its own fit`)
        assert.ok(b.minZ >= cover(vw, vh) - 1e-9, `${vw}x${vh} at ${dpr}x floors below cover`)
      }
  })

  it('never lets a watch hold more than WATCH_SLOTS slots across (the wrist that did not zoom out did not die)', () => {
    const span = WATCH_SLOTS * BENTO.unit + (WATCH_SLOTS - 1) * BENTO.gap
    for (const [vw, vh] of [
      [320, 240],
      [320, 392],
      [205, 251],
      [184, 224],
    ])
      for (const dpr of [1, 2, 3]) {
        assert.equal(chromeDensity(vw, vh), 'watch')
        const b = cameraBounds(vw, vh, WORLD, dpr)
        assert.ok(
          vw / b.minZ <= span + 1e-6,
          `${vw}x${vh} at ${dpr}x shows ${Math.round(vw / b.minZ)} world px across`
        )
        assert.ok(b.fit >= b.minZ)
        // and past it nothing mounts: the plan paints the wrist's full width
        assert.equal(b.mountZ, b.minZ, `${vw}x${vh} at ${dpr}x mounts below its floor`)
      }
    // and a phone keeps its cover floor: the cap is the wrist's alone
    const phone = cameraBounds(390, 844, WORLD, 3)
    assert.ok(390 / phone.minZ > span, 'a phone may still see the world')
  })

  it('opens a watch at its floor, on the ladder', () => {
    const b = cameraBounds(320, 240, WORLD, 2)
    assert.equal(b.fit, b.minZ)
    assert.equal(b.minZ, 0.75)
  })
})
