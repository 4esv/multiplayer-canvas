// test/shared-hover.test.js
// BIBLE.md section 2: a pointer resting on something is shared, and a hand on
// a control is not.
//
// Two things get guarded here, because the feature is only as good as the line
// it stops at. First, a relayed hover must paint EXACTLY what your own pointer
// paints, never a second visual state that could drift away from the first.
// Second, the set of things a peer can light is closed and named: the day
// someone hangs a hover key on something new, this fails and makes them say
// so out loud.
//
// The wire half of the boundary lives in test/presence.test.js, which guards
// what the protocol can carry; this file guards what the page offers.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isHoverKey } from '../primitives/presence/presence-protocol.js'
import { TILES } from '../src/static/canvas/layout.js'

const ROOT = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const CSS = read('src/static/css/canvas-home.css')
const APP = read('src/static/canvas/app.js')
const KIT_SCROLL = read('primitives/kit/kit-scroll.js')
const PRESENCE = read('primitives/presence/presence.js')

// brace-aware enough for a flat stylesheet: every `selectors { ... }` whose
// selector list mentions the class, with comments stripped so a commented-out
// example never counts as a rule
const RULES = [...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
  (m) => ({
    selectors: m[1]
      .split(',')
      .map((x) => x.trim().replace(/\s+/g, ' '))
      .filter(Boolean),
    body: m[2],
  })
)

describe('a shared hover is the same hover', () => {
  // mutation: shared-hover.stack-drops-peer-twin
  it('the stylesheet actually carries relayed hovers', () => {
    // if this hits zero the two tests below pass by finding nothing
    const n = RULES.filter((r) => r.selectors.some((s) => s.includes('.peerhover'))).length
    assert.ok(n >= 2, `only ${n} rules answer to .peerhover; the feature is unwired`)
    // A count alone stopped biting when the card's hover into two
    // rules: one surface could lose its relay and the total still cleared
    // the floor. So each surface a hand lights names its own relayed twin:
    // the cards and the pile's front card.
    for (const surface of ['.openable.peerhover', '.t-stack.peerhover'])
      assert.ok(
        RULES.some((r) => r.selectors.some((s) => s.startsWith(surface))),
        `${surface} carries no relayed hover; a peer's pointer lights nothing there`
      )
  })

  // mutation: shared-hover.peer-rule-of-its-own
  it('every .peerhover selector sits beside the :hover it copies', () => {
    // Same rule, same declarations, by construction. A .peerhover rule of its
    // own would be a second state that looks like the first until the day
    // someone edits one of them.
    const orphans = []
    for (const r of RULES) {
      for (const sel of r.selectors) {
        if (!sel.includes('.peerhover')) continue
        const local = sel.replace('.peerhover', ':hover')
        if (!r.selectors.includes(local)) orphans.push(`${sel}  (wants ${local} in the same rule)`)
      }
    }
    assert.deepEqual(
      orphans,
      [],
      `relayed hovers that paint something of their own:\n  ${orphans.join('\n  ')}`
    )
  })
})

describe('the shared set is closed, and mutation is not in it', () => {
  // every key the page can put on the wire: tiles are named by addNode from
  // their layout id, and everything else is named by hand. The lookbehind
  // skips `[data-hk="..."]`, which READS a key back out of the DOM rather
  // than granting one.
  //
  // TWO WAYS TO GRANT ONE, AND BOTH ARE COUNTED. This scanned
  // markup attributes only, so a key handed over as `el.dataset.hk = '...'`
  // walked straight past the boundary below without anyone deciding
  // anything. That is not hypothetical: the maker's mark was put on the wire
  // by exactly that line, and the list underneath did not budge. addNode's
  // own assignment is excluded because it is the layout's channel, which the
  // test above already guards.
  const attrs = [...APP.matchAll(/(?<!\[)data-hk="([^"]*)"/g)].map((m) => m[1])
  const assigned = [...APP.matchAll(/\.dataset\.hk = (?:'([^']*)'|"([^"]*)")/g)]
    .map((m) => m[1] ?? m[2])
    .filter((k) => k !== undefined)
  const literals = [...attrs, ...assigned]
  const tileIds = TILES.map((t) => t.id)

  // mutation: shared-hover.tiles-unkeyed
  it('tiles are keyed from the layout, not by hand', () => {
    // either spelling of the grant counts, as long as addNode makes it from
    // the tile's layout id
    assert.match(
      APP,
      /function addNode\([^)]*\)\s*\{[^}]*(?:\.dataset\.hk = t\.id|setAttribute\(\s*['"]data-hk['"],\s*t\.id\s*\))/,
      'addNode no longer names tiles from their layout id'
    )
    // and no tile is ALSO named by hand, which would be two sources for one key
    for (const lit of literals) {
      assert.ok(!tileIds.includes(lit), `${lit} is a tile id typed out by hand as well`)
    }
  })

  // mutation: shared-hover.hero-key-underscored
  it('every hand-written key is one the protocol accepts', () => {
    for (const lit of literals) {
      const probe = lit.replace(/\$\{[^}]*\}/g, '0') // a template hole is a row index
      assert.ok(isHoverKey(probe), `data-hk="${lit}" is not a key the wire will carry`)
    }
  })

  // tripwire: a frozen list on purpose; each key is a grant to strangers, so a new one has to be typed here by hand
  it('the hand-written keys are exactly these, and adding one is a decision', () => {
    // Not a style rule: this list is the boundary. Anything new here has to be
    // something a stranger may light on your screen, and that is a call worth
    // making on purpose rather than by adding an attribute.
    // The two hero doors carry no keys: a shortcut past a layout is a
    // symptom of a layout that cannot be read on its own.
    assert.deepEqual(literals.sort(), [
      // THE STATEMENT. The biggest thing on the ground and the
      // one a stranger disturbing is most worth seeing. It can be shared
      // because it is already shared: the phrase is the room's and the wrap
      // is a world constant, so a relayed point lands on the same glyph cell
      // in every tab. The maker's mark was on this list earlier the same day
      // and left with the stamp itself, when the statement took over the
      // mark's alphabet and the monogram became the same letter twice.
      'hero',
    ])
  })

  // mutation: shared-hover.transport-keyed
  it('the controls that mutate carry no key', () => {
    // A control can sit inside a tile that has a key of its own, so "nothing
    // nearby has one" is not the test. Each of these is checked where it is
    // built: the markup that makes the control must not name it.
    // The theme switch used to head this list and went with the second
    // theme; the full page's bar took its place (drawn
    // in kit-scroll.js), and it is the same kind of thing: a control
    // that moves YOU, which nobody else in the room should be dragged along
    // by.
    const controls = [
      ['the page bar', /export function pageBarMarkup\(([\s\S]*?)\n\}\n/, KIT_SCROLL],
      ['the snap scrollbar', /export function scrollMarkup\(([\s\S]*?)\n\}\n/, KIT_SCROLL],
      ['the preview walk', /fanNav\.innerHTML = scrollMarkup\([^)]*\)/, APP],
    ]
    for (const [what, re, src] of controls) {
      const m = re.exec(src)
      assert.ok(m, `${what}: the guard cannot find it any more, so it is guarding nothing`)
      assert.ok(
        !m[0].includes('data-hk'),
        `${what} is on the wire; starting it for everyone is a fight`
      )
    }
  })

  // mutation: shared-hover.move-leaks-zoom
  it('the client sends where it is and what it is doing, a squish, a front, a feed, or a watch, and nothing else', () => {
    // The outbound mirror of parseFrame: five sends, five shapes. The feed
    // is the slime mould's food, a cell of the dish; like the
    // squish and the front it names a thing ON THE GROUND and nothing about
    // another visitor's view.
    // The play is a replay started or stopped, a shared
    // mutation of a game on the ground like the front: a slug, a bool and the
    // game's last ply, nothing about anybody.
    // The move carries `d` (whether this tab's button is down,
    // which picks which of the two hands the room draws for it). That is a
    // third fact about the SENDER, next to where it is and what it is over,
    // and not a fourth thing it may ask the room to do; test/presence.test.js
    // holds that line on the parsing side.
    // The watch is a fact about the sender of the
    // same kind: whether THIS tab can see the dish, so the room sends the
    // dish to nobody who cannot. One boolean, nothing about anybody else.
    // The anchor `at` is a fourth fact about the sender: the
    // page block its pointer is on, so a reader of the same page can draw
    // it there. A slug and an index; nothing about another visitor.
    // With of:'sky' it says the same of the weather window, and
    // the dish's watch leaves `of` off. The push is the window's hand: a
    // shared mutation of a thing on the ground, like the feed, two capped
    // whole numbers and nothing about anybody.
    // The selection (shared highlighting) is a fifth fact about the sender:
    // the words it has selected on the page it reads, as blocks, offsets and
    // a few characters of quote, so the readers of that page can draw them.
    // Nothing about anybody else, and nothing anybody else's page does.
    //
    // `f` is whom the sender follows, a fact about the sender
    // like the rest, so the room can draw it in line behind that peer. The
    // act is a SESSION's (presence.js act sends it only inside one, and the
    // public room's parser has no kind for it, test/sessions.test.js): a
    // channel and a small object, relayed to the rest of that session.
    //
    // This counted `ws.send(` and regex-matched each call's text, so a sixth
    // field on an existing frame only failed if it broke the spelling. Now
    // every send has to be a JSON.stringify of an object literal, and the
    // literal's key set per type is the contract.
    const sends = [...PRESENCE.matchAll(/ws\.send\(/g)].map((m) => {
      const rest = PRESENCE.slice(m.index)
      const lit = rest.match(/^ws\.send\(JSON\.stringify\(\{([^{}]*)\}\)\)/)
      assert.ok(lit, `a send that is not a plain frame: ${rest.slice(0, 60)}`)
      const keys = lit[1]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
      const type = keys.find((p) => /^type\s*:/.test(p))?.match(/'([^']*)'/)?.[1]
      return [type, keys.map((p) => p.split(':')[0].trim()).sort()]
    })
    const shapes = Object.fromEntries(sends)
    assert.equal(sends.length, Object.keys(shapes).length, 'two sends share a type')
    assert.deepEqual(shapes, {
      feed: ['type', 'x', 'y'],
      front: ['i', 'stack', 'type'],
      play: ['n', 'on', 'stack', 'type'],
      move: ['at', 'd', 'f', 'fx', 'fy', 'k', 'type'],
      push: ['dx', 'dy', 'type'],
      sel: ['a', 'at', 'b', 'j', 'q', 'type', 'z'],
      squish: ['type'],
      watch: ['of', 'on', 'type'],
      act: ['ch', 'd', 'type'],
    })
  })
})
