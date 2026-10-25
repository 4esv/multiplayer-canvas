// test/outbound.test.js
// Every way off the canvas leaves through one door, exit().
//
// Each exit used to be written twice, once for the click and once for
// keyable(), and each called window.open itself. One door means a fork that
// wants to count the clicks that leave adds it in one place, and a keyboard
// visitor is never the one it misses. A new outbound tile that calls
// window.open itself fails here.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')

// exit() lifted out of app.js and run against a window and a location this
// test holds: what it opens is observed, not grepped.
function exitFn() {
  const src = APP.match(/function exit\(url\)\{[\s\S]*?\n\}/)
  assert.ok(src, 'exit() is not defined')
  const seen = { opened: [] }
  const window = { open: (...a) => seen.opened.push(a) }
  const location = { href: '' }
  const exit = new Function('window', 'location', `${src[0]}; return exit`)(window, location)
  return { exit, seen, location }
}

describe('every exit off the canvas is one door', () => {
  // mutation: outbound.link-opens-directly
  it('window.open is called in exactly one place', () => {
    const calls = APP.match(/window\.open\(/g) || []
    assert.equal(
      calls.length,
      1,
      `window.open appears ${calls.length}x; it belongs only inside exit()`
    )
  })

  // mutation: outbound.mailto-as-tab
  it('that one place is exit(), and a mailto is asked for in place', () => {
    const { exit, seen, location } = exitFn()
    exit('https://example.com/x')
    assert.deepEqual(seen.opened, [['https://example.com/x', '_blank', 'noopener']])
    // a mailto opened as a tab leaves a blank tab behind
    exit('mailto:you@example.com')
    assert.equal(location.href, 'mailto:you@example.com')
    assert.equal(seen.opened.length, 1, 'a mailto opened a tab')
  })

  // mutation: outbound.entry-opens-directly
  it('every outbound tile kind routes through it', () => {
    assert.match(
      APP,
      /const open = t\.ext \? \(\)=>exit\(t\.ext\)/,
      'an external entry opens itself'
    )
    assert.match(APP, /const gosocial = \(\)=>exit\(s\.url\);/, 'a glyph opens itself')
  })
})
