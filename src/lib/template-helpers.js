import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import nunjucks from 'nunjucks'

import config from '../config.js'
import { pathFor } from './entry-kind.js'
import { pixelTitle } from 'multiplayer-canvas/pixel-type'
import { IMPORT_MAP, SPECULATION_RULES } from './import-map.js'
import { imgUrl } from './img-version.js'
import { PART_FILES } from './kit-parts.js'

const SITE_URL = config.site.url

// --- Fingerprinted assets ---------------------------------------------------
// scripts/build-assets.mjs (run in the Docker assets stage, never in dev)
// minifies static css/js into dist/static/ under content-hashed names and
// writes the logical->hashed map to dist/asset-manifest.json. asset() resolves
// through that map so templates always reference one logical path; without a
// manifest (dev, tests) it is the identity function and raw files are served.
function loadAssetManifest() {
  if (config.env !== 'production') return {}
  try {
    return JSON.parse(readFileSync(join(import.meta.dirname, '../../dist/asset-manifest.json')))
  } catch {
    return {}
  }
}

const ASSET_MANIFEST = loadAssetManifest()

// Same resolution the asset() template global does, for code that builds
// URLs outside a template (the /api/page payload the canvas consumes).
export function assetUrl(path) {
  return ASSET_MANIFEST[path] || path
}

// --- Retro text shaping (base-retro.njk) -----------------------------------
// The old-browser page reuses each page's plain-text block verbatim and drops
// it inside a <pre>. Four transforms make that text behave on an ancient
// browser: fold the decorative glyphs to ASCII (a relic with thin UTF-8 font
// coverage shows boxes for arrows and curly quotes otherwise), hard-wrap (no
// soft-wrap in <pre>), HTML-escape, then linkify so navigation works. Order
// matters: fold and wrap on the raw text for honest widths, escape, then
// linkify the escaped text (URLs here carry no <, >, or &). Accented letters
// are left alone -- they are meaningful and decode fine under the declared
// UTF-8; only the ornamental punctuation is folded.

const RETRO_WRAP_WIDTH = 78

// Decorative glyphs the text path uses for chrome, plus the curly punctuation
// markdown produces, mapped to their plain-ASCII equivalents.
const RETRO_FOLDS = [
  [/[‘’‚‛′]/g, "'"], // ' ' ‚ ‛ ′ -> '
  [/[“”„‟″]/g, '"'], // " " „ ‟ ″ -> "
  [/[—―]/g, '--'], // — ― -> --
  [/[–‑]/g, '-'], // – ‑ -> -
  [/[→↗↦➡]/g, '->'], // → ↗ ↦ ➡ -> ->
  [/[←↖]/g, '<-'], // ← ↖ -> <-
  [/↑/g, '^'], // ↑ -> ^
  [/↓/g, 'v'], // ↓ -> v
  [/[·•‧∙]/g, '-'], // · • ‧ ∙ -> -
  [/…/g, '...'], // … -> ...
  [/\u00A0/g, ' '], // nbsp -> space
]

function retroFold(text) {
  let out = String(text)
  for (const [pattern, replacement] of RETRO_FOLDS) out = out.replace(pattern, replacement)
  return out
}

function retroWrap(text, width) {
  return String(text)
    .split('\n')
    .map((line) => {
      if (line.length <= width) return line
      // Greedy word-wrap. A single token longer than the width (a long URL)
      // is left to overflow rather than broken, so links stay clickable.
      const words = line.split(/\s+/).filter(Boolean)
      const out = []
      let cur = ''
      for (const word of words) {
        if (cur && (cur + ' ' + word).length > width) {
          out.push(cur)
          cur = word
        } else {
          cur = cur ? cur + ' ' + word : word
        }
      }
      if (cur) out.push(cur)
      return out.join('\n')
    })
    .join('\n')
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// --- Entry bodies to plain text (feed/entry.njk terminal branch) ------------
// Case studies mix prose with inline <svg> diagrams, figure sections, hljs
// code blocks, and footnote chrome. A tag-strip on that markup leaks every
// SVG text label and dumps the footnote bodies mid-page, so the terminal
// tier walks the rendered HTML instead: graphic and footnote subtrees are
// dropped whole, footnote markers survive as [n], code blocks come out as
// indented text, and paragraph breaks are kept while whitespace collapses.
// The retro path reuses this output; retroText folds/wraps/linkifies on top.

// Decode the entities markdown-it and hljs emit (numeric plus the named
// handful they actually produce). &amp; goes last so it cannot double-decode.
function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

// Remove whole element subtrees. The open regex captures the tag name; the
// matching close is found by depth, so a same-name element nested inside a
// dropped subtree still counts toward its close. An unclosed tag drops the
// rest of the document rather than looping.
function dropSubtrees(html, openRe) {
  let out = String(html)
  for (;;) {
    const m = out.match(openRe)
    if (!m) return out
    const scan = new RegExp(`<(/?)${m[1].toLowerCase()}\\b[^>]*>`, 'gi')
    scan.lastIndex = m.index + m[0].length
    let depth = 1
    let end = out.length
    let t
    while ((t = scan.exec(out))) {
      depth += t[1] ? -1 : 1
      if (depth === 0) {
        end = scan.lastIndex
        break
      }
    }
    out = out.slice(0, m.index) + out.slice(end)
  }
}

// seam: test/lib/template-helpers.test.js
export function htmlToText(html) {
  // Graphics carry no prose: svg, figure, and the section-based figures
  // (figure-title/figure-note included; a caption without its diagram is
  // noise). The footnotes section goes too: the [n] markers stay behind as
  // the record that a claim was sourced.
  let out = dropSubtrees(String(html ?? ''), /<(svg|style|script|figure)\b[^>]*>/i)
  out = dropSubtrees(out, /<(section)\b[^>]*class="[^"]*\b(?:figure|footnotes)\b[^"]*"[^>]*>/i)

  // Code blocks keep their internal layout: strip the hljs span markup,
  // decode, indent four spaces, and park the block behind a placeholder so
  // the whitespace collapse below cannot touch it.
  const blocks = []
  out = out.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner) => {
    const code = decodeEntities(inner.replace(/<[^>]+>/g, ''))
      .replace(/^\n+|\s+$/g, '')
      .split('\n')
      .map((line) => (line.trim() ? '    ' + line : ''))
      .join('\n')
    blocks.push(code)
    return `\n\n\u0000${blocks.length - 1}\u0000\n\n`
  })

  // Footnote markers become [n]: the marker's own number when it has one,
  // document order otherwise.
  let seq = 0
  out = out.replace(
    /<sup\b[^>]*class="[^"]*\bfootnote-ref\b[^"]*"[^>]*>([\s\S]*?)<\/sup>/gi,
    (_m, inner) => {
      seq += 1
      const label = inner.replace(/<[^>]+>/g, '').trim()
      return `[${/^\d+$/.test(label) ? label : seq}]`
    }
  )

  // Block closes become paragraph breaks, list items become dashes, then
  // every remaining tag is dropped and its text kept.
  out = out
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|h[1-6]|li|ul|ol|blockquote|section|article|div|table|tr)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')

  out = decodeEntities(out)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Restore the parked code blocks: split on the sentinel, odd parts are
  // block indices (a regex literal here would trip no-control-regex).
  return out
    .split('\u0000')
    .map((part, i) => (i % 2 ? blocks[Number(part)] : part))
    .join('')
}

function retroLinkify(escaped) {
  return escaped
    .replace(/\bhttps?:\/\/[^\s<]+/g, (match) => {
      const trail = match.match(/[.,)]+$/)
      const url = trail ? match.slice(0, -trail[0].length) : match
      return `<a href="${url}">${url}</a>${trail ? trail[0] : ''}`
    })
    .replace(
      /(^|[\s(])(\/[a-z][\w/-]*)/g,
      (_m, lead, path) => `${lead}<a href="${path}">${path}</a>`
    )
    .replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      (email) => `<a href="mailto:${email}">${email}</a>`
    )
}

/**
 * @param {import('nunjucks').Environment} env
 */
export function registerFilters(env) {
  env.addFilter('safeJson', (obj) => {
    return JSON.stringify(obj ?? null).replace(/<\//g, '<\\/')
  })

  env.addFilter('retroText', (s) => {
    const wrapped = retroWrap(retroFold(s ?? ''), RETRO_WRAP_WIDTH)
    return nunjucks.runtime.markSafe(retroLinkify(escapeHtml(wrapped)))
  })

  // A full page's title in the canvas's own face. pixelTitle escapes
  // the words it keeps for readers; the rest is glyph data, never input.
  env.addFilter('pixelTitle', (s) =>
    nunjucks.runtime.markSafe(pixelTitle(String(s ?? ''), 'display', { tag: 'h1' }))
  )

  // Entry bodies for the curl text path: rendered HTML in, prose out.
  env.addFilter('htmlToText', htmlToText)

  env.addFilter('repeat', (str, count) => {
    if (typeof str !== 'string' || typeof count !== 'number') return ''
    if (count < 0) return ''
    return str.repeat(Math.floor(count))
  })

  env.addFilter('date', (date, format) => {
    const d = date instanceof Date ? date : new Date(date)
    if (format === 'Y') return d.getFullYear().toString()
    return d.toISOString()
  })
}

/** Every kit part's picture at its hash, keyed by part-state. */
function kitImg() {
  return Object.fromEntries(PART_FILES.map((f) => [f, imgUrl(`/img/kit/${f}.png`)]))
}

/**
 * @param {import('nunjucks').Environment} env
 */
export function registerGlobals(env) {
  env.addGlobal('now', new Date())
  // who the site is (site.config.js): every template that prints the
  // origin, the name, the owner or the contact line reads it here, so no
  // page carries an identity of its own
  env.addGlobal('identity', {
    ...config.site,
    host: new URL(config.site.url).host,
  })
  env.addGlobal('asset', (path) => ASSET_MANIFEST[path] || path)
  // the engine by its package name, for the browser (lib/import-map.js)
  env.addGlobal('importMap', IMPORT_MAP)
  env.addGlobal('speculationRules', SPECULATION_RULES)
  // an /img URL with its bytes' hash (lib/img-version.js)
  env.addGlobal('imgUrl', imgUrl)
  // every kit part at its hash, keyed by part-state: a page that
  // wears the kit ships this map (kit/parts.njk), kit.css reads it as
  // --kp-<part>-<state> and js/kit.js swaps pictures from it
  env.addGlobal('kitImg', kitImg)
  // The kind-to-path fork, once, for the text templates too. They used to
  // spell it inline ({% if not e.webOnly %}/feed{% endif %}/{{ e.slug }}),
  // which is the same fork the routes make and a second place for it to go
  // wrong: curl would have been the last surface to learn a new kind.
  env.addGlobal('entryUrl', (entry) => entry.externalUrl || `${SITE_URL}${pathFor(entry)}`)
}
