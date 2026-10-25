// / : the home page. Modern browsers get the V2 infinite canvas
// (templates/canvas/home.njk, promoted from sandbox/canvas-lab; the design
// contract is BIBLE.md). Terminal and retro clients keep the plain-text and
// HTML 3.2 variants in pages/home.njk, which still carry the combined /feed
// index plus the live last-played / activity / weather lines.

import { loadFeedEntries, loadWwwEntries } from './feed.js'
import { canvasBoot } from './canvas.js'

import { isCaseStudy, pathFor } from '../lib/entry-kind.js'
import { PERSON, PROFILES, jsonld, personNode, websiteNode } from '../lib/identity.js'
import { renderPage } from '../lib/render.js'
import { TILES } from '../static/canvas/layout.js'

import config from '../config.js'
const SITE_URL = config.site.url
const SITE_NAME = config.site.name

const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '')

const href = (e) => e.externalUrl || pathFor(e)

// The home document's crawlable body. `/` is the only canvas route with no
// SSR'd sheet, so before this it shipped one h1 and three nav links: every
// crawler that does not run JS (GPTBot, ClaudeBot, PerplexityBot, and Google
// before its render pass) saw eighteen words on the page an assistant fetches
// first. /work, /feed and /about were never affected - they SSR their sheet.
//
// This is the same index the canvas paints as tiles and the same one the
// terminal variant prints, so it is a fallback, not a second story: it lives
// in #prelude, which is display:none while JS is on and which app.js removes
// once the canvas has painted. No-JS readers see it; nobody is served text
// the canvas does not also show.
async function homeIndex() {
  const [all, www] = await Promise.all([loadFeedEntries(), loadWwwEntries()])
  return {
    caseStudies: all
      .filter((e) => isCaseStudy(e) && !e.hidden)
      .sort(byNewest)
      .map((e) => ({ title: e.title, summary: e.summary || '', href: href(e) })),
    entries: [...www].sort(byNewest).map((e) => ({
      title: e.title,
      summary: e.summary || '',
      href: href(e),
      external: Boolean(e.externalUrl),
    })),
  }
}

export async function registerHomeRoutes(fastify) {
  fastify.get('/', async (request, reply) => {
    if (request.grid?.isTerminal || request.grid?.isRetro) {
      const entries = await loadWwwEntries()
      const sorted = [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      return renderPage(fastify, request, reply, 'pages/home.njk', {
        withPageData: true,
        entries: sorted,
        // the piles and the ring as the canvas has them: layout.js TILES is
        // the roster of stacks and identity.js the roster of profiles, so a
        // terminal sees every door the ground has and nothing it does not
        stacks: TILES.filter((t) => t.type === 'stack').map((t) => ({
          label: t.label,
          route: t.route,
        })),
        profiles: PROFILES,
      })
    }
    // The canvas shell reads the same meta-head partial as base.njk; these
    // are the values the template used to hardcode. og:title now follows the
    // page title (the partial keeps them from drifting apart).
    return renderPage(fastify, request, reply, 'canvas/home.njk', {
      // The background-refreshed canvas data (snapshot until the first
      // refresh lands) plus the routed-pages index; never blocks on an upstream.
      boot: await canvasBoot(fastify),
      index: await homeIndex(),
      meta: {
        title: SITE_NAME,
        description: `Site of ${PERSON.name}. ${PERSON.description}`,
        canonical: `${SITE_URL}/`,
        // Who owns the site, machine-readable: the Person (with the sameAs
        // roster) and the WebSite it publishes.
        jsonld: jsonld(personNode(), websiteNode()),
      },
    })
  })
}
