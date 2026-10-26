// Photo sets: an entry whose page IS its pictures.
//
// BIBLE.md section 5 already counts photos among the items, and section 6
// says the modal is the page. A photo set is both of those and nothing
// else: no body to write, no layout to design per set. Drop the pictures in
// src/static/img/<slug>/, write the frontmatter, and the page is a carousel
// of them.
//
// Two decisions worth stating, because they are what keep this small:
//
// 1. The pictures live in the static tree, not beside the markdown. The
//    content loader reads one flat directory and takes only top-level .md
//    files, so a folder of images next to the entry would need it to
//    recurse, and the pictures would then need serving from somewhere the
//    static handler does not look. Under src/static/img/<slug>/ they are
//    ordinary assets: cached, immutable-ish, swept by the metadata guard.
//
// 2. The directory listing IS the set. Filename order, natural (so 2 comes
//    before 10). Frontmatter can override the order or attach alt text, but
//    the zero-configuration path is "put the pictures in the folder".
//
// The markup is a scroll-snap strip walked by the kit's snap scrollbar
// (primitives/kit/kit-scroll.js, the one way a collection is walked: a stepper at each
// end, a slider between them). Deliberately not the CSS carousel
// pseudo-elements (::scroll-marker, ::scroll-button): they are Blink-only,
// absent behind a flag in both other engines, and absent from Interop 2026,
// so they would be a carousel that only works in one browser wearing a
// fallback that works in all of them.

import { readdirSync } from 'node:fs'
import { extname, join } from 'node:path'

import { scrollMarkup } from 'multiplayer-canvas/kit/scroll'
import { escapeHtml } from './canvas-sheets.js'
import { dimensionsOf } from './image-meta.js'
import { imgUrl } from './img-version.js'
import { readFileHead } from './read-head.js'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'])

// Enough of a file to hold any header this reads: PNG puts IHDR in the
// first 33 bytes, WebP in the first 30, and a JPEG's frame header sits
// behind its metadata, which the strip step has already removed.
const HEAD_BYTES = 65536

// "2.jpg" before "10.jpg": a set numbered by hand is in the order a human
// wrote, not the order a byte comparison finds.
// seam: test/lib/photo-set.test.js
export function naturalCompare(a, b) {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
}

// The entries reload per request in development, so an authoring mistake
// would otherwise print once per reload until it drowned out the log it
// was trying to appear in. Said once, then remembered.
const said = new Set()
function warnOnce(message) {
  if (said.has(message)) return
  said.add(message)
  console.warn(message)
}

/**
 * The pictures of one set, in order, with their real dimensions.
 *
 * @param {string} imageRoot  the directory /img maps to
 * @param {string} slug
 * @param {{title?: string, photos?: Array<string|{src: string, alt?: string}>}} entry
 * @returns {Array<{src: string, alt: string, width: number|null, height: number|null}>}
 */
export function readPhotoSet(imageRoot, slug, entry = {}) {
  const dir = join(imageRoot, slug)
  let files
  try {
    files = readdirSync(dir, { withFileTypes: true })
      .filter((f) => f.isFile() && IMAGE_EXT.has(extname(f.name).toLowerCase()))
      .map((f) => f.name)
      .sort(naturalCompare)
  } catch {
    // NOTE: a set whose folder is missing must not take down every content
    // surface, the same reason the markdown loader skips a bad file rather
    // than throwing. It renders as a set with no pictures and says so here.
    warnOnce(`photo-set: ${slug} has no pictures at ${join('img', slug)}`)
    return []
  }

  // Frontmatter, when present, selects and orders. A bare string is a
  // filename; an object may also carry the alt text.
  const declared = Array.isArray(entry.photos) ? entry.photos : null
  const chosen = declared
    ? declared
        .map((p) => (typeof p === 'string' ? { src: p } : p))
        .filter((p) => p && typeof p.src === 'string')
    : files.map((name) => ({ src: name }))

  const total = chosen.length
  return chosen
    .filter((p) => {
      if (files.includes(p.src)) return true
      warnOnce(`photo-set: ${slug} lists ${p.src}, which is not in ${join('img', slug)}`)
      return false
    })
    .map((p, i) => {
      const head = readFileHead(join(dir, p.src), HEAD_BYTES)
      const size = head ? dimensionsOf(head) : null
      return {
        src: `/img/${slug}/${p.src}`,
        // Alt text is the owner's to write. Absent it, the honest fallback
        // says which picture this is inside a set he did name, rather than
        // inventing a description of what is in the frame.
        alt: p.alt || `${entry.title || slug}, photo ${i + 1} of ${total}`,
        width: size ? size.width : null,
        height: size ? size.height : null,
      }
    })
}

/**
 * The carousel, as the entry's body HTML.
 *
 * @param {{slug: string, title?: string, photos: Array<object>}} entry
 * @returns {string}
 */
export function photoSetHtml(entry) {
  const photos = entry.photos || []
  if (!photos.length) return ''
  const label = escapeHtml(entry.title || entry.slug)
  const total = photos.length

  const slides = photos
    .map((p, i) => {
      // Intrinsic size reserves the box before the bytes land, so a set
      // does not shove the page around as it loads. The ratio rides a
      // custom property because each slide is sized to its own picture.
      const box =
        p.width && p.height
          ? ` width="${p.width}" height="${p.height}" style="--photoset-ratio:${p.width}/${p.height}"`
          : ''
      // Only the first picture is asked for up front. The script promotes
      // each neighbour as it becomes one, so a set of forty costs one
      // download until somebody starts moving through it. With no script
      // the browser's own lazy loading does the same job on scroll.
      const load = i === 0 ? ' loading="eager" fetchpriority="high"' : ' loading="lazy"'
      return (
        `<div class="photoset-slide" role="group" aria-roledescription="slide" ` +
        `aria-label="${i + 1} of ${total}">` +
        `<img src="${escapeHtml(imgUrl(p.src))}" alt="${escapeHtml(p.alt)}"${box}${load} decoding="async">` +
        `</div>`
      )
    })
    .join('')

  // The track is the scroll container, so it is focusable: a region that
  // scrolls has to be reachable by keyboard whether or not anything inside
  // it is. Arrow keys are handled there; Escape is not, because closing the
  // page belongs to the page's own ladder and a second dismissal path would
  // mean Escape did different things depending on where the focus sat.
  // The walker names every slot by its picture's alt text and the slider by
  // the set's own name (scrollMarkup escapes both).
  return (
    `<section class="photoset" data-photoset aria-roledescription="carousel" aria-label="${label}">` +
    `<div class="photoset-track" tabindex="0" role="group" aria-label="${label}, ${total} photos">` +
    slides +
    `</div>` +
    `<div class="photoset-bar">` +
    scrollMarkup({ titles: photos.map((p) => p.alt), at: 0, label: entry.title || entry.slug }) +
    `<p class="photoset-count" role="status" aria-atomic="true"><span data-photoset-at>1</span> / ${total}</p>` +
    `</div>` +
    `</section>`
  )
}
