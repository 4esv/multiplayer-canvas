// Draw the Open Graph cards: one 1200 x 630 PNG per page, into src/static/img/og/.
//
//   node scripts/og/render.mjs [--only slug,slug] [--out dir]
//   bash scripts/og/render.sh                      (the same, the documented way in)
//
// The cards are pages of the site at billboard size (cards.mjs builds them out
// of the site's own parts), so this boots the site itself, hands Chrome each
// card as a page of it, and puts what Chrome drew onto the ramp. Nothing is
// served from anywhere else: the stylesheets, the fonts, the pictures and the
// figures are the tree's own, and a card that cannot be drawn from the tree
// is not drawn.
//
// THE STANDARD: every page on the site MUST have an OG card. The pages are
// derived, not listed: the doors are in cards.mjs, and every entry under
// content/feed/ that is not hidden and does not live elsewhere gets a card
// from its own front matter. Routes point og:image at /img/og/<slug>.png, so a
// missing card is a broken social preview and an orphan is dead weight
// (test/og.test.js holds one card per page, and holds every px to the ramp).
//
// Needs Chrome (CHROME_PATH, or the usual places) and the tree's dependencies.
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { readRamps } from '../../src/lib/kit-parts.js'
import { build } from '../../src/server.js'
import { loadFeedEntries } from '../../src/routes/feed.js'
import { decodePng, encodePng } from '../icon/png.mjs'
import { browser, onRamp } from '../img/textmode-bake.mjs'
import { CARD, cardHtml, cardSpecs } from './cards.mjs'
import { readStills } from './tree.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const args = process.argv.slice(2)
const flag = (name) => {
  const at = args.indexOf(name)
  return at > -1 ? args[at + 1] : null
}
const ONLY = flag('--only') ? new Set(flag('--only').split(',')) : null
const OUT = flag('--out') ?? join(ROOT, 'src/static/img/og')
const PORT = 9223
const CSS = readFileSync(join(import.meta.dirname, 'card.css'), 'utf8')

const app = await build({ logger: false })
const entries = await loadFeedEntries()
const stills = readStills(entries, ROOT)
const specs = cardSpecs({ entries, stills }).filter((s) => !ONLY || ONLY.has(s.slug))
if (!specs.length) throw new Error(`og: nothing to draw${ONLY ? ` for ${[...ONLY]}` : ''}`)

// one origin: a card is a page here, and everything else is the site's
const cards = new Map(specs.map((s) => [`/__og/${s.slug}`, cardHtml(s, { css: CSS })]))
const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0]
  if (cards.has(path)) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(cards.get(path))
  }
  const r = await app.inject({ method: 'GET', url: req.url })
  res.writeHead(r.statusCode, r.headers)
  res.end(r.rawPayload)
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`

// the window is the card's size too: the first screenshot of a session is
// drawn into a surface the size of the window, and a window smaller than the
// card tiles it
const chrome = await browser(PORT, [
  `--window-size=${CARD.w},${CARD.h}`,
  '--hide-scrollbars',
  '--font-render-hinting=none',
])
const greys = readRamps().grey
mkdirSync(OUT, { recursive: true })
try {
  await chrome.send('Page.enable')
  await chrome.send('Emulation.setDeviceMetricsOverride', {
    width: CARD.w,
    height: CARD.h,
    deviceScaleFactor: 1,
    mobile: false,
  })
  const capture = () =>
    chrome.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: CARD.w, height: CARD.h, scale: 1 },
    })
  for (const s of specs) {
    // the override is the viewport a card is laid out in; asked for again with
    // each card, and checked, because a card laid out at any other size is
    // another card
    await chrome.send('Emulation.setDeviceMetricsOverride', {
      width: CARD.w,
      height: CARD.h,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await chrome.send('Page.navigate', { url: `${origin}/__og/${s.slug}` })
    // the page, its fonts and its pictures, all in
    await chrome.evaluate(`(async () => {
      while (document.readyState !== 'complete') await new Promise((r) => setTimeout(r, 50))
      if (innerWidth !== ${CARD.w} || innerHeight !== ${CARD.h}) throw new Error('viewport ' + innerWidth + 'x' + innerHeight)
      await document.fonts.ready
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})))
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return true
    })()`)
    // OG_EVAL='<expression>' prints what the page says of itself, for a card
    // that is not coming out as drawn
    if (process.env.OG_EVAL) console.log(s.slug, await chrome.evaluate(process.env.OG_EVAL))
    // a card is drawn when two frames in a row are the same frame: the first
    // frame of a session can be drawn into a surface still being sized
    let shot = await capture()
    for (let tries = 0; tries < 8; tries++) {
      await new Promise((r) => setTimeout(r, 100))
      const next = await capture()
      const same = next.data === shot.data
      shot = next
      if (same) break
      if (tries === 7) throw new Error(`og: ${s.slug} never settled`)
    }
    const card = decodePng(Buffer.from(shot.data, 'base64'))
    const snapped = onRamp(card.rgba, greys)
    let moved = 0
    for (let i = 0; i < snapped.length; i += 4)
      if (snapped.compare(card.rgba, i, i + 4, i, i + 4)) moved++
    writeFileSync(join(OUT, `${s.slug}.png`), encodePng(card.width, card.height, snapped))
    console.log(`  ${s.slug}.png: ${card.width}x${card.height}, ${moved} px moved onto the ramp`)
  }
} finally {
  chrome.close()
  server.close()
  await app.close()
}
console.log(`OG cards written to ${OUT}`)
