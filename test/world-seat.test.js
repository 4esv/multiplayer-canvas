// test/world-seat.test.js
// BIBLE.md section 2: the world seats its nodes, and nothing else may.
//
// `.el` is `position: absolute` with `top: 0; left: 0`, and app.js puts every
// node where it belongs with a transform. That is the whole seating mechanism,
// and it is what makes the world FIXED: same tiles, same coordinates, every
// visitor, which on a canvas with shared cursors is a correctness property and
// not a preference.
//
// A single later rule at equal specificity is enough to undo it. The tap-floor
// pass wrote `.options button, .t-icon { position: relative }` to mint a
// containing block for a hit pad, and `.t-icon` IS an `.el`: one class, same
// weight as `.el`, further down the file, so it won. Every icon was demoted to
// `relative` and dropped into the flow of `#scene` — whose width and height
// setSceneTransform rewrites on every zoom, and whose flow holds only the
// nodes the camera has not hidden. So an icon's seat then moved with the zoom
// AND with the pan: 192 world px of measured drift, and different drift for
// different viewers. It read as "steam wanders when I zoom".
//
// The pad did not even need the declaration: an `.el` is already positioned,
// so a `position: absolute` pseudo-element inside it already anchors to it.
// The rule was pure collateral, which is the kind that survives review.
//
// This is text over the stylesheet. What it cannot see (that the transform
// actually lands where layout.js says) is canvas-layout.test.js's job; what
// canvas-layout cannot see is that CSS quietly took the seat away.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const FILE = 'src/static/css/canvas-home.css'

// a world node's own box: the selector's LAST compound carries `.el` or a
// tile-variant class. A descendant of one (`.t-slime .bar`) is ordinary
// component chrome and positions itself freely; a pseudo-element on one
// (`.t-icon::after`) is not the node either, it is drawn inside it.
const WORLD_NODE = /\.(el|t-[a-z0-9-]+)(?![a-z0-9-])/

function rules(css) {
  const out = []
  // comments out first: they hold plenty of prose about position and about
  // selectors, and this guard reads declarations, not discussion
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    out.push({
      selectors: m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      body: m[2],
    })
  return out
}

describe('the world seats its own nodes', () => {
  const css = readFileSync(join(ROOT, FILE), 'utf8')

  // mutation: world-seat.el-relative
  it('.el is still the seat', () => {
    // if this moves or is renamed the guard below is checking nothing, and
    // would pass loudest exactly when the invariant is gone
    assert.match(
      css.replace(/\/\*[\s\S]*?\*\//g, ''),
      /(^|\})\s*\.el\s*\{[^}]*position:\s*absolute/,
      `${FILE} no longer declares .el { position: absolute }: the seat moved, and this guard has to move with it`
    )
  })

  // mutation: world-seat.icon-made-relative
  it('no other rule re-declares position on a world node', () => {
    const hits = []
    for (const { selectors, body } of rules(css)) {
      const decl = body.match(/(?:^|;)\s*position\s*:\s*([a-z-]+)/)
      if (!decl) continue
      for (const sel of selectors) {
        if (sel === '.el') continue // the seat itself
        // last compound only, and a pseudo-element is not the node
        const last =
          sel
            .split(/[\s>+~]+/)
            .filter(Boolean)
            .pop() || ''
        if (/::[a-z-]+/.test(last)) continue
        if (WORLD_NODE.test(last)) hits.push(`${sel} { position: ${decl[1]} }`)
      }
    }
    assert.deepEqual(
      hits,
      [],
      'these rules re-seat a node that the world already seated:\n  ' +
        hits.join('\n  ') +
        `\n.el is position:absolute and app.js places it with a transform. A ` +
        `second position declaration at equal specificity wins by source order ` +
        `and drops the node into the flow of #scene, whose box changes with the ` +
        `camera: the node then drifts under zoom and pan, differently for ` +
        `different viewers. If you need a containing block for a pseudo-element, ` +
        `you already have one. Position the descendant, never the node.`
    )
  })
})
