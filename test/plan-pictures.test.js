// test/plan-pictures.test.js
// Zoomed out, the canvas draws each tile as its baked plan picture
// (scripts/img/bake-plan.mjs, app.js planPic). A tile with no picture is a
// hole in the plan and a 404 on every load, which is how the dock's two
// icons went missing once without any other test noticing.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { TILES } from '../src/static/canvas/layout.js'

const PLAN = join(import.meta.dirname, '../src/static/img/canvas/plan')

describe('the plan pictures', () => {
  // tripwire: the thing that breaks is a missing binary file, which a text mutation cannot remove
  it('every tile has its plan picture', () => {
    const missing = TILES.filter((t) => !existsSync(join(PLAN, `${t.id}.png`))).map((t) => t.id)
    assert.deepEqual(missing, [])
  })
})
