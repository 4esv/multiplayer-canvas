// /about: long-form bio rendered from content/about.md
import { join } from 'path'

import { canvasBoot } from './canvas.js'
import { loadMarkdownFile } from '../lib/content.js'
import { jsonld, profilePageNode } from '../lib/identity.js'
import { imgUrl } from '../lib/img-version.js'
import { renderPage } from '../lib/render.js'

import config from '../config.js'
const SITE_URL = config.site.url
const SITE_NAME = config.site.name

const loadAbout = loadMarkdownFile(join(import.meta.dirname, '../../content/about.md'))

export async function registerAboutRoutes(fastify) {
  fastify.get('/about', async (request, reply) => {
    const about = await loadAbout()
    const canonical = `${SITE_URL}/about`
    const meta = {
      title: `about · ${SITE_NAME}`,
      description: about.summary,
      canonical,
      ogType: 'profile',
      ogImage: imgUrl(`${SITE_URL}/img/og/about.png`),
      // The bio page is the person's profile page; the full Person node
      // (identity.js) rides as its main entity.
      jsonld: jsonld(profilePageNode(canonical)),
    }
    if (request.grid?.isTerminal || request.grid?.isRetro) {
      return renderPage(fastify, request, reply, 'about/index.njk', {
        site: { name: 'about', tagline: about.summary },
        about,
        meta,
      })
    }
    // Modern browsers get the canvas with the camera landing on the about
    // zone (BIBLE.md section 5): the page is a place on the ground, and the
    // zone's words also stand in the prelude for a reader without the script.
    return renderPage(fastify, request, reply, 'canvas/home.njk', {
      boot: { ...(await canvasBoot(fastify)), land: 'about' },
      meta,
    })
  })
}
