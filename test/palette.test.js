// test/palette.test.js
// The palette rule, codified (BIBLE.md section 1: two inks, tokens only).
// Every site color is a token in canvas-tokens.css, so a raw #hex anywhere
// else is either drift or a new color that skipped the token list. This
// fails the build on either, across every LIVE surface: stylesheets, njk
// templates, and the canvas/lib js that builds markup in template strings.
//
// Allowlisted:
//   canvas-tokens.css         defines the palette (the one place hex is allowed;
//                             One Dark, the syntax theme, is its --cv-code-*
//                             block, and highlight.css reads those like any
//                             stylesheet)
//   base-retro.njk            HTML 3.2 has no CSS variables; its body
//                             attributes mirror the two inks by hand
//   JS_HEX_ALLOW              the handful of js literals that render with no
//                             --cv-* context (the icon tool's standalone-file
//                             download); each mirrors a token, named in a
//                             source comment
//
// Two surfaces cannot hold a var() at all: the theme-color metas and the web
// app manifest. Their literals are checked AGAINST the resolved token instead
// of skipped. Skipping is what this guard used to do, and it is how #fff/#111
// outlived the two-ink skin by two redesigns: the browser painted its dark
// chrome a different near-black than the page, with every other guard green.
// The rule for a mandatory literal is not "look away", it is "prove it".
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveTokens } from './lib/css-tokens.js'
import { cssFiles, cssPath } from './lib/stylesheets.js'

const ROOT = join(import.meta.dirname, '..')
const CSS_ALLOW = new Set(['canvas-tokens.css'])
const NJK_ALLOW = new Set(['base-retro.njk'])

// Every first-party js that builds markup in a template string: the whole
// canvas engine, the client scripts under src/static/js (the icon tool
// included), the engine's primitives (the kit, the sky, the rooms), and the lib modules that emit HTML/SVG. Vendored
// js (src/static/js/vendor, canvas/vendor) is third-party and stays out.
// Directories are walked so a new file arrives guarded, not forgotten.
const JS_DIRS = ['src/static/canvas', 'src/static/js', 'primitives']
const JS_EXTRA = [
  'src/lib/canvas-sheets.js',
  'src/lib/render.js',
  'src/lib/pixel-icon.js',
  'src/lib/postcard.js',
  'src/lib/markdown.js',
  'src/lib/photo-set.js',
  'src/lib/template-helpers.js',
]
const JS_SKIP_DIR = new Set(['vendor'])

// Hex that must be a literal because it renders where a CSS custom property
// cannot reach: a downloaded standalone file, or a library option that takes a
// concrete string. Each entry names the file and the exact hexes, and the
// source carries a comment naming the token it mirrors. That comment is the
// sync contract; this list is the escape hatch, kept as small as the rule.
const JS_HEX_ALLOW = {
  // The textmode tool's starting colours. These are picture values, not UI:
  // they reach a WebGL uniform inside textmode.js (which takes a concrete
  // string, never a custom property) and they describe the artwork a person
  // then changes with a colour input. They are picture values, which is why
  // the one-ground pass left them alone: a picture's black is not the page's
  // ink. (instruments.css had the same standing until its art became cell
  // data on the site's own tokens.)
  'primitives/textmode-settings.js': ['#000000', '#ffffff', '#e4e4e7', '#18181b'],
}

function walkJs(dir, out = []) {
  for (const f of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (f.isDirectory()) {
      if (!JS_SKIP_DIR.has(f.name)) walkJs(join(dir, f.name), out)
    } else if (f.name.endsWith('.js')) {
      out.push(join(dir, f.name))
    }
  }
  return out
}

const JS_FILES = [...JS_DIRS.flatMap((d) => walkJs(d)), ...JS_EXTRA]

// The two literal-only surfaces, and the palette they have to quote.
const META_HEAD = join(ROOT, 'src/templates/partials/meta-head.njk')
const MANIFEST = join(ROOT, 'src/static/manifest.json')
const tokens = resolveTokens(readFileSync(cssPath('canvas-tokens.css'), 'utf8'), {
  prefix: '--cv-',
})

// #rgb or #rrggbb as a standalone color token (word-bounded so we don't
// match fragment ids or the like).
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g

// #abc and #AABBCC compare as colors, not as strings.
function hex6(value, label) {
  assert.equal(typeof value, 'string', `${label} is not a color string: ${JSON.stringify(value)}`)
  const v = value.trim().toLowerCase()
  assert.match(v, /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/, `${label} is not a hex color: ${value}`)
  return v.length === 4
    ? '#' +
        v
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')
    : v
}

const THEME_COLOR_META = /<meta\s+name="theme-color"[^>]*>/g

const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const stripNjkComments = (s) => s.replace(/\{#[\s\S]*?#\}/g, '')
const stripJsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function hexes(text) {
  return [...text.matchAll(HEX)].map((m) => m[0])
}

function walkNjk(dir, out = []) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name)
    if (f.isDirectory()) walkNjk(p, out)
    else if (f.name.endsWith('.njk')) out.push(p)
  }
  return out
}

describe('palette: raw hex lives only in canvas-tokens.css', () => {
  for (const file of cssFiles().filter((f) => f.endsWith('.css'))) {
    if (CSS_ALLOW.has(file)) continue
    // mutation: palette.css-hardcodes-the-ink, palette.syntax-hex-back
    it(`css: ${file}`, () => {
      const found = hexes(stripCssComments(readFileSync(cssPath(file), 'utf8')))
      assert.deepEqual(found, [], `${file} carries raw hex: ${found.join(', ')}`)
    })
  }

  for (const path of walkNjk(join(ROOT, 'src/templates'))) {
    const name = path.split('/').pop()
    if (NJK_ALLOW.has(name)) continue
    // mutation: palette.njk-noscript-ground-literal
    it(`template: ${name}`, () => {
      // NOTE: the theme-color metas are dropped HERE and only here, because
      // the block below asserts them against --cv-ground. A theme-color meta
      // added to any other template still fails this scan, so the exemption
      // cannot spread by copy-paste.
      const src = stripNjkComments(readFileSync(path, 'utf8'))
      const found = hexes(path === META_HEAD ? src.replace(THEME_COLOR_META, '') : src)
      assert.deepEqual(found, [], `${name} carries raw hex: ${found.join(', ')}`)
    })
  }

  for (const rel of JS_FILES) {
    // mutation: palette.js-sky-ground-literal
    it(`js: ${rel}`, () => {
      const allow = JS_HEX_ALLOW[rel] || []
      const found = hexes(stripJsComments(readFileSync(join(ROOT, rel), 'utf8'))).filter(
        (h) => !allow.includes(h.toLowerCase())
      )
      assert.deepEqual(found, [], `${rel} carries raw hex: ${found.join(', ')}`)
    })
  }
})

// The literals a var() cannot reach. Both paint BEFORE any of our CSS parses
// (the browser chrome around the tab, the PWA splash), which is exactly why
// they are hand-written, and exactly why they drift unwatched.
describe('palette: the mandatory literals quote their token', () => {
  // HTML 3.2 has no var(): the retro shell paints its two inks as body
  // attributes. Allowlisted above, so this is where they are held to the
  // tokens: #ffffff and #111111 sat there for months after the ink became
  // #18181b on #e4e4e7.
  // mutation: palette.retro-old-ground
  it('base-retro.njk: the body attributes are the ground, the ink and the mute', () => {
    const retro = readFileSync(join(ROOT, 'src/templates/base-retro.njk'), 'utf8')
    const body = retro.match(/<body ([^>]+)>/)
    assert.ok(body, 'the retro shell has no <body> attributes')
    const attr = (name) => {
      const m = body[1].match(new RegExp(`${name}="([^"]+)"`))
      assert.ok(m, `<body> carries no ${name}`)
      return hex6(m[1], `retro ${name}`)
    }
    assert.equal(attr('bgcolor'), hex6(tokens.light.ground, '--cv-ground'))
    assert.equal(attr('text'), hex6(tokens.light.ink, '--cv-ink'))
    assert.equal(attr('link'), hex6(tokens.light.ink, '--cv-ink'))
    assert.equal(attr('vlink'), hex6(tokens.light.mute, '--cv-mute'))
    assert.equal(attr('alink'), hex6(tokens.light.mute, '--cv-mute'))
  })

  // mutation: palette.theme-color-old-near-black
  it('meta-head.njk: the one theme-color is the one ground', () => {
    // ONE GROUND (2026-09-15). This used to assert a light/dark PAIR, each
    // pinned to its own --cv-ground. There is one ground now, so the guard that
    // kept the pair honest becomes the guard that keeps the single value
    // honest: the browser chrome must be the same colour as the page.
    const head = readFileSync(META_HEAD, 'utf8')
    const metas = [...head.matchAll(/<meta name="theme-color"[^>]*>/g)].map((m) => m[0])
    assert.equal(metas.length, 1, `expected exactly one theme-color, got ${metas.length}`)
    assert.ok(
      !/prefers-color-scheme/.test(metas[0]),
      'a theme-color with a scheme media query is a second theme coming back'
    )
    const ground = hex6(tokens.light.ground, '--cv-ground')
    assert.equal(hex6(metas[0].match(/content="([^"]+)"/)[1], 'theme-color'), ground)
  })

  // mutation: palette.manifest-white-splash
  it('manifest.json: theme_color and background_color are the ground', () => {
    const app = JSON.parse(readFileSync(MANIFEST, 'utf8'))
    // The manifest carries ONE of each with no media scoping, which used to
    // be the awkward case: two themes, one slot, and the light ground won by
    // fiat. With one ground it is simply the ground.
    const ground = hex6(tokens.light.ground, '--cv-ground')
    assert.equal(hex6(app.theme_color, 'manifest theme_color'), ground)
    assert.equal(hex6(app.background_color, 'manifest background_color'), ground)
  })

  // The icon emitters write standalone SVGs, so a var() cannot reach them
  // either. They keep a light/dark pair (the tab strip's ground is the OS's,
  // see wire.mjs), and the pair is the site's own: ink on light, the fixed
  // ground on dark. #111/#fff sat one step off both for months. (The
  // loader's emitter went with the loader picture: the kit's loader
  // is drawn in CSS.)
  for (const rel of ['scripts/icon/wire.mjs']) {
    // mutation: palette.icon-dark-fill-white
    it(`${rel}: the mark's fills are --cv-ink and --cv-ground-fixed`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      const ink = hex6(tokens.light.ink, '--cv-ink')
      const ground = hex6(tokens.light['ground-fixed'], '--cv-ground-fixed')
      const dark = [...src.matchAll(/prefers-color-scheme:dark\)\{path\{fill:([^;}]+)/g)]
      const light = [
        ...src
          .replace(/prefers-color-scheme:dark\)\{path\{fill:/g, '')
          .matchAll(/path\{fill:([^;}]+)/g),
      ]
      assert.ok(light.length > 0 && dark.length > 0, `${rel}: no path fill pair found`)
      for (const m of light) assert.equal(hex6(m[1], `${rel} light fill`), ink)
      for (const m of dark) assert.equal(hex6(m[1], `${rel} dark fill`), ground)
    })
  }
})
