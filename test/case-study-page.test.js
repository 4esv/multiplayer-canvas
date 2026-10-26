// test/case-study-page.test.js
// a case study is ONE page and ONE card, in the pixel law.
//
//   - a direct load of /work/<slug> is the same full page the canvas opens,
//     not a sheet with the canvas showing above it
//   - its title is set by pixel-type.js, the face the canvas titles wear,
//     so every case-study title has to be settable in it
//   - every figure in a case study is drawn on the cell, and is what
//     scripts/img/figures.mjs draws from its spec
//   - a figure's words are the page's body face, and every figure fits a
//     phone's column (the painted half: scripts/verify/figure-fit.mjs)
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { build } from '../src/server.js'
import { loadFeedEntries } from '../src/routes/feed.js'
import { isCaseStudy, isFullPage } from '../src/lib/entry-kind.js'
import { missingGlyphs } from '../primitives/pixel-type.js'
import { entryJsModules } from '../src/lib/canvas-sheets.js'

const ROOT = join(import.meta.dirname, '..')
const studies = (await loadFeedEntries()).filter((e) => isCaseStudy(e) && !e.hidden)
const SOURCES = studies.map((e) => ({
  slug: e.slug,
  md: readFileSync(join(ROOT, 'content/feed', `${e.slug}.md`), 'utf8'),
}))

let app
before(async () => {
  app = await build({ logger: false })
})
after(async () => {
  await app.close()
})

describe('case study: one page', () => {
  it('there are case studies to hold to this', () => {
    assert.ok(studies.length >= 1, `found ${studies.length}`)
  })

  it('every title is settable in the display face', () => {
    for (const e of studies)
      assert.deepEqual(missingGlyphs(e.title, 'display'), [], `${e.slug}: "${e.title}"`)
  })

  for (const e of studies) {
    // mutation: case-study-page.direct-load-not-full
    it(`/work/${e.slug} arrives as the full page with its pixel title`, async () => {
      const r = await app.inject({ method: 'GET', url: `/work/${e.slug}` })
      assert.equal(r.statusCode, 200)
      assert.match(
        r.body,
        /<html lang="en" class="[^"]*\bfullpage-open\b/,
        'html wears fullpage-open'
      )
      assert.match(
        r.body,
        /<div id="modal" role="dialog" class="open fullpage( reading)?"/,
        'modal is full'
      )
      assert.match(r.body, /<h1 class="ptitle ptitle-display"/, 'title is pixel type')
      // the accessible name is still the words
      assert.ok(r.body.includes(`<span class="px-vh">`), 'title keeps its words')
    })
  }
})

// the same test off-cell.mjs applies, inline: rectangles on an
// integer viewBox, crispEdges, no curve, no circle, no rotation, no fade,
// and a word is <text> with no face of its own (the page's body face)
const onTheCell = (svg) =>
  /shape-rendering="crispEdges"/.test(svg) &&
  /viewBox="\d+ \d+ \d+ \d+"/.test(svg) &&
  ![...svg.matchAll(/\sd="([^"]*)"/g)].some((m) => /[cCsSqQtTaA]/.test(m[1])) &&
  !/<(circle|ellipse)\b|<text\b[^>]*\b(font-family|font|style)=|\btransform=|opacity=/.test(svg)

describe('case study: figures on the cell', () => {
  for (const { slug, md } of SOURCES) {
    // mutation: case-study-page.figure-off-cell
    it(`${slug}: every inline figure is drawn on the cell`, () => {
      for (const m of md.matchAll(/<svg\b[\s\S]*?<\/svg>/g)) {
        assert.ok(onTheCell(m[0]), `${slug}: ${m[0].slice(0, 90)}`)
        // drawn at a whole number of cells, never a fraction
        const [, w, h] = /width="(\d+)" height="(\d+)"/.exec(m[0]) || []
        assert.ok(w && h && w % 4 === 0 && h % 4 === 0, `${slug}: ${w}x${h} is off the cell`)
      }
    })
  }

  // mutation: case-study-page.figure-hand-edited
  it('every figure is what scripts/img/figures.mjs draws', () => {
    assert.doesNotThrow(() =>
      execFileSync(process.execPath, [join(ROOT, 'scripts/img/figures.mjs'), '--check'], {
        stdio: 'pipe',
      })
    )
  })
})

// A case study's rules: a white ground, no shadow, type a
// step down, a title that answers the pointer as the canvas's titles do, the
// site's own cursor in the figures, and no thumbnails in the page's nav.
const CSS = readFileSync(join(ROOT, 'src/static/css/canvas-home.css'), 'utf8')
const TOKENS = readFileSync(join(ROOT, 'primitives/kit/canvas-tokens.css'), 'utf8')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')
const FIGS = readFileSync(join(ROOT, 'scripts/img/figures.mjs'), 'utf8')
const CS_CSS = readFileSync(join(ROOT, 'src/static/css/case-study.css'), 'utf8')
// the prose's rules and the figures' each have one home (the snap): the page's
// own prose rules are entry.css's and its figure rules case-study.css's, and
// canvas-home.css keeps the page's ground and column
const ENTRY_CSS = readFileSync(join(ROOT, 'src/static/css/entry.css'), 'utf8')
const FLOW = readFileSync(join(ROOT, 'src/static/canvas/case-study.js'), 'utf8')
// the declarations of the one rule whose selector list is exactly `sel`
const rule = (sel, sheet = CSS) => {
  const i = sheet.indexOf(sel + ' {')
  return i < 0 ? '' : sheet.slice(i, sheet.indexOf('}', i))
}

describe('case study: the page rules', () => {
  // mutation: case-study-page.ground-ground
  it('a case-study page stands on --cv-white, a white of its own', () => {
    assert.match(TOKENS, /--cv-white: #ffffff;/)
    const r = rule('#modal.fullpage #sheet:has(> #sheetInner > h1.ptitle)')
    assert.match(r, /background: var\(--cv-white\);/)
    assert.match(r, /box-shadow: none;/)
    // experiments keep the ground
    assert.match(rule('#modal.fullpage #sheet'), /background: var\(--cv-ground\);/)
  })

  // mutation: case-study-page.card-cast
  it('the card throws no shadow in any state', () => {
    // the rule sits after every tile and pile rule that casts, at their
    // specificity, so it wins by order: resting, hover, relayed hover, focus,
    // and the pile's front (which is the card itself)
    const r = rule('.openable.cs-card .cell,\n.t-stack .facsimile.cs-card .cell')
    assert.match(r, /box-shadow: none;/)
    const at = CSS.indexOf('.openable.cs-card .cell,')
    for (const cast of ['.openable:hover .cell,', '.t-stack:hover .facsimile .cell,'])
      assert.ok(CSS.indexOf(cast) < at, `${cast} comes after the card's rule and wins`)
  })

  // The second review (2026-09-24): title and body on one ladder, figures
  // that belong to the white page, the page to the bottom of the frame, and
  // a nav that walks both ways with the collection at the foot.
  // mutation: case-study-page.two-scales
  it('title and prose share one ladder: half-cell title over the 16px body', () => {
    assert.match(
      rule('#modal.fullpage #sheetInner:has(> h1.ptitle) .prose', ENTRY_CSS),
      /font-size: var\(--cv-fs-0\);/
    )
    assert.match(
      rule('#modal.fullpage #sheetInner:has(> h1.ptitle) h1.ptitle'),
      /--tpx: calc\(var\(--cv-px\) \/ 2\);/
    )
    // no width sets the title at another pitch
    assert.equal(CSS.match(/h1\.ptitle \{\s*--tpx:/g).length, 1)
  })

  // mutation: case-study-page.figure-ground-ground
  it("a figure has no ground of its own, and its ground is the sheet, not the canvas's gray", () => {
    assert.match(
      rule('#modal.fullpage #sheetInner:has(> h1.ptitle) .figure', CS_CSS),
      /background: none;/
    )
    assert.match(CS_CSS, /\.cellfig \.f-p \{\n  fill: var\(--cv-white\);/)
  })

  // mutation: case-study-page.lavender-figure
  it('no figure has a lavender letter', () => {
    assert.doesNotMatch(CS_CSS, /\.cellfig \.l\b|cellfig[^}]*lavender/)
    assert.doesNotMatch(FIGS, /['"]l['"]/)
    for (const { slug, md } of SOURCES) assert.doesNotMatch(md, /class="l"/, slug)
  })

  // mutation: case-study-page.canvas-under-page
  it('a full page gets no inline height, so its 100dvh reaches the bottom', () => {
    assert.match(APP, /style\.minHeight = preview \|\| full \? ''/)
    assert.match(rule('#modal.fullpage #sheet'), /min-height: 100dvh;/)
  })

  // THE COLUMN IS THE TEXT'S MEASURE and ONE EDGE RULE. The sheet's 60ch paragraph cap is lifted on the
  // page, and the 50rem code strip is off it: a block is the column's
  // width or centred on its axis. The painted half is figure-fit.mjs
  // (measure and edges readings at 390, 768, 1280, 1440, 1920).
  // mutation: case-study-page.measure-capped, case-study-page.code-strip
  it('the column is the measure: no paragraph cap, no code strip', () => {
    assert.match(
      rule('#modal.fullpage #sheetInner:has(> h1.ptitle) .prose p', ENTRY_CSS),
      /max-width: none;/
    )
    assert.match(
      rule('#modal.fullpage #sheetInner:has(> h1.ptitle) .prose pre', ENTRY_CSS),
      /width: auto;\n  max-width: 100%;\n  margin-inline: 0;/
    )
  })

  // ONE AXIS: text and figures share one centred
  // column, wide enough to read as one piece; the two-track desk is gone.
  // The painted half is figure-fit.mjs (the column centred in the frame at
  // 390, 768, 1280, 1440 and 1920).
  // mutation: case-study-page.two-tracks
  it('one centred column, 72ch wide, and no second track for the figures', () => {
    assert.match(rule('#modal.fullpage #sheetInner:has(> h1.ptitle)'), /--cs-measure: 864px;/)
    assert.doesNotMatch(CSS, /@media \(min-width: 1202px\)/)
    // the only float on the page is the one the flow module hangs
    const page = CSS.slice(CSS.indexOf('THE CASE-STUDY PAGE'))
    const floats = [page, CS_CSS, ENTRY_CSS].flatMap((sheet) =>
      [...sheet.matchAll(/^([^\n]*)\{[^}]*float: (?!none)/gm)].map((m) => m[1].trim())
    )
    assert.deepEqual(floats, [
      '#modal.fullpage #sheetInner:has(> h1.ptitle) .prose > .fig-narrow.hung',
    ])
  })

  // NO FRAME ON ANY FIGURE: a UI, a diagram, a
  // photo, each stands as itself, no bordered box, no ground, no label over
  // it; its title is a plain caption line under it. figures.mjs still marks
  // the screens (a fact about the drawing), and no rule hangs on the mark.
  // mutation: case-study-page.figure-framed, case-study-page.caption-over, case-study-page.ui-unmarked
  it('no figure wears a frame, and its title is a caption under it', () => {
    const box = rule('#modal.fullpage #sheetInner:has(> h1.ptitle) .figure', CS_CSS)
    assert.match(box, /border: 0;/)
    assert.match(box, /padding: 0;/)
    assert.match(box, /background: none;/)
    assert.match(box, /flex-direction: column;/)
    const cap = rule('#modal.fullpage #sheetInner:has(> h1.ptitle) .figure-title', CS_CSS)
    assert.match(cap, /order: 1;/)
    assert.doesNotMatch(cap, /display: none/)
    assert.match(
      rule('#modal.fullpage #sheetInner:has(> h1.ptitle) .figure-note', CS_CSS),
      /order: 2;/
    )
    for (const sheet of [CSS, CS_CSS, ENTRY_CSS])
      assert.doesNotMatch(sheet, /\.figure:has\(> \.cf-ui\)/)
    assert.match(FIGS, /const ui = fig\.ui \? ' cf-ui' : ''/)
  })

  // THE TEXT FLOWS ROUND THE FIGURES WHERE THERE IS WIDTH: pretext lays the paragraphs after a narrow figure at the
  // width beside it and hangs the figure only where that text is wide
  // enough and outlasts it. The painted half is figure-fit.mjs (hung
  // figures on the column's edge, no line across one, none orphaned, none
  // below the width). These hold the module and its two thresholds.
  // mutation: case-study-page.flow-threshold, case-study-page.flow-orphan, case-study-page.flow-unchained, case-study-page.flow-retyped-font
  it("canvas/case-study.js hangs a figure by pretext, in the prose's own face, for every case study", async () => {
    assert.match(FLOW, /from '\/canvas\/vendor\/pretext\/layout\.js'/)
    assert.match(FLOW, /const MIN_BESIDE_CH = 60\n/)
    assert.match(FLOW, /const SPARE_LINES = 2\n/)
    assert.match(FLOW, /if \(have < need \+ SPARE_LINES \* lh\) fig\.classList\.remove\('hung'\)/)
    // the font is read from the paragraph, never retyped (font-rule)
    assert.match(
      FLOW,
      /`\$\{s\.fontStyle\} \$\{s\.fontWeight\} \$\{s\.fontSize\} \$\{s\.fontFamily\}`/
    )
    assert.doesNotMatch(FLOW, /px\s+['"]?DotGothic16|font\s*=\s*[`'"].*DotGothic16/)
    // served for every case study, both doors, and for no experiment
    for (const e of studies) {
      assert.deepEqual(
        entryJsModules(e),
        ['/canvas/case-study.js', '/canvas/code-refs.js', ...(e.extraJsModule || [])],
        e.slug
      )
      const page = await app.inject({
        method: 'GET',
        url: `/work/${e.slug}`,
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/128' },
      })
      assert.match(
        page.body,
        /<script type="module" src="\/canvas\/case-study\.js"><\/script>/,
        e.slug
      )
      assert.match(
        page.body,
        /<script type="module" src="\/canvas\/code-refs\.js"><\/script>/,
        e.slug
      )
      const embed = await app.inject({ method: 'GET', url: `/api/page/${e.slug}` })
      assert.ok(embed.json().modules.includes('/canvas/case-study.js'), e.slug)
    }
    for (const e of fullEntries)
      assert.ok(!entryJsModules(e).includes('/canvas/case-study.js'), e.slug)
  })

  // mutation: case-study-page.card-title-inert
  it('the pixel title raises the dust on the card, the page and the SSR page', () => {
    assert.match(APP, /if\(t\.kind === 'case study'\) dustTitle\(/)
    assert.match(APP, /dustTitle\(\$\('#sheetInner > h1\.ptitle'\)\);\n\}/)
    assert.match(APP, /dustUnder\(e\.target\?\.closest\?\.\('#sheetInner > h1\.ptitle'\)/)
  })

  // The fourth review (2026-09-24): the pixel face came into the figures,
  // and the figures got less responsive. A figure's words are the page's
  // body face; a figure fits a phone's column, scaling down, never scrolling.
  // mutation: case-study-page.figure-pixel-face, case-study-page.figure-face-css
  it("a figure's words are <text> in the body face, never pixel-type paths", () => {
    assert.doesNotMatch(FIGS, /pixel-type/)
    assert.match(CS_CSS, /\.cellfig text \{\n  font-family: var\(--cv-font\);/)
    for (const { slug, md } of SOURCES)
      for (const m of md.matchAll(/<svg class="cellfig[\s\S]*?<\/svg>/g))
        assert.match(m[0], /<text\b/, `${slug}: a figure with no words set as words`)
  })

  // mutation: figure-fit.scrolls, figure-fit.swap-off
  it('every figure fits a phone: it scales down, and a screen has a narrow draw', () => {
    assert.match(CS_CSS, /\.cellfig \{\n  display: block;\n  max-width: 100%;\n  height: auto;/)
    // the screen is hidden until its box has the screen's width
    assert.match(CS_CSS, /\.cellfig\.cf-wide \{\n  display: none;\n\}/)
    // the screen shows from thirteen modules, the density law's container
    // step (BIBLE.md section 8), scaled down to a box under its 688
    assert.match(
      CS_CSS,
      /@container \(min-width: 624px\) \{\n  \.cellfig\.cf-wide \{\n    display: block;/
    )
    assert.doesNotMatch(CS_CSS, /\.figure:has\(> \.cellfig\) \{\n  overflow-x: auto;/)
    // a drawing wider than a narrow figure (304 px) is a screen, shown only
    // where its box has room, and is followed by its narrow draw
    for (const { slug, md } of SOURCES)
      for (const m of md.matchAll(
        /<svg class="(cellfig[^"]*)"[^>]*\swidth="(\d+)"[\s\S]*?<\/svg>(<svg class="cellfig(?: cf-ui)? cf-narrow"[^>]*\swidth="(\d+)")?/g
      )) {
        if (/cf-narrow$/.test(m[1])) continue
        if (+m[2] <= 304) continue
        assert.match(
          m[1],
          /^cellfig(?: cf-ui)? cf-wide$/,
          `${slug}: a ${m[2]}px drawing is not marked a screen`
        )
        assert.ok(m[4] && +m[4] <= 304, `${slug}: a ${m[2]}px screen has no narrow draw`)
      }
  })

  // The fifth review (2026-09-24): the figures centred in the column at
  // every width, and
  // the documented case-study primitives this branch had deleted, back.
  // mutation: figure-fit.off-centre
  // The sheet's rule (figures fill the column) outranked the percentage caps
  // for as long as both were written; one home kept the one that painted.
  it('every figure is centred: its drawing in its box, its box on the column', () => {
    assert.match(
      CS_CSS,
      /\.figure > \.cellfig,\n\.figure > img,\n\.figure > video \{\n  margin-inline: auto;/
    )
    assert.match(
      CS_CSS,
      /\.fig-narrow,\n\.fig-mid,\n\.fig-wide \{\n  max-width: 100%;\n  margin-inline: auto;/
    )
  })

  // mutation: case-study-page.primitives-deleted
  it('the documented case-study primitives are still there', () => {
    // (.unit-pict and .inline-token had no content using them and went with
    // the kit; the grid they sat in is still the kit for a dictogram)
    for (const sel of ['.unit-grid {', '.pipeline {', '.math-aside {'])
      assert.ok(CS_CSS.includes('\n' + sel), sel)
  })
})

// Experiment pages let the canvas peek out at the bottom
// too; fix it in the shared shell, not per kind. The painted half of this is
// scripts/verify/page-ground.mjs (a browser, both sizes, scrolled to the end);
// these hold the two halves of the shell it measures.
const fullEntries = (await loadFeedEntries()).filter((e) => isFullPage(e) && !isCaseStudy(e))

describe('every full page: one shell', () => {
  it('there are full pages other than case studies to hold to this', () => {
    assert.ok(fullEntries.length >= 1, `found ${fullEntries.length}`)
  })

  for (const e of fullEntries) {
    // mutation: page-ground.experiment-direct-not-full
    it(`/${e.slug} arrives as the full page the canvas opens`, async () => {
      const r = await app.inject({
        method: 'GET',
        url: `/${e.slug}`,
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/130' },
      })
      assert.equal(r.statusCode, 200)
      assert.match(
        r.body,
        /<div id="modal" role="dialog" class="open fullpage( reading)?"/,
        'modal is full'
      )
      // the canvas paints an experiment's title plain; only a case study
      // sets it in the pixel face
      assert.match(r.body, /id="sheetInner"><h1>/, 'plain title')
    })
  }

  // mutation: page-ground.bounce
  it("a full page's scroller does not bounce the canvas into view", () => {
    assert.match(rule('#modal.fullpage #mscroll'), /overscroll-behavior-y: none;/)
  })
})

// The search bar is not visible with an experiment open;
// it sits at the collection layer at most. The layer is marked on <html>
// (item-open) by the server for a direct load and by paintSheet for a page
// the canvas opens, and the bar reads the layer, not the full-page skin. On
// main a direct load of /web-instruments was a sheet and the bar floated over it.
// The painted half is page-ground.mjs (bar reading, both doors, both sizes,
// with /work and /feed as the collection layer that keeps it).
describe('the bar sits at the collection layer at most', () => {
  // mutation: page-ground.bar-on-item
  it('an item hides the bar, by its layer', () => {
    assert.match(rule('html.item-open #topbar'), /display: none;/)
    assert.doesNotMatch(CSS, /html\.fullpage-open #topbar/)
  })

  for (const url of [...fullEntries.map((e) => `/${e.slug}`), `/work/${studies[0].slug}`]) {
    // mutation: page-ground.item-unmarked
    it(`${url} arrives marked as the item layer`, async () => {
      const r = await app.inject({
        method: 'GET',
        url,
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/130' },
      })
      assert.match(r.body, /<html lang="en" class="[^"]*\bitem-open\b/)
    })
  }
  it('a collection is not the item layer', async () => {
    for (const url of ['/feed', '/work']) {
      const r = await app.inject({
        method: 'GET',
        url,
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/130' },
      })
      assert.doesNotMatch(r.body, /<html lang="en" class="[^"]*\bitem-open\b/, url)
    }
  })
  // mutation: page-ground.item-unmarked-client
  it('the canvas marks the layer when it opens a page', () => {
    assert.match(
      APP,
      /document\.documentElement\.classList\.toggle\('item-open', !SECTIONS\[slug\]\);/
    )
    assert.match(APP, /classList\.remove\('fullpage-open', 'item-open'\)/)
  })
})
