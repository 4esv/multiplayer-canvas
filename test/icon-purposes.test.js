// test/icon-purposes.test.js
// BIBLE.md section 10, the manifest half: one asset per icon purpose, proved
// against the shipped PIXELS rather than against the filename.
//
// A purpose is a framing, and no framing is two of them. `any` is painted
// whole, `maskable` is cropped to a shape the platform picks and only the
// central 80% diameter survives, `monochrome` is repainted by the platform in
// the user's theme color and so must be a silhouette on transparency. The set
// shipped ONE 512 declared "any maskable" for months: the framing that keeps
// a maskable whole is exactly the framing that leaves an `any` a small mark
// adrift in its frame, so that file was always wrong in one of its two jobs,
// and nothing could tell which. There was no `monochrome` at all.
//
// The spec allows the space-separated list, and this guard does not. The
// permission is about what a browser MAY reuse a file for, not about the art
// being right for both, and a rule that lets one file answer two briefs is
// how the old 512 stayed wrong while every other guard was green.
//
// Filenames prove none of this, so nothing here reads one. Every assertion
// decodes the PNG (test/lib/png-decode.js, the read side of the encoder in
// scripts/icon/png.mjs) and measures alpha and ink extent.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { decodePng, measureInk, inkOutsideCircle } from './lib/png-decode.js'

const ROOT = join(import.meta.dirname, '..')
const STATIC = join(ROOT, 'src/static')
const manifest = JSON.parse(readFileSync(join(STATIC, 'manifest.json'), 'utf8'))

const PURPOSES = new Set(['any', 'maskable', 'monochrome'])
// The share of the canvas a platform mask is guaranteed to keep: a centred
// circle of 80% the side, so ink may reach 0.4 * size from the centre.
const SAFE_DIAMETER = 0.8

// Decoded once per file, because every icon gets several assertions.
const cache = new Map()
function icon(src) {
  if (!cache.has(src)) {
    const path = join(STATIC, src.replace(/^\//, ''))
    const img = decodePng(readFileSync(path))
    cache.set(src, { img, ink: measureInk(img) })
  }
  return cache.get(src)
}

describe('manifest icons: every declared purpose is satisfied by real pixels', () => {
  it('the manifest declares icons at all', () => {
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length, 'manifest.icons is empty')
  })

  it('no two entries share a src', () => {
    const srcs = manifest.icons.map((e) => e.src)
    assert.deepEqual(
      [...new Set(srcs)].sort(),
      [...srcs].sort(),
      'the same file is declared twice, which is "any maskable" spelled with more lines'
    )
  })

  it('all three purposes are declared', () => {
    const declared = new Set(manifest.icons.flatMap((e) => String(e.purpose || '').split(/\s+/)))
    for (const purpose of PURPOSES) {
      assert.ok(declared.has(purpose), `no icon declares purpose ${purpose}`)
    }
  })

  it('an `any` icon is offered at both sizes Chrome asks for', () => {
    const sizes = manifest.icons.filter((e) => e.purpose === 'any').map((e) => e.sizes)
    for (const want of ['192x192', '512x512']) {
      assert.ok(sizes.includes(want), `no ${want} icon with purpose any`)
    }
  })

  for (const entry of manifest.icons) {
    describe(`${entry.src} (${entry.purpose})`, () => {
      // mutation: icon-purposes.one-file-two-jobs
      it('declares exactly one purpose, from the known set', () => {
        assert.equal(typeof entry.purpose, 'string', 'purpose is not declared')
        const parts = entry.purpose.trim().split(/\s+/)
        assert.equal(
          parts.length,
          1,
          `declares ${parts.length} purposes; one asset cannot be two framings`
        )
        assert.ok(PURPOSES.has(parts[0]), `unknown purpose ${parts[0]}`)
      })

      it('exists on disk and is the PNG it claims to be', () => {
        assert.match(entry.src, /^\/[\w./-]+\.png$/, 'src is not a rooted .png path')
        assert.equal(entry.type, 'image/png', `type ${entry.type} is not image/png`)
        assert.ok(
          existsSync(join(STATIC, entry.src.replace(/^\//, ''))),
          `${entry.src} is declared but not on disk`
        )
        assert.doesNotThrow(() => icon(entry.src), `${entry.src} does not decode as a PNG`)
      })

      it('its pixel dimensions match its declared sizes', () => {
        const { img } = icon(entry.src)
        assert.equal(
          `${img.width}x${img.height}`,
          entry.sizes,
          `${entry.src} decodes as ${img.width}x${img.height}`
        )
      })

      it('its pixels satisfy its purpose', () => {
        const { img, ink } = icon(entry.src)
        const radius = ink.radiusFrac / SAFE_DIAMETER // 1.0 == exactly on the safe circle
        const lost = () => inkOutsideCircle(img, SAFE_DIAMETER)

        if (entry.purpose === 'monochrome') {
          // The themed-icon pipeline reads the alpha channel and throws the
          // color away. An opaque file arrives as a solid tinted chip.
          assert.equal(ink.ground[3], 0, `${entry.src} has an opaque ground; monochrome needs one`)
          assert.ok(
            ink.clearPct > 50,
            `${entry.src} is only ${ink.clearPct.toFixed(1)}% transparent; a silhouette is mostly clear`
          )
          // Themed icons are masked exactly like adaptive ones.
          assert.equal(lost(), 0, `${entry.src} loses ink to the themed-icon mask`)
        } else {
          // Both painted purposes bake their own ground: a raster cannot adapt
          // to the launcher behind it the way favicon.svg can.
          assert.equal(ink.clearPct, 0, `${entry.src} is ${ink.clearPct.toFixed(1)}% transparent`)
          assert.equal(
            ink.partialAlphaCount,
            0,
            `${entry.src} has ${ink.partialAlphaCount} partially transparent pixels`
          )
        }

        if (entry.purpose === 'maskable') {
          assert.equal(
            lost(),
            0,
            `${entry.src} draws outside the safe zone (ink reaches ${radius.toFixed(3)} of it)`
          )
          // The ground has to reach every corner, or the mask cuts through to
          // the launcher wherever it keeps one.
          const { width, height, rgba } = img
          for (const [x, y] of [
            [0, 0],
            [width - 1, 0],
            [0, height - 1],
            [width - 1, height - 1],
          ]) {
            const i = (y * width + x) * 4
            assert.equal(
              rgba.compare(Buffer.from(ink.ground), 0, 4, i, i + 4),
              0,
              `${entry.src} does not bleed its ground to (${x}, ${y})`
            )
          }
        }

        if (entry.purpose === 'any') {
          // An `any` icon is never cropped, so it fills. One framed inside
          // the maskable safe zone is the old shared-asset bug wearing a
          // new filename: a small mark adrift in a wide margin.
          assert.ok(
            lost() > 0,
            `${entry.src} is framed for a crop it never gets (ink reaches only ${radius.toFixed(3)} of the safe zone)`
          )
        }
      })
    })
  }
})

// iOS picks its home-screen icon up from the <link> in canvas-base.njk and
// home.njk, and composites it onto an opaque tile of its own: a transparent
// one goes black. iOS 18 added dark and tinted home-screen icons, and there
// is NOTHING correct for a web app to declare for them. Native apps ship
// alternate images in the asset catalog; the web has no equivalent. Apple
// documents exactly three attributes on the link (rel, href, sizes), with no
// media and no color-scheme, and the manifest's own `color_scheme` member for
// an image resource is still an open proposal, not a shipped feature. So the
// dark and tinted renderings are the system re-rendering THIS asset, and the
// only rule worth guarding is the one that has always applied: keep it opaque
// and keep the mark legible after a tint flattens it.
describe('apple-touch-icon: opaque, because iOS composites it', () => {
  it('is 180x180 and fully opaque', () => {
    const { img, ink } = icon('/apple-touch-icon.png')
    assert.equal(`${img.width}x${img.height}`, '180x180')
    assert.equal(ink.clearPct, 0, `apple-touch-icon.png is ${ink.clearPct.toFixed(1)}% transparent`)
    assert.equal(ink.partialAlphaCount, 0, 'apple-touch-icon.png has partially transparent pixels')
  })
})
