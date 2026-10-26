// test/one-ground.test.js
// ONE GROUND (2026-09-15, BIBLE.md section 1): there is no second theme.
//
// The site ran two themes and each of them got about half the palette right.
// Keeping both honest meant every accent carried a light value and a lifted
// dark one, every contrast pair was measured twice, and a fix in one mode
// routinely broke the other. It was deleted rather than repaired.
//
// This guard exists because deleting a theme is not one commit's work and the
// first attempt proved it. The flip went in 840c629 and the sweep that should
// have gone with it missed, among other things: a `.themeSwitch` lightbulb
// whose rules kept shipping to every visitor with no markup left to match, an
// `html.theming` crossfade armed with `!important` that nothing could ever
// add the class for, a MutationObserver on every 3D preview watching the root
// element for a class that is never written again, two templates documenting
// the load order of a `theme.js` that no longer exists, and a selector list in
// instruments.css duplicated verbatim because the `html.dark ` prefix had been
// stripped off the second copy. None of it changed a pixel; all of it was
// shipped, parsed and believed, and every one of those comments was read by
// somebody as a statement about how the site works.
//
// So the decision is guarded rather than remembered. Three claims:
//
//   1. Nothing shipped declares a dark context. No media query, no class, no
//      attribute selector. This is the claim that keeps the other two true.
//   2. Every token therefore resolves to exactly ONE value. A guard that
//      loops over `light` and `dark` is running twice on identical input and
//      reporting coverage it does not have (test/cursor-ring.test.js did
//      exactly that for a day), so the resolver's two maps must be equal.
//   3. The machinery of the old flip is GONE, named piece by piece, so it
//      cannot come back as a fragment nobody recognises.
//
// Two exceptions are stated here rather than discovered. scripts/icon/*
// still emit `prefers-color-scheme` into the favicon and the app icon,
// because those are painted by the BROWSER into a tab strip and a task
// switcher whose ground follows the user's OS and which this site does not
// own. That is their ground, not ours, and answering it is correct.
//
// And a page that is READ (2026-09-25): its shell, #modal.reading, may take the inverted ground when
// the reader asks for it (Dark Mode) or, with nothing asked, when their OS
// does. That is the reader's eyes, not a second theme for the site, and it
// is held to a boundary this guard draws: two files may declare it
// (css/page-reader.css and js/page-reader.js), every rule under a dark
// context in the stylesheet starts at the shell, and the script writes the
// choice on the shell and nowhere else. The canvas, its chrome, the
// collections and every experiment stay on the one ground.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { resolveTokens } from './lib/css-tokens.js'
import { cssRules } from './lib/cascade.js'

const ROOT = join(import.meta.dirname, '..')

// everything a browser is served, minus the vendored third-party trees (their
// theming is their authors' business, and we do not edit them)
const SHIPPED = [
  'src/static/css',
  'src/static/js',
  'src/static/canvas',
  'src/templates',
  'primitives',
]
const SKIP_DIR = /(^|\/)vendor(\/|$)/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (SKIP_DIR.test(relative(ROOT, full))) continue
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}
const files = SHIPPED.flatMap((d) => walk(join(ROOT, d))).map((f) => ({
  path: relative(ROOT, f),
  text: readFileSync(f, 'utf8'),
}))

// Comments are where the HISTORY of the flip is allowed to live, and it
// should: a deletion nobody wrote down gets re-added. So every check below
// reads code with comments stripped, and the prose is left alone.
//
// This is deliberately three small strippers rather than one clever one. CSS
// and JS block comments, JS line comments, and Nunjucks comments are
// genuinely different syntaxes, and a regex that tried to be all three at
// once would be the kind of thing that silently stops matching.
const strip = (text, path) => {
  let t = text.replace(/\/\*[\s\S]*?\*\//g, ' ')
  if (/\.(js|mjs)$/.test(path)) t = t.replace(/^\s*\/\/.*$/gm, ' ')
  if (/\.njk$/.test(path)) t = t.replace(/\{#[\s\S]*?#\}/g, ' ')
  return t
}
const code = files.map((f) => ({ ...f, text: strip(f.text, f.path) }))

// the page shell's boundary: the only files that may declare a dark context,
// and the one selector every rule under it starts at
const PAGE_SHELL = ['src/static/css/page-reader.css', 'src/static/js/page-reader.js']
const SHELL = '#modal.reading'

describe('one ground: nothing shipped asks what theme it is', () => {
  // mutation: one-ground.dark-query-returns
  it('declares no dark context anywhere a browser can see', () => {
    // The three ways a page can carry a second theme. Any one of them coming
    // back means the palette has to be measured twice again, so it is a
    // decision, not an edit.
    const ways = [
      ['a media query', /prefers-color-scheme/],
      ['a theme class', /\.dark\b|\bhtml\.theming\b/],
      ['a theme attribute', /\[data-theme|data-ground|dataset\.ground/],
    ]
    const found = []
    for (const f of code) {
      if (PAGE_SHELL.includes(f.path)) continue
      for (const [what, re] of ways) if (re.test(f.text)) found.push(`${f.path}: ${what}`)
    }
    assert.deepEqual(
      found,
      [],
      `a second theme is being declared again:\n  ${found.join('\n  ')}\n` +
        'If that is intended, this guard is the place to say so out loud.'
    )
  })

  // mutation: one-ground.page-dark-leaks, one-ground.page-dark-on-root, one-ground.page-dark-on-body
  it('lets a page that is read invert its ground, and never past its shell', () => {
    const css = readFileSync(join(ROOT, PAGE_SHELL[0]), 'utf8')
    const rules = cssRules(css)
    // what the exemption is FOR: both ways in, the reader's word and the OS's
    const dark = rules.filter(
      (r) =>
        r.media.some((m) => /prefers-color-scheme:\s*dark/.test(m)) ||
        r.selectors.some((x) => /\[data-ground='dark'\]/.test(x))
    )
    assert.ok(
      dark.some((r) => r.media.length) && dark.some((r) => !r.media.length),
      'the page shell answers neither the OS nor the reader'
    )
    // every rule under a dark context, and every rule that rebinds a token,
    // starts at the shell
    const leaks = []
    for (const r of rules) {
      const scoped =
        dark.includes(r) ||
        r.decls.some((d) => d.prop.startsWith('--cv-')) ||
        r.decls.some((d) => d.prop === 'color-scheme')
      if (!scoped) continue
      for (const sel of r.selectors)
        if (!sel.trim().startsWith(SHELL))
          leaks.push(`${sel.trim()} (${r.media.join(' ') || 'no media'})`)
    }
    assert.deepEqual(
      leaks,
      [],
      `the inverted ground reaches past the page shell:\n  ${leaks.join('\n  ')}`
    )
    // the script writes the choice on the shell it is handed, and app.js
    // hands it #modal and nothing else
    const js = code.find((f) => f.path === PAGE_SHELL[1]).text
    const writes = [...js.matchAll(/(\w+)\.dataset\.ground\s*=/g)].map((m) => m[1])
    assert.ok(writes.length >= 2, 'the reader never states a ground')
    assert.deepEqual(
      [...new Set(writes)],
      ['shell'],
      `the ground is written on ${writes.join(', ')}`
    )
    const app = code.find((f) => f.path === 'src/static/canvas/app.js').text
    for (const m of app.matchAll(/applyReader\(([^,]+),|shell: ([^,]+),/g))
      assert.equal((m[1] || m[2]).trim(), "$('#modal')", `the reader's shell is ${m[1] || m[2]}`)
  })

  // mutation: one-ground.dark-query-returns
  it('resolves every token to exactly one value, so there is nothing to flip', () => {
    // The consequence of the claim above, measured rather than assumed: if
    // no dark context is declared then the resolver's dark map is a copy of
    // its light one, and any guard iterating both is doing the same work
    // twice. Stated here once so those guards do not each have to.
    const t = resolveTokens(readFileSync(join(ROOT, 'primitives/kit/canvas-tokens.css'), 'utf8'), {
      prefix: '--cv-',
    })
    const names = [...new Set([...Object.keys(t.light), ...Object.keys(t.dark)])]
    assert.ok(names.length > 40, `only ${names.length} tokens resolved; this is guarding air`)
    const split = names.filter((n) => t.light[n] !== t.dark[n])
    assert.deepEqual(split, [], `these tokens still have two values: ${split.join(', ')}`)
  })

  // tripwire: a frozen list of the deleted theme's parts by name; no behaviour is left to run, the names are the claim
  it('kept none of the old flip machinery', () => {
    // Named one by one, because this is what the first sweep actually left
    // behind and a generic "no dead CSS" check would never have found it.
    // Each of these shipped to visitors after the feature was deleted.
    const ghosts = [
      ['themeSwitch', 'the lightbulb control'],
      ['html.theming', 'the ink-flip crossfade'],
      ['data-theme-mode', 'the attribute app.js wrote'],
      ['inkflip', 'the two-phase dither sheet'],
      ['theme.js', 'the pre-paint script'],
      ['bulbGlyph', 'the bulb rasteriser'],
    ]
    const left = []
    for (const f of code)
      for (const [needle, what] of ghosts)
        if (f.text.includes(needle)) left.push(`${f.path}: ${needle} (${what})`)
    assert.deepEqual(left, [], `the deleted theme left parts behind:\n  ${left.join('\n  ')}`)
  })

  // mutation: one-ground.favicon-drops-dark
  it('lets the ICONS answer the OS, because that ground is not ours', () => {
    // The exception, asserted so it is a documented carve-out rather than an
    // inconsistency someone finds later and "fixes". A favicon paints into a
    // tab strip this site does not own and cannot read; a single ink there is
    // invisible on half the machines that show it.
    // EVERY emitter, not "the file mentions it somewhere": an earlier
    // version of this test asserted only that the FILE matched, so deleting
    // the dark rule from one of two emitters passed clean. The claim is about each
    // stylesheet the scripts emit: if it pins a fill, it owes the OS an
    // answer, or that mark vanishes on half the tab strips that show it.
    const icons = ['scripts/icon/wire.mjs']
    let emitters = 0
    for (const rel of icons) {
      const text = readFileSync(join(ROOT, rel), 'utf8')
      assert.match(
        text,
        /THE ONE PLACE prefers-color-scheme SURVIVES/,
        `${rel} emits a dark rule without saying why it is exempt from the one-ground sweep`
      )
      // each `path{fill:...}` the script writes into an icon's <style>. The
      // fill INSIDE the dark rule is not an emitter of its own: it is the
      // answer. Counting it as one made this fail on correct source, which
      // is the other half of a guard being right.
      for (const m of text.matchAll(/path\{fill:\s*(#[0-9a-f]{3,8})[^}]*\}/gi)) {
        if (/prefers-color-scheme[^{]*\{\s*$/.test(text.slice(Math.max(0, m.index - 60), m.index)))
          continue
        emitters++
        const after = text.slice(m.index, m.index + 260)
        assert.match(
          after,
          /@media\(prefers-color-scheme:dark\)/,
          `${rel}: the icon fill ${m[1]} has no dark answer, so the mark ` +
            'disappears on a dark tab strip'
        )
      }
    }
    // one emitter: the favicon (the mark is the hand-drawn source it reads)
    assert.ok(emitters >= 1, `only ${emitters} icon fills found; this is guarding air`)
  })
})
