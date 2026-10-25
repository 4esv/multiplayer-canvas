// test/bundle-entries.test.js
// A served script that imports a LOGICAL path ('/canvas/x.js', '/js/y.js')
// only works in dev: production hashes every asset filename and only
// templates resolve the manifest, so the import 404s on the box. Bundling is
// how this site answers that, and BUNDLE_ENTRIES is the list. The list was
// hand-kept until web-instruments joined it a day late and served a blank
// stage in the meantime (the failure is silent: the page still loads, the
// art never arrives). This computes the list from the imports themselves.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SRC = join(ROOT, 'src/static')
const BUILD = readFileSync(join(ROOT, 'scripts/build-assets.mjs'), 'utf8')

const entries = new Set([...BUILD.matchAll(/^\s*'((?:js|canvas)\/[\w./-]+)',$/gm)].map((m) => m[1]))

const walk = (dir, base = '') =>
  readdirSync(join(SRC, dir)).flatMap((f) => {
    const rel = posix.join(base || dir, f)
    if (statSync(join(SRC, dir, f)).isDirectory()) return walk(join(dir, f), rel)
    return f.endsWith('.js') ? [rel] : []
  })

// every logical import a file makes, static or dynamic
const importsOf = (rel) => {
  const src = readFileSync(join(SRC, rel), 'utf8')
  return [
    ...[...src.matchAll(/\bfrom\s+['"](\/(?:js|canvas)\/[\w./-]+)['"]/g)].map((m) => m[1]),
    ...[...src.matchAll(/\bimport\(\s*['"](\/(?:js|canvas)\/[\w./-]+)['"]/g)].map((m) => m[1]),
  ]
}

describe('a script that imports a logical path is bundled', () => {
  const files = [...walk('js'), ...walk('canvas')].filter((f) => !f.startsWith('js/vendor/'))

  // reachable = bundled itself, or pulled in by something that is
  const reachable = new Set(entries)
  for (let pass = 0; pass < 12; pass++)
    for (const f of files)
      if (reachable.has(f)) for (const i of importsOf(f)) reachable.add(i.replace(/^\//, ''))

  // mutation: bundle-entries.instruments-unbundled
  it('every importer is an entry or is bundled into one', () => {
    const orphans = files.filter((f) => importsOf(f).length && !reachable.has(f))
    assert.deepEqual(
      orphans,
      [],
      `these import a logical path but nothing bundles them, so the import 404s in production:\n  ${orphans.join('\n  ')}`
    )
  })

  // mutation: bundle-entries.import-renamed
  it('every logical import resolves to a file on disk', () => {
    for (const f of files)
      for (const i of importsOf(f))
        assert.ok(
          statSync(join(SRC, i.replace(/^\//, ''))).isFile(),
          `${f} imports ${i}, which is not in the static tree`
        )
  })
})
