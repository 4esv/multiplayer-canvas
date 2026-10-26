// One content collection backed by one directory of markdown:
//   /feed/<slug>  every article (prose; the writing collection)
//   /<slug>       web experiments and photo sets, root-mounted
// The combined index lives on the home page; this file owns the detail pages
// and /feed.xml (articles only). Case studies (type: case-study) live in the
// same dir but surface under /work instead, and are excluded here.
// Entries with `external_url` frontmatter are aggregated, not hosted: they
// appear on the /feed index and in the RSS linking off-site; /feed/<slug>
// 302s to where they live (a stable local handle, repointable in
// frontmatter); no OG card and no sitemap line here.

import { createHash } from 'crypto'

import { buildSectionSheet, canvasBoot } from './canvas.js'
import config from '../config.js'
import { entryCssChain, entryJsModules, buildEntrySheet } from '../lib/canvas-sheets.js'
import { loadMarkdownDir, normalizeDate, siblingNav } from '../lib/content.js'
import { isCaseStudy, isPhotoSet, isRootMounted, isWriting, kindOf } from '../lib/entry-kind.js'
import { PERSON, articleNode, jsonld } from '../lib/identity.js'
import { imgUrl } from '../lib/img-version.js'
import { photoSetHtml, readPhotoSet } from '../lib/photo-set.js'
import { renderPage } from '../lib/render.js'
import { fail } from '../lib/api-errors.js'
import { assetUrl } from '../lib/template-helpers.js'
import { escapeXml } from '../lib/xml.js'

const SITE_NAME = config.site.name

// An entry with no summary falls back to the site's own description, the
// one the home page carries, rather than a line that files it under a kind
const SITE_DESCRIPTION = `Site of ${PERSON.name}. ${PERSON.description}`

const SITE_URL = config.site.url

// A photo set brings its own stylesheet and script, so the frontmatter
// never has to name them: `type: photos` is the whole declaration. The
// script is a module (it imports the kit's walker, primitives/kit/kit-scroll.js).
const PHOTOSET_CSS = '/css/photoset.css'
const PHOTOSET_JS = '/js/photoset.js'

const mapEntry = (base, data) => ({
  ...base,
  tags: data.tags || [],
  hidden: data.hidden === true,
  // Interactive-only entries (3D/canvas/audio): no readable prose outside a
  // modern browser, so the terminal and retro paths say so instead of dumping
  // orphaned button labels. Also the card-kind discriminator on the home and
  // /feed index: web_only entries get the visual (thumbnail) card, articles get
  // the typographic card.
  webOnly: data.web_only === true,
  // Aggregated entries published elsewhere (a notebook, a dataset):
  // frontmatter only, no body. They ride the /feed index and the RSS
  // with their link pointing off-site, and get no local detail page.
  externalUrl: data.external_url || '',
  backToTop: data.back_to_top === true,
  // When the FILE last changed, as opposed to `date`, which is when the work
  // happened. Only the sitemap reads it: `date` is a fixed historical event
  // (a 2023 fire-department rescue stays 2023 forever), so using it as
  // lastmod told crawlers the case studies had not been touched in years
  // while their bodies were edited days ago. test/sitemap.test.js ties this
  // to git so it cannot silently rot.
  updated: normalizeDate(data.updated) || '',
  type: data.type || '',
  year: data.year || (base.date ? base.date.slice(0, 4) : ''),
  tag: data.tag || '',
  stack: data.stack || '',
  // Case-study head matter: list of { name, url } technology links.
  used: data.used || [],
  impact: data.impact || '',
  repo: data.repo || '',
  extraCss: data.extra_css || [],
  extraJs: data.extra_js || [],
  // Module scripts can't sit in the markdown body: asset() has to resolve
  // them to their hashed bundles, and Nunjucks never sees body HTML.
  extraJsModule: data.extra_js_module || [],
  // Large same-origin payloads a page fetches at runtime (a model's mesh):
  // preloading lets them download in parallel with the module that asks
  // for them instead of after it.
  extraPreloadFetch: data.extra_preload_fetch || [],
})

const loadEntries = loadMarkdownDir(config.content.dir, (base, data) => {
  const entry = mapEntry(base, data)
  if (!isPhotoSet(entry)) return entry
  // The pictures ARE the body: the folder is read here, once per load, and
  // the carousel is rendered ahead of whatever prose the entry carries. Same
  // shape as every other entry from here on, so the sheet builders, the API
  // payload and the terminal path need to know nothing about photo sets.
  const photos = readPhotoSet(config.content.imageDir, entry.slug, {
    ...entry,
    photos: data.photos,
  })
  return {
    ...entry,
    photos,
    html: photoSetHtml({ ...entry, photos }) + entry.html,
    extraCss: [...entry.extraCss, PHOTOSET_CSS],
    extraJsModule: [...entry.extraJsModule, PHOTOSET_JS],
  }
})

export const loadFeedEntries = loadEntries

// The unified /feed collection: everything that isn't a case study (prose
// articles AND root-mounted entries). The combined index lives on the home
// page; this slice feeds both that index and the /feed/:slug detail route.
export const loadWwwEntries = async () =>
  (await loadEntries()).filter((e) => !e.hidden && !isCaseStudy(e))

export async function registerFeedRoutes(fastify) {
  // /feed: the combined writing + web index as a full page. Same grid the home
  // page shows below its hero, lifted to its own URL so the collection is
  // shareable and canonical. Newest first.
  fastify.get('/feed', async (request, reply) => {
    const meta = {
      title: `feed · ${SITE_NAME}`,
      description: `Writing by ${PERSON.name}.`,
      canonical: `${SITE_URL}/feed`,
      ogImage: imgUrl(`${SITE_URL}/img/og/feed.png`),
    }
    if (request.grid?.isTerminal || request.grid?.isRetro) {
      // The feed is the writing aggregator (local articles + entries published
      // elsewhere). Experiments are not feed items: they live at their root
      // URLs and on the canvas as themselves.
      const entries = (await loadWwwEntries()).filter(isWriting)
      const sorted = [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      return renderPage(fastify, request, reply, 'feed/index.njk', {
        site: { name: 'feed', tagline: `Writing by ${PERSON.name}.` },
        entries: sorted,
        meta,
      })
    }
    // Modern browsers get the canvas with the feed sheet already open
    // (articles only; experiments live on the canvas as themselves and stay
    // crawlable via the sitemap and their own /feed/<slug> documents).
    return renderPage(fastify, request, reply, 'canvas/home.njk', {
      boot: await canvasBoot(fastify),
      sheet: await buildSectionSheet(fastify, 'feed'),
      meta,
    })
  })

  // /feed/:slug: detail page for every article and web experiment (the 2026-07
  // rename of /www, itself the merge of the old /feed + /web; clean break, no
  // redirect). Case studies live under /work, so a case-study slug 404s here.
  fastify.get('/feed/:slug', async (request, reply) => {
    const entries = await loadEntries()
    const entry = entries.find((e) => e.slug === request.params.slug)
    // Case studies live under /work, root-mounted kinds at /<slug>: all 404 here.
    if (!entry || entry.hidden || !isWriting(entry)) {
      reply.callNotFound()
      return reply
    }
    // An external entry's /feed/<slug> is its permanent local handle: old
    // inbound links keep working, and the piece can move hosts later by
    // repointing external_url. 302, not 301, so no cache fossilizes the
    // current hop. The tile and the index already say what it is (the
    // one-line summary) and where it lives (host label + arrow), so there
    // is no interstitial page: the link is direct.
    if (entry.externalUrl) {
      return reply.redirect(entry.externalUrl, 302)
    }
    const canonical = `${SITE_URL}/feed/${entry.slug}`
    const ogImage = imgUrl(`${SITE_URL}/img/og/${entry.slug}.png`)
    const meta = {
      title: `${entry.title} · ${SITE_NAME}`,
      description: entry.summary || `An entry by ${PERSON.name}.`,
      canonical,
      ogType: 'article',
      ogImage,
      publishedTime: entry.date || undefined,
      jsonld: jsonld(articleNode(entry, canonical, ogImage)),
    }
    if (request.grid?.isTerminal || request.grid?.isRetro) {
      // The prev/next pool is the set of entries this route actually serves:
      // experiments (root-mounted) and external entries (off-site) would make
      // dead /feed/<slug> links here.
      const visible = entries.filter((e) => !e.hidden && isWriting(e) && !e.externalUrl)
      const { prev, next } = siblingNav(visible, entry.slug)
      return renderPage(fastify, request, reply, 'feed/entry.njk', {
        site: { name: 'feed', tagline: entry.summary || SITE_DESCRIPTION },
        entry,
        html: entry.html,
        prev,
        next,
        backToTop: entry.backToTop,
        basePath: '/feed',
        canonicalBase: '/feed',
        meta,
      })
    }
    // Modern browsers get the canvas with the entry sheet already open: the
    // real markup SSR'd, the entry's css as real links, its scripts as real
    // tags (parser order keeps a multi-script entry in the order it declared).
    const { sheet, assets } = buildEntrySheet(entry, assetUrl)
    return renderPage(fastify, request, reply, 'canvas/home.njk', {
      boot: await canvasBoot(fastify),
      sheet,
      sheetAssets: assets,
      meta,
    })
  })

  // Root-mounted kinds are canvas content and live at the root: web
  // experiments (/web-instruments) and photo sets. One explicit
  // route per slug, fixed at boot (a catch-all /:slug would swallow the root
  // txt files and favicons); a new one ships with its deploy. The body still
  // reloads per request, so dev edits show without a restart.
  const rootMounted = (await loadEntries()).filter((e) => isRootMounted(e) && !e.hidden)
  for (const exp of rootMounted) {
    try {
      fastify.get(`/${exp.slug}`, async (request, reply) => {
        const entry = (await loadEntries()).find(
          (e) => e.slug === exp.slug && isRootMounted(e) && !e.hidden
        )
        if (!entry) {
          reply.callNotFound()
          return reply
        }
        const meta = {
          title: `${entry.title} · ${SITE_NAME}`,
          description: entry.summary || SITE_DESCRIPTION,
          canonical: `${SITE_URL}/${entry.slug}`,
          ogType: 'article',
          ogImage: imgUrl(`${SITE_URL}/img/og/${entry.slug}.png`),
          publishedTime: entry.date || undefined,
        }
        if (request.grid?.isTerminal || request.grid?.isRetro) {
          // Standalone at the root: no sibling nav, links resolve rootward.
          return renderPage(fastify, request, reply, 'feed/entry.njk', {
            site: { name: SITE_NAME, tagline: entry.summary || SITE_DESCRIPTION },
            entry,
            html: entry.html,
            prev: null,
            next: null,
            backToTop: entry.backToTop,
            basePath: '',
            canonicalBase: '',
            meta,
          })
        }
        // the page bar walks the root-mounted entries of the page's own
        // kind, in the list's order; buildEntrySheet keeps the kind
        const { sheet, assets } = buildEntrySheet(
          entry,
          assetUrl,
          (await loadEntries()).filter((e) => isRootMounted(e) && !e.hidden)
        )
        return renderPage(fastify, request, reply, 'canvas/home.njk', {
          boot: await canvasBoot(fastify),
          sheet,
          sheetAssets: assets,
          meta,
        })
      })
    } catch (err) {
      // WARNING: a root-mounted slug that collides with a real route (work,
      // life, login...) must not take the server down; the warn names it.
      console.warn(`feed: could not mount /${exp.slug} at the root: ${err.message}`)
    }
  }

  // /api/page/:slug: the entry as data, for the canvas. The modal IS the
  // page: the canvas fetches this, injects the real markup (figures, SVGs,
  // photos and all) into the sheet, and loads the entry's css/js natively.
  // Case studies are served too: same content that is public at /work/<slug>.
  // Asset paths resolve through the manifest so prod serves hashed URLs.
  fastify.get('/api/page/:slug', async (request, reply) => {
    const entries = await loadEntries()
    const entry = entries.find((e) => e.slug === request.params.slug)
    if (!entry || entry.hidden) {
      return fail(reply, 404, 'notfound')
    }
    // The stylesheet chain entry.njk always loads, then the entry's own.
    const css = entryCssChain(entry)
    reply.header('cache-control', 'no-cache')
    return {
      slug: entry.slug,
      title: entry.title,
      type: kindOf(entry),
      date: entry.date || null,
      summary: entry.summary || '',
      tags: entry.tags || [],
      externalUrl: entry.externalUrl || null,
      html: entry.html,
      css: css.map(assetUrl),
      js: (entry.extraJs || []).map(assetUrl),
      modules: entryJsModules(entry).map(assetUrl),
    }
  })

  // /feed.xml: RSS 2.0 over the writing slice (same `belongs` as /feed:
  // no case studies, no web-only experiments, no repos). An external
  // entry's item still links straight to where it was published (readers
  // want the piece, not a hop); its local /feed/<slug> interstitial is for
  // the site's own surfaces. Guids never churn.
  fastify.get('/feed.xml', async (request, reply) => {
    const entries = await loadEntries()
    const sorted = entries
      .filter((e) => !e.hidden && isWriting(e))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    // RSS wants an author as "email (name)"; the name follows site config so
    // it never drifts from the identity line.
    const author = escapeXml(`${PERSON.email.replace(/^mailto:/, '')} (${PERSON.name})`)
    const items = sorted
      .map((e) => {
        const url = e.externalUrl || `${SITE_URL}/feed/${e.slug}`
        const pubDate = e.date ? new Date(`${e.date}T00:00:00Z`).toUTCString() : ''
        return `    <item>
      <title>${escapeXml(e.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>${pubDate ? `\n      <pubDate>${pubDate}</pubDate>` : ''}
      <author>${author}</author>
      <description>${escapeXml(e.summary || '')}</description>
    </item>`
      })
      .join('\n')

    // lastBuildDate is the newest entry's date (the channel changes when
    // content does), falling back to now when nothing is dated.
    const newest = sorted.find((e) => e.date)?.date
    const lastBuildDate = newest
      ? new Date(`${newest}T00:00:00Z`).toUTCString()
      : new Date().toUTCString()

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)} / feed</title>
    <link>${SITE_URL}/</link>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${items}
  </channel>
</rss>
`

    reply.header('content-type', 'application/rss+xml; charset=utf-8')
    // Feed readers poll; an explicit hour beats whatever the proxy defaults to.
    reply.header('cache-control', 'public, max-age=3600')
    // Conditional GET. A reader polling hourly forever re-downloaded the whole
    // feed every time, because nothing here ever offered it a way to ask
    // "changed?". The ETag is over the rendered bytes, so it moves when an
    // entry does and only then; Last-Modified carries the same fact in the
    // form older readers send back.
    const etag = `"${createHash('sha256').update(xml).digest('base64url').slice(0, 27)}"`
    reply.header('etag', etag)
    reply.header('last-modified', lastBuildDate)
    const inm = request.headers['if-none-match']
    const ims = request.headers['if-modified-since']
    if (inm === etag || (!inm && ims && new Date(ims) >= new Date(lastBuildDate))) {
      // 304 must carry the validators and no body, or the reader caches nothing
      // and asks again with the same question next hour.
      return reply.code(304).send()
    }
    return xml
  })
}
