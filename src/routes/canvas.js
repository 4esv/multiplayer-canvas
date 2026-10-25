// The canvas sheet endpoint. The section doors (work / feed / about) exist
// as data here so the client router can open them without a reload; the same
// builders feed the SSR'd sheets in work.js / feed.js / about.js. Built from
// live content on every call (the content loader has its own dev/prod cache).

import { loadFeedEntries } from './feed.js'
import { aboutZone } from '../lib/zones.js'
import { fail } from '../lib/api-errors.js'
import { imgManifest } from '../lib/img-version.js'
import {
  buildWorkSheet,
  buildAboutSheet,
  buildDocSheet,
  buildFeedSheet,
  buildLocalPaths,
} from '../lib/canvas-sheets.js'
import {
  isCaseStudy,
  isFullPage,
  isRootMounted,
  isWriting,
  kindOf,
  metaLine,
  pathFor,
} from '../lib/entry-kind.js'
import { getCanvasBoot, getFetchedAt } from '../services/canvas-data.js'
import { presenceRoom, SQUISH_MS } from 'multiplayer-canvas/presence/room'
import { slimeFrame } from 'multiplayer-canvas/slime/server'
import { DOCS, isDoc } from '../lib/docs.js'

import config from '../config.js'
const SITE_NAME = config.site.name

// The routed-pages index the client router and omni search ride: every
// openable slug with its title, meta line, real path and document title.
// The section doors carry their sheet BODY too, so a client-side open
// paints whole immediately and survives a dead /api/sheet (which only
// refreshes them live); entries mount natively via /api/page.
async function buildPagesIndex(fastify, entries) {
  const pages = {}
  for (const key of ['work', 'feed', 'about', ...Object.keys(DOCS)]) {
    const s = await buildSectionSheet(fastify, key, entries)
    pages[key] = { title: s.title, meta: s.meta, docTitle: s.docTitle, body: s.body }
    if (isDoc(key)) pages[key].path = `/${key}`
  }
  for (const e of entries) {
    // NOTE: the door slugs are reserved; a content file named work.md,
    // feed.md or about.md must never clobber a section in the index.
    if (pages[e.slug]) continue
    // External entries have no local page to open: their tiles link out
    // directly (host label + arrow announce the departure), so the pages
    // index skips them and /feed/<slug> stays a 302 handle.
    if (e.externalUrl) continue
    pages[e.slug] = {
      title: e.title,
      meta: metaLine(e),
      path: pathFor(e),
      embed: e.slug,
      docTitle: isCaseStudy(e) ? `${e.title} · work · ${SITE_NAME}` : `${e.title} · ${SITE_NAME}`,
      // FULL PAGES (2026-09-15): a case study and an experiment are
      // destinations, not cards. They fill the frame, they carry their own
      // way back and their own way onward, and they arrive through the
      // cover pair rather than out of a card, because they did not come
      // out of one. Everything else still opens as a sheet.
      full: isFullPage(e),
      // The kind rides along because the ring a full page walks stays inside
      // it (issue #284): an experiment never steps into a case study, and
      // the client has no other way to tell the two apart.
      kind: kindOf(e),
    }
  }
  return pages
}

// The summary/date/tags every article tile prints, keyed by slug. It rides
// the boot payload so the article tiles paint whole on the first frame
// instead of each firing a /api/page fetch (that fetch survives in app.js
// only as the fallback for a stale boot). Content is local, so this is
// snapshot-independent. Case studies ride it too now that they live on the
// canvas as tiles (the work door stays the curated index over the same
// set); root-mounted entries (their own art) are still not article tiles.
function buildArts(entries) {
  const arts = {}
  for (const e of entries) {
    if (isRootMounted(e)) continue
    arts[e.slug] = { summary: e.summary || '', date: e.date || null, tags: e.tags || [] }
  }
  return arts
}

// Everything the shell SSRs into #boot: the live tile data (synchronous,
// background-refreshed), the routed-pages index, the article-tile copy, and
// per-source freshness stamps.
export async function canvasBoot(fastify) {
  const entries = (await loadFeedEntries()).filter((e) => !e.hidden)
  return {
    ...getCanvasBoot(),
    pages: await buildPagesIndex(fastify, entries),
    arts: buildArts(entries),
    // every picture the canvas builds a URL for, versioned by its bytes
    // (issue #319): a re-bake is a new URL, so it reaches a warm cache
    img: imgManifest(),
    // { weather } -> ISO of the last live fetch;
    // a key is absent until it has succeeded once.
    meta: getFetchedAt(),
    // the address the dock's envelope opens (site.config.js)
    contact: fastify.config.site.author.email,
    // the site's name, for the tab title the canvas writes as it moves
    siteName: fastify.config.site.name,
    // the zones' copy (BIBLE.md section 5, lib/zones.js): the words that
    // stand on the ground, from the same sources the terminal pages read
    zones: await buildZones(fastify, entries),
    // Maurice (BIBLE.md section 5): when he is back on his feet, server ms,
    // so a fresh tab opens on the shared bug and not on a live one that
    // flips to a splat the moment the socket connects
    maurice: { until: presenceRoom.squishUntil, ms: SQUISH_MS },
    // and which member each pile shows, the room's
    fronts: presenceRoom.fronts,
    // and how many others are in the public room, so the tally opens on the
    // count the room holds and not on a zero nobody measured. The page that
    // asked is not one of them yet: it joins when its socket does.
    others: presenceRoom.participants,
    // and the slime mould's dish as it stands (BIBLE.md section 5): the
    // picture the wire will keep refreshing, so the tile is never blank
    slime: slimeFrame(),
  }
}

async function buildZones(fastify, entries) {
  const paths = buildLocalPaths(entries)
  const aboutText = await fastify.view('text/about.njk', {})
  const workText = await fastify.view('text/work.njk', { caseStudies: [] })
  return [aboutZone(aboutText, workText, paths)]
}

export async function buildSectionSheet(fastify, key, preloaded) {
  if (key !== 'work' && key !== 'feed' && key !== 'about' && !isDoc(key)) return null
  const entries = preloaded ?? (await loadFeedEntries()).filter((e) => !e.hidden)
  const paths = buildLocalPaths(entries)
  if (key === 'work') {
    const caseStudies = entries.filter(isCaseStudy)
    const text = await fastify.view('text/work.njk', { caseStudies })
    return buildWorkSheet(text, caseStudies, paths)
  }
  if (isDoc(key)) {
    const text = await fastify.view(`text/${key}.njk`, {})
    return buildDocSheet(key, text, paths)
  }
  if (key === 'about') {
    const text = await fastify.view('text/about.njk', {})
    return buildAboutSheet(text, paths)
  }
  const articles = entries
    .filter(isWriting)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return buildFeedSheet(articles)
}

export async function registerCanvasRoutes(fastify) {
  fastify.get('/api/sheet/:slug', async (request, reply) => {
    const sheet = await buildSectionSheet(fastify, request.params.slug)
    if (!sheet) return fail(reply, 404, 'notfound')
    reply.header('cache-control', 'no-cache')
    return sheet
  })
}
