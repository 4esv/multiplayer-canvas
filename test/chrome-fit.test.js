// test/chrome-fit.test.js
// BIBLE.md section 8, mechanized: the chrome fits every screen, and the
// opening camera clears it without the world reserving a pixel for it.
//
// This guard is the one CLAUDE.md and the registry both claimed
// canvas-layout already carried ("chrome reservation across a viewport
// matrix") and it did not: the reservation it asserted was a single world
// constant solved once at the design view, so it was checked at exactly one
// zoom and held at exactly one zoom. What actually shipped was a 200px search
// field absolutely centred in a 184px bar, spilling off both edges and
// covering the logo and the burger, plus a bar band claiming 26.8% of a watch
// screen. Everything below is pure: layout.js is node-importable, so the
// bar's arithmetic and the camera's are checked as arithmetic. A browser is
// only needed to confirm the CSS says the same thing, and that is done by
// reading the stylesheet rather than by launching one.
//
// (Headless note for anyone verifying this by eye instead: desktop headless
// Chrome clamps windows to a 500px minimum width, so a "390px" screenshot is
// a 500px layout cropped. Use Emulation.setDeviceMetricsOverride with
// mobile: true, never a window size.)
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CHROME,
  BAR_MIN_W,
  BAR_MIN_H,
  DESKTOP_MIN_W,
  chromeDensity,
  chromeBand,
  openFrame,
  openBlock,
  heroFixed,
  placeWorld,
  TILES,
  dims,
  M,
  snapZoom,
  zoomStep,
  cameraBounds,
  ZONES,
  ZONE_TITLE,
} from '../src/static/canvas/layout.js'
import { FACES } from '../primitives/pixel-type.js'
import { cssRules, computed } from './lib/cascade.js'

const ROOT = join(import.meta.dirname, '..')
const HOME_CSS = readFileSync(join(ROOT, 'src/static/css/canvas-home.css'), 'utf8')
const TOKENS = readFileSync(join(ROOT, 'primitives/kit/canvas-tokens.css'), 'utf8')

// A watch, two watches, a watch-sized window, the smallest phone still sold,
// a current phone, a tablet, a laptop, the design view, an ultrawide.
const MATRIX = [
  [184, 224],
  [205, 251],
  [272, 340],
  [320, 568],
  [390, 844],
  [768, 1024],
  [1440, 900],
  [1800, 900],
  [3840, 1100],
]

// The bar's controls at a density, laid out the way the CSS lays them out.
// The bar is the field (BIBLE.md section 8, 2026-09-10): one control,
// absolutely centred. The close that joins it while a sheet or a fan is up
// stands in the right inset's column and is modelled with the open state
// below. A watch has no bar, so it has no controls: not a shrunken row, an
// empty one.
function barLayout(vw, vh, open = false) {
  const watch = chromeDensity(vw, vh) === 'watch'
  if (watch) return { h: 0, controls: [], watch }
  const h = CHROME.h
  const search = { name: 'search', x: (vw - CHROME.searchW) / 2, w: CHROME.searchW, h }
  const close = { name: 'close', x: vw - CHROME.inset - h, w: h, h }
  return { h, controls: open ? [search, close] : [search], watch }
}

// the world the camera opens on, solved once (viewport-blind by contract)
const LIVE = TILES
const hero = heroFixed()
const world = placeWorld({ tiles: LIVE, hero })

// The opening camera, exactly as app.js derives it: the frame fits the screen
// MINUS the bar's band, and the hero centres in what is left. Returns the
// screen rect the opening frame lands on.
function openCamera(vw, vh) {
  const of = openFrame()
  const band = chromeBand(vw, vh)
  // app.js clamps at cover; every viewport in the matrix is far above it, and
  // the cover floor is canvas-layout's business, so the fit is the fit here.
  const z = Math.min(vw / of.w, Math.max(1, vh - band) / of.h)
  const cx = vw / 2
  const cy = (vh - band) / 2
  return {
    z,
    band,
    frame: { x: cx - (of.w * z) / 2, y: cy - (of.h * z) / 2, w: of.w * z, h: of.h * z },
  }
}

describe('the chrome fits every screen (BIBLE.md section 8)', () => {
  it('names three densities and nothing between them', () => {
    const seen = new Set()
    for (let vw = 120; vw <= 4000; vw += 1) seen.add(chromeDensity(vw, 1000))
    for (let vh = 120; vh <= 1400; vh += 1) seen.add(chromeDensity(1200, vh))
    assert.deepEqual([...seen].sort(), ['desktop', 'phone', 'watch'])
    // the thresholds are derivations, not taste: the width the three-control
    // bar needs, the height at which a full control claims a quarter of the
    // screen, and the opening frame's own width
    assert.equal(BAR_MIN_W, CHROME.searchW + 2 * (CHROME.inset + CHROME.h + CHROME.gap))
    assert.equal(BAR_MIN_H, 4 * (CHROME.h + CHROME.inset))
    assert.equal(DESKTOP_MIN_W, openFrame().w)
    // and they are steps, not a ramp: one pixel either side of a threshold
    // changes the state and nothing in between changes anything
    assert.equal(chromeDensity(BAR_MIN_W - 1, 1000), 'watch')
    assert.equal(chromeDensity(BAR_MIN_W, 1000), 'phone')
    assert.equal(chromeDensity(1200, BAR_MIN_H - 1), 'watch')
    assert.equal(chromeDensity(DESKTOP_MIN_W - 1, 1000), 'phone')
    assert.equal(chromeDensity(DESKTOP_MIN_W, 1000), 'desktop')
  })

  // mutation: chrome-fit.watch-threshold-drifts, chrome-fit.watch-keeps-the-map, chrome-fit.bar-reshown-later, chrome-fit.watch-keeps-the-menu
  it('the CSS mirrors the thresholds layout.js owns', () => {
    // One source, two consumers: the camera reads layout.js, the paint reads
    // a media query. A guard, not a comment, keeps them the same number.
    const prelude = /@media \(max-width: ([\d.]+)px\), \(max-height: ([\d.]+)px\) \{/.exec(HOME_CSS)
    assert.ok(prelude, 'canvas-home.css declares the watch density in one media query')
    // the CSS bound is exclusive (< BAR_MIN_W), spelled as a hair under it
    assert.ok(
      Number(prelude[1]) < BAR_MIN_W && Number(prelude[1]) >= BAR_MIN_W - 1,
      `watch width prelude ${prelude[1]}px does not mirror BAR_MIN_W ${BAR_MIN_W}`
    )
    assert.ok(
      Number(prelude[2]) < BAR_MIN_H && Number(prelude[2]) >= BAR_MIN_H - 1,
      `watch height prelude ${prelude[2]}px does not mirror BAR_MIN_H ${BAR_MIN_H}`
    )
    // and the state really does something: every piece of fixed chrome is
    // hidden inside that block. Named one by one rather than by a wildcard,
    // so a NEW control added to the bar has to come back here and say what a
    // watch does with it. (The shrink-to-fit version of this block passed a
    // laxer check for years while the bar still ate 45.7% of the screen.)
    const block = HOME_CSS.slice(prelude.index, HOME_CSS.indexOf('\n}\n', prelude.index))
    const hidden = /^([^{]*)\{\s*display: none(?: !important)?;?\s*\}/m.exec(
      block.replace(/\/\*[\s\S]*?\*\//g, '')
    )
    assert.ok(hidden, 'the watch density hides the chrome outright')
    const hides = new Set(hidden[1].split(',').map((s) => s.trim()))
    // and the kit parts the chrome wears that live outside the bar (#336):
    // the finder's line and the toggles, the menu and the selection mark
    for (const sel of [
      '#topbar',
      '#searchWrap',
      '#cmds',
      '#close',
      '#minimap',
      '#found',
      '#findBtn',
      '#mapBtn',
      '.k-menu',
      '.k-sel',
    ])
      assert.ok(hides.has(sel), `the watch density leaves ${sel} on the screen`)
    // and nothing in the block tries to keep a control alive at a smaller size
    assert.doesNotMatch(block, /--cv-ctrl-h/, 'the watch density has no controls to size')
    // and the hide survives the cascade: an id rule written later in the file
    // at the top level outranks the media block by order alone, so a bar
    // display set after it puts the whole bar back on a watch. The bar is the
    // one checked because it carries the rest: the field and the close live
    // inside it, and the map is hidden by app.js below desktop as well.
    const after = HOME_CSS.slice(HOME_CSS.indexOf('\n}\n', prelude.index) + 3)
    let depth = 0
    let from = 0
    for (let i = 0; i < after.length; i++) {
      const c = after[i]
      if (c === '{') {
        if (depth === 0) {
          const sel = after
            .slice(from, i)
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .trim()
          const end = after.indexOf('}', i)
          const top = !sel.startsWith('@')
          const names = sel.split(',').map((x) => x.trim())
          if (top && names.includes('#topbar'))
            assert.doesNotMatch(
              after.slice(i, end),
              /(^|[;{\s])display\s*:/,
              'a later #topbar rule sets display and overrides the watch hide'
            )
        }
        depth++
      } else if (c === '}') {
        depth--
        if (depth === 0) from = i + 1
      } else if (c === ';' && depth === 0) from = i + 1
    }
  })

  // mutation: chrome-fit.watch-hide-outranked
  it('the watch hide wins the cascade for every piece of chrome it names', () => {
    // The text check above finds the names in the block; this asks what the
    // browser asks. A rule later in the file (#close's grid, the map's block,
    // an open #cmds) outranks the media block on order or specificity, and
    // then the hide only held because app.js set [hidden] and the rest sat
    // in a hidden bar (issue #320). Each element is taken without [hidden]
    // and in its showing state, so the block has to hide it on its own.
    const rules = cssRules(HOME_CSS)
    const html = { tag: 'html', classes: [], attrs: {} }
    const bar = { tag: 'div', id: 'topbar', classes: [], attrs: {} }
    const chains = {
      '#topbar': [html, bar],
      '#searchWrap': [html, bar, { tag: 'div', id: 'searchWrap', classes: [], attrs: {} }],
      '#cmds': [html, bar, { tag: 'div', id: 'cmds', classes: ['open'], attrs: {} }],
      '#close': [html, bar, { tag: 'button', id: 'close', classes: [], attrs: {} }],
      '#minimap': [html, { tag: 'canvas', id: 'minimap', classes: [], attrs: {} }],
    }
    const watches = MATRIX.filter(([vw, vh]) => chromeDensity(vw, vh) === 'watch')
    assert.ok(watches.length, 'the matrix has no watch')
    for (const [sel, chain] of Object.entries(chains)) {
      for (const [vw] of watches)
        assert.equal(
          computed(rules, chain, 'display', vw),
          'none',
          `${sel} paints on a ${vw}px watch: a later rule outranks the hide`
        )
      // and not vacuously: off the watch the same element keeps its box
      assert.notEqual(computed(rules, chain, 'display', 390), 'none', `${sel} is gone on a phone`)
    }
  })

  // mutation: chrome-fit.zone-name-gap-drifts
  it('the name the seat measures is the name the stylesheet draws', () => {
    // ZONE_TITLE is arithmetic about a drawing: the display face's rows at a
    // cell a pixel, and the ground the stylesheet leaves under them
    assert.equal(ZONE_TITLE.h, FACES.display.rows * FACES.display.px)
    const rule = /\.t-zone \.ztitle \{([^}]*)\}/.exec(HOME_CSS)
    assert.ok(rule, 'canvas-home.css draws no zone name')
    const gap = /margin-bottom: var\(--cv-(sp-\d+)\);/.exec(rule[1])
    assert.ok(gap, 'the zone name stands off the cut by something other than a spacing token')
    const token = new RegExp(`--cv-${gap[1]}:\\s*(\\d+)px`).exec(TOKENS)
    assert.equal(Number(token[1]), ZONE_TITLE.gap, `the name stands ${token[1]}px off the cut`)
  })

  it('the close beside the field clears it on every bar that has one', () => {
    for (const [vw, vh] of MATRIX) {
      const bar = barLayout(vw, vh, true)
      if (bar.watch) continue
      const [search, close] = bar.controls
      assert.ok(
        close.x >= search.x + search.w + CHROME.gap - 1e-9,
        `${vw}x${vh}: the close runs into the field`
      )
    }
  })

  for (const [vw, vh] of MATRIX) {
    describe(`${vw}x${vh} (${chromeDensity(vw, vh)})`, () => {
      const bar = barLayout(vw, vh)

      it('every control on the bar is inside the viewport', () => {
        // Refuse a vacuous pass: an empty control row is only correct where
        // the density says there is no bar. Everywhere else three controls
        // must be present AND fit, so a future "hide it to make it fit" is
        // caught rather than rewarded.
        assert.equal(bar.controls.length, bar.watch ? 0 : 1)
        for (const c of bar.controls) {
          assert.ok(c.x >= 0, `${c.name} starts off the left edge at ${c.x}`)
          assert.ok(
            c.x + c.w <= vw,
            `${c.name} runs ${(c.x + c.w - vw).toFixed(0)}px past the right edge`
          )
        }
      })

      it('no two controls overlap, and each keeps its gap', () => {
        const row = [...bar.controls].sort((a, b) => a.x - b.x)
        for (let i = 1; i < row.length; i++) {
          const gap = row[i].x - (row[i - 1].x + row[i - 1].w)
          assert.ok(
            gap >= CHROME.gap,
            `${row[i - 1].name} and ${row[i].name} are ${gap.toFixed(0)}px apart (gap is ${CHROME.gap})`
          )
        }
      })

      it('the bar never claims more than a quarter of the screen', () => {
        // The shipped bar claimed 26.8% of a 224px watch (44 + 16 of inset).
        // The band is the strip from the top of the controls to the foot,
        // and on a watch there are no controls, so it is nothing at all.
        const band = chromeBand(vw, vh)
        assert.equal(band, bar.watch ? 0 : CHROME.foot + CHROME.h)
        assert.ok(
          band <= vh / 4,
          `the bar owns ${((100 * band) / vh).toFixed(1)}% of the ${vh}px viewport`
        )
        // WARNING on this quarter: it is a ceiling on HEIGHT and it is the
        // only thing here that ever bounded the bar's footprint. The
        // shrink-to-fit watch bar passed it comfortably (36 + 16 of 224 is
        // 23%) while its two controls still owned 45.7% of the screen's
        // width, because a bar is a strip and a watch is nearly square. No
        // width ceiling replaces it: a phone's centred 200px field is 51% of
        // a 390px screen and that is correct. The width is not a ratio
        // problem, it is a 44px-fingertip-versus-184px-screen problem, and
        // the answer is the density above, not a tighter number here.
      })

      it('the opening frame clears the bar', () => {
        const cam = openCamera(vw, vh)
        assert.ok(cam.z > 0, 'the opening zoom is a real number')
        assert.ok(
          cam.frame.y + cam.frame.h <= vh - cam.band + 0.5,
          `the frame's foot lands ${(cam.frame.y + cam.frame.h - (vh - cam.band)).toFixed(1)}px inside the bar`
        )
        assert.ok(cam.frame.y >= -0.5, 'the frame does not run off the top')
        assert.ok(
          cam.frame.x >= -0.5 && cam.frame.x + cam.frame.w <= vw + 0.5,
          'the frame fits wide'
        )
      })

      it('the statement and the whole icon belt clear the bar', () => {
        // The clearance guarantee the retired world reservation was reaching
        // for, checked where it is actually decidable: on screen, at the zoom
        // this viewport opens at, against the settled coordinates. It is the
        // composition of two things derived apart (the belt sits inside the
        // opening frame; the frame clears the bar), so it goes red if either
        // half breaks.
        //
        // NOTE the scope, deliberately. A tile BEYOND the opening frame may
        // sit under the floating bar at some viewport, and always could: the
        // bar is chrome floating over a pannable world, its container is
        // pointer-events: none, and one gesture moves any tile out from under
        // it. The only thing that cannot be panned away is the camera's fixed
        // point at home, which is what this asserts. Reserving the whole band
        // in world units to buy more than that is the arithmetic this pass
        // retired: 285 world px on a watch, 28% of the opening frame gone on
        // every device to serve the smallest one.
        const cam = openCamera(vw, vh)
        const { w: W, h: H } = world.world
        // home centres the BLOCK: the hero, a gutter and the dock under it
        // (layout.js openBlock), so the foot is measured off its centre
        const block = openBlock({ ...world.hero, w: hero.w, h: hero.h })
        const heroCX = world.hero.x + hero.w / 2
        const heroCY = block.y + block.h / 2
        const dd = (a, b, p) => {
          let d = a - b
          if (d > p / 2) d -= p
          if (d < -p / 2) d += p
          return d
        }
        const barTop = vh - cam.band
        const foot = (wy, h) =>
          (vh - cam.band) / 2 + dd(wy + h / 2, heroCY, H) * cam.z + (h * cam.z) / 2
        assert.ok(
          foot(world.hero.y, hero.h) <= barTop + 0.5,
          `the statement's foot lands ${(foot(world.hero.y, hero.h) - barTop).toFixed(0)}px inside the bar`
        )
        // The frame holds the dock by construction (it is the hero's width
        // and sits inside the block). Measure every icon on screen, and
        // refuse to pass on an empty measurement.
        let belt = 0
        for (const t of LIVE) {
          if (t.type !== 'icon') continue
          const d = dims(t)
          const sx = vw / 2 + dd(world.tiles[t.id].x + d.w / 2, heroCX, W) * cam.z
          if (sx + (d.w * cam.z) / 2 < 0 || sx - (d.w * cam.z) / 2 > vw) continue
          belt++
          const b = foot(world.tiles[t.id].y, d.h)
          assert.ok(
            b <= barTop + 0.5,
            `${t.id} dips ${(b - barTop).toFixed(0)}px into the bar band`
          )
        }
        const icons = LIVE.filter((t) => t.type === 'icon').length
        assert.ok(icons >= 2, `only ${icons} icons in the dock: the clearance proves nothing`)
        assert.equal(belt, icons, `only ${belt} of ${icons} dock icons on screen`)
      })

      // (the seat itself, the name and the cut centred as one block, is held
      // by test/canvas-layout.test.js: at the ring's present seats no
      // viewport here puts the bar's edge near the name, so a wrong seat
      // would pass this walk)
      it("the About zone's name is never cut by the bar's top edge at the opening camera", () => {
        // The name stands over the cut (layout.js ZONE_TITLE). At the camera
        // this viewport opens at, on the pixel ladder at every display
        // density and at the raw fit above, it is wholly clear of the band or
        // wholly under it, never both: a word the bar's edge slices reads as
        // a mistake, where a word behind the bar is only ground still to pan
        // to. The seat is the arithmetic (placeWorld centres the name and the
        // cut as one block); this walks it.
        const block = openBlock({ ...world.hero, w: hero.w, h: hero.h })
        const cy = block.y + block.h / 2
        const band = chromeBand(vw, vh)
        const barTop = vh - band
        const cams = [['raw', openCamera(vw, vh).z]]
        for (const dpr of [1, 2, 3])
          cams.push([`${dpr}x`, cameraBounds(vw, vh, world.world, dpr).fit])
        for (const z of ZONES) {
          const top = world.tiles[z.id].y - ZONE_TITLE.gap - ZONE_TITLE.h
          for (const [at, k] of cams) {
            const t0 = barTop / 2 + (top - cy) * k
            const t1 = t0 + ZONE_TITLE.h * k
            assert.ok(
              t1 <= barTop + 1e-6 || t0 >= barTop - 1e-6,
              `${at}: ${z.id}'s name spans ${t0.toFixed(1)}..${t1.toFixed(1)}, the bar's edge at ${barTop}`
            )
          }
        }
      })

      it('the camera pays for the clearance, the world does not', () => {
        // The whole architectural claim in one assertion: whatever the bar
        // costs, it costs the CAMERA. The world is the same rectangle at
        // every viewport, hero included.
        // (3456 x 3408 until 2026-09-11; the icons left the rings for the
        // dock under the hero and the ground hugged tighter. 3312 x 2784 until
        // 2026-09-15, when the ground became a 4K screen of cells: 16:9,
        // 960 x 540 at one cell a pixel.)
        assert.deepEqual(world.world, { w: 3840, h: 2160 })
        assert.equal(world.world.w % M, 0)
        const cam = openCamera(vw, vh)
        const bare = Math.min(vw / openFrame().w, vh / openFrame().h)
        // and the price is bounded: a shrink, never a re-layout
        assert.ok(cam.z <= bare + 1e-9)
        // (a tenth until 2026-09-11; the dock made the block taller and the
        // foot line made the band deeper, and together they cost a laptop
        // 10.2%. Still a shrink, never a re-layout.)
        assert.ok(
          cam.z >= bare * 0.88,
          `the band costs ${((1 - cam.z / bare) * 100).toFixed(1)}% of the opening zoom`
        )
        // app.js then rests the fit on the pixel ladder (BIBLE.md section 2),
        // snapping DOWN so the frame is never overflowed. That costs at most
        // one step, and a step is a device pixel per cell, so the whole bill
        // for a crisp opening frame is bounded per display density.
        for (const dpr of [1, 2, 3]) {
          const rested = snapZoom(cam.z, dpr, 'down')
          assert.ok(rested <= cam.z + 1e-9, `dpr ${dpr}: the rested fit overflows the frame`)
          assert.ok(
            rested > cam.z - zoomStep(dpr) - 1e-9,
            `dpr ${dpr}: the ladder costs more than one step (${cam.z.toFixed(3)} -> ${rested.toFixed(3)})`
          )
          // and a cell is a whole number of device pixels there, wherever a
          // cell is at least one device pixel (a 1x watch sits under the
          // first step and keeps its fit; nothing that small can be crisp)
          if (rested < zoomStep(dpr)) continue
          const cellPx = 4 * rested * dpr
          assert.ok(
            Math.abs(cellPx - Math.round(cellPx)) < 1e-6,
            `dpr ${dpr}: cell is ${cellPx} device px`
          )
        }
      })
    })
  }
})
