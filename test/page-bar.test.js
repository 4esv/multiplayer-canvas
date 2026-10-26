// test/page-bar.test.js
// ONE navigation for every full page, and the same control on
// the ground.
//
// The problem: a case study ended in a packed UI at the bottom (four
// truncated titles in a foot dock), an experiment wore its own pinned UI
// up top (two corner boxes), and the piles turned with square dots and
// arrows. The intuition someone builds using one side of the site should
// work on the other.
//
// So: the kit's snap scrollbar (primitives/kit/kit-scroll.js) turns the piles, and every
// full page, a case study or an experiment, opened from the canvas or loaded
// direct, carries exactly one page bar at the top of its sheet and no other
// previous/next anywhere. The bar is a strip of TABS, the way a browser
// holds its pages: one tab a page of the
// ring, each a real link, exactly one lit (aria-current), the close box on
// the lit tab, the corner close at the bar's right end going to the same
// place, and nothing else. The bar is stuck to the top of the
// scroll owner, the ring never mixes kinds, a tab never shrinks under a
// readable title (a strip too long for its bar scrolls sideways instead,
// the lit tab brought into view), the arrows walk the tabs, and a tab switches its page in place
//, never by the round trip through the collection. The way back to the top is the
// foot of a long page, where the web puts it.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from '../src/server.js'
import { loadFeedEntries } from '../src/routes/feed.js'
import { backTo, isFullPage, kindOf, pathFor } from '../src/lib/entry-kind.js'
import { litIntoView, pageBarMarkup, scrollMarkup, wireTabs } from '../primitives/kit/kit-scroll.js'
import { PILE, TILES, pileGeometry } from '../src/static/canvas/layout.js'
import { cssRules } from './lib/cascade.js'

const ROOT = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const APP = read('src/static/canvas/app.js')
const CSS = read('src/static/css/canvas-home.css')
const KIT = read('primitives/kit/kit.css')
const SHEETS = read('src/lib/canvas-sheets.js')
const HOME = read('src/templates/canvas/home.njk')
const KIT_JS = read('src/static/js/kit.js')
const KIT_NJK = read('src/templates/kit/index.njk')
const RULES = cssRules(CSS)
const rule = (sel) =>
  RULES.filter((r) => r.selectors.some((s) => s.trim() === sel))
    .map((r) => r.decls.map((d) => `${d.prop}: ${d.value};`).join('\n  '))
    .join('\n')
const fn = (src, open) => {
  const i = src.indexOf(open)
  assert.ok(i > -1, `${open} is gone`)
  return src.slice(i, src.indexOf('\n}\n', i))
}

const entries = (await loadFeedEntries()).filter((e) => !e.hidden)
const full = entries.filter((e) => isFullPage(e))
const ofKind = (e) => full.filter((x) => kindOf(x) === kindOf(e))

let app
before(async () => {
  app = await build({ logger: false })
})
after(async () => {
  await app.close()
})

describe('the page bar: one navigation for every full page', () => {
  it('there are full pages of two kinds to hold to this', () => {
    assert.ok(new Set(full.map(kindOf)).size >= 2)
  })

  for (const e of full) {
    // mutation: page-bar.ssr-no-bar, page-bar.foot-dock-back, page-bar.ring-mixes-kinds, page-bar.no-corner-close
    it(`${pathFor(e)} arrives with one bar at the top of its sheet and no other way on`, async () => {
      const r = await app.inject({ method: 'GET', url: pathFor(e) })
      assert.equal(r.statusCode, 200)
      const bars = r.body.match(/<nav class="k-bar"/g) || []
      assert.equal(bars.length, 1, 'one bar')
      // the bar is the sheet's first child, before the body, so it is the
      // sheet's full width and can stick to the scroll owner's top
      assert.match(r.body, /<div id="sheet" tabindex="-1"><nav class="k-bar"[ >]/)
      // and nothing else on the page goes back, on or up
      for (const dead of ['k-dock', 'id="pageNav"', 'id="toTop"', 'class="backlink"'])
        assert.ok(!r.body.includes(dead), `${dead} is on the page beside the bar`)
      // cut to the bar's own close: the chrome's landmark is a <nav> too
      const at = r.body.indexOf('<nav class="k-bar"')
      const bar = r.body.slice(at, r.body.indexOf('</nav>', at) + 6)
      // a tab a page of the ring, in the list's order, each a real link
      const mine = ofKind(e)
      const hrefs = [...bar.matchAll(/<a class="k-tab-go" href="([^"]+)"/g)].map((m) => m[1])
      assert.deepEqual(hrefs, mine.map(pathFor), 'the tabs are the ring of its own kind')
      assert.equal(bar.includes('k-scroll'), false, 'the scrollbar is back in the bar')
      assert.doesNotMatch(bar, /k-top|back to the top/, 'the way back to the top is in the bar')
      // exactly one lit tab, and it is this page
      const lit = [
        ...bar.matchAll(
          /<div class="k-tab is-on"><a class="k-tab-go" href="([^"]+)" tabindex="0" aria-current="page">/g
        ),
      ]
      const strip = bar.slice(0, bar.indexOf('<button'))
      assert.equal((strip.match(/aria-current=/g) || []).length, 1, 'one tab is the page')
      assert.deepEqual(
        lit.map((m) => m[1]),
        [pathFor(e)]
      )
      // the close box is on the lit tab and nowhere else, and it goes where
      // the kind came from
      assert.equal((bar.match(/k-close/g) || []).length, 1, 'one close box')
      const litTab = bar.slice(bar.indexOf('<div class="k-tab is-on">'))
      assert.match(
        litTab.slice(0, litTab.indexOf('</div>')),
        new RegExp(`<a class="k-btn k-ico k-close" href="${backTo(e).path}"`),
        'the close box is not on the lit tab'
      )
      // and the corner close ends the bar, after the strip, going the same
      // way, named by the word it shows
      assert.match(
        bar,
        new RegExp(
          `</div><a class="k-btn page-x" href="${backTo(e).path}" aria-label="Close: [^"]+">` +
            `<svg[^]*?</svg><span class="page-x-word">Close</span></a></nav>$`
        ),
        'the corner close is not at the end of the bar'
      )
      // and the bar is the one function on both sides
      const i = mine.findIndex((x) => x.slug === e.slug)
      assert.equal(
        bar,
        pageBarMarkup({
          label: kindOf(e) === 'case-study' ? 'Case Studies' : '',
          close: backTo(e),
          ring: mine.map((x) => ({ title: x.title, path: pathFor(x) })),
          at: i,
        })
      )
      // every page of the ring whole, one box away: the box counts where
      // this page is in how many and opens the list, a real link a row,
      // each by its full title and its summary, this page the lit row
      if (mine.length < 2) return
      assert.match(
        bar,
        new RegExp(
          `<button type="button" class="k-ring-v" popovertarget="k-ring" aria-label="[^"]+, ${i + 1} of ${mine.length}">`
        ),
        'the v does not open the ring, or does not say where this page is in it'
      )
      const list = bar.slice(bar.indexOf('<div class="k-menu k-ring" id="k-ring" popover'))
      assert.ok(list.length < bar.length, 'the box opens no list')
      const rows = [
        ...list.matchAll(
          /<a class="k-btn k-ring-go( is-on)?" href="([^"]+)"[^>]*><span class="k-ring-t">([^<]*)<\/span>(?:<span class="k-meta">([^<]*)<\/span>)?<\/a>/g
        ),
      ]
      assert.deepEqual(
        rows.map((m) => m[2]),
        mine.map(pathFor),
        'the list is not the ring'
      )
      const plain = (s) =>
        (s || '')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
      assert.deepEqual(
        rows.map((m) => plain(m[3])),
        mine.map((x) => x.title),
        'a row cuts its title'
      )
      // a quick switcher: titles only
      assert.ok(!list.includes('k-meta'), 'a row carries a description again')
      assert.deepEqual(
        rows.flatMap((m, k) => (m[1] ? [k] : [])),
        [i],
        'the lit row is not this page'
      )
    })
  }

  // The content above may hold one page of each kind, and a ring of one has
  // no neighbour to light, no other tab to close and no list to open. So the
  // bar is drawn here for a ring of three, the middle one lit, and held to
  // the same rules.
  // mutation: page-bar.close-on-every-tab, page-bar.two-lit, page-bar.ring-summary-back, page-bar.ring-list-missing
  it('holds a ring of three: one lit tab, one close box, and the list of titles', () => {
    const ring = ['/a', '/b', '/c'].map((path, k) => ({ title: `Page ${k + 1}`, path }))
    const close = { path: '/work', label: 'Work' }
    const bar = pageBarMarkup({ label: 'Case Studies', close, ring, at: 1 })
    const strip = bar.slice(0, bar.indexOf('<button'))
    assert.equal((strip.match(/aria-current=/g) || []).length, 1, 'one tab is the page')
    assert.match(strip, /<a class="k-tab-go" href="\/b" tabindex="0" aria-current="page">/)
    assert.equal((bar.match(/k-close/g) || []).length, 1, 'one close box')
    const litTab = bar.slice(bar.indexOf('<div class="k-tab is-on">'))
    assert.match(
      litTab.slice(0, litTab.indexOf('</div>')),
      /<a class="k-btn k-ico k-close" href="\/work"/,
      'the close box is not on the lit tab'
    )
    assert.match(
      bar,
      /<button type="button" class="k-ring-v" popovertarget="k-ring" aria-label="Case Studies, 2 of 3">/,
      'the v does not open the ring, or does not say where this page is in it'
    )
    const list = bar.slice(bar.indexOf('<div class="k-menu k-ring" id="k-ring" popover'))
    assert.ok(list.length < bar.length, 'the box opens no list')
    const rows = [
      ...list.matchAll(
        /<a class="k-btn k-ring-go( is-on)?" href="([^"]+)"[^>]*><span class="k-ring-t">([^<]*)<\/span><\/a>/g
      ),
    ]
    assert.deepEqual(
      rows.map((m) => [m[2], m[3]]),
      ring.map((r) => [r.path, r.title]),
      'the list is not the ring, by its titles'
    )
    assert.ok(!list.includes('k-meta'), 'a row carries a description again')
    assert.deepEqual(
      rows.flatMap((m, k) => (m[1] ? [k] : [])),
      [1],
      'the lit row is not this page'
    )
  })

  // mutation: page-bar.client-no-bar, page-bar.corner-nav-back, page-bar.corner-close-dead
  it('the canvas paints the same bar, and nothing of the old three', () => {
    // a click and a direct load both end in paintPageBar, which draws the
    // one markup from the page's ring
    const paint = fn(APP, 'function paintPageBar(slug){')
    assert.match(
      paint,
      /const all = pageRing\(slug\);\n\s*const ring = all\.includes\(slug\) \? all : \[slug\];/
    )
    assert.match(paint, /pageBarMarkup\(\{/)
    // a tab's plain click switches to its page in place, the lit one stays,
    // the arrows walk the strip, and both closes close
    assert.match(paint, /if\(k !== i\) switchTab\(ring\[k\]\);/)
    assert.match(paint, /bar\.querySelectorAll\('\.k-close, \.page-x'\)/)
    assert.match(paint, /wireTabs\(strip\);/)
    assert.match(fn(APP, 'function adoptSsrSheet(slug){'), /paintPageBar\(slug\)/)
    const sheet = fn(APP, 'function paintSheet(slug){')
    assert.match(sheet, /openChrome\([^\n]*\);\n\s*paintPageBar\(slug\);/)
    // a full page's body has no foot of its own any more
    assert.match(
      fn(APP, 'async function mountEmbed(p, slug){'),
      /const back = isFull\(slug\)\n\s*\? ''/
    )
    // the corner nav, the foot dock and the foot's to-top are gone, in the
    // script, the sheet builder and the stylesheet alike
    for (const dead of ['pageNav', 'studyWalk', 'addToTop', '#toTop', 'k-dock'])
      assert.ok(!APP.includes(dead), `app.js still carries ${dead}`)
    for (const dead of ['studyWalk', 'k-dock'])
      assert.ok(!SHEETS.includes(dead), `canvas-sheets.js still carries ${dead}`)
    for (const dead of ['#pageNav', '#toTop', '.k-dock'])
      assert.ok(!CSS.includes(dead), `canvas-home.css still styles ${dead}`)
    // the shell seats the server's bar where the script seats its own
    assert.ok(
      HOME.includes(
        '<div id="sheet" tabindex="-1">{% if sheet and sheet.bar %}{{ sheet.bar | safe }}{% endif %}<div class="inner" id="sheetInner">'
      )
    )
  })

  // mutation: page-bar.switch-round-trip, page-bar.switch-lane, page-bar.switch-no-frames, page-bar.link-round-trip, page-bar.close-keeps-lane
  it('a tab switches its page in place, in frames, and never by the round trip', () => {
    const sw = fn(APP, 'function switchTab(slug){')
    // nothing closes, nothing shrinks into a card or grows out of one, the
    // collection behind is not walked and the canvas never shows
    for (const trip of [
      'closePage(',
      'paintSheet(',
      'openChrome(',
      'growFrom(',
      'shrinkTo(',
      'zoomRects(',
      'centreLaneOn(',
    ])
      assert.ok(!sw.includes(trip), `a tab switch runs ${trip}`)
    // the page swaps where it stands: the address follows without a new
    // history entry, the room and the reader are told, the body mounts
    assert.match(sw, /history\.replaceState\(/)
    assert.match(sw, /announcePlace\(\);/)
    assert.match(sw, /reader\?\.stop\(\);/)
    assert.match(sw, /mountEmbed\(p, slug\);/)
    assert.match(sw, /paintPageBar\(slug\);/)
    // in the site's frames on the quick token, and none under reduced motion
    assert.match(sw, /if\(REDUCED\) return;\n[^]*inner\.classList\.add\('tab-in'\);/)
    assert.match(
      rule('#sheetInner.tab-in'),
      /animation: cv-tab-in var\(--cv-dur-quick\) var\(--cv-ease-step\) both;/
    )
    assert.match(CSS, /@keyframes cv-tab-in \{\n\s*from \{\n\s*clip-path: inset\(0 0 100% 0\);/)
    // the bar no longer walks the collection's lane on every paint; the
    // courtesy runs once, at the door, under the page
    assert.ok(!fn(APP, 'function paintPageBar(slug){').includes('centreLaneOn('))
    assert.match(
      fn(APP, 'function paintSheet(slug){'),
      /if\(wasPreview\) centreLaneOn\(wasPreview\.def\.slug, true\);/
    )
    // a hop between two pages of one ring by any other door (a link in the
    // prose, a follower) is the same switch, and so is the swipe
    assert.match(
      fn(APP, 'function openPage(slug){'),
      /if\(isFull\(curSheet\) && isFull\(slug\) && pageRing\(curSheet\)\.includes\(slug\)\)\{ switchTab\(slug\); return; \}/
    )
    assert.match(APP, /switchTab\(ring\[\(i \+ by \+ ring\.length\) % ring\.length\]\);/)
  })

  // mutation: page-bar.top-in-bar, page-bar.foot-always, page-bar.foot-twice, page-bar.foot-shows-short, page-bar.foot-not-at-end
  it('the way back to the top is the foot of a long page, never the bar', () => {
    // the bar carries its tabs and nothing else
    const bar = pageBarMarkup({
      label: 'x',
      close: { path: '/', label: 'canvas' },
      ring: [{ title: 'a', path: '/a' }],
      at: 0,
    })
    assert.doesNotMatch(bar, /k-top|back to the top/i, 'the way back to the top is in the bar')
    for (const [file, text] of [
      ['app.js', APP],
      ['canvas-home.css', CSS],
    ])
      assert.ok(!text.includes('.k-top'), `${file} still carries the bar's .k-top`)
    const foot = fn(APP, 'function footTop(){')
    // one foot a page: a repaint takes the last one away before adding its own
    assert.match(foot, /inner\.querySelector\(':scope > \.page-foot'\)\?\.remove\(\);/)
    // after the last of the content, in the page's flow
    assert.match(foot, /inner\.appendChild\(foot\);/)
    // one outline button that says what it does, and nothing beside it
    assert.match(
      foot,
      /foot\.innerHTML = `<button type="button" class="k-btn to-top">\$\{UP_GLYPH\}<span>Back to the Top<\/span><\/button>`;/
    )
    // only on a long page: its scroll owner over two screens tall, hidden
    // until measured, and the stylesheet honours the hidden
    assert.match(foot, /foot\.hidden = true;/)
    assert.match(foot, /foot\.hidden = sc\.scrollHeight <= 2 \* sc\.clientHeight;/)
    assert.match(rule('#sheetInner > .page-foot[hidden]'), /display: none;/)
    // both ways a full page arrives end in it
    assert.match(fn(APP, 'function adoptSsrSheet(slug){'), /if\(full\) footTop\(\);/)
    assert.match(
      fn(APP, 'async function mountEmbed(p, slug){'),
      /if\(isFull\(slug\)\) footTop\(\);/
    )
  })

  // mutation: page-bar.not-sticky, page-bar.strip-clips, page-bar.bar-selectable, page-bar.tab-is-button, page-bar.lit-tab-off-page
  it('the bar sticks to the top of the scroll owner and publishes its height', () => {
    const bar = rule('#modal.fullpage #sheet > .k-bar')
    assert.match(bar, /position: sticky;/)
    assert.match(bar, /top: 0;/)
    assert.match(bar, /background: inherit;/, "the sheet's own ground, never a third")
    // the full page scrolls #mscroll, and the bar is inside it
    assert.match(rule('#mscroll'), /overflow-y: auto;/)
    // the tabs' twelve cells, a cell of air and the rule's cell
    assert.match(rule('#modal.fullpage #sheet'), /--page-bar-h: calc\(15 \* var\(--cv-px\)\);/)
    assert.match(bar, /height: var\(--page-bar-h\);/)
    // the strip is its own sideways scroller, snapping to a tab, rather
    // than a box that clips what does not fit
    const strip = rule('#modal.fullpage #sheet > .k-bar > .k-tabs')
    assert.match(strip, /overflow-x: auto;/)
    assert.match(strip, /scroll-snap-type: x /)
    assert.match(strip, /min-width: 0;/)
    // a tab is the kit's card tab:
    // open at the foot, the lit one a cell taller on the page's own ground
    const kit = cssRules(KIT)
    const kitRule = (sel) =>
      kit
        .filter((r) => r.selectors.some((x) => x.trim() === sel))
        .map((r) => r.decls.map((d) => `${d.prop}: ${d.value};`).join('\n'))
        .join('\n')
    assert.match(kitRule('.k-tab'), /border-bottom: 0;/)
    assert.doesNotMatch(kitRule('.k-tab'), /border-image/, 'a tab is a baked button again')
    assert.match(kitRule('.k-tab.is-on'), /height: calc\(var\(--cv-ctrl-h\) \+ var\(--cv-px\)\);/)
    assert.match(rule('#modal.fullpage #sheet > .k-bar .k-tab.is-on'), /background-color: inherit;/)
    // and nothing in the bar is words to select: a drag across the page
    // selects the prose, never the tabs over it
    assert.match(bar, /user-select: none;/)
    // the head clears nothing: the bar is in the flow above it
    assert.doesNotMatch(
      rule('#modal.fullpage #sheetInner'),
      /var\(--cv-ctrl-h\)\) var\(--cv-sp-6\)/
    )
  })

  // mutation: page-bar.tab-floor-unreadable, page-bar.tabs-shrink-on-phone, page-bar.strip-clips
  it('a tab never shrinks under a readable title: a strip that does not fit scrolls', () => {
    // six tabs at 390 used to read "D..", "R..": a far tab shrank to a
    // sliver so the strip would never scroll. Now every tab keeps a floor
    // of sixteen characters of its title (a character of the face is two
    // cells at the body size, and the face has a two-cell rim each side)
    const sheet = rule('#modal.fullpage #sheet')
    const floor = sheet.match(/--tab-min: calc\((\d+) \* var\(--cv-px\)\);/)
    assert.ok(floor, 'the strip publishes its tab floor as --tab-min')
    assert.ok(Number(floor[1]) >= 16 * 2 + 2 * 2, `a ${floor[1]}-cell tab floor cuts a title short`)
    const tab = rule('#modal.fullpage #sheet > .k-bar .k-tab')
    assert.match(tab, /min-width: var\(--tab-min\);/)
    assert.match(tab, /scroll-snap-align: /)
    // the lit tab's floor is the same title plus its close box
    assert.match(
      rule('#modal.fullpage #sheet > .k-bar .k-tab.is-on'),
      /min-width: calc\(var\(--cv-ctrl-h\) \+ var\(--tab-min\)\);/
    )
    // and nowhere, at any width, does a tab of the bar take a lower floor
    const floors = RULES.filter((r) =>
      r.selectors.some((x) => x.trim().startsWith('#modal.fullpage #sheet > .k-bar .k-tab'))
    ).flatMap((r) =>
      r.decls
        .filter((d) => d.prop === 'min-width')
        .map((d) => `${r.selectors.join(', ')}${r.media.length ? ` @${r.media}` : ''}: ${d.value}`)
    )
    assert.ok(floors.length >= 2, 'the tab floors are gone')
    for (const f of floors) assert.match(f, /var\(--tab-min\)/, f)
    // the strip scrolls, and the corner close is outside it, so it never
    // scrolls away
    assert.match(rule('#modal.fullpage #sheet > .k-bar > .k-tabs'), /overflow-x: auto;/)
    assert.match(rule('#modal.fullpage #sheet > .k-bar > .page-x'), /flex: none;/)
    const bar = pageBarMarkup({
      label: 'x',
      close: { path: '/work', label: 'x' },
      ring: [{ title: 'a', path: '/a' }],
    })
    assert.match(bar, /<div class="k-tabs">.*<\/div><a class="k-btn page-x"/)
  })

  // mutation: page-bar.phone-keeps-strip, page-bar.phone-tab-not-dropdown, page-bar.phone-two-x, page-bar.ring-hidden-on-watch, page-bar.ring-closed-drawn, page-bar.ring-row-round-trip, page-bar.ring-row-cut, page-bar.ring-rows-unruled, page-bar.ring-lit-inverted
  it('on a phone the bar is one tab, the v and the X, and the list reads every page whole', () => {
    // the strip was the phone's only way to the other pages, and at 390 it
    // showed one and a half truncated titles.
    const at = (sel, media) =>
      RULES.filter(
        (r) =>
          r.selectors.some((s) => s.trim() === sel) &&
          (media ? r.media.some((m) => m.includes(media)) : !r.media.length)
      )
        .flatMap((r) => r.decls.map((d) => `${d.prop}: ${d.value};`))
        .join(' ')
    const ph = '#modal.fullpage #sheet > .k-bar:has(> .k-ring-v) .k-tab'
    assert.match(at(`${ph}:not(.is-on)`, 'max-width: 1007.98px'), /display: none;/)
    assert.match(at(`${ph}.is-on`, 'max-width: 1007.98px'), /max-width: none;/)
    assert.match(at(`${ph}.is-on > .k-close`, 'max-width: 1007.98px'), /display: none;/, 'two Xs')
    // and the one tab is the dropdown
    const paintSrc = fn(APP, 'function paintPageBar(')
    assert.match(paintSrc, /else if\(list && PHONE_BAR\.matches\) list\.togglePopover\(\)/)
    assert.match(APP, /const PHONE_BAR = matchMedia\('\(max-width: 560px\)'\)/)
    // a small screen (and the watch, whose chrome menus are all put away)
    // still opens the page's own list
    assert.match(
      at('#modal.fullpage #sheet > .k-bar > .k-ring:popover-open', '359.98px'),
      /display: flex/
    )
    // a menu is a flex box, which outranks the platform's hiding of a
    // closed popover: closed must be said again or the list is always open
    assert.match(
      at('#modal.fullpage #sheet > .k-bar > .k-ring:not(:popover-open)'),
      /display: none;/
    )
    // the rows are tabs laid flat: the tabs' colours, a rule between two, the
    // lit one on the page's ground
    assert.match(
      at('#modal.fullpage #sheet > .k-bar > .k-ring > .k-ring-go + .k-ring-go'),
      /border-top: var\(--cv-px\) solid var\(--cv-ink\);/
    )
    assert.match(
      at('#modal.fullpage #sheet > .k-bar > .k-ring > .k-ring-go'),
      /background: var\(--cv-ground\);[^]*color: var\(--cv-mute\);/
    )
    assert.match(
      at('#modal.fullpage #sheet > .k-bar > .k-ring > .k-ring-go.is-on'),
      /background-color: inherit;[^]*color: var\(--cv-ink\);/
    )
    // a row wraps: the title is never cut, which is the list's whole job
    assert.match(
      at('#modal.fullpage #sheet > .k-bar > .k-ring > .k-ring-go'),
      /white-space: normal;/
    )
    // and a row switches in place, the way a tab does, never the round trip
    const paint = fn(APP, 'function paintPageBar(')
    assert.match(paint, /querySelectorAll\('\.k-ring-go'\)[^]*?switchTab\(ring\[k\]\)/)
    // a ring of one has nothing to choose between
    const one = pageBarMarkup({
      label: 'x',
      close: { path: '/', label: 'x' },
      ring: [{ title: 'a', path: '/a' }],
    })
    assert.ok(!one.includes('k-ring-v'), 'a ring of one carries a v')
  })

  // mutation: page-bar.lit-not-scrolled
  it('the lit tab is brought into view whenever the bar is painted', () => {
    // paintPageBar is the one door: an open, a direct load (adoptSsrSheet)
    // and a tab switch all paint the bar through it
    const paint = fn(APP, 'function paintPageBar(slug){')
    assert.match(paint, /litIntoView\(strip\);/)
    for (const open of ['function adoptSsrSheet(slug){', 'function switchTab(slug){'])
      assert.match(fn(APP, open), /paintPageBar\(slug\);/, open)
  })

  // mutation: page-bar.lit-off-centre
  it('litIntoView centres the lit tab, clamps at the ends and leaves a strip that fits', () => {
    const strip = (tabs, at, width) => {
      const lit = { offsetLeft: at * 150, offsetWidth: 150 }
      return {
        clientWidth: width,
        scrollWidth: tabs * 150,
        scrollLeft: 0,
        querySelector: (sel) => (sel === '.k-tab.is-on' ? lit : null),
      }
    }
    // six tabs of 150 in a 300 strip: the fourth sits in the middle
    const mid = strip(6, 3, 300)
    litIntoView(mid)
    assert.equal(mid.scrollLeft, 3 * 150 + 75 - 150)
    // the first cannot be centred: the strip stays at its start
    const first = strip(6, 0, 300)
    litIntoView(first)
    assert.equal(first.scrollLeft, 0)
    // the last clamps to the end of the strip
    const last = strip(6, 5, 300)
    litIntoView(last)
    assert.equal(last.scrollLeft, 6 * 150 - 300)
    // a strip that fits is left alone
    const fits = strip(3, 2, 600)
    fits.scrollLeft = 7
    litIntoView(fits)
    assert.equal(fits.scrollLeft, 7)
  })

  // mutation: page-bar.sheet-focus-ring
  it('the sheet, a programmatic focus target, paints no focus ring', () => {
    // openPage focuses #sheet (tabindex -1, never a Tab stop) so the keyboard
    // starts inside the page; Chrome then matched :focus-visible on a plain
    // click in the prose and a 3px ink frame went round the whole page
    assert.match(HOME, /<div id="sheet" tabindex="-1">/)
    assert.match(APP, /\$\('#sheet'\)\.focus\(/)
    assert.match(rule('#sheet:focus'), /^outline: none;$/m)
    const ring = RULES.filter((r) =>
      r.selectors.some((x) => /^#sheet:focus(-visible)?$/.test(x.trim()))
    ).flatMap((r) => r.decls.filter((d) => /^outline/.test(d.prop) && d.value !== 'none'))
    assert.deepEqual(ring, [], 'a rule draws a ring on the sheet')
  })

  // mutation: page-bar.head-stacked
  it("an experiment's head is one line under the bar, so the app gets the room", () => {
    assert.match(
      rule('#modal.fullpage #sheetInner:not(:has(> h1.ptitle)) > h1'),
      /display: inline;/
    )
    assert.match(
      rule('#modal.fullpage #sheetInner:not(:has(> h1.ptitle)) > .meta'),
      /display: inline;/
    )
    assert.match(rule('#modal.fullpage #sheet'), /--page-head-h: /)
  })

  // mutation: page-bar.slider-unnamed
  it('the snap scrollbar says what it is: a slider over N, its steppers named', () => {
    const flat = scrollMarkup({ titles: ['a', 'b', 'c'], at: 1, label: 'which' })
    assert.match(
      flat,
      /<div class="k-track" role="slider" tabindex="0" aria-orientation="horizontal"/
    )
    assert.match(flat, /aria-valuemin="1" aria-valuemax="3" aria-valuenow="2" aria-valuetext="b"/)
    assert.match(
      flat,
      /<button type="button" class="k-btn k-ico k-step k-prev" aria-label="previous: a">/
    )
    assert.match(
      flat,
      /<button type="button" class="k-btn k-ico k-step k-next" aria-label="next: c">/
    )
    const up = scrollMarkup({ titles: ['a', 'b'], at: 1, vert: true, hrefs: ['/a', '/b'] })
    assert.match(up, /class="k-scroll k-vert"/)
    assert.match(up, /aria-orientation="vertical"/)
    // the ring wraps: after b comes a, and a link steps there
    assert.match(up, /<a class="k-btn k-ico k-step k-next" href="\/a" aria-label="next: a">/)
    // the specimen shows it working both ways
    assert.match(
      KIT_JS,
      /import \{ scrollMarkup, wireScroll \} from 'multiplayer-canvas\/kit\/scroll'/
    )
    assert.ok(KIT_NJK.includes('data-scrollbar>') && KIT_NJK.includes('data-scrollbar="vert"'))
  })

  // mutation: page-bar.tabs-walk-dead
  it('the arrows walk the tabs, wrapping, and one tab holds the Tab stop', () => {
    // a roving tabindex, run on a strip of four stand-in links
    const links = [0, 1, 2, 3].map((n) => ({
      n,
      tabIndex: n === 1 ? 0 : -1,
      focus() {
        globalThis.document.activeElement = this
      },
    }))
    let onKey
    const strip = {
      querySelectorAll: () => links,
      addEventListener: (type, fn) => {
        if (type === 'keydown') onKey = fn
      },
    }
    const saved = globalThis.document
    globalThis.document = { activeElement: links[1] }
    try {
      wireTabs(strip)
      const press = (key) => onKey({ key, preventDefault() {}, stopPropagation() {} })
      press('ArrowRight')
      assert.equal(document.activeElement.n, 2)
      press('ArrowRight')
      press('ArrowRight')
      assert.equal(document.activeElement.n, 0, 'the strip wraps')
      press('ArrowLeft')
      assert.equal(document.activeElement.n, 3, 'and back again')
      press('Home')
      assert.equal(document.activeElement.n, 0)
      assert.deepEqual(
        links.map((l) => l.tabIndex),
        [0, -1, -1, -1],
        'one tab, the one reached, holds the Tab stop'
      )
    } finally {
      globalThis.document = saved
    }
  })

  // mutation: page-bar.pile-flush
  it("the pile's scrollbar stands a few cells short of the pile at each end", () => {
    assert.ok(PILE.pagerInset >= 2 * PILE.step, 'the pager runs flush with the pile')
    for (const t of TILES.filter((x) => x.type === 'stack')) {
      const g = pileGeometry(t)
      const pileH = g.card.h + PILE.backs * PILE.step
      assert.equal(g.pager.h, pileH - 2 * PILE.pagerInset, `${t.id}: the pager is not inset`)
    }
    assert.match(
      fn(APP, 'function buildStack(t, n){'),
      /<span class="pager" style="left:\$\{g\.pager\.x\}px;top:\$\{g\.pager\.y\}px;height:\$\{g\.pager\.h\}px">/
    )
  })

  // mutation: page-bar.pile-thumb-stays, kit.scroll-pad-dropped, kit.scroll-pad-inward
  it('the pile turns on the same scrollbar, and a remote turn moves the thumb', () => {
    const stack = fn(APP, 'function buildStack(t, n){')
    assert.match(stack, /scrollMarkup\(\{ titles, at: stackFront\[t\.id\] \|\| 0, vert: true/)
    assert.match(stack, /stackBars\[t\.id\] = wireScroll\(/)
    assert.match(stack, /onCommit: i => setFront\(t\.id, i, true\)/)
    assert.match(fn(APP, 'function paintFront(id, node, peek){'), /stackBars\[id\]\?\.set\(i\);/)
    for (const dead of ['class="pg ', 'class="dots"', '.pager .dot'])
      assert.ok(!APP.includes(dead), `the dots are back: ${dead}`)
    assert.doesNotMatch(CSS, /\.t-stack \.(pg|dots|dot)\b/)
    // in the world the steppers are six cells and the pad under each grows
    // the hit to the tap floor on the screen, as under a part
    const pad = cssRules(KIT).find((r) =>
      r.selectors.some((s) => s.trim() === '.k-scroll > .k-step::after')
    )
    assert.ok(pad, 'the pad under a stepper is gone')
    for (const p of ['width', 'height'])
      assert.match(
        pad.decls.find((d) => d.prop === p)?.value || '',
        /--cv-ctrl-h\) \* var\(--cv-world-k/
      )
    // and it grows away from the track: anchored on each stepper's inner
    // edge, so the track (painted after the first stepper) never covers
    // that pad and the last stepper's pad never covers the track's end slot
    const edge = (sel) =>
      cssRules(KIT)
        .filter((r) => r.selectors.some((s) => s.trim() === sel))
        .flatMap((r) => r.decls)
    assert.deepEqual(
      edge('.k-scroll > .k-prev::after').map((d) => `${d.prop}: ${d.value}`),
      ['right: 0'],
      "the first stepper's pad is not anchored on its inner edge"
    )
    assert.deepEqual(
      edge('.k-scroll > .k-next::after').map((d) => `${d.prop}: ${d.value}`),
      ['left: 0'],
      "the last stepper's pad is not anchored on its inner edge"
    )
    assert.match(rule('.t-stack .pager .k-scroll'), /--k-step: calc\(6 \* var\(--cv-px\)\);/)
  })
})
