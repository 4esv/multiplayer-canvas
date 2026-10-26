// /work: the WORK section, and the canonical home for the case studies.
//
//   GET /work            the canvas landing on the work zone (what i do),
//                        which stands beside the case-studies stack; the
//                        hire-me text for curl
//   GET /case-studies    the canvas with the case-studies stack fanned out;
//                        the list for curl
//   GET /work/<slug>     a case study, SSRd open over its fan
//
// Case-study markdown still lives in content/feed/ (tagged `type: case-study`)
// but is surfaced and rendered under /work/<slug>; the /feed collection
// excludes them.

import { loadFeedEntries } from './feed.js'
import { canvasBoot } from './canvas.js'
import { buildEntrySheet } from '../lib/canvas-sheets.js'
import { siblingNav } from '../lib/content.js'
import { isCaseStudy } from '../lib/entry-kind.js'
import { articleNode, jsonld } from '../lib/identity.js'
import { imgUrl } from '../lib/img-version.js'
import { renderPage } from '../lib/render.js'
import { assetUrl } from '../lib/template-helpers.js'

import config from '../config.js'
const SITE_URL = config.site.url
const SITE_NAME = config.site.name

const loadCaseStudies = async () => {
  const entries = await loadFeedEntries()
  return entries.filter((e) => isCaseStudy(e) && !e.hidden)
}

export async function registerWorkRoutes(fastify) {
  fastify.get('/work', async (request, reply) => {
    const meta = {
      title: `work · ${SITE_NAME}`,
      description: `Case studies by ${config.site.author.name}.`,
      canonical: `${SITE_URL}/work`,
      ogImage: imgUrl(`${SITE_URL}/img/og/work.png`),
    }
    if (request.grid?.isTerminal || request.grid?.isRetro) {
      const caseStudies = await loadCaseStudies()
      return renderPage(fastify, request, reply, 'work/index.njk', {
        site: { name: 'work', tagline: 'Case studies and contract work.' },
        caseStudies,
        meta,
      })
    }
    // Modern browsers get the canvas with the studies FANNED.
    // /work lands the camera on the pile, not on a zone beside it: a path
    // landing on a place that does not exist parks the visitor on empty
    // ground with no way to tell that anything went wrong. The path means the
    // work, and the work is the pile.
    return renderPage(fastify, request, reply, 'canvas/home.njk', {
      boot: { ...(await canvasBoot(fastify)), fan: 'work' },
      meta,
    })
  })

  fastify.get('/case-studies', async (request, reply) => {
    const meta = {
      title: `Case Studies · ${SITE_NAME}`,
      description: `Case studies by ${config.site.author.name}, one pile on the canvas.`,
      canonical: `${SITE_URL}/case-studies`,
      ogImage: imgUrl(`${SITE_URL}/img/og/case-studies.png`),
    }
    if (request.grid?.isTerminal || request.grid?.isRetro) {
      // curl gets what a fan IS once the ground is taken away: a title, a
      // count and the links, the same list the other stacks print
      const caseStudies = await loadCaseStudies()
      return renderPage(fastify, request, reply, 'stacks/index.njk', {
        site: { name: 'Case Studies', tagline: 'One pile.' },
        stack: {
          id: 'case-studies',
          title: 'Case Studies',
          items: caseStudies.map((e) => ({
            title: e.title,
            url: `${SITE_URL}/work/${e.slug}`,
            note: e.summary || '',
          })),
        },
        meta,
      })
    }
    // the index IS the fan: the boot payload carries `fan` and app.js
    // spreads the pile before first paint; closing the fan lands on /
    return renderPage(fastify, request, reply, 'canvas/home.njk', {
      boot: { ...(await canvasBoot(fastify)), fan: 'work' },
      meta,
    })
  })

  fastify.get('/work/:slug', async (request, reply) => {
    const caseStudies = await loadCaseStudies()
    const entry = caseStudies.find((e) => e.slug === request.params.slug)
    if (!entry) {
      reply.callNotFound()
      return reply
    }
    const canonical = `${SITE_URL}/work/${entry.slug}`
    const ogImage = imgUrl(`${SITE_URL}/img/og/${entry.slug}.png`)
    const meta = {
      title: `${entry.title} · work · ${SITE_NAME}`,
      description: entry.summary || `Case study from ${config.site.author.name}.`,
      canonical,
      ogType: 'article',
      ogImage,
      publishedTime: entry.date || undefined,
      jsonld: jsonld(articleNode(entry, canonical, ogImage)),
    }
    if (request.grid?.isTerminal || request.grid?.isRetro) {
      const { prev, next } = siblingNav(caseStudies, entry.slug)
      return renderPage(fastify, request, reply, 'feed/entry.njk', {
        site: { name: 'work', tagline: entry.summary || 'Case studies and contract work.' },
        entry,
        html: entry.html,
        prev,
        next,
        backToTop: isCaseStudy(entry) || entry.backToTop,
        basePath: '/work',
        canonicalBase: '/work',
        meta,
      })
    }
    // Modern browsers get the canvas with the case study SSR'd into the
    // open sheet; the backlink goes to /work, closing lands on /.
    // the page bar walks the case studies in the door's order; the
    // canvas repaints it from the pile's ring once it boots
    const { sheet, assets } = buildEntrySheet(entry, assetUrl, caseStudies)
    return renderPage(fastify, request, reply, 'canvas/home.njk', {
      boot: { ...(await canvasBoot(fastify)), fan: 'work' },
      sheet,
      sheetAssets: assets,
      meta,
    })
  })
}
