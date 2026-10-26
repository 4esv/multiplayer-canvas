// test/served-labels.test.js
// A root-mounted thing is not filed under a word for its kind. Experiments
// are not in a stacked collection with a group view, so they are never
// labelled experiments anywhere: each is just the thing it is.
//
// So the kind keeps its name in code (EXPERIMENT, isExperiment, where it
// routes) and the reader never meets it: no meta line, no strip name, no
// llms.txt heading, no fallback description. The guard walks every
// published route in all three of the site's voices (a browser, curl, an
// old browser), plus the machine-read files and the JSON the canvas paints
// a page from, and fails on the word anywhere a reader or a crawler gets
// it.
//
// Tags are content, not labels: an entry's own `tags:` list is its owner's
// and is taken out of each body before the scan, by the exact strings the
// entry carries, so a label that happens to share a tag's spelling is still
// caught everywhere else.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from '../src/server.js'
import { STATIC_ROUTES } from '../src/routes/sitemap.js'
import { loadFeedEntries } from '../src/routes/feed.js'
import { pathFor } from '../src/lib/entry-kind.js'

const VOICES = {
  browser: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15',
  curl: 'curl/8.4.0',
  retro: 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1)',
}
const FILES = ['/llms.txt', '/feed.xml', '/sitemap.xml', '/robots.txt', '/humans.txt']

let app
let entries
before(async () => {
  app = await build({ logger: false })
  entries = (await loadFeedEntries()).filter((e) => !e.hidden)
})
after(async () => {
  await app.close()
})

// every way an entry's tags are written into a response: a JSON array (the
// canvas's boot payload), a comma list (the text and retro pages), and each
// tag on its own (a chip, a keyword)
function withoutTags(body) {
  let out = body
  for (const e of entries) {
    const tags = e.tags || []
    if (!tags.length) continue
    out = out.split(JSON.stringify(tags)).join(' ')
    out = out.split(tags.join(', ')).join(' ')
    for (const t of tags) out = out.split(`"${t}"`).join(' ').split(`>${t}<`).join('><')
  }
  return out
}

describe('the kind a root-mounted page is filed under is never said to a reader', () => {
  // mutation: served-labels.meta-says-kind, served-labels.strip-named-for-kind, served-labels.llms-heading
  it('no published response carries the word, in any voice', async () => {
    const pages = [
      ...STATIC_ROUTES.map((r) => r.path),
      ...entries.filter((e) => !e.externalUrl).map(pathFor),
    ]
    assert.ok(
      entries.some((e) => pathFor(e) === `/${e.slug}` && !e.externalUrl && e.webOnly),
      'there is no root-mounted page to hold to this; the walk is guarding air'
    )
    const hits = []
    const scan = async (url, ua) => {
      const r = await app.inject({ method: 'GET', url, headers: { 'user-agent': ua } })
      if (r.statusCode !== 200) return
      const body = withoutTags(r.body)
      for (const m of body.matchAll(/experiment/gi))
        hits.push(
          `${url} (${ua.slice(0, 12)}): ...${body.slice(Math.max(0, m.index - 50), m.index + 30).replace(/\s+/g, ' ')}...`
        )
    }
    for (const url of pages) for (const ua of Object.values(VOICES)) await scan(url, ua)
    for (const url of FILES) await scan(url, VOICES.browser)
    // the JSON the canvas paints an opened page from
    for (const e of entries.filter((x) => !x.externalUrl))
      await scan(`/api/page/${e.slug}`, VOICES.browser)
    assert.deepEqual(hits, [], `the kind is said to a reader:\n  ${hits.join('\n  ')}`)
  })
})
