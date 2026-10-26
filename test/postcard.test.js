// test/postcard.test.js
// The postcard renderer's contract: one pure function, a camera and a size
// in, a two-ink SVG out.
//   - DETERMINISM, hashed: the same camera and size produce byte-identical
//     output, which is what lets a card be cached forever and a poster be
//     re-cut later and match. Verified the way layout.js determinism is,
//     plus a recorded digest so a silent drawing change fails loudly.
//   - the plan IS the world: every footprint sits where placeWorld put it,
//     at the size dims() gives it, so the drawing cannot quietly disagree
//     with the canvas
//   - the geometry on the card is the camera's, to the pixel
//   - two inks and nothing else: no colour is stated in the module, the
//     tokens arrive as options
//   - the tokens it names exist (a renamed token would otherwise paint the
//     card in the UA's default and no guard would notice)
import site from '../site.config.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  TILES,
  M,
  PX,
  LADDER,
  dims,
  heroFixed,
  placeWorld,
  openFrame,
} from '../src/static/canvas/layout.js'
import { CARD, worldPlan, coverZoom, homeCamera, renderPostcard } from '../src/lib/postcard.js'
import { resolveTokens } from './lib/css-tokens.js'

const ROOT = join(import.meta.dirname, '..')
const sha = (s) => createHash('sha256').update(s).digest('hex')

// the solver input app.js hands placeWorld, rebuilt here rather than
// imported, so the postcard's world is checked against the canvas's world
// and not against its own opinion of it
const LIVE = TILES
const hero = heroFixed()
const canvasWorld = placeWorld({ tiles: LIVE, hero })

// NOTE: the postcard calls placeWorld exactly as app.js does, so its world
// agrees with the canvas's. The work digest is an explicit camera at an
// explicit zoom and does not depend on the frame; hero and world are derived
// from it.
// three cameras and two sheets: a corner at reading zoom, the opening view,
// and the whole ground on a poster
// the cameras are DERIVED from the plan, never typed: a hand-pinned world
// coordinate is a camera aimed at wherever the hero happened to be the day
// it was written (the stacks pass moved the ground to 3552x3120 and a pinned
// 1896,1896 was suddenly looking under the hero)
const plan0 = worldPlan()
const centre = (m) => ({ x: m.x + m.w / 2, y: m.y + m.h / 2 })
const cameras = {
  hero: { ...centre(plan0.hero), zoom: 1 },
  work: { ...centre(plan0.marks.find((m) => m.id === 'work')), zoom: 0.75 },
  world: { x: plan0.world.w / 2, y: plan0.world.h / 2, zoom: coverZoom(CARD.w, CARD.h) },
}

describe('postcard: the world at a camera', () => {
  it('draws the world the canvas settles, not a copy of it', () => {
    const plan = worldPlan()
    assert.deepEqual(plan.world, canvasWorld.world)
    assert.deepEqual(
      { x: plan.hero.x, y: plan.hero.y, w: plan.hero.w, h: plan.hero.h },
      { ...canvasWorld.hero, w: hero.w, h: hero.h }
    )
    assert.equal(plan.marks.length, LIVE.length)
    for (const tile of LIVE) {
      const mark = plan.marks.find((m) => m.id === tile.id)
      const d = dims(tile)
      assert.deepEqual(
        { x: mark.x, y: mark.y, w: mark.w, h: mark.h },
        { ...canvasWorld.tiles[tile.id], w: d.w, h: d.h },
        `${tile.id} is not where the solver put it`
      )
    }
  })

  it('names every footprint', () => {
    const plan = worldPlan()
    assert.ok(plan.marks.length, 'the plan draws the world')
    for (const mark of plan.marks)
      assert.ok(mark.name.length, `${mark.id} has nothing to answer to`)
  })

  it('hands out a frozen plan: a consumer cannot edit the map', () => {
    const plan = worldPlan()
    assert.throws(() => {
      plan.marks[0].x = -1
    }, TypeError)
    assert.equal(worldPlan().marks[0].x, plan.marks[0].x)
  })

  it('is deterministic: the same camera and size, byte for byte', () => {
    for (const [name, camera] of Object.entries(cameras)) {
      const once = renderPostcard({ camera, width: CARD.w, height: CARD.h })
      const twice = renderPostcard({ camera, width: CARD.w, height: CARD.h })
      assert.equal(sha(once), sha(twice), `${name} did not repeat itself`)
    }
  })

  it('records its digests, so a silent change to the drawing fails here', () => {
    // Regenerate ONLY with a deliberate change to the drawing, the same way
    // the hero box is pinned in the layout suite. A diff here means either
    // the world moved or the renderer did, and both are worth reading.
    // The site's host is the one word on the card a fork changes in
    // site.config.js, so it is read out of the drawing before the hash.
    const host = new URL(site.url).host
    const digests = Object.fromEntries(
      Object.entries(cameras).map(([name, camera]) => [
        name,
        sha(renderPostcard({ camera, width: CARD.w, height: CARD.h }).replaceAll(host, 'HOST')),
      ])
    )
    assert.deepEqual(digests, {
      hero: '78ca61a89fe2ddaec1c72f370234537224b3292ca004b9d9aac6c1ad02a90c71',
      work: '26841419c2003701da70cf85d7a31d83db015a1a46dc20fca430194964f7eba2',
      world: 'd9724cc348affd8f2eec44a1a290676cbe0a2efd605f76732b4b0204888c7414',
    })
  })

  it('puts a footprint exactly where the camera says it goes', () => {
    // the sum of the whole thing: point the camera at a tile, do the
    // arithmetic by hand off what the SOLVER reports, and find that
    // rectangle in the emitted SVG
    const plan = worldPlan()
    for (const id of ['slime', 'weather', 'work']) {
      const solved = canvasWorld.tiles[id]
      const tile = LIVE.find((t) => t.id === id)
      const d = dims(tile)
      const zoom = 0.5
      // centred on the tile, so the copy in frame is the tile itself
      const camera = { x: solved.x + d.w / 2, y: solved.y + d.h / 2, zoom }
      const svg = renderPostcard({ camera, width: CARD.w, height: CARD.h })
      const sw = 1.5
      const x = CARD.w / 2 - (d.w * zoom) / 2 + sw / 2
      const y = CARD.h / 2 - (d.h * zoom) / 2 + sw / 2
      const rect = `<rect x="${x}" y="${y}" width="${d.w * zoom - sw}" height="${d.h * zoom - sw}"`
      assert.ok(svg.includes(rect), `${id} is not drawn at ${rect}`)
      // and the plan's own record of it agrees with the solver
      const mark = plan.marks.find((m) => m.id === id)
      assert.deepEqual({ x: mark.x, y: mark.y, w: mark.w, h: mark.h }, { ...solved, ...d })
    }
  })

  it('floors the camera at cover: the ground never ends on the card', () => {
    const { world } = worldPlan()
    const cover = coverZoom(CARD.w, CARD.h)
    assert.equal(cover, Math.max(CARD.w / world.w, CARD.h / world.h))
    // a camera asking to pull back past cover is held at cover, so the two
    // renders are the same drawing
    const held = renderPostcard({ camera: { x: 1920, y: 1704, zoom: cover / 4 } })
    const at = renderPostcard({ camera: { x: 1920, y: 1704, zoom: cover } })
    assert.equal(sha(held), sha(at))
  })

  it('opens on the hero, at the frame the canvas opens on', () => {
    const { hero: h } = worldPlan()
    const cam = homeCamera(CARD.w, CARD.h)
    assert.deepEqual({ x: cam.x, y: cam.y }, { x: h.x + h.w / 2, y: h.y + h.h / 2 })
    const frame = openFrame()
    assert.equal(cam.zoom, Math.min(CARD.w / frame.w, CARD.h / frame.h))
    // and the default render is that view
    assert.equal(sha(renderPostcard()), sha(renderPostcard({ camera: homeCamera() })))
  })

  it('completes a footprint across the seam instead of cutting it', () => {
    // The ground wraps, so a camera one whole world along is the SAME view.
    // That equality only holds if the drawing emits the wrapped copies: a
    // renderer that drew each footprint once would show a blank half here.
    const { world } = worldPlan()
    const seam = { x: 0, y: world.h / 2, zoom: 0.5 }
    const round = { x: world.w, y: world.h / 2 + world.h, zoom: 0.5 }
    assert.equal(sha(renderPostcard({ camera: seam })), sha(renderPostcard({ camera: round })))
    // and the seam view is a view, not an empty sheet
    const svg = renderPostcard({ camera: seam })
    assert.ok((svg.match(/<rect /g) || []).length > 4)
  })

  it('keeps every label whole and inside its box', () => {
    // the cartographic rule: a name prints whole or not at all, so nothing
    // on the card is ever an ellipsis, and the estimated line never claims
    // more width than the box has
    const plan = worldPlan()
    for (const [name, camera] of Object.entries(cameras)) {
      const svg = renderPostcard({ camera, width: CARD.w, height: CARD.h })
      assert.ok(!svg.includes('…'), `${name} truncated a label`)
      const printed = [...svg.matchAll(/<text [^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
      for (const [, fs, text] of printed) {
        const size = Number(fs)
        assert.ok(LADDER.includes(size), `${name} set a label at ${size}, off the ladder`)
        // the widest box on the plan is the hero; anything printed has to
        // fit inside SOMETHING, and the estimate is what decided it did
        const widest = Math.max(plan.hero.w, ...plan.marks.map((m) => m.w)) * camera.zoom
        assert.ok(
          text.length * size * 0.62 <= widest,
          `${name} printed a line wider than the world`
        )
      }
    }
  })

  it('drops its labels as it pulls back, and keeps the hero named', () => {
    // one centre, two zooms, so the only variable is how far back the
    // camera stands. 0.7 holds the hero and the dock under it (the belt
    // stands in rows below it); the ladder's floor of 16 drops the
    // names under about two thirds zoom
    const texts = (svg) => (svg.match(/<text /g) || []).length
    assert.ok(
      texts(renderPostcard({ camera: { ...cameras.world, zoom: 0.7 } })) >
        texts(renderPostcard({ camera: cameras.world })),
      'the plan is not shedding labels as it zooms out'
    )
    // the anchor is named wherever it is in frame, at reading zoom and with
    // the whole ground on the card
    for (const name of ['hero', 'world']) {
      assert.ok(
        renderPostcard({ camera: cameras[name] }).includes(`>${new URL(site.url).host}<`),
        `${name} lost the hero`
      )
    }
  })

  it('scales its hand with the sheet, not with the zoom', () => {
    // a poster of one camera is a true enlargement: the same drawing, the
    // same weights relative to the sheet
    const camera = cameras.world
    const card = renderPostcard({ camera, width: CARD.w, height: CARD.h })
    const poster = renderPostcard({ camera, width: CARD.w * 3, height: CARD.h * 3 })
    assert.match(card, /stroke-width="1\.5"/)
    assert.match(poster, /stroke-width="4\.5"/)
    assert.match(card, /<rect x="1\.5" y="1\.5" width="1197" height="627"/)
  })

  it('states no colour of its own: the caller brings the inks', () => {
    const svg = renderPostcard({ camera: cameras.hero })
    assert.equal([...svg.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].length, 0)
    assert.match(svg, /fill="var\(--cv-ground\)"/)
    assert.match(svg, /stroke="var\(--cv-ink\)"/)
    assert.match(svg, /font-family="var\(--cv-font\)"/)
    // and a standalone consumer (a raster with no stylesheet in reach) can
    // hand over resolved values instead
    const flat = renderPostcard({
      camera: cameras.hero,
      ink: 'black',
      ground: 'white',
      font: 'serif',
    })
    assert.match(flat, /stroke="black"/)
    assert.match(flat, /fill="white"/)
    assert.ok(!flat.includes('var(--cv-'))
  })

  // mutation: postcard.font-token-renamed
  it('names tokens that exist', () => {
    // the defaults are token names in a string; a rename would paint the
    // card in the UA default with every other guard green. Read the names
    // off what the card actually renders, not off a list kept here.
    const tokens = resolveTokens(
      readFileSync(join(ROOT, 'primitives/kit/canvas-tokens.css'), 'utf8'),
      { prefix: '--cv-' }
    )
    const svg = renderPostcard({ camera: cameras.hero })
    const named = [...new Set([...svg.matchAll(/var\(--cv-([\w-]+)\)/g)].map((m) => m[1]))]
    assert.ok(
      named.length >= 3,
      `the card names ${named.length} tokens; ink, ground and face at least`
    )
    for (const name of named) {
      assert.ok(tokens.names.includes(name), `--cv-${name} is not in the palette`)
    }
  })

  it('is inert markup: no script, no fetch, nothing that runs', () => {
    const svg = renderPostcard({ camera: cameras.hero })
    assert.ok(!/<script|href=|xlink|<image|<foreignObject/i.test(svg))
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    assert.match(svg, /<\/svg>$/)
    assert.match(svg, /role="img"/)
    assert.match(svg, /aria-label="[^"]+"/)
  })

  it('says nothing a reader cannot open', () => {
    // the site is external: no path, no filename, no repo word may ride a
    // surface that eventually gets served
    const svg = renderPostcard({ camera: cameras.hero })
    for (const word of ['src/', 'BIBLE', 'test/', '.js', 'content/feed', 'TODO']) {
      assert.ok(!svg.includes(word), `the card names ${word}`)
    }
  })

  it('holds the lattice: every footprint is whole modules, seated on the cell', () => {
    // the ring's slots are on the module (canvas-layout.test.js proves
    // where); a tile centres in its slot on the cell, and the icons ride
    // the cell inside the dock the same way
    for (const mark of worldPlan().marks) {
      assert.equal(mark.x % PX, 0)
      assert.equal(mark.y % PX, 0)
      assert.equal(mark.w % M, 0)
      assert.equal(mark.h % M, 0)
    }
  })
})
