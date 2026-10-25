// Single render path for every page route.
//
// Guarantees every view receives `site`, `route`, and `grid`, sets the
// terminal content-type when the request comes from curl/wget, and merges
// background-refreshed page data when the caller wants it. New routes
// should call this and not duplicate the boilerplate.

import { deskFor } from './desk.js'

export function renderPage(fastify, request, reply, template, payload = {}) {
  const { grid } = request
  const { site: siteOverrides, withPageData = false, desk, ...rest } = payload

  // An owner page names its desk tool by id; the shell (desk-base.njk) gets
  // the whole registry with that one marked current.
  if (typeof desk === 'string') rest.desk = deskFor(request, desk)

  if (grid?.isTerminal) {
    reply.header('Content-Type', 'text/plain; charset=utf-8')
  }

  // The body varies by User-Agent (terminal / retro / modern), so caches
  // must key on it. Scoped here, not in the global header hook, to keep it
  // off the immutable static assets (which never vary).
  reply.header('Vary', 'User-Agent')

  const site = siteOverrides ? { ...fastify.config.site, ...siteOverrides } : fastify.config.site
  const pageData = withPageData ? fastify.getPageData() : {}

  // Parent = one level up the path, named after its destination, so the
  // corner link is a "go up" affordance (not browser-history back).
  const route = request.url.split('?')[0]
  const segments = route.split('/').filter(Boolean)
  const parentPath = segments.length <= 1 ? '/' : '/' + segments.slice(0, -1).join('/')
  const parentLabel = parentPath === '/' ? 'home' : segments[segments.length - 2]

  return reply.view(template, {
    site,
    route,
    parentPath,
    parentLabel,
    grid,
    ...pageData,
    ...rest,
  })
}
