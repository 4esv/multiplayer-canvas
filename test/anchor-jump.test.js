// test/anchor-jump.test.js
// A link inside a page (a footnote, a code line's number, a heading) points at
// a place in a page that is already up. The browser takes the reader there, on
// the sheet's own easing, and tells the page with a popstate. The router used
// to answer every popstate by painting the route again, which rebuilt the page
// under the scroll: with motion allowed the glide ended nowhere near its target
// (a footnote three thousand pixels away, a line number a thousand), and only
// reduced motion landed by luck. Measured in a browser, on main and after.
//
// What is held: a step of the history paints only when the address names
// another page than the one up. The painted half (the reader lands on the
// place, the page is not rebuilt, back and forward still walk the pages) is
// measured in a browser; this is the line that keeps it so.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const APP = readFileSync(join(import.meta.dirname, '..', 'src/static/canvas/app.js'), 'utf8')

describe('a jump inside the page is not a new page', () => {
  // mutation: anchor-jump.popstate-repaints
  it('paints on a step of the history only when the address names another page', () => {
    const at = APP.indexOf("addEventListener('popstate', ()=>{\n  backPending = false;")
    assert.ok(at > -1, 'the router’s popstate handler is gone')
    const handler = APP.slice(at, APP.indexOf('\n});', at))
    const same = handler.indexOf(
      'if(curSheet && slugForPath(location.pathname) === curSheet) return;'
    )
    const paint = handler.indexOf('paintRoute(location.pathname)')
    assert.ok(same > -1, 'a jump inside the page repaints it')
    assert.ok(paint > same, 'the page is painted before the jump is let go')
  })
})
