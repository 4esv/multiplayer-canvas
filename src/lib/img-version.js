// Every /img URL the site emits carries its bytes' hash (issue #319).
//
// Images keep their names across re-bakes (the build copies them verbatim),
// so a bare /img/canvas/web-instruments.png is the same URL before and after the
// picture changes, and a browser holding the old one keeps it for as long as
// the cache header lets it. The fix is the one the css/js already have: the
// URL moves with the content. Here the hash rides a query (`?v=<hash8>`)
// instead of the filename, so nothing on disk is renamed and the static
// handler serves the file as it is.
//
// The hash is sha256 of the file, first 8 hex, taken from the file itself on
// first use and never written by hand. It is remembered against the file's
// mtime and size, so dev, the tests and a re-bake all see new bytes without a
// restart; production's files do not change under a running process, so
// there it is computed once per file.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import config from '../config.js'

const ROOT = config.content.imageDir
// the site's own origin, as a regex fragment: an absolute URL on it is
// versioned the same as a root-relative one
const ORIGIN = config.site.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i

const memo = new Map() // rel -> { mtimeMs, size, v }

/**
 * The hash of one file under /img, or null when there is no such file.
 *
 * @param {string} rel  the path under /img, no leading slash
 */
export function imgVersion(rel) {
  if (!rel || rel.includes('..')) return null
  let st
  try {
    st = statSync(join(ROOT, rel))
  } catch {
    return null
  }
  if (!st.isFile()) return null
  const hit = memo.get(rel)
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.v
  const v = createHash('sha256')
    .update(readFileSync(join(ROOT, rel)))
    .digest('hex')
    .slice(0, 8)
  memo.set(rel, { mtimeMs: st.mtimeMs, size: st.size, v })
  return v
}

/**
 * An /img URL (root-relative or on the site's origin) with its hash. A URL
 * that already carries a query, or names no file, comes back as it went in.
 */
export function imgUrl(url) {
  const m = new RegExp(`^((?:${ORIGIN})?/img/)([^?#"'\\s]+)$`).exec(url)
  if (!m) return url
  const v = imgVersion(m[2])
  return v ? `${m[1]}${m[2]}?v=${v}` : url
}

// an /img URL in markup, not already followed by a query
const IN_MARKUP = new RegExp(
  `(?:${ORIGIN})?/img/[\\w./-]+\\.(?:png|jpe?g|gif|webp|avif|svg|ico)(?![\\w?])`,
  'gi'
)

/** Every /img URL in a string of markup, versioned. */
export function versionImgs(html) {
  return html.replace(IN_MARKUP, imgUrl)
}

/**
 * The map the canvas builds its picture URLs from (BOOT.img): every image
 * under /img, keyed by its path below /img, to its versioned URL.
 */
export function imgManifest() {
  const out = {}
  let files
  try {
    files = readdirSync(ROOT, { recursive: true, withFileTypes: true })
  } catch {
    return out
  }
  for (const f of files) {
    if (!f.isFile() || !IMAGE.test(f.name)) continue
    const rel = relative(ROOT, join(f.parentPath, f.name)).split(sep).join('/')
    const v = imgVersion(rel)
    if (v) out[rel] = `/img/${rel}?v=${v}`
  }
  return out
}
