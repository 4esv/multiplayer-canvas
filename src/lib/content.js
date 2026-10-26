// Markdown-content loader shared by /work, /feed, /about.
//
// Parses front-matter, renders body HTML at load time, sorts by date.
// Cache is hydrated once in production and bypassed in dev so edits
// show up without restarting the server.

import { readdir, readFile } from 'fs/promises'
import { join, parse } from 'path'

import matter from 'gray-matter'

import { versionImgs } from './img-version.js'
import { renderMarkdown } from './markdown.js'

const USE_CACHE = process.env.NODE_ENV === 'production'

// YAML parses an unquoted `YYYY-MM-DD` into a Date, whose default
// stringification is "Tue Jun 02 2026 20:00:00 GMT-0400 (...)". Exported
// because every date-shaped frontmatter field needs this, not just `date`:
// an unnormalised `updated` would put a full JS Date string into <lastmod>.
export function normalizeDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') return value
  return null
}

function parseEntry(slug, raw, mapFrontmatter) {
  const { data, content } = matter(raw)
  const base = {
    slug,
    title: data.title || slug,
    date: normalizeDate(data.date),
    summary: data.summary || '',
    raw: content,
    html: versionImgs(renderMarkdown(content)),
  }
  return mapFrontmatter ? mapFrontmatter(base, data) : base
}

// Load every .md file in a directory. `mapFrontmatter(base, data)` lets
// callers pull through additional frontmatter fields (year, tag, stack, etc.)
// without re-implementing the read/parse/render pipeline.
export function loadMarkdownDir(dir, mapFrontmatter) {
  let cache = null
  return async function load() {
    if (cache && USE_CACHE) return cache
    const entries = await readdir(dir, { withFileTypes: true })
    const items = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const slug = parse(entry.name).name
      // NOTE: one bad file must not take down every content surface (/, /feed,
      // /work, /feed.xml, /sitemap.xml all load this pool). Skip it and say
      // so; a malformed file is a shell problem, not a page outage.
      try {
        const raw = await readFile(join(dir, entry.name), 'utf-8')
        items.push(parseEntry(slug, raw, mapFrontmatter))
      } catch (err) {
        console.warn(`content: skipping ${entry.name}: ${err.message}`)
      }
    }
    items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    cache = items
    return items
  }
}

// Looping prev/next within a date-desc sorted pool (newest first).
// Prior = older (index+1), Next = newer (index-1); both wrap around.
// Returns nulls when the pool has <=1 entry or the slug isn't visible
// (e.g. a hidden entry rendered at its URL but absent from the pool).
export function siblingNav(sortedList, currentSlug) {
  const n = sortedList.length
  const i = sortedList.findIndex((e) => e.slug === currentSlug)
  if (n <= 1 || i === -1) return { prev: null, next: null }
  const older = sortedList[(i + 1) % n]
  const newer = sortedList[(i - 1 + n) % n]
  return {
    prev: { slug: older.slug, title: older.title },
    next: { slug: newer.slug, title: newer.title },
  }
}

// Single-file variant for /about. Same parse pipeline, no sort.
export function loadMarkdownFile(path, mapFrontmatter) {
  let cache = null
  return async function load() {
    if (cache && USE_CACHE) return cache
    const raw = await readFile(path, 'utf-8')
    const slug = parse(path).name
    cache = parseEntry(slug, raw, mapFrontmatter)
    return cache
  }
}
