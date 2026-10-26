// Wires the site's mark into its shipped icons.
//
//   node scripts/icon/wire.mjs [mark.svg] [--static-dir src/static]
//
// The mark is an 11x11 grid drawn as unit squares, the shape
// img/icon/default.svg has (lib/desk.js logoRows reads it). It becomes the
// full favicon set at the exact paths canvas/home.njk, canvas-base.njk and
// manifest.json already serve, plus favicon.svg and logo.png. Redraw
// default.svg (and MARK_A in canvas/marks.js) and run this to make the site
// wear your own mark.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { pixelsToPath } from '../../src/lib/pixel-icon.js'
import { readFile } from 'node:fs/promises'

import { logoRows } from '../../src/lib/desk.js'
import { encodeIco } from './ico.mjs'
import { encodePng } from './png.mjs'
import { GROUND, fitScale, renderRgba } from './render.mjs'

// The SVG icons carry concrete ink with a dark-scheme swap (the native pair
// from canvas-tokens.css).
// THE ONE PLACE prefers-color-scheme SURVIVES, and it is not a theme.
// The site has ONE ground (canvas-tokens.css) and no page on it
// asks the OS what colour to be. These files are different: a favicon and an
// app icon are painted by the BROWSER, into a tab strip, a bookmark bar and a
// task switcher whose ground follows the user's OS and which we do not own
// and cannot read. A single-ink mark there is invisible half the time on
// somebody else's machine. So the icons answer the OS, the pages never do,
// and the two facts are not in tension: one is our ground, the other is
// theirs. Do not "clean this up" to match the sweep.
//
// Favicon SVG: the ICO's 16px geometry mirrored. The ICO seats the 11px art
// at floor((16-11)/2) = 2, so the viewBox opens 2 units above/left and 3
// below/right; at 16 CSS px the tab then shows the same mark pixel for
// pixel whichever file the browser picks.
function faviconSvg(pixels) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 16 16" shape-rendering="crispEdges">` +
    `<style>path{fill:#18181b}@media(prefers-color-scheme:dark){path{fill:#e4e4e7}}</style>` +
    `<path d="${pixelsToPath(pixels)}"/></svg>\n`
  )
}

async function emit(staticDir, rel, contents, written) {
  const path = join(staticDir, rel)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
  written.push(`/${rel} (${contents.length} bytes)`)
}

async function main() {
  const args = process.argv.slice(2)
  const dirFlag = args.indexOf('--static-dir')
  const staticDir = resolve(dirFlag === -1 ? 'src/static' : args[dirFlag + 1])
  const src = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--static-dir')
  const svg = await readFile(src || join(staticDir, 'img/icon/default.svg'), 'utf8')
  const pixels = logoRows(svg).map((row) => [...row].map((c) => (c === '#' ? 1 : 0)))
  if (!pixels.flat().some(Boolean)) {
    console.error('no pixels: the mark must be 11x11 unit squares (M<x> <y>h1v1h-1z)')
    process.exit(1)
  }
  const written = []
  const assets = []

  {
    const png = (size, opts) => encodePng(size, size, renderRgba(pixels, { size, ...opts }))

    // Every raster in the set carries its own ground: rasters cannot adapt
    // to the surface behind them (only favicon.svg can, via its scheme
    // swap), so a transparent one is a coin toss against a dark UI. The
    // ground-grey chip is legible on either. The ONE exception is the monochrome
    // icon below, which is transparent on purpose because the platform,
    // not the file, chooses its colors.
    const rgba16 = renderRgba(pixels, { size: 16, scale: 1, bg: GROUND })
    const rgba32 = renderRgba(pixels, { size: 32, scale: 2, bg: GROUND })

    await emit(staticDir, 'favicon-16x16.png', encodePng(16, 16, rgba16), written)
    await emit(staticDir, 'favicon-32x32.png', encodePng(32, 32, rgba32), written)
    await emit(
      staticDir,
      'favicon.ico',
      encodeIco([
        { size: 16, rgba: rgba16 },
        { size: 32, rgba: rgba32 },
      ]),
      written
    )
    // iOS composites apple-touch-icon on opaque tiles; transparent goes black.
    await emit(
      staticDir,
      'apple-touch-icon.png',
      png(180, { scale: fitScale(180, 12), bg: GROUND }),
      written
    )
    // ground-backed like the touch icon: a transparent 192 went black-on-dark
    // on dark launchers and install sheets (the PWA abyss)
    await emit(
      staticDir,
      'android-chrome-192x192.png',
      png(192, { scale: fitScale(192, 4), bg: GROUND }),
      written
    )
    // One asset per manifest purpose, because a purpose is a FRAMING and no
    // single framing is two of them. `any` is shown whole, `maskable` is
    // cropped to a shape the platform picks, `monochrome` is recolored by
    // the platform. Declaring one file "any maskable" (which this set did)
    // makes the same pixels answer two briefs, so one of them always loses:
    // the safe-zone framing that keeps the maskable whole is exactly the
    // framing that leaves the `any` a small mark in a wide margin.
    //
    // any: never cropped, so it fills. The art takes 90% of the side
    // (11 * 42 = 462 of 512), which is the framing the 192 already has: one
    // mark at two sizes has to read the same.
    await emit(
      staticDir,
      'android-chrome-512x512.png',
      png(512, { scale: 42, bg: GROUND }),
      written
    )
    // maskable: the platform crops to its own shape (circle, squircle,
    // rounded square) and only guarantees the central 80% diameter, so the
    // art SQUARE must fit inside that circle: side under 512 * 0.8 / sqrt(2)
    // ~ 289px, hence 11 * 26 = 286. The ground still bleeds to all four
    // edges, because a maskable with a transparent margin shows the
    // launcher through whatever corners the mask keeps.
    await emit(staticDir, 'maskable-512x512.png', png(512, { scale: 26, bg: GROUND }), written)
    // monochrome: the one raster with no ground. Android 13+ themed icons
    // take the alpha channel and repaint the ink in the user's theme color,
    // so a baked ground arrives as a solid chip with the mark invisible
    // inside it. Framed like the maskable, since a themed icon is masked
    // exactly like an adaptive one.
    await emit(staticDir, 'monochrome-512x512.png', png(512, { scale: 26, bg: null }), written)
    await emit(staticDir, 'logo.png', png(512, { scale: fitScale(512, 3), bg: GROUND }), written)
    await emit(staticDir, 'favicon.svg', faviconSvg(pixels), written)
    assets.push(
      '/favicon.ico',
      '/favicon.svg',
      '/favicon-16x16.png',
      '/favicon-32x32.png',
      '/apple-touch-icon.png',
      '/android-chrome-192x192.png',
      '/android-chrome-512x512.png',
      '/maskable-512x512.png',
      '/monochrome-512x512.png',
      '/logo.png'
    )
  }

  for (const line of written) console.log(`wrote ${line}`)
}

await main()
