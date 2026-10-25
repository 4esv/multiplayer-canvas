// test/readme.test.js
// THE README'S NODE SNIPPETS RUN. Every fenced block marked
// `<!-- readme: node -->` in README.md is run as a module from the repo
// root, so its `multiplayer-canvas/...` imports resolve through the
// package's own `exports`, the way a borrower's would. A snippet that drifts
// from the code it shows fails here instead of in somebody's project.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const README = readFileSync(join(ROOT, 'README.md'), 'utf8')
const SNIPPETS = [...README.matchAll(/<!-- readme: node -->\s*```js\n([\s\S]*?)```/g)].map(
  (m) => m[1]
)

describe('README node snippets', () => {
  it('there are snippets to run', () => {
    assert.ok(SNIPPETS.length >= 8, `found ${SNIPPETS.length}`)
  })
  SNIPPETS.forEach((code, i) => {
    const first = code.split('\n').find((l) => l.startsWith('import')) || `#${i}`
    // mutation: readme.snippet-drifts
    it(`runs: ${first}`, () => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 20000,
      })
      assert.equal(r.status, 0, r.stderr)
    })
  })
})
