// The files machines read about the site itself: robots.txt, humans.txt,
// security.txt and the two web app manifests. Generated rather than stored,
// so the name, the origin and the contact line come from site.config.js and
// a fork never has to find them in five static files. The manifests keep
// their icons and colours in src/static (the guards read them there); the
// identity fields are added here.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import config from '../config.js'

const STATIC = join(import.meta.dirname, '..', 'static')
const { name, url, tagline, author, social } = config.site

const robots = `# ${name}. Open to crawlers and AI ingestion.

User-agent: *
Allow: /

Sitemap: ${url}/sitemap.xml
`

const humans = `/* TEAM */
name: ${author.name}
contact: ${author.email}
${Object.entries(social)
  .map(([k, v]) => `${k}: ${v}`)
  .join('\n')}
site: ${url}
`

// RFC 9116 wants an expiry; a year from boot keeps a long-running process
// honest without a date anybody has to remember to bump.
const security = () => `Contact: mailto:${author.email}
Expires: ${new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()}
Preferred-Languages: en
Canonical: ${url}/.well-known/security.txt
`

async function manifest(file, fields) {
  const base = JSON.parse(await readFile(join(STATIC, file), 'utf8'))
  return JSON.stringify({ ...fields, ...base }, null, 2)
}

export async function registerMetaRoutes(fastify) {
  const text = (body) => async (_request, reply) =>
    reply.type('text/plain; charset=utf-8').send(body())
  fastify.get(
    '/robots.txt',
    text(() => robots)
  )
  fastify.get(
    '/humans.txt',
    text(() => humans)
  )
  fastify.get('/.well-known/security.txt', text(security))

  fastify.get('/manifest.json', async (_request, reply) =>
    reply.type('application/manifest+json').send(
      await manifest('manifest.json', {
        name,
        short_name: new URL(url).host,
        description: tagline,
      })
    )
  )
  fastify.get('/desk.webmanifest', async (_request, reply) =>
    reply.type('application/manifest+json').send(
      await manifest('desk.webmanifest', {
        name: `${name} desk`,
        short_name: 'desk',
        description: "The owner's desk.",
      })
    )
  )
}
