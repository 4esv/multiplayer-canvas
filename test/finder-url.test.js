// test/finder-url.test.js
// BIBLE.md section 8: the finder's bar is `?search=` in the address, so a
// find can be sent. The arithmetic (canvas/finder-url.js), held: the three
// states of the bar read back as written, the query survives any
// character, and every other param in the address stays byte for byte.
// The browser half (a load of /?search=slime opens the bar and finds) is
// scripts/verify/music-windows.mjs.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { roomFromUrl, searchFromUrl, withRoom, withSearch } from '../primitives/rooms/finder-url.js'

describe('the finder in the address', () => {
  it('the three states of the bar: shut, open and empty, holding a query', () => {
    assert.equal(searchFromUrl(''), null)
    assert.equal(searchFromUrl('?diag'), null)
    assert.equal(searchFromUrl('?search='), '')
    assert.equal(searchFromUrl('?search'), '')
    assert.equal(searchFromUrl('?search=slime'), 'slime')
    assert.equal(withSearch('', null), '')
    assert.equal(withSearch('', ''), '?search=')
    assert.equal(withSearch('', 'slime'), '?search=slime')
    assert.equal(withSearch('?search=slime', null), '')
  })

  it('a query is encoded cleanly and reads back as typed', () => {
    for (const q of [
      'top slime',
      'a&b=c',
      'r&b + soul',
      '100%',
      'DeBÍ TiRAR MáS FOToS',
      '?#/',
      "sergio mendes & brasil '66",
    ]) {
      const s = withSearch('', q)
      assert.equal(searchFromUrl(s), q, `${q} did not survive ${s}`)
      assert.doesNotMatch(s.slice('?search='.length), /[ &#?+]/, `${s} is not encoded`)
    }
    assert.equal(withSearch('', 'top slime'), '?search=top%20slime')
    // a space typed by hand as + or %20 reads back as a space
    assert.equal(searchFromUrl('?search=top+slime'), 'top slime')
  })

  it('every other param stays byte for byte, in its order', () => {
    assert.equal(withSearch('?diag', 'slime'), '?diag&search=slime')
    assert.equal(withSearch('?diag&search=old&safe', 'new'), '?diag&safe&search=new')
    assert.equal(withSearch('?diag&search=old&safe', null), '?diag&safe')
    assert.equal(withSearch('?a=1%202&search=x', ''), '?a=1%202&search=')
    // a param that only starts with the name is not it
    assert.equal(withSearch('?searching=1', null), '?searching=1')
    assert.equal(withSearch('?searching=1', 'x'), '?searching=1&search=x')
    // one bar, one param: a doubled one collapses to the bar's state
    assert.equal(withSearch('?search=a&search=b', 'c'), '?search=c')
  })

  it('the same state written twice is the same address (no history churn)', () => {
    const once = withSearch('?diag', 'slime')
    assert.equal(withSearch(once, 'slime'), once)
    assert.equal(withSearch(withSearch('', ''), ''), '?search=')
  })
})

// THE ROOM IN THE ADDRESS (BIBLE.md section 2): the flag is the room, so
// its life is the address's. Read on a load (the PIN with it), rewritten in
// the room's own kind once it answers, carried onto every path the canvas
// walks to, and gone when the tab leaves. The browser half is
// scripts/verify/session-live.mjs.
describe('the room in the address', () => {
  it('no flag is the public room; a bare flag is a new room; a word is that room', () => {
    assert.equal(roomFromUrl(''), null)
    assert.equal(roomFromUrl('?search=slime'), null)
    assert.deepEqual(roomFromUrl('?follow'), { kind: 'follow', code: 'new', pin: null })
    assert.deepEqual(roomFromUrl('?session='), { kind: 'session', code: 'new', pin: null })
    assert.deepEqual(roomFromUrl('?follow=demo'), { kind: 'follow', code: 'demo', pin: null })
    assert.deepEqual(roomFromUrl('?session=thursday-jam&pin=4821'), {
      kind: 'session',
      code: 'thursday-jam',
      pin: '4821',
    })
    // the superset wins when an address carries both
    assert.equal(roomFromUrl('?follow=a&session=b').kind, 'session')
  })

  // mutation: finder-url.room-case-kept
  it('a code is read lower case, and one that is not a code is no room at all', () => {
    assert.equal(roomFromUrl('?follow=Demo').code, 'demo')
    assert.equal(roomFromUrl('?session=JAM-2').code, 'jam-2')
    for (const bad of [
      '?follow=-x',
      '?session=a_b',
      `?follow=${'a'.repeat(33)}`,
      '?session=%3Cb%3E',
    ])
      assert.equal(roomFromUrl(bad), null, bad)
  })

  // mutation: finder-url.room-pin-kept
  it('the room is written in, the PIN is never, and every other param stays', () => {
    // boot: the PIN is read and taken off, the flag stays
    assert.equal(
      withRoom('?follow=demo&pin=4821', roomFromUrl('?follow=demo&pin=4821')),
      '?follow=demo'
    )
    assert.equal(
      withRoom('?diag&session&pin=off', { kind: 'session', code: 'new' }),
      '?diag&session'
    )
    // the room answers: the flag names its code, in the room's own kind
    assert.equal(withRoom('?session=demo', { kind: 'follow', code: 'demo' }), '?follow=demo')
    assert.equal(withRoom('?session', { kind: 'session', code: 'k3x9qa' }), '?session=k3x9qa')
    // a walk to a page carries it onto the new path's empty query
    assert.equal(
      '/work/nao' + withRoom('', { kind: 'follow', code: 'demo' }),
      '/work/nao?follow=demo'
    )
    // the finder's flag and the room's live side by side
    assert.equal(
      withRoom('?search=slime', { kind: 'session', code: 'jam' }),
      '?search=slime&session=jam'
    )
    assert.equal(withSearch('?session=jam', 'slime'), '?session=jam&search=slime')
    // leaving takes it off and nothing else
    assert.equal(withRoom('?search=slime&session=jam', null), '?search=slime')
    assert.equal(withRoom('?follow=demo', null), '')
    // a kind that is not one writes nothing
    assert.equal(withRoom('', { kind: 'presentation', code: 'x' }), '')
  })
})
