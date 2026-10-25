// test/one-bayer.test.js
// BIBLE.md section 0: one Bayer. The ordered dither has one source,
// js/textmode-settings.js (BAYER4 and what is built from it), and every
// dither in the tree imports it: the map's, the sky's, the photograph
// pixelator's, the dither frames'. A second copy of the threshold order is
// the same picture drawn two ways the day one of them is retuned, and the
// tree had three (the textmode source, the map's own BAYER4 in app.js and a
// recursive-doubling generator in scripts/icon/dither.mjs that the
// pixelator borrowed).
//
// A Bayer source is either the order written out (the 4x4 order, the 8x8
// order's first row, the 2x2 seed it is doubled from) or the doubling
// itself (four times the smaller matrix plus its seed). Every tracked
// script under src/, scripts/ and primitives/ is read; vendored code is not ours.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SOURCE = 'primitives/textmode-settings.js'
const scripts = execFileSync(
  'git',
  ['ls-files', '-co', '--exclude-standard', 'src', 'scripts', 'primitives'],
  {
    cwd: ROOT,
    encoding: 'utf8',
  }
)
  .split('\n')
  .filter((f) => /\.m?js$/.test(f) && !/(^|\/)vendor\//.test(f) && f !== SOURCE)

// the orders, compared with every bracket and space taken out
const ORDERS = ['0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5', '0,32,8,40,2,34,10,42', '[[0,2],[3,1]]']
// the doubling: B(2n) = 4 B(n) + seed, however the indices are spelled
const DOUBLING = /\b4\s*\*\s*[\w$.]+\[[^\]]+\]\[[^\]]+\]\s*\+\s*[0-3]\b/

// line-numbered hits in one file, comments left out (prose may name the
// order it is describing)
function sources(text) {
  const hits = []
  const code = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  code.split('\n').forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return
    const flat = line.replace(/\s+/g, '')
    const bare = flat.replace(/[[\]]/g, '')
    for (const o of ORDERS)
      if ((o.startsWith('[') ? flat : bare).includes(o))
        hits.push(`${i + 1}: the order written out (${o})`)
    if (DOUBLING.test(line)) hits.push(`${i + 1}: a Bayer generator (${line.trim().slice(0, 60)})`)
  })
  // a matrix may be written one row a line: read the whole file flat too
  const whole = code
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n')
  const flatAll = whole.replace(/[\s[\]]/g, '')
  if (!hits.length && flatAll.includes(ORDERS[0])) {
    const at = flatAll.indexOf(ORDERS[0])
    // map the flat offset back to a line
    let seen = 0
    const lines = whole.split('\n')
    for (let i = 0; i < lines.length; i++) {
      seen += lines[i].replace(/[\s[\]]/g, '').length
      if (seen > at) {
        hits.push(`${i + 1}: the order written out, across lines`)
        break
      }
    }
  }
  return hits
}

describe('one Bayer (BIBLE.md section 0)', () => {
  // mutation: one-bayer.own-matrix, one-bayer.own-generator
  it('no script writes or builds the threshold order outside textmode-settings.js', () => {
    const hits = scripts.flatMap((f) =>
      sources(readFileSync(join(ROOT, f), 'utf8')).map((h) => `${f}:${h}`)
    )
    assert.deepEqual(
      hits,
      [],
      `a second Bayer source:\n  ${hits.join('\n  ')}\n` +
        `Import BAYER4 (or what is built from it) from ${SOURCE} instead.`
    )
  })

  it('the one source is the order, and it is still there to import', async () => {
    const { BAYER4 } = await import('../primitives/textmode-settings.js')
    assert.deepEqual([...BAYER4], ORDERS[0].split(',').map(Number))
  })
})
