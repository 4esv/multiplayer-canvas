// test/elevation.test.js
// BIBLE.md section 1, the elevation half: one light, fixed, and now
// no cast at all: a control is a lit, dithered picture of itself.
//
// This guard exists because of a bug that shipped for the life of the token
// and was invisible the whole time. --cv-shadow was composed at :root out of
// --cv-cast-x/y, and app.js wrote a per-tile cast vector onto each element so
// the cards would throw away from the hero. They never did. A custom
// property's var() references are substituted where the property is
// DECLARED, not where it is used, so --cv-shadow resolved the cast once at
// :root and every descendant inherited the already-substituted value. The
// hero-lamp code ran on every layout settle, allocated two style writes per
// node, and changed nothing. Nothing caught it because the shadow was soft
// enough that no one could see which way it pointed.
//
// So the rule is not "the lamp is retired" (that is a design call, BIBLE.md
// section 12). The rule is the mechanical one underneath it: if a custom
// property is composed out of other custom properties at :root, no runtime
// may pretend it can override the parts per element. Either the value is a
// constant, as it is now, or the composition moves to the use site.
//
// The failure this reproduces is real: revert to a per-element cast and
// `the composed parts are never written per element` goes red.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { resolveTokens, asPx } from './lib/css-tokens.js'

const ROOT = join(import.meta.dirname, '..')
const TOKENS_CSS = readFileSync(join(ROOT, 'primitives/kit/canvas-tokens.css'), 'utf8')
const { light, dark } = resolveTokens(TOKENS_CSS, { prefix: '--cv-' })

// every .js the canvas ships, read as text: the guard is about what the
// runtime WRITES, so it reads the writers, not their output
const JS_DIRS = ['src/static/canvas', 'src/static/js']
function jsFiles() {
  const out = []
  for (const dir of JS_DIRS) {
    const abs = join(ROOT, dir)
    for (const e of readdirSync(abs, { withFileTypes: true, recursive: true })) {
      if (!e.isFile() || !e.name.endsWith('.js')) continue
      if (e.parentPath.includes('vendor')) continue // third party, not ours to rule
      out.push([join(dir, e.name), readFileSync(join(e.parentPath, e.name), 'utf8')])
    }
  }
  return out
}

// the custom properties that appear inside ANOTHER custom property's value in
// the token file. These are the ones substitution has already frozen at :root.
function composedParts(css) {
  const parts = new Set()
  // one declaration per match: `--name: value;` inside a :root-ish block
  for (const [, value] of css.matchAll(/--cv-[\w-]+\s*:\s*([^;}]+)/g)) {
    for (const [, ref] of value.matchAll(/var\(\s*(--cv-[\w-]+)/g)) parts.add(ref)
  }
  return parts
}

describe('elevation: one light, and tone rather than a cast', () => {
  // mutation: elevation.cell-written-per-element
  it('the composed parts are never written per element', () => {
    const parts = composedParts(TOKENS_CSS)
    assert.ok(parts.size > 0, 'no composed custom properties found: the scan stopped working')
    const hits = []
    for (const [rel, src] of jsFiles()) {
      src.split('\n').forEach((line, i) => {
        for (const [, prop] of line.matchAll(/setProperty\(\s*['"`](--cv-[\w-]+)['"`]/g)) {
          if (parts.has(prop)) hits.push(`${rel}:${i + 1}: writes ${prop}`)
        }
      })
    }
    assert.deepEqual(
      hits,
      [],
      'these properties are substituted into another token at :root, so an\n' +
        'element-level write cannot reach the value that uses them:\n  ' +
        hits.join('\n  ') +
        '\nEither make the value a constant or compose it at the use site.'
    )
  })

  // mutation: elevation.cast-returns
  it('no cast: the cast tokens are retired, the parts ramp is there', () => {
    // No shadow at all. The one-cell cast of 2026-09-11 and the recess
    // cast that mirrored it are gone with every other shadow
    // (test/ink-chrome.test.js); a raised thing is a baked picture of itself
    // on the grey ramp. A token that comes back is a cast waiting for a
    // consumer.
    for (const [theme, view] of [
      ['light', light],
      ['dark', dark],
    ]) {
      for (const name of ['shadow', 'shadow-lift', 'recess-cast', 'cast-x', 'cast-y'])
        assert.equal(view[name], undefined, `${theme}: --cv-${name} is back`)
      for (const grey of ['deep', 'mid', 'bright'])
        assert.ok(view[grey], `${theme}: --cv-${grey}, a grey of the parts ramp, is missing`)
    }
  })

  // mutation: elevation.round-corner
  it('no corner is round: the radius tokens are zero', () => {
    for (const [theme, view] of [
      ['light', light],
      ['dark', dark],
    ]) {
      assert.equal(asPx(view.r), 0, `${theme}: --cv-r rounds a corner`)
      assert.equal(asPx(view['r-sheet']), 0, `${theme}: --cv-r-sheet rounds a corner`)
    }
  })
})
