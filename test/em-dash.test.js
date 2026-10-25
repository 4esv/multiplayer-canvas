// test/em-dash.test.js
// Site voice rule (CLAUDE.md, BIBLE.md section 1): no em-dashes on any
// surface. A period, colon, parens, or comma carries the rhythm instead, so a
// reader never writes the prose off as machine-set. This guard scans the
// surfaces a reader actually meets: every template, every content entry, the
// design contract, and the readme. (First-party js/css comments are the voice
// too, but the guard's remit is shipped surfaces; comments are kept clean by
// hand.)
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const EM_DASH = '—'

// Genuinely quoted third-party text that must keep an em-dash verbatim (a
// quoted tweet, a cited title): keyed by repo-relative path to the substrings
// allowed to carry one on a line. Currently empty: nothing on the surfaces
// quotes an em-dash. Never add a line of the author's own prose here; fix the prose.
const ALLOW = new Map()

function walk(dir, ext, out = []) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name)
    if (f.isDirectory()) walk(p, ext, out)
    else if (f.name.endsWith(ext)) out.push(p)
  }
  return out
}

const FILES = [
  ...walk(join(ROOT, 'src/templates'), '.njk'),
  ...walk(join(ROOT, 'content/feed'), '.md'),
  join(ROOT, 'BIBLE.md'),
  ...(existsSync(join(ROOT, 'README.md')) ? [join(ROOT, 'README.md')] : []),
]

describe('no em-dashes on any shipped surface (the voice rule)', () => {
  for (const path of FILES) {
    const rel = path.slice(ROOT.length + 1)
    // mutation: em-dash.identity-line
    it(rel, () => {
      const allowed = ALLOW.get(rel) || []
      const hits = []
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (line.includes(EM_DASH) && !allowed.some((s) => line.includes(s))) {
            hits.push(`${i + 1}: ${line.trim()}`)
          }
        })
      assert.deepEqual(
        hits,
        [],
        `${rel} carries an em-dash (U+2014); use a period, colon, parens, or comma:\n${hits.join('\n')}`
      )
    })
  }
})
