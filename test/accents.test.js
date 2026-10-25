// test/accents.test.js
// The accent inventory (#313, author review of #315): every accent token in
// canvas-tokens.css is there because something still paints with it.
// scripts/tokens/accents.mjs computes the table; this holds it at zero
// vestigial, so an accent whose last consumer goes takes the token with it.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { inventory } from '../scripts/tokens/accents.mjs'

describe('the accents', () => {
  // mutation: accents.vestigial-back
  it('every accent token has a consumer that needs it', () => {
    const rows = inventory()
    assert.ok(rows.length >= 5, `only ${rows.length} accents found: the scan stopped working`)
    const vestigial = rows.filter((r) => r.vestigial).map((r) => `--cv-${r.name}`)
    assert.deepEqual(vestigial, [], `nothing needs ${vestigial.join(', ')}: delete it`)
  })
})
