// The Open Graph cards, as markup (scripts/og/render.mjs draws them).
//
// A card is a page of the site at billboard size, built out of the site's own
// parts rather than drawn beside them: the tokens, the kit's tag, the pixel
// title the case-study page sets, the marks the home screen holds, and the
// figure the page itself carries. So a card cannot drift from the site it
// announces, and a content edit is a rerun, not a redraw.
//
//   cardSpecs({ entries, stills, counts })   what cards there are, one per
//                                            page, read from the content
//   cardHtml(spec)                           one card's document
//
// Pure: no clock, no network, no files. The renderer owns those.
import { PHRASES } from '../../src/static/canvas/hero-cycle.js'
import site from '../../site.config.js'
import { ICON_SVG, MARK_A } from '../../src/static/canvas/marks.js'
import { pixelTitle } from 'multiplayer-canvas/pixel-type'
import { tagsMarkup } from 'multiplayer-canvas/kit/tags'

export const CARD = Object.freeze({ w: 1200, h: 630 })

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )

// ---- the specs -----------------------------------------------------------

// the ways out of the home screen, in the order it lays them
const BELT = ['rss', 'mail']

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// The doors: every page that is not an entry. Each is a collection or a door
// and has a card of its own (test/og.test.js holds one per page). A door
// that is also a way out of the home screen stands on that mark, grown; the
// work is shown by its own figures.
function doors({ entries }) {
  // in the order the pile and its tabs hold them
  const caseStudies = entries
    .filter((e) => e.type === 'case-study' && !e.hidden)
    .sort((a, b) => a.slug.localeCompare(b.slug))
  return [
    { slug: 'default', kind: 'home', title: PHRASES[0] },
    {
      slug: 'about',
      kind: 'mark',
      title: 'About',
      line: "Who I am, and what's where.",
      mark: MARK_A,
    },
    {
      slug: 'work',
      kind: 'gallery',
      title: 'Work',
      line: 'The case studies.',
      items: caseStudies,
    },
    {
      slug: 'case-studies',
      kind: 'gallery',
      title: 'Case studies',
      line: `${plural(caseStudies.length, 'case study', 'case studies')}, one pile.`,
      items: caseStudies,
    },
    {
      slug: 'feed',
      kind: 'mark',
      title: 'Feed',
      line: 'The writing.',
      mark: ICON_SVG.rss,
    },
    {
      slug: 'credits',
      kind: 'mark',
      title: 'Credits',
      line: 'The code, type and data this site stands on.',
      mark: MARK_A,
    },
  ]
}

// The first picture a page carries, at `px` px to a figure unit (the figures
// are drawn on half a cell a unit, so four is twice their size and a unit is
// a whole cell). A photograph that stands before the first drawing leads;
// otherwise the narrow drawing, since the wide one was drawn for a desk. At
// four, the narrow drawing (152 units) is 608px, the width of the window a
// card gives it. `photos: false` leaves a photograph out, for a place too small
// to cut a picture from. `null` when the page draws nothing.
// seam: test/og-cards.test.js
export function leadFigure(html, px = 4, { photos = true } = {}) {
  const figs = [...html.matchAll(/<svg\b[^>]*class="cellfig[^"]*"[^>]*>[\s\S]*?<\/svg>/g)].map(
    (m) => {
      const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(m[0])
      return { svg: m[0], units: Number(w), w: Number(w) * px, h: Number(h) * px, at: m.index }
    }
  )
  const img = /<img\b[^>]*src="([^"]+)"[^>]*width="(\d+)"[^>]*height="(\d+)"[^>]*>/.exec(html)
  if (photos && img && (!figs.length || img.index < figs[0].at))
    return {
      img: img[1].replace(/\?.*$/, ''),
      w: (Number(img[2]) * px) / 2,
      h: (Number(img[3]) * px) / 2,
    }
  const fig = figs.find((f) => f.units === 152) ?? figs[0]
  return fig ? { svg: fig.svg, w: fig.w, h: fig.h } : null
}

// `stills` is the canvas's baked picture of each experiment, by slug:
// { src, w, h }, read off the tree by the renderer.
export function cardSpecs({ entries, stills = {} }) {
  const specs = doors({ entries })
  for (const e of entries) {
    if (e.hidden || e.externalUrl) continue
    if (e.type === 'case-study')
      specs.push({
        slug: e.slug,
        kind: 'page',
        title: e.title,
        date: e.date,
        tags: e.tags,
        impact: e.impact,
        used: (e.used || []).map((u) => u.name),
        figure: leadFigure(e.html),
      })
    else if (stills[e.slug])
      specs.push({
        slug: e.slug,
        kind: 'thing',
        title: e.title,
        line: e.summary,
        still: stills[e.slug],
      })
    // an article: its title and its summary, standing on the feed's mark
    else if (!e.webOnly && e.type !== 'photos')
      specs.push({
        slug: e.slug,
        kind: 'mark',
        title: e.title,
        line: e.summary,
        mark: ICON_SVG.rss,
      })
  }
  return specs
}

// ---- the markup ----------------------------------------------------------

const foot = (cls = '') =>
  `<div class="og-foot${cls}"><span class="og-brand"><span class="og-logo">${MARK_A}</span>` +
  `<span class="og-word og-smear">${esc(new URL(site.url).host)}</span></span><span class="og-who og-smear">${esc(site.author.name)}</span></div>`

const frame = (body) => `<div class="og-sheet"><div class="og-body">${body}</div>${foot()}</div>`

const sized = (svg, w, h) =>
  svg.replace(/\swidth="\d+"\s+height="\d+"/, ` width="${w}" height="${h}"`)

const picture = (f) =>
  f.svg ? sized(f.svg, f.w, f.h) : `<img src="${esc(f.img)}" width="${f.w}" height="${f.h}" alt="">`

function pageCard(s) {
  const f = s.figure
  const text = (lede) =>
    `<div class="og-text"><div class="og-meta og-smear">Case Study · ${esc(String(s.date).slice(0, 4))}</div>` +
    `${pixelTitle(s.title, 'display', { tag: 'h1' })}${tagsMarkup(s.tags, 'case-study')}${lede}</div>`
  const lede = `<p class="og-lede og-smear">${esc(s.impact)}</p>`
  if (!f)
    // a page that draws nothing is shown by what it says and what it was made of
    return frame(
      text('') +
        `<div class="og-made">${lede}<div class="og-meta og-smear">made of</div>${tagsMarkup(s.used)}</div>`
    )
  return frame(text(lede) + `<div class="og-fig">${picture(f)}</div>`)
}

// A thing on the ground: its baked picture, cut out, at twice its size, or a
// mark at eight px a unit, standing on a piece of the world's own ground.
function thingCard(s) {
  const t = s.still
  const art = t
    ? `<img src="${esc(t.src)}" width="${t.w * 2}" height="${t.h * 2}" alt="">`
    : s.mark.replace('<svg ', '<svg width="192" height="192" ')
  return frame(
    `<div class="og-text">${pixelTitle(s.title, 'display', { tag: 'h1' })}` +
      `<p class="og-lede og-smear">${esc(s.line)}</p></div><div class="og-fig">${art}</div>`
  )
}

// The work, shown by its figures: each case study's own picture, at the size
// the page draws it, in a cell of the sheet.
function galleryCard(s) {
  const cells = s.items
    .map((e) => {
      const f = leadFigure(e.html, 2, { photos: false })
      // a page that draws nothing stands as its title, in the face its card sets
      return `<div class="og-cell">${f ? picture(f) : pixelTitle(e.title, 'display', { tag: 'h3' })}</div>`
    })
    .join('')
  return frame(
    `<div class="og-text">${pixelTitle(s.title, 'display', { tag: 'h1' })}` +
      `<p class="og-lede og-smear">${esc(s.line)}</p></div><div class="og-cells">${cells}</div>`
  )
}

// The home screen: the statement on the ground, and the ways out under it.
function homeCard(s) {
  return (
    `<div class="og-hero">${pixelTitle(s.title, 'display', { tag: 'h1' })}` +
    `<div class="og-belt">${BELT.map((k) => `<span class="og-glyph">${ICON_SVG[k]}</span>`).join('')}</div></div>` +
    foot(' og-foot-bare')
  )
}

const LAYOUTS = {
  page: pageCard,
  thing: thingCard,
  mark: thingCard,
  gallery: galleryCard,
  home: homeCard,
}

// The lede takes what room the title and the tags leave, in whole lines of its
// own leading and an ellipsis for the rest; none when there is not room for
// two lines, since a line cut off mid-sentence says nothing.
const FIT = `(() => {
  const lede = document.querySelector('.og-text .og-lede')
  if (!lede) return
  const lines = Math.floor(lede.clientHeight / 48)
  if (lines < 2) return lede.remove()
  lede.style.cssText =
    'flex:none;height:' + lines * 48 + 'px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:' + lines
})()`

/** One card's document, linked to the site's own stylesheets. */
export function cardHtml(spec, { css = '' } = {}) {
  const layout = LAYOUTS[spec.kind]
  if (!layout) throw new Error(`og: no layout for ${spec.kind} (${spec.slug})`)
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(spec.slug)}</title>` +
    `<link rel="stylesheet" href="/primitives/kit/canvas-tokens.css">` +
    `<link rel="stylesheet" href="/css/ptitle.css">` +
    `<link rel="stylesheet" href="/primitives/kit/kit.css">` +
    `<link rel="stylesheet" href="/css/case-study.css">` +
    `<link rel="stylesheet" href="/css/canvas-home.css">` +
    `<style>${css}</style></head>` +
    `<body class="og og-${spec.kind}">${layout(spec)}<script>${FIT}</script></body></html>`
  )
}
