// test/kit-code.test.js
// The code block (src/static/css/code.css), one part wherever the site shows
// code: a case study's fence (lib/markdown.js, in the sheet under entry.css)
// and the kit's code plate are both lib/code-lines.js's numbered lines.
//
// What is held: the gutter and the surface are written once, and no other
// stylesheet restates them; the block reads to the same thing in the sheet
// and on the kit's code plate (asked of the cascade, because a rule written
// down can still lose to another: the kit's plate sets its links to inherit,
// which a bare .ln-n lost to); the digit count is one variable the renderer
// sets and the gutter reads; a number is drawn from data, sticks to the edge
// and cannot be copied.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { renderMarkdown } from '../src/lib/markdown.js'
import { entryCssChain } from '../src/lib/canvas-sheets.js'
import { computed, cssRules, elementOf } from './lib/cascade.js'

const ROOT = join(import.meta.dirname, '..')
const CSS_DIR = 'src/static/css'
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const sheet = (file) => cssRules(read(`${CSS_DIR}/${file}`))
const FILES = readdirSync(join(ROOT, CSS_DIR)).filter((f) => f.endsWith('.css'))

// the stylesheets a page loads, read off its templates in the order it loads
// them: the cascade is asked about what the page really has
const linksOf = (rel) =>
  [...read(rel).matchAll(/asset\('\/css\/([\w-]+\.css)'\)/g)].map((m) => m[1])
const PAGES = {
  sheet: [
    ...linksOf('src/templates/canvas/home.njk'),
    ...entryCssChain({}).map((u) => u.replace('/css/', '')),
  ],
  plate: [
    ...linksOf('src/templates/canvas-base.njk'),
    ...linksOf('src/templates/desk-base.njk'),
    ...linksOf('src/templates/kit/index.njk'),
  ],
}
const RULES = {}
const loaded = (page) =>
  (RULES[page] ??= PAGES[page].flatMap(sheet).map((rule, order) => ({ ...rule, order })))

// the elements the renderers draw, in the chain each page puts them in
const FENCE = renderMarkdown('```js id=demo\nconst a = 1\n```\n')
const node = (tag, classes = [], id) => ({ tag, id, classes, attrs: {} })
const BLOCK = [
  elementOf(FENCE, 'code'),
  elementOf(FENCE, 'hljs'),
  node('code'),
  elementOf(FENCE, 'ln'),
  elementOf(FENCE, 'ln-n'),
]
const CHAINS = {
  sheet: [node('div', [], 'sheetInner'), node('div', ['prose']), ...BLOCK],
  plate: [node('div', ['ks-codewrap'], 'sheetInner'), node('div', ['prose']), ...BLOCK],
}
// how deep each part is in a chain: the sheet and the plate wrap the block
// in two divs and a .code
const DEPTH = {
  sheet: { pre: 4, code: 5, ln: 6, n: 7 },
  plate: { pre: 4, code: 5, ln: 6, n: 7 },
}
const WIDTH = 1440
const ask = (page, part, prop) =>
  computed(loaded(page), CHAINS[page].slice(0, DEPTH[page][part]), prop, WIDTH)

const PARTS = {
  pre: [
    'font-family',
    'font-size',
    'line-height',
    'tab-size',
    'white-space',
    'scrollbar-width',
    'background',
    'color',
  ],
  code: ['font-family', 'background', 'display', 'min-width'],
  ln: ['display', 'padding-right'],
  n: [
    'position',
    'left',
    'display',
    'box-sizing',
    'width',
    'padding',
    'margin-right',
    'text-align',
    'color',
    'background',
    'text-decoration',
    'user-select',
  ],
}

describe('the block is written once', () => {
  // mutation: kit-code.gutter-rewritten
  it('has its gutter in the code block’s own stylesheet and nowhere else', () => {
    const at = FILES.filter((f) =>
      sheet(f).some((r) => r.selectors.some((s) => /\.ln(-n)?(?![\w-])/.test(s)))
    )
    assert.deepEqual(at, ['code.css'])
  })

  // mutation: kit-code.surface-restated
  it('states its face, ground and tabs once: a page says only where the block stands', () => {
    const STATED = new Set([
      'font-family',
      'font-size',
      'line-height',
      'tab-size',
      'white-space',
      'background',
      'color',
    ])
    const BLOCK = /(^|[\s>+~])pre(?![\w-])|\.et-src(?![\w-])|\.hljs(?![\w-])/
    // a block that is lit (the prose points at it, the URL names it) says so
    // in the page's own sheet: that is a state of the place, not the surface
    const state = /\.is-lit|:target/
    const restated = []
    for (const f of FILES.filter((f) => !['code.css', 'highlight.css'].includes(f)))
      for (const r of sheet(f))
        if (r.selectors.some((s) => BLOCK.test(s) && !state.test(s)))
          for (const d of r.decls)
            if (STATED.has(d.prop)) restated.push(`${f}: ${r.selectors.join(', ')} { ${d.prop} }`)
    assert.deepEqual(restated, [])
  })
})

describe('the block reads the same wherever it stands', () => {
  // mutation: kit-code.gutter-forked, kit-code.surface-forked, kit-code.sheet-not-loaded, kit-code.plate-not-loaded
  it('is one drawing on a case study and on the kit’s plate', () => {
    for (const [part, props] of Object.entries(PARTS))
      for (const prop of props) {
        const seen = Object.fromEntries(
          Object.keys(CHAINS).map((page) => [page, ask(page, part, prop)])
        )
        assert.notEqual(seen.sheet, 'initial', `${part} ${prop}: nothing dresses it in the sheet`)
        assert.deepEqual(
          [seen.plate],
          [seen.sheet],
          `${part} ${prop} is not the same on every page: ${JSON.stringify(seen)}`
        )
      }
  })

  // mutation: kit-code.number-loses-to-links
  it('keeps a number a number against the kit’s rule that links inherit', () => {
    // .ks-codewrap a { color: inherit } is the plate's, and a bare .ln-n
    // (one class) loses to it (a class and a tag): the numbers came out in
    // the code's ink, measured, before the gutter was set under .hljs
    assert.equal(ask('plate', 'n', 'color'), 'var(--cv-code-comment)')
  })
})

describe('the gutter', () => {
  const NUMBER = (sel) =>
    sheet('code.css')
      .filter((r) => r.selectors.some((s) => s.trim() === sel))
      .flatMap((r) => r.decls)

  // mutation: kit-code.digit-var-forked, kit-code.gutter-reads-another
  it('is as wide as the digit count, one variable the renderer sets', () => {
    const width = ask('sheet', 'n', 'width')
    const name = /var\((--[\w-]+)/.exec(width)?.[1]
    assert.ok(name, `the gutter's width does not read a digit count: ${width}`)
    assert.match(FENCE, new RegExp(`style="${name}:1"`), 'the fence does not set it')
    // and says so for the width it needs: three digits for a hundred and forty lines
    const long = renderMarkdown('```txt id=long\n' + 'x\n'.repeat(140) + '```\n')
    assert.match(long, new RegExp(`style="${name}:3"`))
  })

  // mutation: kit-code.number-not-data
  it('draws the number from data, so a copy of the code never carries it', () => {
    const content = NUMBER('.hljs .ln-n::before').find((d) => d.prop === 'content')?.value
    assert.equal(content, 'attr(data-n)')
  })

  // mutation: kit-code.number-copied, kit-code.gutter-scrolls
  it('sticks to the left edge and cannot be selected', () => {
    assert.equal(ask('sheet', 'n', 'position'), 'sticky')
    assert.equal(ask('sheet', 'n', 'left'), '0')
    assert.equal(ask('sheet', 'n', 'user-select'), 'none')
  })
})
