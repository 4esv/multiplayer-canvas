// The shipped world's geometry contract: placeWorld (the tiered-shells
// solver) + heroFixed over TILES, exactly the path app.js runs.
//   - one world for every client: the solve is deterministic and takes NO
//     viewport input, so two devices can never disagree
//   - NOTHING EVER TOUCHES: every pair keeps the strangers' AIR on one
//     axis, min-image on both, hero included
//   - everything lands on the module, world dims included
//   - the ground hugs the content: the seam is exact on all four sides, so
//     the corridor between world repeats is a constant, not an ocean
//   - the icon belt is the innermost ring, the compass holds every tile
//     within a quarter turn of home, and neither half hoards the ink
//   - the hero's north mark strip stays clear, and the world reserves
//     NOTHING for the screen chrome (that clearance is a camera property
//     now; test/chrome-fit.test.js holds it across the viewport matrix)
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  PX,
  MARK,
  TILES,
  homeVec,
  heroFixed,
  placeWorld,
  openFrame,
  dockBox,
  dockSlots,
  DOCK,
  BENTO,
  SLOTS,
  spanBox,
  SEAM,
  GUTTER,
  AIR,
  M,
  dims,
  MEMBERS,
  CHROME,
  BAR_MIN_W,
  WATCH_SLOTS,
  cameraBounds,
  chromeDensity,
  mapOpenAt,
  slotShared,
  mountsAt,
  wrapPos,
  wrapSpots,
  seamAt,
  zoomStep,
  snapZoom,
  chromeBand,
  ZONE_TITLE,
  pileGeometry,
} from '../src/static/canvas/layout.js'
import { loadMarkdownDir } from '../src/lib/content.js'
import { kindOf, CASE_STUDY, EXPERIMENT } from '../src/lib/entry-kind.js'

const LIVE = TILES
const hero = heroFixed()
const solve = () => placeWorld({ tiles: LIVE, hero })

// min-image delta and per-axis gap on the torus
const dd = (a, b, world) => {
  let d = a - b
  if (d > world / 2) d -= world
  if (d < -world / 2) d += world
  return d
}
const axisGap = (aPos, aSize, bPos, bSize, world) =>
  Math.abs(dd(bPos + bSize / 2, aPos + aSize / 2, world)) - (aSize + bSize) / 2

describe('the shipped world (tiered shells)', () => {
  const out = solve()
  const { w: W, h: H } = out.world
  const hCX = out.hero.x + hero.w / 2
  const hCY = out.hero.y + hero.h / 2

  it('solves violation-free with the full live tile set', () => {
    assert.equal(out.violations, 0)
    for (const t of LIVE) assert.ok(out.tiles[t.id], `${t.id} was placed`)
  })

  it('is deterministic and viewport-blind: the same world every time', () => {
    assert.deepEqual(solve(), out)
  })

  // mutation: chrome-fit.zone-centred-alone, chrome-fit.zone-on-floor
  it('lands everything on the lattice: the ring and the dock on the module, every tile on the cell inside its slot', () => {
    assert.equal(W % M, 0)
    assert.equal(H % M, 0)
    const pitch = BENTO.unit + BENTO.gap
    for (const t of LIVE) {
      if (t.type === 'icon' || t.id === 'maurice') continue
      const r = out.tiles[t.id]
      const d = dims(t)
      const s = SLOTS[t.id]
      assert.ok(s, `${t.id} has no slot on the ring`)
      // a seat's third number is a nudge in whole modules along its row, and
      // its fourth the same down its column
      assert.ok(Number.isInteger(s[2] ?? 0), `${t.id} is nudged off the module`)
      assert.ok(Number.isInteger(s[3] ?? 0), `${t.id} is nudged off the module`)
      const slot = {
        x: SEAM.x + s[0] * pitch + (s[2] ?? 0) * M,
        y: SEAM.y + s[1] * pitch + (s[3] ?? 0) * M,
      }
      assert.equal(slot.x % M, 0)
      assert.equal(slot.y % M, 0)
      assert.equal(r.x % PX, 0, `${t.id} x off the cell`)
      assert.equal(r.y % PX, 0, `${t.id} y off the cell`)
      // centred in its slot (or the slots it spans), to the cell, and inside;
      // a zone centres with the name standing over it, as one block
      const box = spanBox(t)
      const name = t.type === 'zone' ? ZONE_TITLE.h + ZONE_TITLE.gap : 0
      assert.ok(
        Math.abs(r.x - slot.x - (box.w - d.w) / 2) <= PX / 2,
        `${t.id} is off centre in its slot`
      )
      assert.ok(
        Math.abs(r.y - name - slot.y - (box.h - d.h - name) / 2) <= PX / 2,
        `${t.id} is off centre in its slot`
      )
      assert.ok(d.w <= box.w && d.h <= box.h, `${t.id} is bigger than its slot`)
      // a span covers whole slots on the ring, and the ones it covers are
      // nobody else's seat
      for (let c = 1; c < (t.span || 1); c++) {
        assert.ok(s[0] + c < BENTO.cols, `${t.id} spans off the ring`)
        const taken = Object.entries(SLOTS).find(
          ([id, o]) => id !== t.id && o[0] === s[0] + c && o[1] === s[1]
        )
        assert.ok(!taken, `${t.id} spans over ${taken?.[0]}'s slot`)
      }
    }
    // no two tiles share a slot
    const seats = new Set(Object.values(SLOTS).map((s) => s.join(',')))
    assert.equal(seats.size, Object.keys(SLOTS).length)
    assert.equal(out.tiles.dock.x % M, 0, 'dock x off the module')
    assert.equal(out.tiles.dock.y % M, 0, 'dock y off the module')
  })

  // mutation: canvas-layout.hero-unsnapped
  it('keeps the hero identical to the one-source derivation', () => {
    assert.equal(hero.w % M, 0)
    assert.equal(hero.h % M, 0)
    // 2/3 of the design atom, snapped: the value app.js frames the fit
    // zoom around. Recorded so an accidental hero resize fails loudly.
    assert.deepEqual(hero, { w: 912, h: 432 })
  })

  it('NOTHING EVER TOUCHES: every pair keeps the strangers AIR on one axis', () => {
    // the icons stand ON the dock, so the dock is the body they are
    const rects = LIVE.filter((t) => t.type !== 'icon').map((t) => ({
      id: t.id,
      ...out.tiles[t.id],
      ...dims(t),
    }))
    rects.push({ id: 'hero', x: out.hero.x, y: out.hero.y, w: hero.w, h: hero.h })
    rects.push({ id: 'dock', ...dockBox({ ...out.hero, w: hero.w, h: hero.h }) })
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const A = rects[i]
        const B = rects[j]
        // the dock is the hero's furniture, a gutter under it by design
        if ((A.id === 'hero' && B.id === 'dock') || (A.id === 'dock' && B.id === 'hero')) continue
        const gx = axisGap(A.x, A.w, B.x, B.w, W)
        const gy = axisGap(A.y, A.h, B.y, B.h, H)
        assert.ok(
          gx >= AIR - 1 || gy >= AIR - 1,
          `${A.id} and ${B.id} under the air floor (${gx}, ${gy})`
        )
      }
  })

  it('is a 4K screen of cells: 16:9, 960 x 540, with the ring inside it', () => {
    // the ground is 3840 x 2160 at one cell a pixel, so the board a person
    // paints on is a whole number of cells each way and 16:9 exactly
    assert.deepEqual({ w: W, h: H }, { w: 3840, h: 2160 })
    assert.equal(W / PX, 960)
    assert.equal(H / PX, 540)
    assert.equal(W * 9, H * 16)
    // the ring is seated at the near corner of the wrap corridor, on the
    // module both ways, and fits inside the ground with the corridor left
    const pitch = BENTO.unit + BENTO.gap
    const ringW = BENTO.cols * pitch - BENTO.gap
    const ringH = BENTO.rows * pitch - BENTO.gap
    assert.equal(SEAM.x % M, 0)
    assert.equal(SEAM.y % M, 0)
    assert.equal(W - ringW, 5 * M, 'the corridor across the wrap')
    assert.equal(H - ringH, 3 * M, 'the corridor down the wrap')
    assert.ok(SEAM.x + ringW <= W && SEAM.y + ringH <= H)
  })

  it('docks every icon: an air under the hero, as wide as it, every glyph inside on the cell', () => {
    const box = dockBox({ ...out.hero, w: hero.w, h: hero.h })
    assert.deepEqual(out.tiles.dock, { x: box.x, y: box.y })
    assert.equal(box.x, out.hero.x)
    assert.equal(box.w, hero.w)
    assert.equal(box.y, out.hero.y + hero.h + AIR)
    assert.equal(box.h % M, 0, 'the dock is modules tall')
    const icons = LIVE.filter((t) => t.type === 'icon')
    const { slots, overflow } = dockSlots({ ...out.hero, w: hero.w, h: hero.h }, icons)
    assert.deepEqual(overflow, [], 'an icon the dock has no row for')
    for (const t of icons) {
      const r = out.tiles[t.id]
      const d = dims(t)
      assert.deepEqual(r, slots[t.id], `${t.id} is not where the dock seats it`)
      assert.equal(r.x % PX, 0, `${t.id} x off the cell`)
      assert.equal(r.y % PX, 0, `${t.id} y off the cell`)
      assert.ok(
        r.x >= box.x && r.x + d.w <= box.x + box.w && r.y >= box.y && r.y + d.h <= box.y + box.h,
        `${t.id} hangs off the dock`
      )
    }
    // the rows are the hand's order, and each row is centred on the slab
    const rows = DOCK.rows
    let i = 0
    for (const n of rows) {
      const row = DOCK.order.slice(i, i + n)
      i += n
      const xs = row.map((id) => out.tiles[id].x)
      for (let k = 1; k < xs.length; k++) assert.equal(xs[k] - xs[k - 1], DOCK.pitch)
      const left = xs[0] - box.x
      const right = box.x + box.w - (xs[xs.length - 1] + 2 * M)
      assert.ok(Math.abs(left - right) <= PX, `row ${row[0]}.. is off centre (${left} vs ${right})`)
    }
    // no two icons share a seat
    const seats = new Set(icons.map((t) => `${out.tiles[t.id].x},${out.tiles[t.id].y}`))
    assert.equal(seats.size, icons.length)
  })

  // mutation: canvas-layout.tile-unlabelled, canvas-layout.label-lower-case
  it('labels every thing on the ground, each in Title Case (#339)', () => {
    // the author: "For consistency's sake we should capitalize all labels
    // and label all things". A word is capitalised unless it is a small
    // word inside the name (Sisyphus the Slime); a brand keeps its own
    // casing because it starts in capitals (GitHub, E-ffigy, RSS)
    const SMALL = new Set([
      'a',
      'an',
      'and',
      'at',
      'by',
      'for',
      'in',
      'of',
      'on',
      'or',
      'the',
      'to',
    ])
    for (const t of LIVE) {
      assert.ok(typeof t.label === 'string' && t.label.trim(), `${t.id} has no label`)
      t.label
        .split(/\s+/)
        .forEach((w, i) =>
          assert.ok(
            /^[A-Z0-9]/.test(w) || (i > 0 && SMALL.has(w)),
            `${t.id}: "${w}" in "${t.label}" is not Title Case`
          )
        )
    }
  })

  it('holds the compass: every tile lands within a quarter turn of home', () => {
    for (const t of LIVE) {
      if (t.type === 'icon') continue // the dock's, not the compass's
      if (t.id === 'maurice') continue // seated by hand in the ground's corner, off every ring
      const v = homeVec(t)
      if (!v) continue
      const d = dims(t)
      const r = out.tiles[t.id]
      const bx = dd(r.x + d.w / 2, hCX, W)
      const by = dd(r.y + d.h / 2, hCY, H)
      const dot = (bx * v[0] + by * v[1]) / Math.hypot(bx, by)
      const ang = Math.acos(Math.max(-1, Math.min(1, dot)))
      assert.ok(
        ang <= Math.PI / 2 + 0.01,
        `${t.id} strays ${((ang / Math.PI) * 180).toFixed(1)} deg off its neighborhood`
      )
    }
  })

  it('reserves NOTHING in the world for the screen chrome', () => {
    // This replaced "keeps the bottom chrome band clear of tiles at the home
    // camera", which asserted a world-space reservation the solver no longer
    // makes. That reservation could only ever be right at one zoom (it was
    // solved once against DESIGN_VIEW and measured 2.6x too small on a watch
    // and too large on a laptop), so it is a camera property now and the
    // clearance guarantee lives in test/chrome-fit.test.js, across the
    // viewport matrix, where the bar's height is actually known.
    //
    // What is asserted here is the architectural half: placeWorld reads
    // nothing but tiles and hero, so no chrome argument can move a tile.
    for (const chrome of [{ topH: 108, bottom: true }, { topH: 999 }, undefined]) {
      assert.deepEqual(placeWorld({ tiles: LIVE, hero, chrome }), out)
    }
  })

  it("keeps the hero's north air strip empty for the maker's mark", () => {
    // the mark seats at hero.y - MARK - 3 cells inside the AIR strip (app.js
    // positionStampA); assert the strip really is tile-free so the pin can
    // never overlap anything, and that the pin itself fits the strip
    assert.equal(MARK, 11 * PX)
    assert.ok(MARK + 3 * PX <= AIR, 'the mark and its gap fit inside the air strip')
    // the hero's box is whole cells, so a mark seated on the cell lattice
    // relative to it lands on the world's lattice too
    assert.equal(hero.w % PX, 0)
    assert.equal(hero.h % PX, 0)
    assert.equal(out.hero.x % PX, 0)
    assert.equal(out.hero.y % PX, 0)
    const strip = { x: out.hero.x, y: out.hero.y - AIR, w: hero.w, h: AIR }
    for (const t of LIVE) {
      const d = dims(t)
      const r = out.tiles[t.id]
      const gx = axisGap(strip.x, strip.w, r.x, d.w, W)
      const gy = axisGap(strip.y, strip.h, r.y, d.h, H)
      assert.ok(gx >= 0 || gy >= 0, `${t.id} intrudes on the mark strip`)
    }
  })

  it('derives the opening frame from the hero and its dock, no magic numbers', () => {
    // BIBLE.md section 2: the open frame holds the block (the hero, a
    // gutter, the dock) with a gutter on every side
    const of = openFrame()
    const dock = dockBox({ x: 0, y: 0, ...hero })
    assert.deepEqual(of, {
      w: hero.w + 2 * GUTTER,
      h: hero.h + AIR + dock.h + 2 * GUTTER,
    })
    // and the frame really contains every docked icon
    const block = { y: out.hero.y, h: hero.h + AIR + dock.h }
    const bCY = block.y + block.h / 2
    for (const t of LIVE) {
      if (t.type !== 'icon') continue
      const r = out.tiles[t.id]
      const d = dims(t)
      const cy = dd(r.y + d.h / 2, bCY, H)
      assert.ok(
        Math.abs(cy) + d.h / 2 <= of.h / 2,
        `${t.id} rides outside the opening frame (${cy})`
      )
    }
  })

  it('keeps the work bearing to its quarter turn', () => {
    // the six case studies used to be the largest group the compass carried;
    // they ride one stack now (BIBLE.md section 5), which still has to sit
    // inside its +-45deg wedge like everything else. The WORK ZONE that used
    // to share the bearing was dropped on 2026-09-16: a door landing on a
    // paragraph beside the studies said what the studies say, so its copy
    // became the about triptych's middle panel and the bearing is the
    // stack's alone.
    const work = TILES.filter((t) => (t.tags || []).join() === 'work')
    assert.deepEqual(
      work.map((t) => t.id).sort(),
      ['work'],
      'the work bearing carries the case-study stack'
    )
    // settled positions must hold the quarter turn (the compass test also
    // covers this; here the aim is the failure reading "the fan cap broke")
    for (const t of work) {
      const v = homeVec(t)
      const d = dims(t)
      const r = out.tiles[t.id]
      const bx = dd(r.x + d.w / 2, hCX, W)
      const by = dd(r.y + d.h / 2, hCY, H)
      const dot = (bx * v[0] + by * v[1]) / Math.hypot(bx, by)
      const ang = Math.acos(Math.max(-1, Math.min(1, dot)))
      assert.ok(ang <= Math.PI / 2 + 0.01, `${t.id} left the work wedge`)
    }
  })

  it('uses the ground evenly: neither half hoards the ink', () => {
    // content skews by nature (repos + experiments north vs writing alone
    // south), so the bound is a tolerance, not a perfect split; a new
    // one-sided pile breaks it.
    let L = 0,
      R = 0,
      T = 0,
      B = 0
    // Area is SPLIT where a tile straddles the axis rather than being handed
    // wholly to the side its centre falls on (2026-09-16). The about triptych
    // spans three slots and sits centred under the hero: attributing all of
    // it to one side made the ring read as 69% right-heavy when what is
    // actually there is a balanced ring with a wide tile down the middle.
    // Measuring the overlap is the same question asked correctly.
    const splitX = (x, w) => {
      const a = dd(x, hCX, W)
      const b = a + w
      const left = Math.max(0, Math.min(0, b) - Math.min(0, a))
      return { left, right: w - left }
    }
    for (const t of LIVE) {
      const d = dims(t)
      const r = out.tiles[t.id]
      const sx = splitX(r.x, d.w)
      L += sx.left * d.h
      R += sx.right * d.h
      const sy = splitX(r.y, d.h)
      // splitX is written on x, but the arithmetic is the same on y with the
      // hero's other centre; reuse it by naming the pieces after the axis
      const top = Math.max(0, Math.min(0, dd(r.y, hCY, H) + d.h) - Math.min(0, dd(r.y, hCY, H)))
      T += top * d.w
      B += (d.h - top) * d.w
      void sy
    }
    for (const [a, b, name] of [
      [L, R, 'left/right'],
      [T, B, 'top/bottom'],
    ]) {
      const share = Math.max(a, b) / (a + b)
      assert.ok(share <= 0.65, `${name} imbalance: ${(share * 100).toFixed(1)}% on one side`)
    }
  })
})

// BIBLE.md section 5, the taxonomy: an experiment has no card, it is an
// object on the ground (a toolkit PNG under its name); a case study is a card.
describe('the taxonomy on the canvas', () => {
  const ROOT = join(import.meta.dirname, '..')
  const entries = loadMarkdownDir(join(ROOT, 'content/feed'), (base, data) => ({
    ...base,
    type: data.type,
    webOnly: data.web_only === true,
  }))
  const everything = [...TILES, ...MEMBERS]

  // mutation: canvas-layout.experiment-as-card
  it('an experiment is a web object with its PNG, never a card', async () => {
    const experiments = (await entries()).filter((e) => kindOf(e) === EXPERIMENT)
    assert.ok(experiments.length, 'the tree has experiments')
    for (const { slug } of experiments) {
      const rows = everything.filter((t) => t.slug === slug)
      assert.deepEqual(
        rows.map((t) => t.type),
        ['web'],
        `${slug}: one web object on the ground, no card`
      )
      assert.ok(existsSync(join(ROOT, 'src/static/img/canvas', `${slug}.png`)), `${slug}.png`)
    }
    for (const t of everything.filter((t) => t.type === 'web'))
      assert.ok(
        experiments.some((e) => e.slug === t.slug),
        `${t.id}: a web object that is not an experiment`
      )
  })

  it('a case study is a card in the work stack', async () => {
    const studies = (await entries()).filter((e) => kindOf(e) === CASE_STUDY)
    assert.ok(studies.length, 'the tree has case studies')
    for (const { slug } of studies) {
      const rows = everything.filter((t) => t.slug === slug)
      assert.deepEqual(
        rows.map((t) => [t.type, t.stack]),
        [['article', 'work']],
        `${slug}: one card, in the work pile`
      )
    }
  })
})

// THE HONEST TORUS: the camera pulls out until the view first reaches the
// world's width or height (cover) and no further, so no place is ever on
// screen twice. A tile the view's edge cuts shows its other part at the
// opposite edge (a live copy, test/mirror.test.js). A desktop and a phone
// mount the real world all the way out; the wrist mounts down to its old
// floor and the plan draws past it. The map takes turns with the field on a
// phone.
describe('zoom out, the plan and the map', () => {
  const out = solve()
  const { world } = out
  const SCREENS = [
    ['laptop', 1440, 900, [1, 2]],
    ['phone', 390, 844, [2, 3]],
    ['watch', 320, 392, [2]],
    ['watch panel', 205, 251, [2]],
  ]
  // the viewport matrix the chrome and floor tests use, both orientations
  const MATRIX = [
    [184, 224],
    [205, 251],
    [272, 340],
    [320, 240],
    [320, 392],
    [320, 568],
    [390, 844],
    [844, 390],
    [768, 1024],
    [1024, 768],
    [1440, 900],
    [1800, 900],
    [1920, 1080],
    [2996, 1507],
    [3840, 1100],
  ]
  const placed = [
    ...LIVE.map((t) => ({ id: t.id, ...out.tiles[t.id], ...dims(t) })),
    { id: 'hero', ...out.hero, w: hero.w, h: hero.h },
  ]
  // every torus copy of a span that meets the view, by brute force: not the
  // arithmetic under test
  const copies = (pos, cam, W, view, size) => {
    const seen = []
    for (let k = -3; k <= 3; k++) {
      const c = pos + k * W - cam
      if (c < view && c + size > 0) seen.push(c)
    }
    return seen.sort((a, b) => a - b)
  }

  // mutation: canvas-layout.floor-full-width, canvas-layout.floor-snaps-near
  it('never shows past one world: the furthest-out view is no larger than the world', () => {
    for (const [vw, vh] of MATRIX)
      for (const dpr of [1, 2, 3]) {
        const b = cameraBounds(vw, vh, world, dpr)
        assert.ok(
          vw / b.outZ <= world.w + 1e-6 && vh / b.outZ <= world.h + 1e-6,
          `${vw}x${vh} at ${dpr}x sees ${Math.round(vw / b.outZ)}x${Math.round(vh / b.outZ)} of ${world.w}x${world.h}`
        )
        // nothing zooms out past the camera floor, a flight included
        assert.ok(b.minZ >= b.outZ - 1e-9 && b.fit >= b.outZ - 1e-9)
      }
  })

  // mutation: canvas-layout.floor-subtracts-tile, canvas-layout.floor-overshoots
  it('goes out as far as that allows: the next rung out would show past the world', () => {
    for (const [vw, vh] of MATRIX)
      for (const dpr of [1, 2, 3]) {
        const b = cameraBounds(vw, vh, world, dpr)
        const s = zoomStep(dpr)
        const cover = Math.max(vw / world.w, vh / world.h)
        if (cover < s) assert.equal(b.outZ, cover, `${vw}x${vh} at ${dpr}x`)
        else
          assert.ok(
            b.outZ - s < cover - 1e-9,
            `${vw}x${vh} at ${dpr}x rests at ${b.outZ} with ${b.outZ - s} still inside the world`
          )
      }
  })

  // mutation: canvas-layout.floor-subtracts-tile
  it('never forces the opening frame tighter than cover does: a phone opens on the whole hero', () => {
    const phone = cameraBounds(390, 844, world, 3)
    assert.ok(390 / phone.fit >= hero.w, `a phone opens ${Math.round(390 / phone.fit)} across`)
    // a landscape phone on the rung its frame fits, cover under it
    const flat = cameraBounds(844, 390, world, 3)
    assert.equal(
      flat.fit,
      snapZoom(
        Math.min(844 / openFrame().w, (390 - chromeBand(844, 390)) / openFrame().h),
        3,
        'down'
      )
    )
  })

  // mutation: canvas-layout.spots-second-always, canvas-layout.spots-one-only
  it('a tile the view cuts shows its other part at the opposite edge, and no part twice', () => {
    for (const [vw, vh] of MATRIX)
      for (const dpr of [1, 3]) {
        const b = cameraBounds(vw, vh, world, dpr)
        for (const [W, view, pos, size] of [
          [world.w, vw / b.outZ, 'x', 'w'],
          [world.h, vh / b.outZ, 'y', 'h'],
        ])
          for (let i = 0; i < 36; i++) {
            const cam = Math.round((W * i) / 36 - W / 2)
            for (const t of placed) {
              const spots = wrapSpots(t[pos], cam, W, view, t[size])
              // exactly the copies the torus puts in view, its own first
              assert.deepEqual(
                [...spots].sort((a, c) => a - c),
                copies(t[pos], cam, W, view, t[size])
              )
              assert.equal(spots.length ? spots[0] : null, wrapPos(t[pos], cam, W, view, t[size]))
              if (spots.length < 2) continue
              assert.equal(spots.length, 2, `${t.id} is on screen ${spots.length} times`)
              const [a, c] = spots
              // one runs off the far edge, the other comes in at the near one
              assert.ok(a + t[size] > view && c < 0, `${t.id}: a copy the view does not cut`)
              // and they show disjoint parts: [0, view - a) and [-c, size)
              assert.ok(view - a <= -c + 1e-6, `${t.id}: a part shown twice`)
            }
          }
      }
  })

  it('refuses a view longer than the world, the fake it retired', () => {
    assert.throws(() => wrapSpots(0, 0, 100, 101, 10), RangeError)
  })

  // mutation: canvas-layout.seam-any-edge
  it('the world edge is on screen once at most: one seam line per axis', () => {
    for (const W of [world.w, world.h])
      for (const view of [W, W - 1, W / 2, 1])
        for (let i = 0; i < 97; i++) {
          const cam = (W * i) / 32 - W
          const at = seamAt(cam, W, view)
          const seen = copies(0, cam, W, view, 1e-9).filter((c) => c >= 0)
          assert.deepEqual(at === null ? [] : [at], seen, `view ${view} cam ${cam}`)
        }
  })

  // mutation: canvas-layout.seam-clone-back, canvas-layout.seam-line-copies, canvas-layout.copy-anywhere
  it('a copy is made in one place, the mirror, and only for a spot past the node', () => {
    const root = join(import.meta.dirname, '..')
    const dir = join(root, 'src/static/canvas')
    const files = readdirSync(dir).filter((f) => f.endsWith('.js'))
    assert.ok(files.includes('app.js'), 'the renderer is not where this looks')
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8')
      // a world node or the seam copied into the scene outside the mirror is
      // the frozen fake coming back
      if (f !== 'mirror.js')
        assert.doesNotMatch(
          src,
          /(?:\.n|\bnode|\bseam\w*)\.cloneNode\(/,
          `${f} clones a world node`
        )
      assert.doesNotMatch(
        src,
        /seam-clone|\.clones\b|wrapEvery|wrapCopies/,
        `${f} keeps frozen copies`
      )
    }
    const app = readFileSync(join(dir, 'app.js'), 'utf8')
    // the renderer hands the mirror every spot of the node, its own first
    assert.match(app, /o\.n\.style\.transform=`translate\(\$\{xs\[0\]\}px,\$\{ys\[0\]\}px\)`/)
    assert.match(app, /mirror\.sync\(o\.n, spots\)/)
  })

  // mutation: canvas-layout.mount-follows-camera, canvas-layout.watch-mounts-out
  it('mounts the real world all the way out, except on the wrist, which keeps WATCH_SLOTS', () => {
    const span = WATCH_SLOTS * BENTO.unit + (WATCH_SLOTS - 1) * BENTO.gap
    for (const [name, vw, vh, dprs] of SCREENS)
      for (const dpr of dprs) {
        const b = cameraBounds(vw, vh, world, dpr)
        assert.equal(mountsAt(b.mountZ, b.mountZ), true, `${name}: the mount floor mounts`)
        assert.equal(mountsAt(b.fit, b.mountZ), true, `${name}: the opening frame mounts`)
        if (chromeDensity(vw, vh) === 'watch') {
          assert.equal(b.mountZ, b.minZ, `${name}: the wrist's mount floor moved`)
          assert.ok(
            vw / b.mountZ <= span + 1e-6,
            `${name}: mounts ${Math.round(vw / b.mountZ)} across`
          )
          assert.equal(mountsAt(b.outZ, b.mountZ), false, `${name}: all the way out mounts tiles`)
        } else {
          assert.equal(b.mountZ, b.outZ, `${name} at ${dpr}x stops mounting short of the floor`)
          assert.equal(mountsAt(b.outZ, b.mountZ), true, `${name}: all the way out shows the plan`)
        }
      }
  })

  // mutation: canvas-layout.map-open-everywhere
  it('opens the map on a desktop and on a phone, and not on a watch', () => {
    assert.equal(mapOpenAt(chromeDensity(1440, 900)), true)
    assert.equal(mapOpenAt(chromeDensity(390, 844)), true)
    assert.equal(mapOpenAt(chromeDensity(320, 392)), false)
  })

  // mutation: canvas-layout.slot-shared-everywhere
  it('shares the slot on a phone only, so a desktop toggle never touches the field', () => {
    // 1440 and 1024: the map has its own corner and the field holds still;
    // 390: the field and the map take turns. verify:world measures the rects.
    assert.equal(slotShared(chromeDensity(1440, 900)), false)
    assert.equal(slotShared(chromeDensity(1024, 768)), false)
    assert.equal(slotShared(chromeDensity(390, 844)), true)
  })

  it("the map fits the field's slot, and the slot's buttons fit the bar", () => {
    // the map takes the field's place on a phone, so it may not be wider
    assert.ok(
      CHROME.mapW <= CHROME.searchW,
      `the map is ${CHROME.mapW}, the slot ${CHROME.searchW}`
    )
    // it is the world decimated on the map's 2px cell: whole cells, ten to one
    assert.equal((CHROME.mapW / 2) * 10, world.w / PX)
    // the narrowest phone: search on the left inset, map on the right, a gap
    // from the centred field each side
    const vw = BAR_MIN_W
    const field = (vw - CHROME.searchW) / 2
    const left = { x: CHROME.inset, w: CHROME.h }
    const right = { x: vw - CHROME.inset - CHROME.h, w: CHROME.h }
    assert.ok(left.x + left.w + CHROME.gap <= field + 1e-9)
    assert.ok(field + CHROME.searchW + CHROME.gap <= right.x + 1e-9)
    assert.equal(chromeDensity(vw, 844), 'phone')
  })
})
