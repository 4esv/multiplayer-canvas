// test/room-state.test.js
// BIBLE.md sections 2 and 4: what the room holds is not a tab's. The
// statement is a pile of sentences, and the room turns it (`front`), so a tab
// does not run a clock of its own for the statement.
//
//   - The statement. hero-cycle.js was a pure function of the clock (which
//     phrase, which character, which beat) that nothing had called since the
//     pager made the phrase the room's. It holds the phrases and nothing
//     else, so the clock cannot come back as a second way to change them.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as HERO from '../src/static/canvas/hero-cycle.js'

const APP_PATH = 'src/static/canvas/app.js'
const APP = readFileSync(join(import.meta.dirname, '..', APP_PATH), 'utf8')

describe("what the room holds is not a tab's (BIBLE.md sections 2 and 4)", () => {
  // mutation: room-state.hero-clock-back
  it('hero-cycle.js exports the phrases and nothing else', () => {
    assert.deepEqual(
      Object.keys(HERO).sort(),
      ['PHRASES'],
      'src/static/canvas/hero-cycle.js: the statement is the pager, and nothing turns it on a clock'
    )
    assert.ok(HERO.PHRASES.length > 1, 'a pager of one phrase turns nothing')
  })
})
