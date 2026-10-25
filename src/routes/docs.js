// /credits: the documents in lib/docs.js. One handler; the routes are
// written out so a reader (and the route walkers in test/) can see them.
import { canvasBoot, buildSectionSheet } from './canvas.js'
import { DOCS } from '../lib/docs.js'
import { imgUrl } from '../lib/img-version.js'
import { renderPage } from '../lib/render.js'
import config from '../config.js'

const SITE_URL = config.site.url
const SITE_NAME = config.site.name

function docPage(fastify, slug) {
  const { description } = DOCS[slug]
  return async (request, reply) => {
    const meta = {
      title: `${slug} · ${SITE_NAME}`,
      description,
      canonical: `${SITE_URL}/${slug}`,
      ogImage: imgUrl(`${SITE_URL}/img/og/${slug}.png`),
    }
    if (request.grid?.isTerminal || request.grid?.isRetro) {
      return renderPage(fastify, request, reply, 'doc/index.njk', {
        site: { name: slug, tagline: description },
        doc: slug,
        meta,
      })
    }
    // Modern browsers get the canvas with the document's sheet already open.
    return renderPage(fastify, request, reply, 'canvas/home.njk', {
      boot: await canvasBoot(fastify),
      sheet: await buildSectionSheet(fastify, slug),
      meta,
    })
  }
}

export async function registerDocRoutes(fastify) {
  fastify.get('/credits', docPage(fastify, 'credits'))
}
