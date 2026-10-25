// Auto-discovers any `*.njk` under templates/pages/ and mounts it as a route.
// `home.njk` and `index.njk` mount at `/`. Everything else mounts at its
// filename. Subdirectories become path segments.
//
// Drop a template into templates/pages/ to publish a new page: no route
// wiring needed. Skipped: `404.njk`, `500.njk` (handled by the error registrar).

import { readdir } from 'fs/promises'
import { join, parse } from 'path'

import { renderPage } from '../lib/render.js'

const PAGES_DIR = join(import.meta.dirname, '../templates/pages')
const ROOT_NAMES = new Set(['index', 'home'])
// 404/500 are owned by the error handler; `home` is owned by home.js (it needs
// the /feed index data the auto-mount can't supply).
const SKIP_NAMES = new Set(['404', '500', 'home'])

async function discoverTemplates(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true })
  const routes = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = await discoverTemplates(join(dir, entry.name), `${prefix}/${entry.name}`)
      routes.push(...nested)
    } else if (entry.name.endsWith('.njk')) {
      const { name } = parse(entry.name)
      if (SKIP_NAMES.has(name)) continue
      const route = ROOT_NAMES.has(name) ? prefix || '/' : `${prefix}/${name}`
      const template = `pages${prefix}/${entry.name}`
      routes.push({ route, template })
    }
  }

  return routes
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function registerPageRoutes(fastify) {
  const templates = await discoverTemplates(PAGES_DIR)

  for (const { route, template } of templates) {
    fastify.get(route, async (request, reply) =>
      renderPage(fastify, request, reply, template, { withPageData: true })
    )
  }
}
