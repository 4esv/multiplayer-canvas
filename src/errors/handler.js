// Site-wide 404 + 500 handlers. Routes through the shared renderPage helper
// so error views receive the same {site, route, grid} shape as every page,
// including the text/plain switch for terminal clients.
//
// NOTE: error metas set no canonical. An error page is not an alternate of
// the home page; meta-head.njk skips the tag when the value is absent.

import { fail } from '../lib/api-errors.js'
import { renderPage } from '../lib/render.js'

import config from '../config.js'
const SITE_NAME = config.site.name

// A program on /api reads JSON whatever went wrong, in the one error shape
// (lib/api-errors.js), never the HTML door: an unknown path is a word, and
// so is a body the parser refused.
const isApi = (request) => /^\/api(\/|\?|$)/.test(request.url)

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export function registerErrorHandler(fastify) {
  fastify.setNotFoundHandler(async (request, reply) => {
    if (isApi(request)) return fail(reply, 404, 'notfound', `no route for ${request.method} here`)
    reply.status(404)
    return renderPage(fastify, request, reply, 'pages/404.njk', {
      meta: {
        title: `404 · ${SITE_NAME}`,
        description: 'Page not found.',
        robots: 'noindex',
      },
    })
  })

  fastify.setErrorHandler(async (error, request, reply) => {
    fastify.log.error(error)
    const status = error.statusCode || 500
    if (isApi(request)) {
      if (status >= 500) return fail(reply, status, 'server', `request ${request.id} failed`)
      return fail(reply, status, status === 413 ? 'toolarge' : 'invalid', error.message)
    }
    reply.status(status)
    return renderPage(fastify, request, reply, 'pages/500.njk', {
      // The id the log line carries, printed on the page so a report can
      // quote it and the log grep is one string.
      reqId: request.id,
      meta: {
        title: `500 · ${SITE_NAME}`,
        description: 'Server error.',
        robots: 'noindex',
      },
    })
  })
}
