// /sitemap.xml: generated at request time from the feed content tree.
// Static routes are listed here; dynamic entries (/feed/<slug>, /work/<slug>,
// root-mounted web experiments)
// come from loadFeedEntries, the same loader those routes use.

import { loadFeedEntries } from './feed.js'
import { isCaseStudy, pathFor } from '../lib/entry-kind.js'
import { escapeXml } from '../lib/xml.js'

import config from '../config.js'

const SITE_URL = config.site.url

// The site's static routes, one place. The sitemap emits them; page-furniture
// derives its coverage from them so a new static route arrives guarded without
// a second hand-edited list. (/login is noindex, so it is not here; the
// furniture test adds it as an explicit extra.)
// seam: test/crawlability.test.js, test/jsonld.test.js, test/page-furniture.test.js, test/retro.test.js, test/sitemap.test.js
export const STATIC_ROUTES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/work', changefreq: 'monthly', priority: '0.8' },
  { path: '/case-studies', changefreq: 'monthly', priority: '0.7' },
  { path: '/feed', changefreq: 'weekly', priority: '0.7' },
  { path: '/about', changefreq: 'monthly', priority: '0.7' },
  { path: '/credits', changefreq: 'monthly', priority: '0.3' },
]

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return `  <url>
    <loc>${escapeXml(loc)}</loc>${lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : ''}${changefreq ? `\n    <changefreq>${escapeXml(changefreq)}</changefreq>` : ''}${priority ? `\n    <priority>${escapeXml(priority)}</priority>` : ''}
  </url>`
}

export async function registerSitemapRoute(fastify) {
  fastify.get('/sitemap.xml', async (_request, reply) => {
    const entries = await loadFeedEntries()
    // External entries live on someone else's sitemap; only locally hosted
    // pages belong here.
    const visible = entries.filter((e) => !e.hidden && !e.externalUrl)

    // What a page's lastmod actually means: when the FILE changed, not when
    // the work happened. `date` is a fixed historical event, so it can never
    // move again once published, and would advertise an edited page as
    // untouched since its date.
    const lastmodOf = (e) => e.updated || e.date || undefined

    // Static-route lastmod tracks the site's freshness (the newest content
    // change), not process boot: a redeploy that ships no content must not
    // bump every page's lastmod and re-poke crawlers. Computed over EVERY
    // non-hidden entry, including external ones: they have no <loc> of their
    // own, but / and /feed both list them, so publishing one does change
    // those pages. Falls back to today only when there is no dated content.
    const newest = entries
      .filter((e) => !e.hidden)
      .map(lastmodOf)
      .filter(Boolean)
      .sort()
      .at(-1)
    const staticLastmod = newest || new Date().toISOString().slice(0, 10)

    const urls = [
      ...STATIC_ROUTES.map((r) =>
        urlEntry({
          loc: `${SITE_URL}${r.path}`,
          lastmod: staticLastmod,
          changefreq: r.changefreq,
          priority: r.priority,
        })
      ),
      ...visible.map((e) =>
        urlEntry({
          loc: `${SITE_URL}${pathFor(e)}`,
          lastmod: lastmodOf(e),
          changefreq: 'monthly',
          priority: isCaseStudy(e) ? '0.7' : '0.6',
        })
      ),
    ].join('\n')

    reply.header('content-type', 'application/xml; charset=utf-8')
    // Generated per request; an hour of shared cache is plenty fresh for a
    // crawler and keeps the render off the hot path.
    reply.header('cache-control', 'public, max-age=3600')
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
  })
}
