// test/keys.test.js
// THE KEYS (BIBLE.md section 6, the bar): the keys the page answers are one
// table (KEYS in canvas/commands.js) and one command (/keys), and `?` opens
// it, the shortcut sheet every web app answers to that key. Before it the keys
// were real and listed nowhere: the slash, Escape, the arrows and the zoom
// keys were found by pressing them.
//
// What is held: the command is everybody's and shown to everybody; the table
// and the page's global key handler say the same keys, both ways (a key the
// page answers that the table does not say is a key nobody finds, and a row
// for a key the page does not answer is a promise it does not keep); and `?`
// runs the list in the bar and never while a field has the keyboard.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { KEYS, commandsFor, parseCommand } from '../src/static/canvas/commands.js'

const APP = readFileSync(join(import.meta.dirname, '..', 'src/static/canvas/app.js'), 'utf8')

// the page's global key handler: from its opening to the line that closes it
const start = APP.indexOf("addEventListener('keydown', e=>{\n  if(e.key==='Escape'){")
const HANDLER = APP.slice(start, APP.indexOf('\n});', start))

describe('the legend is a command anyone can run', () => {
  // mutation: keys.command-hidden
  it('is listed and runs for a guest, and every row says a key and what it does', () => {
    const guest = commandsFor(false)
    assert.ok(
      guest.listed.some((c) => c.name === 'keys'),
      'a guest is not shown /keys'
    )
    assert.equal(parseCommand('/keys', guest.runnable).error, null)
    assert.ok(KEYS.length >= 5)
    for (const k of KEYS) {
      assert.ok(k.keys && k.does, `a row says nothing: ${JSON.stringify(k)}`)
      // a row is a line in the bar, on a phone: the key and its words fit one
      assert.ok(k.keys.length + k.does.length <= 34, `${k.keys} is too long for a phone's line`)
    }
  })
})

describe('the legend and the handler are the same list', () => {
  const read = new Set()
  for (const m of HANDLER.matchAll(/e\.key\s*===\s*'([^']+)'/g)) read.add(m[1])
  for (const m of HANDLER.matchAll(/\[((?:'[^']+',?\s*)+)\]\.includes\(e\.key\)/g))
    for (const k of m[1].matchAll(/'([^']+)'/g)) read.add(k[1])
  const said = new Set(KEYS.flatMap((k) => k.handles))

  // mutation: keys.handler-unlisted, keys.legend-promises
  it('says every key the page answers, and answers every key it says', () => {
    assert.ok(start > -1 && read.size >= 6, 'the global key handler is gone or unreadable')
    assert.deepEqual(
      [...read].filter((k) => !said.has(k)),
      [],
      'the page answers a key that /keys does not say'
    )
    assert.deepEqual(
      [...said].filter((k) => !read.has(k)),
      [],
      'a row in /keys is a key the page does not answer'
    )
  })

  // mutation: keys.question-mark-unbound
  it('opens on ?, in the bar, and not while a field has the keyboard', () => {
    const typing = HANDLER.indexOf("if(e.target.closest?.('input,textarea')) return;")
    const at = HANDLER.indexOf("if(e.key==='?')")
    assert.ok(typing > -1 && at > typing, '? is read before a field has let go of the keyboard')
    assert.match(HANDLER.slice(at, at + 200), /openSearch\(\)[\s\S]*runLine\('\/keys'\)/)
  })

  // mutation: keys.palette-after-field-guard, keys.palette-takes-chords, keys.palette-eats-browsers, keys.palette-unbound
  it('opens on Ctrl or Cmd K, a field included, and leaves the browser its own where there is no bar', () => {
    const typing = HANDLER.indexOf("if(e.target.closest?.('input,textarea')) return;")
    const at = HANDLER.indexOf("e.key==='k'")
    assert.ok(
      typing > -1 && at > -1 && at < typing,
      'K is read after a field has kept the keyboard'
    )
    const branch = HANDLER.slice(HANDLER.lastIndexOf('if((e.ctrlKey || e.metaKey)', at), typing)
    // Shift (the browser's console) and Alt make other chords
    assert.match(branch, /!e\.altKey && !e\.shiftKey/)
    // the bar opens, and the browser's own chord is taken only once the field has the keyboard
    assert.match(
      branch,
      /openSearch\(\);\s*if\(document\.activeElement === searchEl\) e\.preventDefault\(\)/
    )
  })
})
