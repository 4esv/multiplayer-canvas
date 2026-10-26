// The canvas section-door sheets (work / feed / about) built from live data,
// rendering the same plain-text bodies the terminal serves (templates/text/*.njk) at request time, with
// links rewritten to the real paths the pushState router owns. Pure
// functions: the routes feed them rendered text and entry lists.

import {
  backTo as backToFor,
  isCaseStudy,
  isFullPage,
  isRootMounted,
  kindOf,
  metaLine,
  pathFor,
} from './entry-kind.js'
import { pageBarMarkup } from 'multiplayer-canvas/kit/scroll'
import { readerMarkup } from '../static/js/page-reader.js'
import { tagsMarkup } from 'multiplayer-canvas/kit/tags'

import config from '../config.js'
const SITE_NAME = config.site.name
// the site's own origin as a regex fragment, for linkify below
const ORIGIN = config.site.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const OWN_LINK = new RegExp(`^${ORIGIN}/(?:work/|feed/)?([a-z0-9-]+)/?$`)

// Mirrors python's html.escape (quote=True), which the baked pages used.
export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;')
}

// A URL's bare host (www stripped) for a tile or CTA label. A malformed
// frontmatter external_url (a typo, a bare word) must degrade to no label,
// never throw new URL() and take the whole home-page boot down with it.
function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// URLs in already-escaped text become anchors. Links on the site's own
// origin whose slug the
// site serves become real local paths (the client router intercepts them);
// everything else opens in a new tab.
function linkify(escaped, paths = {}) {
  return escaped.replace(/https:\/\/[^\s<]+/g, (url) => {
    const m = OWN_LINK.exec(url)
    if (m && paths[m[1]]) return `<a href="${paths[m[1]]}">${url}</a>`
    return `<a href="${url}" target="_blank" rel="noopener">${url}</a>`
  })
}

// The plain-text-to-HTML formatter: a dashed underline makes an h2, "- "
// lines make a plainList, blank lines split paragraphs.
export function fmt(body, paths = {}) {
  const lines = String(body ?? '').split('\n')
  const out = []
  const para = []
  const items = []
  const flush = () => {
    if (items.length) {
      out.push(
        '<ul class="plainList">' +
          items.map((x) => '<li>' + linkify(escapeHtml(x), paths) + '</li>').join('') +
          '</ul>'
      )
      items.length = 0
    }
    if (para.length) {
      out.push('<p>' + linkify(escapeHtml(para.join('\n')), paths).replace(/\n/g, ' ') + '</p>')
      para.length = 0
    }
  }
  let i = 0
  while (i < lines.length) {
    const ln = lines[i].replace(/\s+$/, '')
    const nxt = i + 1 < lines.length ? lines[i + 1].replace(/\s+$/, '') : ''
    if (ln && /^-{2,}$/.test(nxt)) {
      flush()
      out.push('<h2>' + escapeHtml(ln) + '</h2>')
      i += 2
      continue
    }
    if (!ln.trim()) {
      flush()
      i += 1
      continue
    }
    if (ln.trim().startsWith('- ')) {
      if (para.length) flush()
      items.push(ln.trim().slice(2))
      i += 1
      continue
    }
    if (items.length) flush()
    para.push(ln.trim())
    i += 1
  }
  flush()
  return out.join('\n')
}

// Strips the "title / ====" head (and a date meta line if present) off a
// rendered plain-text page, leaving the body for fmt().
export function parseText(raw) {
  const lines = String(raw ?? '')
    .replace(/\r/g, '')
    .split('\n')
  while (lines.length && !lines[0].trim()) lines.shift()
  const title = (lines.shift() || '').trim()
  if (lines.length && /^=+$/.test(lines[0].trim())) lines.shift()
  while (lines.length && !lines[0].trim()) lines.shift()
  let meta = ''
  if (lines.length && /^\d{4}-\d{2}-\d{2} · /.test(lines[0].trim())) {
    meta = lines[0].trim()
    lines.shift()
  }
  return { title, meta, body: lines.join('\n').trim() }
}

// Splits a plain-text body into its dash-underlined sections, in order.
export function splitSections(src) {
  const marks = []
  const re = /^(.+)\n-{2,}\n?/gm
  let m
  while ((m = re.exec(src))) marks.push({ title: m[1].trim(), start: m.index, end: re.lastIndex })
  return marks.map((mk, i) => ({
    title: mk.title,
    body: src.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : undefined).trim(),
  }))
}

// The two pillar diagrams, in the canvas schematic hand (currentColor
// stroke, no fill, 2.5), standing on the page with no box around them:
// automation is a queue of tasks run through a box
// that loops on its own (the arrow over it shows the cycle) and comes out
// checked; integration is two systems whose inner shapes don't match,
// joined through the one adapter in the line. currentColor keeps both
// theme-true.
const PILLAR_ART = {
  automation:
    '<svg viewBox="0 0 200 96" role="img" aria-label="a queue of tasks flows through a box that runs itself and comes out done">' +
    '<g fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<rect x="8" y="20" width="34" height="14"/><rect x="8" y="41" width="34" height="14"/><rect x="8" y="62" width="34" height="14"/>' +
    '<path d="M48 48 H64 M60 44 l6 4 -6 4"/>' +
    '<rect x="72" y="31" width="52" height="34"/>' +
    '<path d="M84 24 A 22 14 0 0 1 112 24 M112 24 l-2 -8 M112 24 l-7 -4"/>' +
    '<path d="M130 48 H146 M142 44 l6 4 -6 4"/>' +
    '<rect x="154" y="20" width="34" height="14"/><rect x="154" y="41" width="34" height="14"/><rect x="154" y="62" width="34" height="14"/>' +
    '<path d="M164 27 l4 4 7 -8 M164 48 l4 4 7 -8 M164 69 l4 4 7 -8"/>' +
    '</g></svg>',
  integration:
    '<svg viewBox="0 0 200 96" role="img" aria-label="two different systems joined through one adapter">' +
    '<g fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<rect x="8" y="26" width="52" height="44"/><circle cx="34" cy="48" r="9"/>' +
    '<rect x="140" y="26" width="52" height="44"/><rect x="158" y="40" width="16" height="16"/>' +
    '<path d="M60 48 H88 M112 48 H140"/>' +
    '<path d="M100 36 l12 12 -12 12 -12 -12 z"/>' +
    '</g></svg>',
}

// "- Automation, letting the computers …" list items become two drawings
// side by side, each with its words under it, when every item has art;
// anything else falls back to fmt.
function pillarDuo(items, paths) {
  const cards = items.map((it) => {
    const m = /^([^,]+),\s*(.*)$/.exec(it)
    const key = m && m[1].trim().toLowerCase()
    if (!m || !PILLAR_ART[key]) return null
    return (
      `<section class="pillar-card">${PILLAR_ART[key]}` +
      `<h3>${escapeHtml(m[1].trim())}</h3><p>${linkify(escapeHtml(m[2]), paths)}</p></section>`
    )
  })
  return cards.length && cards.every(Boolean)
    ? `<div class="pillar-duo">${cards.join('')}</div>`
    : null
}

// One row of a collection: the title that links, the line under it, and the
// tags, ruled with the kit's one-cell rule (.k-rb). The feed and the work sheet
// are both made of it, so two collections' rows cannot be set two ways.
// `attrs` is whatever the link needs beyond its href.
function listRow({ href, title, line, tags, kind, attrs = '' }) {
  return (
    `<li class="k-rb"><a href="${escapeHtml(href)}"${attrs}><b>${escapeHtml(title)}</b></a>` +
    `<span class="k-meta">${escapeHtml(line)}</span>${tagsMarkup(tags, kind)}</li>`
  )
}

// work: the hire-me prose up to the case-studies marker, then the live
// case-study list. The sheet dresses what the plain-text page states flat,
// in the kit's parts: the pillars render as two drawings with their
// words, the long "Not clear enough?" pitch folds into the kit's disclosure
// (.k-disc, its summary the outline button), the keyword line is a still
// list of screen-printed labels (.k-meta), and get-in-touch renders as the
// kit's outline buttons (.k-btn). The case-study list is ruled with the
// kit's one-cell rule (.k-rb) under each row.
export function buildWorkSheet(text, caseStudies, paths = {}) {
  const { body } = parseText(text)
  // Match the marker by its dashes, not a hardcoded dash count: the terminal
  // page's underline length must be free to change without silently breaking
  // this split (which would fold the case-study list into the hire-me prose).
  const head = body.split(/case studies\n-{2,}\n/)[0].replace(/\s+$/, '')
  const out = []
  for (const sec of splitSections(head)) {
    if (sec.title === 'what i do') {
      const blocks = sec.body.split(/\n\s*\n/)
      const moreIdx = blocks.findIndex((b) => b.trim().startsWith('Not clear enough?'))
      let more = ''
      if (moreIdx !== -1) {
        const rest = blocks
          .splice(moreIdx, 1)[0]
          .trim()
          .replace(/^Not clear enough\?\s*/, '')
        more = `<details class="more k-disc"><summary class="k-btn">Not clear enough?</summary><div class="k-body">${fmt(rest, paths)}</div></details>`
      }
      const rendered = blocks.map((b) => {
        const lines = b.split('\n')
        const items = lines.filter((l) => l.trim().startsWith('- ')).map((l) => l.trim().slice(2))
        const duo = items.length ? pillarDuo(items, paths) : null
        if (!duo) return fmt(b, paths)
        const lead = lines.filter((l) => !l.trim().startsWith('- ')).join('\n')
        return (lead.trim() ? fmt(lead, paths) + '\n' : '') + duo
      })
      out.push('<h2>' + escapeHtml(sec.title) + '</h2>', rendered.join('\n'))
      if (more) out.push(more)
    } else if (sec.title === 'keywords') {
      // one still list, no heading: the words say what they are, and they
      // are tags (the kit's, in the code face). A list read at rest reads; a
      // scrolling ribbon does not.
      const terms = sec.body
        .split('·')
        .map((t) => t.trim())
        .filter(Boolean)
      out.push(
        `<ul class="k-tags kwList" aria-label="keywords">` +
          terms.map((t) => `<li class="k-tag">${escapeHtml(t)}</li>`).join('') +
          '</ul>'
      )
    } else if (sec.title === 'get in touch') {
      // working CTAs: the address mails, the profiles link out
      const ctas = sec.body
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((ln) => {
          if (ln.includes('@') && !ln.startsWith('http'))
            return `<a class="cta k-btn" href="mailto:${escapeHtml(ln)}">${escapeHtml(ln)}</a>`
          if (ln.startsWith('http')) {
            const label = hostLabel(ln).split('.')[0] || ln
            return `<a class="cta k-btn" href="${escapeHtml(ln)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`
          }
          return `<p>${linkify(escapeHtml(ln), paths)}</p>`
        })
      out.push(
        '<h2>' + escapeHtml(sec.title) + '</h2>',
        `<div class="ctaRow">${ctas.join('')}</div>`
      )
    } else {
      out.push('<h2>' + escapeHtml(sec.title) + '</h2>', fmt(sec.body, paths))
    }
  }
  const lis = caseStudies
    .map((cs) =>
      listRow({
        href: paths[cs.slug] || `/work/${cs.slug}`,
        title: cs.title,
        line: cs.summary || '',
        tags: cs.tags,
        kind: kindOf(cs),
      })
    )
    .join('\n')
  return {
    slug: 'work',
    title: 'work',
    meta: 'index',
    body: out.join('\n') + '\n<h2>Case Studies</h2>\n<ul class="entryList">' + lis + '</ul>',
    docTitle: `work · ${SITE_NAME}`,
  }
}

// about: cut the terminal-only Pages table, and append the contact lines
// from site.config.js.
export function buildAboutSheet(text, paths = {}) {
  const { body } = parseText(text)
  const head = body.split(/\nPages\n-{2,}\n/)[0].replace(/\s+$/, '')
  const reach =
    '\n\nreach me\n--------\n' +
    [`email ${config.site.author.email}`, ...Object.values(config.site.social)].join(' · ')
  return {
    slug: 'about',
    title: 'about',
    meta: '',
    body: fmt(head + reach, paths),
    docTitle: `about · ${SITE_NAME}`,
  }
}

// A document (lib/docs.js): the same text template feeds the terminal page
// and this sheet. The "updated" line rides as the sheet meta.
export function buildDocSheet(slug, text, paths = {}) {
  const { body } = parseText(text)
  const m = body.match(/^(updated \d{4}-\d{2}-\d{2})\n+/)
  return {
    slug,
    title: slug,
    meta: m ? m[1] : '',
    body: fmt(m ? body.slice(m[0].length) : body, paths),
    docTitle: `${slug} · ${SITE_NAME}`,
  }
}

// feed: articles only (BIBLE.md: feed and RSS carry articles only;
// experiments live on the canvas as themselves). The feed aggregates: an
// external entry links straight to where it lives, and the one-line
// summary plus the host on the meta line announce the departure before
// the click. Newest first.
export function buildFeedSheet(entries) {
  const items = entries
    .map((e) => {
      const host = e.externalUrl ? hostLabel(e.externalUrl) : ''
      const href = e.externalUrl || `/feed/${e.slug}`
      // target only on external items: the canvas router leaves non-/ hrefs
      // alone, and a new tab keeps the canvas where the reader left it.
      const attrs = e.externalUrl ? ' target="_blank" rel="noopener"' : ''
      const extra = [e.summary || '', e.date || '', host].filter(Boolean).join(' · ')
      return listRow({ href, title: e.title, line: extra, tags: e.tags, kind: kindOf(e), attrs })
    })
    .join('\n')
  return {
    slug: 'feed',
    title: 'feed',
    meta: 'collection · rss at /feed.xml',
    body: '<ul class="entryList">' + items + '</ul>',
    docTitle: `feed · ${SITE_NAME}`,
  }
}

// The stylesheet chain every entry needs in the sheet: the base entry kit
// (highlight, entry, case-study), then the entry's own extras. Shared by
// /api/page and the SSR'd entry sheets so the two can never drift.
export function entryCssChain(entry) {
  // the kit draws a case study's foot (the dock); an experiment still wears
  // its own controls, some under their own k- names, so it is not
  // handed the kit until it is moved onto it
  return [
    '/css/highlight.css',
    '/css/code.css',
    '/css/entry.css',
    '/css/case-study.css',
    ...(isCaseStudy(entry) ? ['/primitives/kit/kit.css'] : []),
    ...(entry.extraCss || []),
  ]
}

// The module chain: every case study gets canvas/case-study.js, the pretext
// flow that hangs a narrow figure in its text where there is width,
// and canvas/code-refs.js, the copy key on every block and the prose-to-code
// mapping, the way every entry gets case-study.css. One
// layout, no entry names it.
export function entryJsModules(entry) {
  return [
    ...(isCaseStudy(entry) ? ['/canvas/case-study.js', '/canvas/code-refs.js'] : []),
    ...(entry.extraJsModule || []),
  ]
}

// THE PAGE BAR: a full page's one navigation, a strip of tabs at the
// top of the sheet the way a browser holds its pages, which the shell
// (canvas/home.njk) puts before the page's body so it is the sheet's full
// width and sticks to the top of the scroll. A tab a page of the ring, the
// close box on the lit one, and the way back to the top. `ring` is the
// collection the page walks, in order, and it is filtered to the page's own
// kind here so no list a route hands over can make a case study step into
// an experiment; app.js paintPageBar repaints the same markup
// (primitives/kit/kit-scroll.js) from the canvas's ring once it boots.
function pageBar(entry, ring) {
  const kind = kindOf(entry)
  const mine = (ring || []).filter((e) => kindOf(e) === kind && !e.hidden)
  const at = mine.findIndex((e) => e.slug === entry.slug)
  const close = backToFor(entry)
  // the strip always holds the page itself, a strip of one when the route
  // handed over no ring it is in
  const tabs = at < 0 ? [entry] : mine
  // the strip names its collection when there is one to name: case studies
  // are a pile; a root-mounted thing is just itself and its strip goes
  // unnamed rather than filed under a word for its kind
  return pageBarMarkup({
    label: isCaseStudy(entry) ? 'Case Studies' : '',
    close,
    ring: tabs.map((e) => ({ title: e.title, path: pathFor(e) })),
    at: Math.max(0, at),
  })
}

// An entry (case study, article, experiment) as a canvas sheet: the same
// markup mountEmbed builds client-side, plus the asset lists the shell
// emits as real link/script tags.
export function buildEntrySheet(entry, assetUrl, ring = null) {
  const full = isFullPage(entry)
  // The way back names its collection; root-mounted kinds live on the canvas,
  // so theirs names the canvas itself. It is never omitted: a watch-sized
  // touch screen would have no reachable close at all. A full
  // page's way back is its bar's close box instead (one way back per page).
  const backTo = backToFor(entry)
  const back = full
    ? ''
    : `\n<p class="backlink"><a href="${backTo.path}">← ${backTo.label}</a></p>`
  return {
    sheet: {
      slug: entry.slug,
      title: entry.title,
      // a FULL page on a direct load exactly when the canvas opens it as one
      // (isFullPage): the standalone URL and the page the canvas opens are
      // one page, not two. Only a case study sets its title in the canvas's
      // own face; an experiment keeps the plain h1 the canvas paints.
      full,
      // an entry is the ITEM layer, above the canvas and its collections:
      // the bar is not drawn over it
      item: true,
      pixel: isCaseStudy(entry),
      meta: metaLine(entry),
      // the tags inside the meta block, as markup: the one row the canvas
      // draws for the same page (primitives/kit/tags.js). An experiment is the thing it
      // is, with no row of words over it.
      tagRow: isRootMounted(entry) ? '' : tagsMarkup(entry.tags, kindOf(entry)),
      // a page that is READ (a case study; the articles and reports after
      // it) wears the reader's settings under its meta line, the same
      // string the canvas paints (js/page-reader.js), and its shell is
      // #modal.reading, the one place the inverted ground may be taken
      reading: isCaseStudy(entry),
      body: `${isCaseStudy(entry) ? readerMarkup() : ''}<div class="exp-native"><article class="prose">${entry.html}</article></div>${back}`,
      // the page bar, before the body in the sheet (a full page only)
      bar: full ? pageBar(entry, ring) : '',
      docTitle: isCaseStudy(entry)
        ? `${entry.title} · work · ${SITE_NAME}`
        : `${entry.title} · ${SITE_NAME}`,
    },
    assets: {
      css: entryCssChain(entry).map(assetUrl),
      js: (entry.extraJs || []).map(assetUrl),
      modules: entryJsModules(entry).map(assetUrl),
      preload: (entry.extraPreloadFetch || []).map(assetUrl),
    },
  }
}

// Every slug the site serves, mapped to the real path the router uses.
export function buildLocalPaths(entries) {
  const paths = { work: '/work', feed: '/feed', about: '/about' }
  for (const e of entries) {
    // NOTE: the door paths are reserved; an entry slug can never clobber them.
    if (e.hidden || paths[e.slug]) continue
    paths[e.slug] = pathFor(e)
  }
  return paths
}
