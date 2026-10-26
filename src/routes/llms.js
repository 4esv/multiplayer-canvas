// /llms.txt: the site, addressed to a machine reader.
//
// Generated, not stored, for the same reason /sitemap.xml is: the hand-kept
// version listed URL SHAPES (`/feed/<slug>`) rather than the pages, so an
// assistant reading it learned the routing and none of the work, and every
// new entry made it staler. The lists below come from loadFeedEntries, so
// they are right by construction.
//
// Format follows llmstxt.org: an H1, a blockquote summary, then H2 sections
// of markdown links. It used to write bare URLs in plain lines, which reads
// to a parser as prose with no links in it at all - Lighthouse's llms-txt
// audit failed on exactly that ("File does not appear to contain any
// links").

import { loadFeedEntries } from './feed.js'
import { isCaseStudy, isExperiment, isPhotoSet, isWriting, pathFor } from '../lib/entry-kind.js'
import { PERSON, PROFILES } from '../lib/identity.js'

import config from '../config.js'

const SITE_URL = config.site.url
const SITE_NAME = config.site.name

const link = (name, url, desc) => `- [${name}](${url})${desc ? `: ${desc}` : ''}`

// One line per entry, pointing where the entry actually lives: an aggregated
// piece links to its host, a local one to its canonical URL here.
const entryLink = (e) =>
  link(e.title, e.externalUrl || `${SITE_URL}${pathFor(e)}`, e.summary || undefined)

export async function registerLlmsRoute(fastify) {
  fastify.get('/llms.txt', async (request, reply) => {
    const entries = (await loadFeedEntries()).filter((e) => !e.hidden)
    const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '')
    const cases = entries.filter(isCaseStudy).sort(byNewest)
    const writing = entries.filter(isWriting).sort(byNewest)
    // the root-mounted things are listed as themselves, under a heading that
    // says where they stand (on their own, at the root) rather than filing
    // them under a word for their kind
    const standalone = entries.filter(isExperiment).sort(byNewest)
    const photos = entries.filter(isPhotoSet).sort(byNewest)

    // A heading with nothing under it tells a machine reader the site has a
    // kind it does not have, so a kind with no entries yet prints nothing.
    const section = (title, list) =>
      list.length ? `\n## ${title}\n\n${list.map(entryLink).join('\n')}\n` : ''

    const profiles = Object.entries(PROFILES).map(([name, url]) => link(name, url))
    const host = new URL(SITE_URL).host

    const body = `# ${SITE_NAME}

> Site of ${PERSON.name}. ${PERSON.description}

## Identity

${[
  link(PERSON.name, `${SITE_URL}/about`, PERSON.jobTitle),
  link('Email', PERSON.email, PERSON.email.replace(/^mailto:/, '')),
  ...profiles,
].join('\n')}

## Pages

${[
  link('Home', `${SITE_URL}/`, 'landing plus the combined writing and web index'),
  link('About', `${SITE_URL}/about`, 'bio'),
  link('Work', `${SITE_URL}/work`, 'the case studies'),
  link('Case studies', `${SITE_URL}/case-studies`, 'one pile'),
  link('Feed', `${SITE_URL}/feed`, 'the full writing index'),
  link('Credits', `${SITE_URL}/credits`, 'the code, type and data this site uses'),
].join('\n')}
${section('Case studies', cases)}${section('Writing', writing)}${section('Standalone pages', standalone)}${section('Photos', photos)}
## Feeds and metadata

${[
  link('Sitemap', `${SITE_URL}/sitemap.xml`, 'every locally hosted page'),
  link('RSS', `${SITE_URL}/feed.xml`, 'RSS 2.0 for the writing feed (articles only)'),
  link('Web app manifest', `${SITE_URL}/manifest.json`),
  link('Humans', `${SITE_URL}/humans.txt`, 'credits'),
  link('Security contact', `${SITE_URL}/.well-known/security.txt`),
  link('Health check', `${SITE_URL}/health`),
].join('\n')}

## API

${[
  link('Canvas data', `${SITE_URL}/api/canvas`, 'everything the home canvas shows, as JSON'),
  link('Section sheet', `${SITE_URL}/api/sheet/work`, 'work, feed or about, rendered'),
  ...(cases.length
    ? [link('An entry as data', `${SITE_URL}/api/page/${cases[0].slug}`, 'any entry, by its slug')]
    : []),
].join('\n')}

## Curl-friendly

Every page also renders as plain text when the User-Agent is curl,
wget, lynx, or httpie. \`curl ${host}/about\` returns text, not HTML.

## Technical

Server-rendered HTML. Node.js + Fastify + Nunjucks. No client-side
framework.
`

    reply.header('content-type', 'text/plain; charset=utf-8')
    reply.header('cache-control', 'public, max-age=3600')
    return body
  })
}
