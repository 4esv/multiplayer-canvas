// test/hero-cycle.test.js
// The statement is a pile of phrases the room turns (BIBLE.md section 4), so
// what is held here is the pile itself. That the file
// holds nothing but the phrases is test/room-state.test.js's.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { PHRASES } from '../src/static/canvas/hero-cycle.js'

describe('the hero is a pile of phrases', () => {
  it('every phrase is one plain sentence', () => {
    assert.ok(PHRASES.length >= 2, 'a pile of one is not a pile')
    for (const p of PHRASES) {
      assert.match(p, /^[A-Z].*[.!?]$/, `"${p}" is not a sentence`)
      assert.doesNotMatch(p, /\u2014/, `"${p}" carries an em-dash`)
    }
    assert.equal(new Set(PHRASES).size, PHRASES.length, 'a phrase repeats')
  })
})
