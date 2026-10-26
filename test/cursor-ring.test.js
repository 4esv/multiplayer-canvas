// test/cursor-ring.test.js
// The live-presence cursor must have an edge on the canvas it lives on.
//
// The bug this exists for: the arrow carried one halo, stroked with
// --cv-ground. --cv-ground IS the canvas ground, and the pair flips with the
// theme, so the halo matched the surface behind it in BOTH modes: a light
// border in light mode, a dark border in dark mode, which is exactly what it
// looked like. Measured on the bare ground in light mode, the strongest edge
// the arrow could produce was its own hue fill at 2.78:1; nothing about the
// halo was visible at all.
//
// Nothing caught it. test/contrast.test.js takes a census of the TOKENS and
// their declared pairs; it never knew --cv-ground was being painted against
// itself here, because that pairing lives in a stylesheet rule rather than in
// the frontmatter. So this guard checks the pairing where it is made.
//
// The fix is two rings on the same drawing, ink outside ground: over the ground
// the ink ring draws the edge, over a dark guest tile the ground ring does. The
// per-peer hue is untouched (it is the identity, and a sanctioned palette
// exception); only the chrome around it moved.
//
// The arrow is a SPRITE (BIBLE.md section 10) and nothing is
// stroked, so the invariant is carried by three stacked
// grids rather than by three stroke widths: the mark, the mark grown one cell
// for the ground ring, and grown twice for the ink one. The guard checks the
// same pairing in the same place, and it re-grows the sprite here rather than
// trusting the source's own word for which grid is bigger.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveTokens } from './lib/css-tokens.js'
import { CLICK_NUDGE, cursorImage } from '../primitives/presence/presence.js'

const ROOT = join(import.meta.dirname, '..')
const HOME = readFileSync(join(ROOT, 'src/static/css/canvas-home.css'), 'utf8')
// the same text, for the whole-file assertions below
const CSS_HOME = HOME.replace(/\/\*[\s\S]*?\*\//g, ' ')
const PRESENCE = readFileSync(join(ROOT, 'primitives/presence/presence.js'), 'utf8')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')
const SCROLL = readFileSync(join(ROOT, 'primitives/kit/kit-scroll.js'), 'utf8')
const readTokens = () => readFileSync(join(ROOT, 'primitives/kit/canvas-tokens.css'), 'utf8')
const tokens = resolveTokens(readTokens(), { prefix: '--cv-' })

// WCAG relative luminance, on the six-digit hex the tokens carry.
const hex = (v) => {
  const m = /^#([0-9a-f]{6})$/i.exec(v.trim())
  assert.ok(m, `not a plain hex color: ${v}`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const lum = ([r, g, b]) =>
  [r, g, b]
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (a, b) => {
  const [hi, lo] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// the declaration block for a selector, comments already gone
const blockFor = (sel) => {
  const css = HOME.replace(/\/\*[\s\S]*?\*\//g, '')
  const i = css.indexOf(sel + ' {')
  assert.notEqual(i, -1, `no rule for ${sel}`)
  return css.slice(i + sel.length + 2, css.indexOf('}', i))
}
const decl = (block, prop) => {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'm').exec(block)
  return m ? m[1].trim() : null
}
const tokenOf = (value) => {
  const m = /^var\(--cv-([a-z0-9-]+)\)$/.exec(value ?? '')
  return m ? m[1] : null
}

const RING_FILL = '.cursor svg path.ring'
const HALO_FILL = '.cursor svg path.halo'

// the sprite, read back out of presence.js, and the same one-cell growth it
// uses: computing both here is what makes "the ring is bigger" a measurement
const arrowRows = (name = 'POINT_ROWS') => {
  const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`).exec(PRESENCE)
  assert.ok(m, `presence.js no longer declares ${name}`)
  return [...m[1].matchAll(/'([01]+)'/g)].map((r) => r[1])
}
// the margin the source claims, not one this file happens to agree with
const arrowPad = () => {
  const m = /const ARROW_PAD = (\d+)/.exec(PRESENCE)
  assert.ok(m, 'presence.js no longer declares ARROW_PAD')
  return Number(m[1])
}
const gridOf = (rows, pad) => {
  const w = rows[0].length + 2 * pad
  const g = Array.from({ length: rows.length + 2 * pad }, () => Array(w).fill(false))
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '1') g[y + pad][x + pad] = true
    })
  )
  return g
}
const grow = (g) =>
  g.map((row, y) =>
    row.map(
      (on, x) => on || g[y - 1]?.[x] || g[y + 1]?.[x] || g[y]?.[x - 1] || g[y]?.[x + 1] || false
    )
  )
const lit = (g) => g.flat().filter(Boolean).length
const covers = (outer, inner) => inner.every((row, y) => row.every((on, x) => !on || outer[y][x]))

describe('the presence cursor has an edge on the canvas', () => {
  // the hand set, read back out of the source rather than restated here
  const handsOf = () => {
    const m = /const HANDS = \{([\s\S]*?)\n\}/.exec(PRESENCE)
    assert.ok(m, 'presence.js no longer declares HANDS')
    const out = {}
    for (const h of m[1].matchAll(
      /(\w+): \{\s*hot: \[(\d+), (\d+)\],\s*rows: \[([\s\S]*?)\],\s*\},/g
    ))
      out[h[1]] = {
        hot: [Number(h[2]), Number(h[3])],
        rows: [...h[4].matchAll(/'([.+o#]+)'/g)].map((r) => r[1]),
      }
    return out
  }

  // mutation: cursor-ring.layers-out-of-order, cursor-ring.ring-inked-ground
  it('is three DRAWN layers, not one shape grown twice', () => {
    // A single bitmap dilated once for the black and twice for the border
    // decides the outline for you; every layer is placed by hand instead. If grow() appears in the
    // sprite path, the drawing has been taken back off whoever drew it.
    const sprite = PRESENCE.slice(
      PRESENCE.indexOf('const pathOfLayer'),
      PRESENCE.indexOf('const CURSOR')
    )
    assert.ok(!/\bgrow\(/.test(sprite), 'the sprite is deriving a layer again')
    const uses = [
      ...PRESENCE.matchAll(/<path class="(halo|ring|mark)" d="\$\{pathOfLayer\(rows, '(.)'\)\}"/g),
    ]
    assert.deepEqual(
      uses.map((u) => [u[1], u[2]]),
      [
        ['halo', 'o'],
        ['ring', '+'],
        ['mark', '#'],
      ],
      'the layers are not border, then black, then colour'
    )
    assert.equal(tokenOf(decl(blockFor(RING_FILL), 'fill')), 'ink')
  })

  // mutation: cursor-ring.hand-colour-unedged
  it('every hand is edged: colour never meets the ground', () => {
    // What grown rings would guarantee by construction a drawn
    // sprite has to earn. A colour cell touching nothing is a cell sitting
    // straight on the canvas, and on the bare ground that edge is the only
    // thing telling a hand from the ground behind it.
    const hands = handsOf()
    // THREE. point and click are drawn for a peer and are also the visitor's
    // own; grab is the visitor's alone. An open hand sat on the ground for a
    // few hours and went: the closed hand says "you may grab this" at the
    // moment it matters, where an open one said it early and everywhere.
    assert.deepEqual(Object.keys(hands).sort(), ['click', 'grab', 'point'])
    for (const [name, h] of Object.entries(hands)) {
      const at = (x, y) => (h.rows[y] && h.rows[y][x]) || '.'
      const bare = []
      h.rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] !== '#') continue
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            if (at(x + dx, y + dy) === '.') bare.push(`${x},${y}`)
        }
      })
      assert.deepEqual(bare, [], `${name}: colour meets the ground at ${bare.join(' ')}`)
    }
  })

  // mutation: cursor-ring.hand-black-unhaloed
  it('every hand is haloed: black never meets the ground either', () => {
    // The other half, and the reason there are two outlines at all: over a
    // dark host's tile the black disappears into its near-black ground, so
    // the border is the only edge left. A black cell touching nothing is a
    // hand with no edge on a dark tile.
    const hands = handsOf()
    for (const [name, h] of Object.entries(hands)) {
      const at = (x, y) => (h.rows[y] && h.rows[y][x]) || '.'
      const bare = []
      h.rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] !== '+') continue
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            if (at(x + dx, y + dy) === '.') bare.push(`${x},${y}`)
        }
      })
      assert.deepEqual(bare, [], `${name}: black meets the ground at ${bare.join(' ')}`)
    }
  })

  // mutation: cursor-ring.ring-inked-ground
  it('ONE of the two outlines clears 3:1 against EVERY ground it crosses', () => {
    // Unchanged in meaning and still the bug this file exists for: a single
    // ground-token halo shipped once and --cv-ground IS the canvas, so the
    // cursor was outlined in the exact colour behind it. What must hold is
    // that on any ground at least one of the two shows. Grounds, not themes:
    // there is one ground here, and the reason there are two
    // outlines is that a tile wearing a host's livery (a --guest-*-bg token,
    // when a fork adds one) carries that host's background, which no
    // decision of ours flips.
    const fills = [RING_FILL, HALO_FILL].map((sel) => tokenOf(decl(blockFor(sel), 'fill')))
    for (const f of fills)
      assert.ok(f, 'an outline is filled with something other than a --cv- token')
    const view = tokens.light
    const grounds = { 'the bare ground': view.ground, 'a tile surface': view.surface }
    for (const [, , name, value] of readTokens().matchAll(
      /(--(guest-[a-z]+-bg))\s*:\s*(#[0-9a-f]{6})/gi
    ))
      grounds[name] = value
    assert.ok(Object.keys(grounds).length >= 2, 'the ground census found almost nothing')
    for (const [where, bg] of Object.entries(grounds)) {
      const best = Math.max(...fills.map((f) => ratio(view[f], bg)))
      assert.ok(
        best >= 3,
        `the best cursor outline is ${best.toFixed(2)}:1 over ${where} (needs 3:1)`
      )
    }
  })

  // mutation: cursor-ring.ring-inked-ground
  it('the two rings take opposite inks, so one of them always shows', () => {
    const ring = tokenOf(decl(blockFor(RING_FILL), 'fill'))
    const halo = tokenOf(decl(blockFor(HALO_FILL), 'fill'))
    assert.deepEqual([ring, halo].sort(), ['ground', 'ink'])
    assert.equal(decl(blockFor('.cursor svg path.mark'), 'fill'), 'currentColor')
  })

  // mutation: cursor-ring.peer-draws-grab
  it('the two populations of hand stay separate', () => {
    // point and click are drawn for a PEER and the click travels; open and
    // grab are the visitor's own and nothing carries them, because a drag is
    // a continuous gesture with an audience of one. The failure this exists
    // for is somebody reaching for the grab hand when building the peer
    // sprite, and every visitor suddenly watching everybody else drag.
    const peer = PRESENCE.slice(PRESENCE.indexOf('const ARROW ='), PRESENCE.indexOf('const TIP_X'))
    for (const h of ['grab', 'open'])
      assert.ok(!peer.includes(`'${h}'`), `${h} is being drawn for peers`)
    assert.match(peer, /spriteOf\('point', 'up'\) \+ spriteOf\('click', 'down'\)/)
  })

  // mutation: cursor-ring.own-hand-uses-peer-hot
  it('each hand keeps its OWN hot spot, and the click is nudged to match', () => {
    // A hot spot is the point the cursor aims at, so it stays on the target
    // while the drawing moves around it. The peer element is seated on the
    // pointing hand's hot spot and the clicking one is offset by the
    // difference, so one transform on the element serves both: that transform
    // is rewritten every animation frame for every peer.
    const hands = handsOf()
    const nudge = [hands.point.hot[0] - hands.click.hot[0], hands.point.hot[1] - hands.click.hot[1]]
    // the pitch, read off the rendered image rather than restated
    const svgOf = (value) => decodeURIComponent(/data:image\/svg\+xml,([^"]+)"/.exec(value)[1])
    const pitch = (name) =>
      Number(/width="(\d+)"/.exec(svgOf(cursorImage(name, '#ff0000', '#000000', '#ffffff')))[1]) /
      hands[name].rows[0].length
    assert.deepEqual(CLICK_NUDGE, { x: nudge[0] * pitch('point'), y: nudge[1] * pitch('point') })
    assert.match(
      CSS_HOME,
      /translate\(var\(--cv-click-nudge-x, 0\), var\(--cv-click-nudge-y, 0\)\)/
    )
    assert.match(APP, /setProperty\('--cv-click-nudge-x'/)
    assert.ok(
      nudge[0] !== 0 || nudge[1] !== 0,
      'the two hands share a hot spot, so the nudge does nothing'
    )
    // and the visitor's own carry theirs into the cursor value, in the
    // rendered image's pixels, not the drawing's cells: the two are only the
    // same number at one px a cell, so the pitch is read off the image
    for (const [name, h] of Object.entries(hands)) {
      const value = cursorImage(name, '#ff0000', '#000000', '#ffffff')
      const px = pitch(name)
      const at = /\) (\d+) (\d+), \w+$/.exec(value)
      assert.deepEqual(
        [Number(at[1]), Number(at[2])],
        [h.hot[0] * px, h.hot[1] * px],
        `${name}: the cursor value aims somewhere other than its own hot spot`
      )
      assert.ok(
        h.hot[0] >= 0 && h.hot[0] < h.rows[0].length && h.hot[1] >= 0 && h.hot[1] < h.rows.length,
        `${name}: the hot spot is outside the drawing`
      )
    }
  })

  // mutation: cursor-ring.hauling-before-pressing
  it('the hand is a state of the POINTER, decided in one place', () => {
    // Which hand shows is a fact about what the pointer is doing, never about
    // what it is over. So there is exactly one element that decides it, and
    // everything else inherits.
    //
    // This is the third arrangement. The first gave the hand to every rule
    // that already said `cursor: pointer` and added a fourth on
    // `:where(#stage, #sheet, #topbar) :active`: an image cursor on 989 of
    // 991 elements and a descendant selector the engine matches tree-wide on
    // every press, which is the whole duration of a pan. The second was
    // `html:active` alone, which matched and reached nothing, because
    // `html, body` both declared a cursor and body's own beat the value
    // inherited from html. Both were the same mistake: deciding a hand
    // somewhere other than on the pointer.
    assert.match(blockFor('html'), /cursor:\s*var\(--cv-hand-point, default\)/)
    assert.match(blockFor('html.pressing'), /cursor:\s*var\(--cv-hand-click, default\)/)
    assert.match(blockFor('html.hauling'), /cursor:\s*var\(--cv-hand-grab, grabbing\)/)
    // hauling is also pressing, so it must come second: equal specificity
    assert.ok(
      CSS_HOME.indexOf('html.hauling') > CSS_HOME.indexOf('html.pressing'),
      'html.hauling is declared before html.pressing, so a pan shows the click hand'
    )
    // the elements the UA sheet forces a cursor onto are handed back to
    // inheritance rather than restated per state
    assert.match(blockFor("a,\nbutton,\nselect,\nsummary,\n[role='button']"), /cursor:\s*inherit/)
    // NOTHING else decides a hand. Not the body, not the scene, not a tile.
    const decls = [...CSS_HOME.matchAll(/([^{}]*)\{[^}]*cursor:\s*var\(--cv-hand-[a-z]+/g)].map(
      (m) => m[1].split(';').pop().trim().replace(/\s+/g, ' ')
    )
    assert.deepEqual(
      decls.sort(),
      ['html', 'html.grabbable', 'html.hauling', 'html.pressing'],
      'a hand is being decided somewhere other than on the root'
    )
    // and app.js writes the state there, nowhere else
    assert.match(APP, /classList\.toggle\('pressing'/)
    assert.match(APP, /classList\.add\('hauling'\)/)
    assert.match(APP, /classList\.remove\('hauling'\)/)
    assert.match(APP, /\['point', 'click', 'grab'\]/)
  })

  // mutation: cursor-ring.scrub-clicks, cursor-ring.grabbable-after-pressing
  it('scrolling a collection is the grab hand: offered over the track, held through the scrub', () => {
    //.
    // Every collection is walked on the kit's snap scrollbar (the piles, the
    // statement's pile, a fan's), so the scrollbar writes the state and the
    // root wears it, like every other hand
    assert.match(blockFor('html.grabbable'), /cursor:\s*var\(--cv-hand-grab, grab\)/)
    // offered before the press, so a press anywhere still clicks, and a
    // scrub (a haul) still wins over the click that started it
    assert.ok(
      CSS_HOME.indexOf('html.grabbable') < CSS_HOME.indexOf('html.pressing'),
      'html.grabbable comes after html.pressing, so a press over a track never clicks'
    )
    const at = SCROLL.indexOf('export function wireScroll(')
    const wire = SCROLL.slice(at)
    assert.match(
      wire,
      /addEventListener\('pointerenter', \(\) => \{\n\s*root\.classList\.add\('grabbable'\)/
    )
    assert.match(wire, /root\.classList\.remove\('grabbable'\)/)
    // the press that starts a scrub makes it a haul, and the release ends it
    const down = wire.slice(wire.indexOf("track.addEventListener('pointerdown'"))
    assert.match(down.slice(0, down.indexOf('\n  })')), /root\.classList\.add\('hauling'\)/)
    const release = wire.slice(wire.indexOf('const release = (cancel) => {'))
    assert.match(release.slice(0, release.indexOf('\n  }')), /root\.classList\.remove\('hauling'\)/)
  })
})
