// test/minimap-pre-boot.test.js
// The minimap is styled like a tile (white, ink border, cast), so an empty
// one reads as a tile that failed to load. Before the module boots and
// drawMinimap() fills it, it must not paint at all.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')
const CSS = readFileSync(join(ROOT, 'src/static/css/canvas-home.css'), 'utf8')
const NJK = readFileSync(join(ROOT, 'src/templates/canvas/home.njk'), 'utf8')

// The display a hidden #minimap ends up with on a desktop, worked out the way
// the browser does: every top-level rule whose selector is #minimap alone or
// with [hidden] competes, !important first, then specificity, then the later
// rule. Matching the first `#minimap[hidden]` block's text passed however many
// rules came after it; a later `display: block !important` walked through.
function hiddenDisplay(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = []
  let depth = 0
  let from = 0
  for (let i = 0; i < bare.length; i++) {
    if (bare[i] === '{') {
      if (depth === 0) rules.push({ head: bare.slice(from, i).trim(), open: i })
      depth++
    } else if (bare[i] === '}') {
      depth--
      if (depth === 0) {
        rules[rules.length - 1].body = bare.slice(rules[rules.length - 1].open + 1, i)
        from = i + 1
      }
    }
  }
  let win = null
  rules.forEach((r, order) => {
    if (r.head.startsWith('@')) return // media and friends are not the desktop cascade
    const sels = r.head.split(',').map((x) => x.trim().replace(/\s+/g, ' '))
    const hits = sels.filter((x) => /^#minimap(\[hidden\])?$/.test(x))
    if (!hits.length) return
    const d = r.body.match(/(?:^|;|\s)display\s*:\s*([^;!}]+?)\s*(!important)?\s*(?:;|$)/)
    if (!d) return
    const spec = Math.max(...hits.map((x) => (x.includes('[') ? 110 : 100)))
    const rank = [d[2] ? 1 : 0, spec, order]
    const beats = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
    if (!win || beats(rank, win.rank) > 0) win = { rank, value: d[1] }
  })
  return win?.value ?? null
}

describe('the minimap never paints blank before boot', () => {
  // mutation: minimap-pre-boot.ua-hidden-trusted, minimap-pre-boot.display-important
  it('ships hidden from the server, and hidden means display:none', () => {
    const tag = NJK.match(/<canvas id="minimap"[^>]*>/)
    assert.ok(tag, 'home.njk renders #minimap')
    assert.match(tag[0], /\shidden[\s>]/, '#minimap must ship with the hidden attribute')
    assert.equal(hiddenDisplay(CSS), 'none', 'a hidden #minimap still takes a box')
  })

  // mutation: minimap-pre-boot.visible-before-boot
  it('stays unseen until the first draw, even once density unhides it', () => {
    const init = APP.indexOf("minimap.style.visibility = 'hidden'")
    const size = APP.indexOf('sizeMap();')
    assert.ok(
      init > -1 && init < size,
      'visibility is withheld before sizeMap() can unhide the map'
    )
    const draw = APP.slice(APP.indexOf('function drawMinimap(){'))
    const body = draw.slice(0, draw.indexOf('\n}\n'))
    assert.match(
      body,
      /minimap\.style\.visibility = ''/,
      'drawMinimap() reveals the map after drawing'
    )
  })
})

// AN ACTUAL MAP. The
// corner is every tile's own picture shrunk to the map's cell and set back
// in the inks, never footprints; it is drawn whole, cell for cell; and the
// camera's frame keeps an edge of the ground so it reads over a dark tile.
describe('the minimap is the world in miniature', () => {
  const pic = APP.slice(
    APP.indexOf('function mapWorldPicture('),
    APP.indexOf('function drawMinimap(')
  )
  const draw = APP.slice(
    APP.indexOf('function drawMinimap('),
    APP.indexOf('// ---- the plan: the world past the mount floor')
  )

  // mutation: minimap.footprints-again
  it("lays every tile's own picture where the tile sits", () => {
    assert.match(
      pic,
      /const pic = planPic\(id\);\s*if\(pic\) c\.drawImage\(pic, o\.wx \* k, o\.wy \* k, o\.w \* k, o\.h \* k\);/
    )
    assert.doesNotMatch(draw, /pressFootprints/, 'the corner presses footprints again')
  })

  // mutation: minimap.not-dithered
  it('sets each shrunk cell back in the inks by the Bayer order', () => {
    assert.match(pic, /BAYER4\[\(y % 4\) \* 4 \+ \(x % 4\)\]/)
    assert.match(pic, /c\.putImageData\(img, 0, 0\);/)
  })

  // mutation: minimap.smoothed-up
  it('draws the shrunk world whole, a map cell a block, never smoothed', () => {
    assert.match(draw, /c\.imageSmoothingEnabled = false;\s*c\.drawImage\(mapWorldPicture\(/)
  })

  // mutation: minimap.frame-no-edge
  it("keeps an edge of the ground round the camera's frame", () => {
    assert.match(draw, /c\.fillStyle = mapInk\.ground; bars\(x - MAPPX, y - MAPPX/)
  })
})
