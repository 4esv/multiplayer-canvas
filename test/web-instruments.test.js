// test/web-instruments.test.js
// /web-instruments on the Lo-Hi tech kit, built to the approved
// Synth board: photographs on the ground, one index card whose
// tabs are the instruments, one panel of kit parts in it, every one of them
// wired to the sound, the playing surface on its lower edge, a scope that
// draws the real output and no readout. No <svg> anywhere in the entry, and
// every surface fits from an SE to a desk without a control under a finger.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'

import { decodePng } from '../scripts/icon/png.mjs'
import { PX } from '../src/static/canvas/layout.js'
import {
  U,
  CTRL,
  FRETS,
  OCTAVES,
  TYPING,
  TYPING_OCTAVES,
  typed,
  shiftOctave,
  keybed,
  fretboard,
  pads,
  shotScale,
  SHOT_SCALES,
  WHITE,
  BLACK,
  PAD,
  previewTrace,
  liveTrace,
  envelopeCells,
  staffStep,
  noteGlyph,
  STAFF,
  WINDOWS,
  windowFor,
  staffLines,
  clefCells,
  sparks,
  QUAVER,
  quaverCells,
  quaverAt,
  FLIGHT,
  midiMessage,
  midiToNote,
  noteToMidi,
  GM_DRUMS,
} from '../src/static/canvas/instrument-surfaces.js'
import * as VOICES from '../src/static/canvas/instrument-voices.js'
import * as SURFACES from '../src/static/canvas/instrument-surfaces.js'

const ROOT = join(import.meta.dirname, '..')
const ENTRY = readFileSync(join(ROOT, 'content/feed/web-instruments.md'), 'utf8')
const CSS = readFileSync(join(ROOT, 'src/static/css/instruments.css'), 'utf8')
const TOKENS = readFileSync(join(ROOT, 'primitives/kit/canvas-tokens.css'), 'utf8')
const PAGE = readFileSync(join(ROOT, 'src/static/js/instruments.js'), 'utf8')

const PARTS = ['kick', 'snare', 'hat', 'tom1', 'tom2', 'crash'].map((id) => ({ id, name: id }))
// one instrument's card in the entry
const cardOf = (inst) => {
  const at = ENTRY.indexOf(`data-instrument="${inst}"`)
  return ENTRY.slice(at, ENTRY.indexOf('</section>', at))
}
// the surface's width in css px: the narrowest a keybed can be, an SE's
// (375, the sheet and the rig off), an iPhone 14's and a desk's
const WIDTHS = [308, 311, 326, 440, 640]
// a fretboard sits in a well: its edge and padding (instruments.js) come off
const NECK = 16
const surfaces = (w) => ({
  keys: keybed(),
  bass: fretboard(w - NECK, ['G2', 'D2', 'A1', 'E1']),
  uke: fretboard(w - NECK, ['A4', 'E4', 'C4', 'G4']),
  pads: pads(w, PARTS),
})

describe('web-instruments: the entry', () => {
  // mutation: web-instruments.svg-back
  it('has no <svg> in it: the controls are the kit, the pictures are PNGs', () => {
    assert.ok(!/<svg\b/i.test(ENTRY), 'an <svg> is back in content/feed/web-instruments.md')
    assert.ok(!/\.svg\b/i.test(ENTRY), 'the entry links an .svg file')
  })

  // mutation: web-instruments.shot-off-cell
  it('every picture is a PNG on disk at the size the markup declares, in whole cells', () => {
    const shots = [
      ...ENTRY.matchAll(
        /<img class="shot k-px" data-for="[a-z]+" src="([^"]+)" width="(\d+)" height="(\d+)"/g
      ),
    ]
    assert.equal(shots.length, 2, 'the Rhodes and the synth')
    for (const [, src, w, h] of shots) {
      const png = decodePng(readFileSync(join(ROOT, 'src/static', src)))
      assert.deepEqual([png.width, png.height], [Number(w), Number(h)], src)
      assert.equal(png.width % PX, 0, `${src} is not whole cells wide`)
      assert.equal(png.height % PX, 0, `${src} is not whole cells tall`)
    }
  })

  // tripwire: every picture on the page is credited with its licence in
  // SOURCES.md; a picture with no row is a picture nobody may ship.
  it('SOURCES.md credits every picture the page shows, with its licence', () => {
    const sources = readFileSync(join(ROOT, 'src/static/img/instruments/SOURCES.md'), 'utf8')
    const shots = [...ENTRY.matchAll(/<img class="shot k-px" data-for="[a-z]+" src="([^"]+)"/g)]
    for (const [, src] of shots) {
      const f = src.split('/').pop()
      assert.match(sources, new RegExp(`\`${f}\`[^\\n]*CC BY`), f)
    }
  })

  // mutation: web-instruments.own-chrome
  it('wears the kit and restates none of it: instruments.css only lays out', () => {
    const plain = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const prop of ['border', 'background', 'box-shadow', 'outline', 'transition'])
      assert.ok(
        !new RegExp(`(^|[\\s;{])${prop}(-[a-z-]+)?\\s*:`, 'm').test(plain),
        `instruments.css sets ${prop}: a look belongs in kit.css`
      )
    for (const cls of [
      'k-cardtabs',
      'k-cardtab',
      'k-card',
      'k-strip',
      'k-sec',
      'k-knob',
      'k-toggle',
      'k-rk',
      'k-fader',
      'k-pin',
      'k-scope',
      'k-lamp',
    ])
      assert.match(ENTRY, new RegExp(`class="[^"]*\\b${cls}\\b`), `the entry has no .${cls}`)
    // the round-3 kit this replaced
    for (const cls of [
      'thumb',
      'k-seg',
      'k-tabs',
      'k-slider',
      'k-well',
      'k-lcd',
      'k-pad',
      'k-label',
    ]) {
      assert.ok(!new RegExp(`class="[^"]*\\b${cls}\\b`).test(ENTRY), `.${cls} is back`)
      assert.ok(!new RegExp(`['"\\s]${cls}['"\\s]`).test(PAGE), `instruments.js sets .${cls}`)
    }
    // the kit's ground is .k-ground; a bare .k is nothing
    assert.match(ENTRY, /<section class="rig k-ground"/)
  })

  // mutation: web-instruments.line-half-cell
  // Every line the page
  // lays is one cell (--cv-px): a string, a staff line, a ledger and the
  // rules the phone layout tucks under the card's edge.
  it('every line it lays is one cell: no 1px or 2px left in its layout or its script', () => {
    const bare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const [name, text] of [
      ['instruments.css', CSS],
      ['instruments.js', PAGE],
    ])
      assert.deepEqual(
        bare(text).match(/-?\b[12]px\b/g) ?? [],
        [],
        `${name} lays a line under a cell`
      )
  })

  // mutation: web-instruments.kit-part-unset
  // kit.css wears its parts through --kp-<part>-<state>, which a template
  // page sets from kit/parts.njk. This page is an entry, so the rig
  // sets them itself, at URLs the server versions like every /img URL.
  it('sets every part kit.css wears on the rig, or its pads and radios have no face', () => {
    const KIT = readFileSync(join(ROOT, 'primitives/kit/kit.css'), 'utf8')
    const worn = [...new Set([...KIT.matchAll(/var\(--kp-([\w-]+)\)/g)].map((m) => m[1]))]
    assert.ok(worn.length >= 7, `kit.css wears only ${worn.length} parts`)
    const style = /<section class="rig k-ground"[^>]* style="([^"]+)"/.exec(ENTRY)?.[1] ?? ''
    for (const part of worn)
      assert.ok(
        style.includes(`--kp-${part}: url('/img/kit/${part}.png')`),
        `the rig does not set --kp-${part}`
      )
  })

  // mutation: web-instruments.part-unhashed
  // Every /img URL carries its bytes' hash. The script swaps a control
  // to another part's picture, so every picture it can ask for is named in
  // the entry, where the server versions it, and the script asks for a
  // picture only through that list.
  it('asks for a part picture only at its hash: every one it swaps to is named in the entry', () => {
    const named = new Set(/data-parts="([^"]+)"/.exec(ENTRY)?.[1].split(' ') ?? [])
    const asked = new Set()
    for (const m of PAGE.matchAll(/partSrc\(('[a-z]+'|name), ([^)]+)\)/g)) {
      const names = m[1] === 'name' ? ['white', 'black'] : [m[1].slice(1, -1)]
      const states =
        m[2] === 'v'
          ? ['0', '1', '2', '3', '4', '5', '6', '7']
          : [...m[2].matchAll(/'([a-z]+)'/g)].map((q) => q[1])
      for (const n of names) for (const st of states) asked.add(`/img/kit/${n}-${st}.png`)
    }
    assert.ok(asked.size >= 18, `only ${asked.size} part pictures found in instruments.js`)
    for (const url of asked) assert.ok(named.has(url), `${url} is asked for but not in data-parts`)
    assert.match(PAGE, /return PART_URL\.get\(path\) \|\| path/)
    const code = PAGE.replace(/^\s*\/\/.*$/gm, '')
    assert.equal([...code.matchAll(/['"`]\/img\//g)].length, 1, 'an /img URL built outside partSrc')
  })

  // tripwire: keep the
  // index card, lose the nesting inside it
  it('is one index card: five tabs rising out of it, one panel in each card, nothing nested', () => {
    const tabs = [...ENTRY.matchAll(/class="k-cardtab"[^>]*>([^<]+)</g)].map((m) => m[1])
    assert.deepEqual(tabs, ['epiano', 'bass', 'uke', 'drums', 'synth'])
    const card = ENTRY.slice(ENTRY.indexOf('<div class="k-card">'))
    assert.ok(!/role="tab"/.test(card), 'a tab inside the card')
    assert.ok(!/\bk-panel\b|\bk-card\b[^s]/.test(card.slice(20)), 'a box inside the card')
    const cards = [...card.matchAll(/<section [^>]*data-instrument="([a-z]+)"/g)].map((m) => m[1])
    assert.deepEqual(cards, ['rhodes', 'bass', 'ukulele', 'drums', 'synth'])
    for (const inst of cards)
      assert.equal(cardOf(inst).match(/class="k-strip panel"/g)?.length, 1, `${inst}: one panel`)
  })

  // mutation: web-instruments.readout-back
  it('shows no readout: no Hz, no LCD, no wall of stats, no model name', () => {
    for (const [name, text] of [
      ['the entry', ENTRY],
      ['the page', PAGE],
    ]) {
      assert.ok(!/\bHz\b/.test(text), `${name} prints a frequency`)
      assert.ok(!/k-lcd|data-values|data-readout|k-digit/.test(text), `${name} has a readout`)
      assert.ok(
        !/FM electric piano|subtractive pluck|nylon pluck/i.test(text),
        `${name}: a model name`
      )
    }
  })

  // mutation: web-instruments.midi-drawn-anyway
  it('draws no MIDI where there is no Web MIDI: the lamp ships hidden, the page shows it', () => {
    const sections = [...ENTRY.matchAll(/<div class="k-sec midi"[^>]*>/g)].map((m) => m[0])
    assert.equal(sections.length, 5, 'a midi lamp on every card')
    for (const s of sections) assert.match(s, /\bhidden\b/)
    const guard = PAGE.indexOf('if (!navigator.requestMIDIAccess) return')
    const shown = PAGE.indexOf("querySelectorAll('[data-midi]').forEach((s) => (s.hidden = false))")
    assert.ok(guard > 0 && shown > guard, 'the lamp is drawn before asking whether MIDI exists')
  })

  // tripwire: CTRL restates --cv-ctrl-h in a DOM-free module; a floor that
  // moves in the tokens has to move the layout with it
  it('the tap floor this file lays out on is the one the tokens declare', () => {
    assert.match(TOKENS, new RegExp(`--cv-ctrl-h:\\s*${CTRL}px;`))
  })
})

describe('web-instruments: the surfaces fit the column', () => {
  // the narrowest each board can be: every column at the tap floor. A board
  // wider than its column scrolls in it (instruments.css .scroll); one wider
  // than its floor in a column it does not fill has grown past the column.
  const FLOOR = {
    keys: 7 * OCTAVES * WHITE.w,
    bass: FRETS * CTRL,
    uke: FRETS * CTRL,
    pads: 2 * PAD.w + 2 * PX,
  }
  for (const w of WIDTHS)
    // mutation: web-instruments.pad-under-finger
    it(`at ${w}px every surface is on the cell, under no finger, and past the column only at its floor`, () => {
      for (const [name, s] of Object.entries(surfaces(w))) {
        const column = name === 'bass' || name === 'uke' ? w - NECK : w
        assert.ok(
          s.w <= Math.max(column, FLOOR[name]),
          `${name} is ${s.w}px in a ${column}px column`
        )
        for (const z of s.zones) {
          assert.ok(
            z.x >= 0 && z.y >= 0 && z.x + z.w <= s.w && z.y + z.h <= s.h,
            `${name}: a zone hangs off the surface`
          )
          // sizes are whole cells; an edge may take the half cell, the label
          // hand's pixel, and nothing finer
          for (const v of [z.w, z.h]) assert.equal(v % PX, 0, `${name}: ${v}px is not whole cells`)
          for (const v of [z.x, z.y]) assert.equal(v % U, 0, `${name}: ${v}px is off the lattice`)
          // the kit's tap floor, as drawn
          assert.ok(z.w >= CTRL && z.h >= CTRL, `${name}: a ${z.w}x${z.h}px control`)
        }
      }
    })

  // mutation: web-instruments.frets-shrink
  it('four strings by nine frets (open and eight), at every width', () => {
    assert.equal(FRETS, 9)
    for (const w of [...WIDTHS, 1600]) {
      const s = surfaces(w)
      for (const board of [s.bass, s.uke])
        for (let str = 0; str < 4; str++)
          assert.equal(board.zones.filter((z) => z.string === str).length, 9, `${w}px`)
    }
    // each fret a semitone up its string
    assert.deepEqual(
      surfaces(326)
        .bass.zones.filter((z) => z.string === 3)
        .map((z) => z.note),
      ['E1', 'F1', 'F#1', 'G1', 'G#1', 'A1', 'A#1', 'B1', 'C2']
    )
  })

  // mutation: web-instruments.keys-one-octave
  it('two octaves of keys drawn, C4 to B5, 24 keys at every width', () => {
    const notes = (o) => [...['C', 'D', 'E', 'F', 'G', 'A', 'B'].map((n) => n + o)]
    for (const w of [...WIDTHS, 1600]) {
      const { zones } = keybed()
      assert.equal(zones.length, 24, `${w}px`)
      assert.deepEqual(
        zones.filter((z) => !z.black).map((z) => z.note),
        [...notes(4), ...notes(5)]
      )
      assert.deepEqual(
        zones.filter((z) => z.black).map((z) => z.note),
        ['C#4', 'D#4', 'F#4', 'G#4', 'A#4', 'C#5', 'D#5', 'F#5', 'G#5', 'A#5']
      )
    }
    // the octave control moves the drawn keys: the same board from C2
    const low = keybed({ octave: 2 })
    assert.deepEqual(
      low.zones.filter((z) => !z.black).map((z) => z.note),
      [...notes(2), ...notes(3)]
    )
    assert.deepEqual(
      low.zones.map((z) => [z.x, z.y, z.w, z.h]),
      keybed().zones.map((z) => [z.x, z.y, z.w, z.h]),
      'the keys stand where they stood'
    )
    // and the page relays the keys from the row, naming each C
    assert.match(PAGE, /layout: \(\) => lay\.keybed\(\{ octave \}\)/)
    assert.match(PAGE, /surface\.relayout\(\)/)
    assert.match(PAGE, /name\.className = 'cname k-meta'/)
  })

  it('six pads: all in a row on a desk, two a row on a phone', () => {
    const s = surfaces(326)
    assert.deepEqual(
      s.pads.zones.map((z) => z.part),
      PARTS.map((p) => p.id)
    )
    assert.equal(new Set(pads(1264, PARTS).zones.map((z) => z.y)).size, 1)
    assert.equal(new Set(s.pads.zones.map((z) => z.y)).size, 3)
  })

  // mutation: web-instruments.black-key-offset
  it('a black key straddles the line between the two white keys it sits between', () => {
    for (const w of WIDTHS) {
      const { zones } = keybed()
      const white = (n) => zones.find((z) => z.note === n)
      for (const [black, left] of [
        ['C#4', 'C4'],
        ['F#4', 'F4'],
        ['A#4', 'A4'],
      ]) {
        const b = zones.find((z) => z.note === black)
        const line = white(left).x + white(left).w
        assert.equal(b.x + b.w / 2, line, `${black} is off its line at ${w}px`)
      }
    }
  })

  it('nothing overlaps but a black key over the whites, and no black key over another', () => {
    const cross = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    for (const w of WIDTHS)
      for (const [name, s] of Object.entries(surfaces(w)))
        s.zones.forEach((a, i) =>
          s.zones.slice(i + 1).forEach((b) => {
            if (!cross(a, b)) return
            assert.ok(a.black !== b.black, `${name}: two controls overlap at ${w}px`)
          })
        )
  })

  // mutation: web-instruments.keys-stretched
  it("keys and pads are the kit's own parts at their own size, never stretched (U12)", () => {
    const kit = (f) => decodePng(readFileSync(join(ROOT, 'src/static/img/kit', `${f}.png`)))
    for (const [part, size] of [
      ['white-up', WHITE],
      ['black-up', BLACK],
      ['btn-up', PAD],
    ]) {
      const png = kit(part)
      assert.deepEqual([png.width, png.height], [size.w, size.h], part)
    }
    const { zones } = keybed()
    for (const z of zones)
      assert.deepEqual([z.w, z.h], z.black ? [BLACK.w, BLACK.h] : [WHITE.w, WHITE.h])
    for (const z of pads(1600, PARTS).zones) assert.deepEqual([z.w, z.h], [PAD.w, PAD.h])
    // the Synth board's taller keys: a white 88 by 176, a black 48 tall
    // enough to leave a finger's room below it
    assert.deepEqual([WHITE.w, WHITE.h], [88, 176])
    assert.ok(WHITE.h - BLACK.h >= CTRL)
  })
})

describe('web-instruments: the computer keyboard', () => {
  // mutation: web-instruments.typing-layout
  it("types GarageBand's layout: a to ' the whites from C, w e t y u o p the blacks", () => {
    const home = [..."asdfghjkl;'"].map((ch) => typed(ch, 4))
    assert.deepEqual(home, ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5'])
    const blacks = [...'wetyuop'].map((ch) => typed(ch, 4))
    assert.deepEqual(blacks, ['C#4', 'D#4', 'F#4', 'G#4', 'A#4', 'C#5', 'D#5'])
    assert.equal(TYPING.length, 18)
    assert.equal(typed('q', 4), null, 'q is not a key')
  })

  // mutation: web-instruments.octave-shift
  it('z shifts the typing octave down and x up, within the range, and the notes follow', () => {
    assert.equal(shiftOctave('z', 4), 3)
    assert.equal(shiftOctave('x', 4), 5)
    assert.equal(shiftOctave('a', 4), 4, 'a note key leaves the octave alone')
    const [lo, hi] = TYPING_OCTAVES
    assert.equal(shiftOctave('z', lo), lo)
    assert.equal(shiftOctave('x', hi), hi)
    assert.equal(typed('a', shiftOctave('x', 4)), 'C5')
    assert.equal(typed('a', shiftOctave('z', 4)), 'C3')
    // the range is the octave row's: C2 to C5, on both keyboards, and z
    // and x step that row (the page clicks the button, so it lights)
    assert.deepEqual([lo, hi], [2, 5])
    for (const inst of ['rhodes', 'synth']) {
      const row = /<div class="k-radio"[^>]*data-radio="octave">([\s\S]*?)<\/div><\/div>/.exec(
        cardOf(inst)
      )
      assert.ok(row, `${inst} has no octave row`)
      assert.deepEqual(
        [...row[1].matchAll(/data-value="(\d)"/g)].map((m) => Number(m[1])),
        [2, 3, 4, 5]
      )
      assert.match(row[0], /aria-checked="true"[^>]*aria-label="keys from C4"/)
      assert.match(row[0], /aria-keyshortcuts="z x"/)
    }
    assert.match(PAGE, /lay\.shiftOctave\(ch, octave\)/)
    assert.match(PAGE, /radios\.find\(\(r\) => Number\(r\.dataset\.value\) === to\)/)
    assert.ok(!/a = C\$\{octave\}/.test(PAGE), 'the typed-octave text line is back')
  })

  // mutation: web-instruments.fret-rows
  it("frets are typed on main's rows, the lowest string on the bottom row", () => {
    const m = /const FRET_KEYS = (\[[^\]]*\])/.exec(PAGE)
    assert.ok(m, 'FRET_KEYS is gone from instruments.js')
    const rows = JSON.parse(m[1].replace(/'/g, '"'))
    assert.deepEqual(rows, ['123456789', 'qwertyuio', 'asdfghjkl', 'zxcvbnm,.'])
    for (const r of rows) assert.equal(r.length, FRETS)
    // top string first in the entry, so the fourth string (E on the bass,
    // the re-entrant G on the uke, main's FRET_ROWS) is the bottom row
    assert.deepEqual(
      [...ENTRY.matchAll(/data-strings="([^"]+)"/g)].map((x) => x[1]),
      ['G2,D2,A1,E1', 'A4,E4,C4,G4']
    )
  })

  // mutation: web-instruments.no-scroller
  it('a board wider than its column scrolls sideways in it rather than losing range', () => {
    const rule = /\.surface \.scroll \{([^}]*)\}/.exec(CSS)
    assert.ok(rule, 'instruments.css has no .surface .scroll')
    assert.match(rule[1], /overflow-x:\s*auto/)
    assert.match(rule[1], /touch-action:\s*pan-x/)
    assert.match(PAGE, /scroll\.className = 'scroll'/)
  })
})

// The page run in a VM on a stub DOM, with an AudioContext that counts
// itself: sound starts with the visitor's hand, never on load. The
// stub keeps what the page does to it (attributes, listeners, the elements
// it makes, the address it writes, the events it sends) so a test can read
// it back. With `modules` the layout and a spy for the voices are handed to
// the page's import, so the panel and the surfaces are wired as in a
// browser; without, the import fails and the card stands on its markup.
function loadPage({ hash = '', session, followed = false, modules = false } = {}) {
  const noop = () => {}
  let contexts = 0
  const on = {}
  const made = []
  const el = ({ attrs: given = {}, ...extra } = {}) => {
    const attrs = { ...given }
    const own = {}
    const node = {
      dataset: {},
      style: { setProperty: noop },
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      attrs,
      on: own,
      clientWidth: 640,
      isConnected: true,
      getClientRects: () => [{}],
      setAttribute: (k, v) => (attrs[k] = v),
      getAttribute: (k) => attrs[k] ?? null,
      toggleAttribute: noop,
      addEventListener: (type, fn) => (own[type] ||= []).push(fn),
      fire: (type, e = {}) => (own[type] || []).forEach((fn) => fn(e)),
      focus: noop,
      remove: noop,
      querySelector: () => el(),
      querySelectorAll: () => [],
      replaceChildren: noop,
      append: noop,
      appendChild: noop,
      after: noop,
      setPointerCapture: noop,
      ...extra,
    }
    return node
  }
  // a knob on the Rhodes, so a control can be moved by hand and by a peer
  const knob = el({ dataset: { knob: 'tone' }, attrs: { 'aria-valuenow': '4' } })
  const HOST = {
    rhodes: '[data-keys]',
    synth: '[data-keys]',
    bass: '[data-frets]',
    ukulele: '[data-frets]',
    drums: '[data-pads]',
  }
  const STRINGS = { bass: 'G2,D2,A1,E1', ukulele: 'A4,E4,C4,G4' }
  const slides = ['rhodes', 'bass', 'ukulele', 'drums', 'synth'].map((instrument) =>
    el({
      dataset: { instrument },
      querySelector: (q) =>
        /^\[data-(keys|frets|pads)\]$/.test(q)
          ? q === HOST[instrument]
            ? el({ dataset: { strings: STRINGS[instrument] } })
            : null
          : el(),
      querySelectorAll: (q) => (q === '[data-knob]' && instrument === 'rhodes' ? [knob] : []),
    })
  )
  const tabs = slides.map(() => el())
  // the card's root, one node the test can hide (the sheet closed) or take
  // out of the document (another page opened over it)
  const rig = el({ getClientRects: () => (rig.hidden ? [] : [{}]) })
  // every signal a page-wide listener was given, so a test can see that the
  // page took its listeners off when it left
  const signals = []
  const listen = (bag, type, fn, opts) => {
    if (opts?.signal) signals.push(opts.signal)
    bag[type] = (e) => (opts?.signal?.aborted ? undefined : fn(e))
  }
  const document = {
    documentElement: {
      dataset: { ...(session ? { session } : {}), ...(followed ? { followed: '' } : {}) },
    },
    querySelectorAll: (q) => (q === '.carousel-slide' ? slides : q === '.k-cardtab' ? tabs : []),
    querySelector: (q) => (q === '.rig' ? rig : el()),
    createElement: () => {
      const e = el()
      made.push(e)
      return e
    },
    getElementById: () => el(),
    on: {},
    addEventListener: (type, fn, opts) => listen(document.on, type, fn, opts),
  }
  class AudioContext {
    constructor() {
      contexts++
      this.state = 'running'
    }
    createBufferSource() {
      return { connect: noop, start: noop }
    }
    createBuffer() {
      return {}
    }
    createGain() {
      return { connect: (n) => n }
    }
    createAnalyser() {
      return { connect: (n) => n }
    }
  }
  const sent = []
  const voiced = []
  const voice =
    (name) =>
    (a, bus, o, args = {}) => {
      const v = { hz: null, release: () => voiced.push(['release', name, args.note]) }
      voiced.push([name, args.note ?? args])
      return v
    }
  const location = { pathname: '/web-instruments', search: '?a=1', hash }
  const history = {
    state: { sheet: 'web-instruments', direct: true },
    written: [],
    replaceState(state, title, url) {
      this.written.push([state, title, url])
      location.hash = url.slice(url.indexOf('#'))
    },
  }
  const window = {
    AudioContext,
    CustomEvent: class {
      constructor(type, init) {
        this.type = type
        this.detail = init?.detail
      }
    },
    dispatchEvent: (e) => sent.push(e),
    matchMedia: () => ({ matches: false }),
    addEventListener: (type, fn, opts) => listen(on, type, fn, opts),
    removeEventListener: noop,
    innerHeight: 900,
    innerWidth: 500,
  }
  const mods = {
    surfaces: SURFACES,
    voices: {
      KIT: VOICES.KIT,
      rhodes: voice('rhodes'),
      sawPluck: voice('sawPluck'),
      nylonPluck: voice('nylonPluck'),
      synth: voice('synth'),
      drum: (a, bus, o, part) => (voiced.push(['drum', part]), { hz: null }),
    },
  }
  const code = modules
    ? PAGE.replace(
        /import\('\/canvas\/instrument-(surfaces|voices)\.js'\)/g,
        (m, name) => `Promise.resolve(__mods.${name})`
      )
    : PAGE
  vm.runInNewContext(code, {
    window,
    document,
    location,
    history,
    navigator: {},
    ResizeObserver: class {
      observe() {}
    },
    requestAnimationFrame: noop,
    performance,
    AbortController,
    // a held note's ceiling is ten seconds; the test does not wait on it
    setTimeout: (fn, ms) => setTimeout(fn, ms).unref(),
    clearTimeout,
    __mods: mods,
  })
  // the import resolves on a later turn; a test awaits `ready` first
  const ready = new Promise((r) => setTimeout(r, 0))
  const selected = () => tabs.findIndex((t) => t.attrs['aria-selected'] === 'true')
  const peer = (detail) => on['canvas:peer-act']({ detail })
  // the computer keyboard, which reaches the same surfaces as a finger
  const key = (type, k) =>
    document.on[type]({ key: k, target: { tagName: 'BODY' }, preventDefault: noop })
  return {
    contexts: () => contexts,
    rig,
    signals,
    document,
    on,
    tabs,
    selected,
    history,
    sent,
    voiced,
    made,
    knob,
    peer,
    key,
    ready,
  }
}

describe('web-instruments: no sound until the hand', () => {
  // mutation: web-instruments.plays-on-load
  it('loading the page opens no audio; the first touch does', () => {
    const page = loadPage()
    assert.equal(page.contexts(), 0, 'something made sound on load')
    // the counter is live: the first pointerdown is the hand, and it primes
    page.on.pointerdown()
    assert.equal(page.contexts(), 1)
  })
})

describe('web-instruments: the picture is shown on the cell', () => {
  // The snap: a watch measured the Rhodes at 0.315 by 0.5, half
  // on one axis and squeezed to the column on the other. The scales are the
  // divisors of PX, so a quarter (a css px a cell) is the floor where half
  // is wider than the column, and the scale is the picture's only size.
  // mutation: web-instruments.shot-any-fraction, web-instruments.shot-squeezed
  it('at its own size, a half or a quarter, never enlarged and never a fraction between', () => {
    assert.deepEqual(SHOT_SCALES, [1, 2, 4])
    assert.equal(shotScale(464, 128, 1264, 270), 1, 'a picture is never blown up past its bake')
    assert.equal(shotScale(464, 128, 640), 1)
    assert.equal(shotScale(464, 128, 318), 2, 'a phone halves it')
    assert.equal(shotScale(476, 360, 900, 270), 2, 'a short window halves it')
    assert.equal(shotScale(476, 360, 238), 2, 'half, where half fits the column')
    assert.equal(shotScale(476, 360, 150), 4, 'a watch quarters it')
    assert.equal(shotScale(476, 360, 100), 4, 'and a quarter is the floor')
    for (const k of SHOT_SCALES) assert.equal((PX / k) % 1, 0, 'a cell stays whole css px')
    // one scale for the set: the page takes the one the largest needs
    assert.match(PAGE, /k = Math\.max\(k, shotScale\(/)
    // and the reading column never fits it to itself on one axis
    assert.match(PAGE, /img\.style\.maxWidth = 'none'/)
  })
})

describe('web-instruments: MIDI in', () => {
  it('reads note on, note off, and a note on at velocity 0 as the off it is', () => {
    assert.deepEqual(midiMessage([0x90, 60, 127]), { on: true, note: 'C4', velocity: 1 })
    assert.deepEqual(midiMessage([0x93, 69, 0]), { on: false, note: 'A4' })
    assert.deepEqual(midiMessage([0x80, 40, 64]), { on: false, note: 'E2' })
    assert.equal(midiMessage([0xb0, 64, 127]), null, 'a sustain pedal is not a note')
  })

  it('names every MIDI note the way the voices read it, and back', () => {
    for (let n = 12; n < 120; n++) assert.equal(noteToMidi(midiToNote(n)), n)
    assert.equal(midiToNote(21), 'A0')
  })

  it("General MIDI's drums land on the six pads", () => {
    const ids = new Set(PARTS.map((p) => p.id))
    assert.ok(Object.values(GM_DRUMS).every((p) => ids.has(p)))
    assert.deepEqual([GM_DRUMS[36], GM_DRUMS[38], GM_DRUMS[42]], ['kick', 'snare', 'hat'])
  })
})

// The synth must not shake. Measured (scripts/verify/instrument-motion.mjs,
// CDP, 60 Hz): the LCD's k-settle ramp restarted on every note (34 luminance
// changes in 1.5 s of typing), a struck key sank below its scroller and the
// scrollbar that flipped in moved the whole board 7.5 px, and the press
// padded its label in four steps. Nothing on the page may shake, strobe or
// flash (WCAG 2.3.1): the stylesheets the page loads run no animation, no
// transition moves a box, and a press is a state.
describe('web-instruments: nothing shakes, strobes or flashes', () => {
  const KIT = readFileSync(join(ROOT, 'primitives/kit/kit.css'), 'utf8')
  const sheets = { 'kit.css': KIT, 'instruments.css': CSS }
  const bare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

  // The kit keeps one animation, the text field's caret (kit.css .k-field),
  // and this page has no field. No animation may reach a class the page
  // wears or sets.
  // mutation: web-instruments.scope-cell-blinks
  it('runs no animation on anything it wears: a changed value is drawn, not flashed', () => {
    for (const [name, css] of Object.entries(sheets))
      for (const [, sel, body] of bare(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/\banimation(-name)?\s*:/.test(body)) continue
        for (const [, cls] of sel.matchAll(/\.([a-z][\w-]*)/g))
          assert.ok(
            !new RegExp(`\\b${cls}\\b`).test(ENTRY + PAGE),
            `${name} animates .${cls}, which the page wears`
          )
      }
    assert.ok(!/@keyframes/.test(bare(CSS)), 'instruments.css declares a @keyframes')
  })

  // mutation: web-instruments.press-slides-label
  it('no transition moves a box: a press changes tone, the label drops in one go', () => {
    const MOVES =
      /\b(transform|translate|margin|padding|inset|left|top|right|bottom|width|height|all)\b/
    for (const [name, css] of Object.entries(sheets)) {
      for (const m of bare(css).matchAll(/\btransition(-property)?\s*:\s*([^;}]+)/g)) {
        const props = m[2].split(',').map((p) => p.trim().split(/\s+/)[0])
        for (const p of props) assert.ok(!MOVES.test(p), `${name} transitions ${p}`)
      }
    }
  })

  // mutation: web-instruments.sink-overflows
  it('a struck key sinks into a cell of floor, never past the scroller', () => {
    const scroll = /\.surface \.scroll \{[^}]*overflow-y:\s*hidden/.test(bare(CSS))
    const floor = /\.surface \.deck \{[^}]*padding-bottom:\s*var\(--cv-px\)/.test(bare(CSS))
    assert.ok(scroll, 'the scroller can grow a vertical bar when a key sinks')
    assert.ok(floor, 'the deck has no cell of floor for a key to sink into')
  })

  // tripwire: a press is a state in the Lo-Hi kit (a picture swapped), so
  // there is nothing to reduce; a transition that comes back has to come
  // back with the reduced-motion block that turns it off
  it('honours prefers-reduced-motion: any transition the kit runs is off under it', () => {
    const outside = bare(KIT).replace(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/,
      ''
    )
    if (!/\btransition\s*:/.test(outside)) return
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(KIT)
    assert.ok(block && /transition: none/.test(block[1]), 'a transition with no reduced-motion off')
  })

  // mutation: web-instruments.scope-strobes
  it('the scope redraws three times a second at most, and stops when the sound does', () => {
    const ms = Number(/const REDRAW_MS = (\d+)/.exec(PAGE)?.[1])
    assert.ok(ms >= 1000 / 3, `the scope redraws every ${ms} ms`)
    assert.match(PAGE, /if \(peak < SILENT\) \{\n\s*watching = false/)
  })
})

// An AudioContext that plays nothing and writes down everything a voice does
// to it: every node it makes, every value and ramp it sets, every wire. Two
// voices that differ in any way a listener could hear write different logs.
function recorder() {
  const log = []
  let n = 0
  const val = (v) =>
    ArrayBuffer.isView(v) ? v.reduce((a, b) => a + b, 0).toFixed(4) : (v?.id ?? v)
  const param = (id, name) => {
    const p = {}
    for (const m of [
      'setValueAtTime',
      'linearRampToValueAtTime',
      'exponentialRampToValueAtTime',
      'setTargetAtTime',
      'cancelScheduledValues',
      'cancelAndHoldAtTime',
    ])
      p[m] = (...args) => {
        log.push([id, name, m, ...args.map(val)])
        return p
      }
    return new Proxy(p, {
      set(t, k, v) {
        log.push([id, name, k, val(v)])
        return true
      },
    })
  }
  const node = (type) => {
    const id = `${type}#${n++}`
    const own = {
      id,
      connect(to) {
        log.push([id, '->', to.id])
        return to
      },
      start: (t = 0) => log.push([id, 'start', t]),
      stop: (t = 0) => log.push([id, 'stop', t]),
    }
    return new Proxy(own, {
      get(t, k) {
        if (k in t) return t[k]
        if (typeof k === 'string' && /^[a-zA-Z]+$/.test(k)) return (t[k] = param(id, k))
        return undefined
      },
      set(t, k, v) {
        log.push([id, k, '=', val(v)])
        t[k] = v
        return true
      },
    })
  }
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    createBuffer: (ch, length, sampleRate) => ({
      id: `buffer#${n++}`,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
  }
  for (const k of [
    'Gain',
    'Oscillator',
    'BiquadFilter',
    'BufferSource',
    'ConstantSource',
    'WaveShaper',
  ])
    ctx[`create${k}`] = () => node(k.toLowerCase())
  return { ctx, dest: { id: 'bus' }, log }
}

// the page's options, as its markup sets them (instruments.js wirePanel)
function optionsOf(card) {
  const o = { patch: {} }
  for (const [, k, v] of card.matchAll(/data-knob="(\w+)"[^>]*aria-valuenow="(\d+)"/g)) o[k] = +v
  for (const [, k, v] of card.matchAll(/data-fader="(\w+)"[^>]*aria-valuenow="(\d+)"/g)) o[k] = +v
  for (const [, k, v] of card.matchAll(/data-toggle="(\w+)" aria-pressed="(\w+)"/g))
    o[k] = v === 'true'
  for (const [, k, v] of card.matchAll(/data-pin="([\w:]+)" aria-pressed="(\w+)"/g))
    o.patch[k] = v === 'true'
  for (const [, k, body] of card.matchAll(
    /data-radio="(\w+)">([\s\S]*?)<\/div><\/div>(?!<div class="stack">)/g
  )) {
    const on = /data-value="([^"]+)" aria-checked="true"/.exec(body)[1]
    o[k] = k === 'octave' ? Number(on) : on
  }
  return o
}
// every control a card draws, with a value that is not its default
function controlsOf(card) {
  const out = []
  for (const [, k, v] of card.matchAll(/data-knob="(\w+)"[^>]*aria-valuenow="(\d+)"/g))
    out.push([`knob ${k}`, (o) => (o[k] = +v === 7 ? 6 : +v + 1)])
  for (const [, k, v] of card.matchAll(/data-fader="(\w+)"[^>]*aria-valuenow="(\d+)"/g))
    out.push([`fader ${k}`, (o) => (o[k] = +v === 8 ? 7 : +v + 1)])
  for (const [, k] of card.matchAll(/data-toggle="(\w+)"/g))
    out.push([`toggle ${k}`, (o) => (o[k] = !o[k])])
  for (const [, k] of card.matchAll(/data-pin="([\w:]+)"/g))
    out.push([`pin ${k}`, (o) => (o.patch[k] = !o.patch[k])])
  for (const [, k, body] of card.matchAll(
    /data-radio="(\w+)">([\s\S]*?)<\/div><\/div>(?!<div class="stack">)/g
  ))
    for (const [, v, on] of body.matchAll(/data-value="([^"]+)" aria-checked="(\w+)"/g))
      if (on === 'false') out.push([`${k} ${v}`, (o) => (o[k] = k === 'octave' ? Number(v) : v)])
  return out
}
// a phrase on each instrument: two notes (so a glide has one to come from),
// each let go (so a release, a damper and an R are heard)
const PHRASE = {
  rhodes: (o, r) =>
    ['C4', 'E4'].map((note) => VOICES.rhodes(r.ctx, r.dest, o, { note })?.release?.()),
  bass: (o, r) => ['E1', 'A1'].map((note) => VOICES.sawPluck(r.ctx, r.dest, o, { note })),
  ukulele: (o, r) => ['C4', 'A4'].map((note) => VOICES.nylonPluck(r.ctx, r.dest, o, { note })),
  drums: (o, r) => PARTS.map(({ id }) => VOICES.drum(r.ctx, r.dest, o, id)),
  synth: (o, r) => {
    const mem = {}
    for (const note of ['C4', 'E4']) VOICES.synth(r.ctx, r.dest, o, { note }, mem)?.release()
  },
}
// what a control does that is not in its voice: the strum is a barre the
// surface plays across the strings (instruments.js wireFrets), and the
// octave row moves the keys themselves, so a note reaches the voice at its
// pitch and the voice transposes nothing
const ON_THE_SURFACE = new Set([
  'ukulele toggle strum',
  ...[2, 3, 5].flatMap((o) => [`rhodes octave ${o}`, `synth octave ${o}`]),
])

function played(inst, o) {
  const random = Math.random
  Math.random = () => 0.5
  const timer = globalThis.setTimeout
  globalThis.setTimeout = () => 0
  try {
    const r = recorder()
    PHRASE[inst](o, r)
    return JSON.stringify(r.log)
  } finally {
    Math.random = random
    globalThis.setTimeout = timer
  }
}

describe('web-instruments: every control changes the sound', () => {
  // Every knob, fader, toggle,
  // pin and radio button a card draws is turned off its default, and the
  // voice has to build a different graph for it.
  for (const inst of ['rhodes', 'bass', 'ukulele', 'drums', 'synth'])
    // mutation: web-instruments.control-unwired
    it(`${inst}: each of its controls changes what the voice builds`, () => {
      const card = cardOf(inst)
      const base = optionsOf(card)
      const before = played(inst, structuredClone(base))
      const controls = controlsOf(card)
      assert.ok(controls.length >= 2, `${inst} has no controls`)
      for (const [name, turn] of controls) {
        if (ON_THE_SURFACE.has(`${inst} ${name}`)) continue
        const o = structuredClone(base)
        turn(o)
        assert.notEqual(played(inst, o), before, `${inst}: ${name} changes nothing`)
      }
    })

  // tripwire: the approved Synth board (lohi-specimen, design/lohi): its
  // sections along the signal path and the switches in them
  it("the synth's switchboard is the board's: its sections, in order, and what each holds", () => {
    const card = cardOf('synth')
    const sections = [
      ...card.matchAll(/<div class="k-sec[^"]*" role="group" aria-label="([a-z]+)"/g),
    ].map((m) => m[1])
    assert.deepEqual(sections, ['oscillator', 'filter', 'patch', 'envelope', 'output', 'midi'])
    // the octave row is the oscillator's, under its wave row
    assert.match(card, /data-radio="wave">[\s\S]*?<div class="k-radio" [^>]*data-radio="octave">/)
    // and both rows are one grammar: a blank face, the name under it
    for (const inst of ['rhodes', 'synth']) {
      const row = /data-radio="octave">([\s\S]*?)<\/div><\/div>/.exec(cardOf(inst))[1]
      assert.equal(
        row.match(/<div class="stack"><button [^>]*><\/button><span class="k-lbl">C\d<\/span>/g)
          ?.length,
        4,
        inst
      )
    }
    const names = controlsOf(card).map(([n]) => n)
    for (const need of [
      'knob cutoff',
      'knob resonance',
      'knob level',
      'toggle glide',
      'fader a',
      'fader r',
    ])
      assert.ok(names.includes(need), need)
    assert.equal(
      names.filter((n) => n.startsWith('pin ')).length,
      9,
      'three sources by three places'
    )
    assert.deepEqual(optionsOf(card).wave, 'sawtooth')
  })

  // mutation: web-instruments.strum-unwired
  it('the strum toggle strums: a fret becomes a barre across the strings', () => {
    assert.match(PAGE, /if \(OPT\[inst\]\.strum\)\n\s*for \(let s = open\.length - 1/)
  })

  it('the defaults are the sound the page always made: a knob at 4 multiplies by one', () => {
    const r1 = recorder()
    VOICES.sawPluck(r1.ctx, r1.dest, { tone: 4, drive: 0, mute: false }, { note: 'A1' })
    const filter = r1.log.find(
      (l) => l[1] === 'frequency' && l[2] === 'setValueAtTime' && l[0].startsWith('biquad')
    )
    assert.equal(filter[3], VOICES.noteToFreq('A1') * 8, 'the bass opens at 8f, as it did')
    assert.ok(!r1.log.some((l) => l[0].startsWith('waveshaper')), 'drive 0 adds no clip')
  })
})

describe('web-instruments: the screens draw what is useful', () => {
  const inBounds = (cells, W, H) => cells.every(([x, y]) => x >= 0 && x < W && y >= 0 && y < H)
  const columns = (cells) => new Set(cells.map(([x]) => x)).size

  it('the scope holds the real output still on its first rising zero crossing', () => {
    const rate = 8000
    const hz = 200
    const wave = (phase) =>
      Float32Array.from(
        { length: 2048 },
        (_, i) => 0.4 * Math.sin((2 * Math.PI * hz * i) / rate + phase)
      )
    const a = liveTrace(64, 20, wave(0), rate, hz)
    const b = liveTrace(64, 20, wave(1.3), rate, hz)
    assert.ok(inBounds(a, 64, 20))
    assert.equal(columns(a), 64, 'a column the trace skips')
    // the same wave caught at another phase is the same picture, give or
    // take a cell of rounding: a trigger that holds
    const seen = new Set(a.map(String))
    const moved = b.filter((c) => !seen.has(String(c))).length
    assert.ok(moved <= b.length * 0.05, `${moved} of ${b.length} cells move with the phase`)
    const quiet = liveTrace(64, 20, new Float32Array(2048), rate, null)
    assert.equal(new Set(quiet.map(([, y]) => y)).size, 1, 'silence is a flat line')
  })

  it("at rest the synth's scope is the wave its switches are about to make", () => {
    const at = (s) =>
      previewTrace(64, 20, { wave: 'sawtooth', octave: 4, cutoff: 5, resonance: 2, ...s })
    assert.equal(columns(at({})), 64)
    for (const s of [
      { wave: 'square' },
      { wave: 'sine' },
      { octave: 5 },
      { cutoff: 1 },
      { resonance: 7 },
    ])
      assert.notDeepEqual(at(s), at({}), JSON.stringify(s))
  })

  it('the envelope view is drawn from the faders: up to the top, down to the sustain, out to nothing', () => {
    const cells = envelopeCells(44, 12, 2, 4, 6, 3)
    assert.ok(inBounds(cells, 44, 12))
    assert.ok(
      cells.some(([x, y]) => x === 2 && y === 0),
      'the attack peaks at its third column'
    )
    const sustainRow = Math.round((1 - 6 / 8) * 11)
    assert.ok(
      cells.some(([x, y]) => x === 20 && y === sustainRow),
      'the sustain holds its level'
    )
    assert.ok(
      cells.some(([x, y]) => x === 43 && y === 11),
      'the release ends at nothing'
    )
  })

  // The piano writes what you play onto a music sheet.
  // mutation: web-instruments.sheet-silent
  it('the piano writes what you play onto the sheet, at its pitch', () => {
    assert.match(cardOf('rhodes'), /data-sheet/)
    assert.match(PAGE, /if \(inst === 'rhodes'\) sheet\?\.\(note\)/)
    assert.equal(staffStep('E4'), 0)
    assert.equal(staffStep('C4'), -2)
    assert.equal(staffStep('F5'), 8)
    const treble = windowFor(4)
    const [x] = STAFF.slots
    assert.deepEqual(
      staffLines(treble),
      [0, 1, 2, 3, 4].map((k) => treble.bottom - 4 * k)
    )
    assert.deepEqual(
      noteGlyph('C4', x, treble).ledgers,
      [treble.bottom + 4],
      'middle C on a ledger'
    )
    assert.deepEqual(noteGlyph('G4', x, treble).ledgers, [])
    assert.ok(
      noteGlyph('C#4', x, treble).cells.length > noteGlyph('C4', x, treble).cells.length,
      'a sharp is drawn'
    )
    assert.equal(noteGlyph('C1', x, treble), null, 'no room in the window, no note')
    // the sheet is plain glass: a staff's rules over the scope's dots are
    // more lines
    assert.match(cardOf('rhodes'), /class="k-scope k-plain sheet"/)
  })

  // The octave control places the window: a low board reads on the bass
  // clef, a high one on the treble, both drawn in cells, and every key on
  // the board from C2 has a place on its sheet
  // mutation: web-instruments.clef-fixed
  it('the sheet shows a bass clef for a low board, a treble for a high one, and moves with the octave', () => {
    assert.deepEqual(Object.keys(WINDOWS).map(Number), [2, 3, 4, 5])
    assert.equal(WINDOWS[2].clef, 'bass')
    assert.equal(WINDOWS[3].clef, 'bass')
    assert.equal(WINDOWS[4].clef, 'treble')
    assert.equal(WINDOWS[5].clef, 'treble')
    assert.equal(windowFor(9), WINDOWS[4], 'an octave off the row reads treble')
    const [x] = STAFF.slots
    // G2 is the bass clef's bottom line; E4 the treble's
    assert.equal(noteGlyph('G2', x, WINDOWS[2]).ledgers.length, 0)
    assert.deepEqual(noteGlyph('E2', x, WINDOWS[2]).ledgers, [WINDOWS[2].bottom + 4])
    assert.equal(noteGlyph('E4', x, WINDOWS[4]).ledgers.length, 0)
    // the whole low board is on its sheet
    for (const note of keybed({ octave: 2 }).zones.map((z) => z.note))
      assert.ok(noteGlyph(note, x, WINDOWS[2]), `${note} has no place on the C2 sheet`)
    for (const note of keybed({ octave: 4 }).zones.map((z) => z.note))
      assert.ok(noteGlyph(note, x, WINDOWS[4]), `${note} has no place on the C4 sheet`)
    // the clefs are cells, inside the sheet, left of the first slot
    for (const o of [2, 3, 4, 5]) {
      const cells = clefCells(WINDOWS[o])
      assert.ok(cells.length > 12, `the ${WINDOWS[o].clef} clef is not drawn`)
      for (const [cx, cy] of cells) {
        assert.ok(cx >= 0 && cx < x - 5, `clef cell at ${cx} runs into a note`)
        assert.ok(cy >= 0 && cy < STAFF.rows, `clef cell at row ${cy} is off the sheet`)
      }
      for (const row of staffLines(WINDOWS[o]))
        assert.ok(row >= 0 && row < STAFF.rows, `a line at ${row} is off the sheet`)
    }
    assert.ok(clefCells(WINDOWS[2]).length !== clefCells(WINDOWS[4]).length, 'two clefs')
    // the page redraws the staff and rewrites the notes when the row moves
    assert.match(PAGE, /sheetWindow = \(octave\) => \{/)
    assert.match(PAGE, /if \(inst === 'rhodes'\) sheetWindow\?\.\(octave\)/)
  })
})

describe('web-instruments: the hand', () => {
  // tripwire: these were once lost and are back
  it('a drag from one key or fret to the next plays each in turn: glissando and strum', () => {
    assert.match(PAGE, /board\.addEventListener\('pointermove'/)
    assert.match(PAGE, /release\(under\)\n\s*under = b\.dataset\.id\n\s*press\(under\)/)
  })

  // mutation: web-instruments.legato-lost
  it('a new fret on a ringing string slurs into it: a hammer-on up, a pull-off down', () => {
    assert.match(PAGE, /const LEGATO_WINDOW = 600/)
    assert.match(PAGE, /prev\.voice\?\.stop\?\.\(\)\n\s*legato = true/)
    const r = recorder()
    VOICES.nylonPluck(r.ctx, r.dest, { tone: 4, decay: 4 }, { note: 'C4', legato: true })
    const hard = recorder()
    VOICES.nylonPluck(hard.ctx, hard.dest, { tone: 4, decay: 4 }, { note: 'C4' })
    assert.ok(r.log.length < hard.log.length, 'a slur has no finger transient')
  })

  // tripwire: a note from the keyboard or a controller lets its key go
  it('a key is down while its note is held, and lets go when the note does', () => {
    assert.match(PAGE, /document\.addEventListener\(\s*'keyup'/)
    assert.match(
      PAGE,
      /slide\._midi = \(\{ on, note, velocity \}\) => \(on \? down\(note, velocity\) : up\(note\)\)/
    )
  })
  // mutation: web-instruments.sparks-lost
  // The drum-hit ripples: a pad
  // threw three sparks across the drum while it was down
  it('a struck pad throws three sparks across its top, lit while it is down', () => {
    const cells = sparks(PAD.w)
    assert.equal(cells.length, 3)
    for (const [x, y] of cells) {
      assert.ok(x % PX === 0 && y % PX === 0, `a spark off the cell at ${x},${y}`)
      assert.ok(x > 0 && x < PAD.w - PX && y > 0 && y < PAD.h / 2, `a spark off the pad's top`)
    }
    // an arc: the middle one high, the two sides low
    assert.ok(cells[1][1] < cells[0][1] && cells[0][1] === cells[2][1])
    assert.match(PAGE, /for \(const \[x, y\] of lay\.sparks\(z\.w\)\)/)
    assert.match(PAGE, /c\.className = 'k-cell is-live spark'/)
    const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    assert.match(bare, /\.surface \.spark \{[^}]*display: none/)
    assert.match(bare, /\.surface \.is-down > \.spark \{\s*display: block/)
  })

  // mutation: web-instruments.quaver-lost, web-instruments.quaver-strobes
  // The ukulele's floating note glyph. A thing may move by itself; nothing may
  // shake, strobe or flash, so the quaver rises in steps under three a
  // second and only up
  it('a plucked ukulele lets a quaver go from its soundhole, rising under three steps a second', () => {
    assert.deepEqual(QUAVER, ['..kk.', '..k.k', '..k..', '..k..', 'kkk..', 'kkk..'])
    assert.equal(quaverCells().length, 12)
    for (const [x, y] of quaverCells()) assert.ok(x % PX === 0 && y % PX === 0)
    const at = quaverAt({ x: 100, y: 200, w: 448, h: 152 })
    assert.ok(at.x % PX === 0 && at.y % PX === 0, 'the quaver starts off the cell')
    // over the soundhole, its head a cell clear of the body, on the ground
    assert.ok(Math.abs(at.x + PX - (100 + 140)) < PX, 'the quaver is not over the soundhole')
    assert.equal(at.y + QUAVER.length * PX, 200 - PX, 'the quaver starts on the wood')
    assert.ok(1000 / FLIGHT.ms < 3, `the quaver steps ${1000 / FLIGHT.ms} times a second`)
    assert.ok(FLIGHT.steps >= 1 && FLIGHT.cells >= 1)
    assert.match(PAGE, /if \(inst === 'ukulele'\) letGo\(\)/)
    // up only: each step lifts it from where it was let go
    assert.match(
      PAGE,
      /el\.style\.top = `calc\(\$\{at\.y\}px - \$\{n \* cells\} \* var\(--cv-px\)\)`/
    )
    // and one in the air at a time
    assert.match(PAGE, /quaver\?\.flying\) return/)
  })
})

// The tab is in the address: #epiano, #bass, #uke, #drums, #synth, the
// tab's own name, so a link lands on the instrument it was copied from.
const LABELS = [...ENTRY.matchAll(/class="k-cardtab"[^>]*>([^<]+)</g)].map((m) => m[1])

// The canvas runs this classic script again every time the sheet opens, and
// a listener on the document outlives the card it was made for. Two did:
// after one visit, arrows on a case study walked tabs nobody
// could see and letters played notes, one more copy per reopen.
describe("web-instruments: the keys are the page's, and only while it is on screen", () => {
  // mutation: web-instruments.keys-offscreen
  it('a closed sheet hears no keys: no tab walked, no note sent', async () => {
    const page = loadPage({ session: 'session', modules: true })
    await page.ready
    page.rig.hidden = true
    const was = page.selected()
    page.key('keydown', 'ArrowRight')
    page.key('keydown', 'a')
    assert.equal(page.selected(), was, 'an arrow walked the tabs of a closed sheet')
    assert.equal(page.sent.length, 0, 'a letter played on a closed sheet')
    page.rig.hidden = false
    page.key('keydown', 'a')
    assert.equal(page.sent.length, 1, 'the open sheet did not play')
  })

  // mutation: web-instruments.listeners-outlive-page
  it('a card taken out of the document takes every page-wide listener with it', async () => {
    const page = loadPage({ session: 'session', modules: true })
    await page.ready
    assert.ok(page.signals.length >= 5, `only ${page.signals.length} listeners carry the signal`)
    page.rig.isConnected = false
    page.key('keydown', 'a')
    assert.ok(
      page.signals.every((s) => s.aborted),
      'a listener outlived the card it was made for'
    )
    assert.equal(page.sent.length, 0)
  })
})

describe('web-instruments: the tab is in the address', () => {
  // mutation: web-instruments.hash-ignored
  it('lands on the tab the hash names, the first for a hash that names none', () => {
    assert.equal(LABELS.length, 5)
    LABELS.forEach((name, i) => {
      const page = loadPage({ hash: `#${name}` })
      assert.equal(page.selected(), i, `#${name} lands on tab ${page.selected()}`)
      assert.deepEqual(page.history.written, [], 'landing writes nothing')
    })
    for (const hash of ['', '#', '#piano', '#rhodes', '#nope', '#/web-instruments'])
      assert.equal(loadPage({ hash }).selected(), 0, `"${hash}"`)
  })

  // mutation: web-instruments.hash-state-dropped, web-instruments.hash-unwritten
  it('a tab switch writes its name over the address and keeps the router state', () => {
    const page = loadPage()
    const state = page.history.state
    LABELS.forEach((name, i) => {
      page.tabs[(i + 1) % 5].fire('click')
      page.tabs[i].fire('click')
      const [kept, , url] = page.history.written.at(-1)
      assert.equal(url, `/web-instruments?a=1#${name}`)
      assert.equal(kept, state, 'the canvas keeps its router state in history.state')
    })
  })

  // mutation: web-instruments.hash-unheard
  it('a hash that changes later walks to its tab', () => {
    const page = loadPage()
    page.history.replaceState(page.history.state, '', '/web-instruments#drums')
    page.on.hashchange()
    assert.equal(page.selected(), 3)
    page.history.replaceState(page.history.state, '', '/web-instruments#nope')
    page.on.hashchange()
    assert.equal(page.selected(), 3, 'a hash naming no tab leaves the tab where it is')
  })
})

// A session plays together: what the visitor plays goes out as `canvas:act`,
// a peer's comes back as `canvas:peer-act`, is read strictly, and is played
// here without being sent on.
const KNOWN = {
  parts: Object.keys(VOICES.KIT),
  controls: {
    rhodes: { tone: { kind: 'int', lo: 0, hi: 7 }, sustain: { kind: 'bool' } },
    synth: {
      wave: { kind: 'one', of: ['sine', 'sawtooth'] },
      octave: { kind: 'one', of: [2, 4] },
    },
  },
}
const HUE = 'hsl(137.5 65% 57%)'
const act = (ch, d, extra = {}) => ({ ch, d, id: 3, color: HUE, ...extra })

describe('web-instruments: a session plays together', () => {
  it('reads every act it knows: a note, a pad, a key let go, a control', () => {
    const ok = (ch, d) => assert.ok(SURFACES.peerAct(act(ch, d), KNOWN), JSON.stringify(d))
    for (const i of ['rhodes', 'bass', 'ukulele', 'synth']) ok('note', { i, n: 60, v: 0.5 })
    ok('note', { i: 'rhodes', n: 0, v: 0 })
    ok('note', { i: 'synth', n: 127, v: 1 })
    for (const p of KNOWN.parts) ok('note', { i: 'drums', p, v: 1 })
    ok('off', { i: 'synth', n: 64 })
    ok('patch', { i: 'rhodes', k: 'tone', v: 7 })
    ok('patch', { i: 'rhodes', k: 'sustain', v: false })
    ok('patch', { i: 'synth', k: 'wave', v: 'sine' })
    ok('patch', { i: 'synth', k: 'octave', v: 2 })
    const a = SURFACES.peerAct(act('note', { i: 'rhodes', n: 60, v: 0.5 }), KNOWN)
    assert.deepEqual(a, { ch: 'note', i: 'rhodes', n: 60, v: 0.5, id: 3, color: HUE })
    const bare = SURFACES.peerAct(act('off', { i: 'rhodes', n: 1 }, { color: 'url(x)' }), KNOWN)
    assert.equal(bare.color, null, 'a colour that is not a colour is not worn')
  })

  it('drops whole any act that is not exactly one of those shapes', () => {
    const BAD = [
      ['note', { i: 'piano', n: 60, v: 0.5 }],
      ['note', { i: 'rhodes', n: 128, v: 0.5 }],
      ['note', { i: 'rhodes', n: -1, v: 0.5 }],
      ['note', { i: 'rhodes', n: 60.5, v: 0.5 }],
      ['note', { i: 'rhodes', n: '60', v: 0.5 }],
      ['note', { i: 'rhodes', n: 60, v: 1.01 }],
      ['note', { i: 'rhodes', n: 60, v: -0.1 }],
      ['note', { i: 'rhodes', n: 60, v: NaN }],
      ['note', { i: 'rhodes', n: 60, v: Infinity }],
      ['note', { i: 'rhodes', n: 60 }],
      ['note', { i: 'rhodes', n: 60, v: 0.5, x: 1 }],
      ['note', { i: 'drums', p: 'cowbell', v: 1 }],
      ['note', { i: 'drums', p: 'toString', v: 1 }],
      ['note', { i: 'drums', p: 'kick', v: 2 }],
      ['note', { i: 'drums', n: 36, v: 1 }],
      ['off', { i: 'drums', n: 36 }],
      ['off', { i: 'rhodes', n: 60, v: 1 }],
      ['patch', { i: 'rhodes', k: 'tone', v: 8 }],
      ['patch', { i: 'rhodes', k: 'tone', v: 3.5 }],
      ['patch', { i: 'rhodes', k: 'tone', v: '3' }],
      ['patch', { i: 'rhodes', k: 'sustain', v: 1 }],
      ['patch', { i: 'rhodes', k: 'octave', v: 4 }],
      ['patch', { i: 'rhodes', k: 'constructor', v: true }],
      ['patch', { i: 'rhodes', k: '__proto__', v: true }],
      ['patch', { i: 'hasOwnProperty', k: 'tone', v: 1 }],
      ['patch', { i: 'synth', k: 'wave', v: 'triangle' }],
      ['patch', { i: 'synth', k: 'octave', v: '2' }],
      ['patch', { i: 'bass', k: 'tone', v: 1 }],
      ['egg', { w: 'egg', p: [0, 0, 0], n: [0, 0, 1] }],
      ['mark', { p: 'web-instruments' }],
      ['note', null],
      ['note', [60]],
      ['note', 'rhodes'],
    ]
    for (const [ch, d] of BAD)
      assert.equal(SURFACES.peerAct(act(ch, d), KNOWN), null, `${ch} ${JSON.stringify(d)}`)
    for (const detail of [null, undefined, 'note', [], { ch: 'note' }])
      assert.equal(SURFACES.peerAct(detail, KNOWN), null, JSON.stringify(detail))
  })

  it('lights a key at its lip and a pad across its top, on the cell', () => {
    const { w, h } = SURFACES.WHITE
    for (const [x, y] of SURFACES.peerCells(w, h, true)) {
      assert.ok(y > h / 2 && y + PX < h, `a key's cell at ${y} is not at its lip`)
      assert.equal(x % PX, 0)
    }
    assert.deepEqual(SURFACES.peerCells(w, h, false), SURFACES.sparks(w), 'a pad wears its sparks')
  })

  // mutation: web-instruments.act-unsent
  it('in a session a note, its key let go, a pad and a control go out; alone nothing does', async () => {
    const page = loadPage({ session: 'session', modules: true })
    await page.ready
    page.key('keydown', 'a')
    page.key('keyup', 'a')
    page.knob.fire('keydown', { key: 'ArrowUp', preventDefault() {} })
    page.tabs[3].fire('click')
    page.key('keydown', 'k')
    // across the VM's realm, compared as data (the tab switch is a view,
    // held by its own test below)
    const acts = page.sent.filter((e) => e.type === 'canvas:act')
    assert.deepEqual(
      JSON.parse(JSON.stringify(acts.map((e) => [e.type, e.detail.ch, e.detail.d]))),
      [
        ['canvas:act', 'note', { i: 'rhodes', n: 60, v: 0.85 }],
        ['canvas:act', 'off', { i: 'rhodes', n: 60 }],
        ['canvas:act', 'patch', { i: 'rhodes', k: 'tone', v: 5 }],
        ['canvas:act', 'note', { i: 'drums', p: 'kick', v: 1 }],
      ]
    )
    const alone = loadPage({ modules: true })
    await alone.ready
    alone.key('keydown', 'a')
    alone.key('keyup', 'a')
    alone.knob.fire('keydown', { key: 'ArrowUp', preventDefault() {} })
    assert.deepEqual(alone.sent, [], 'a visitor in no session sent an act')
    assert.ok(
      alone.voiced.some(([v]) => v === 'rhodes'),
      'and still played'
    )
  })

  // a follow is a session of one direction: somebody following this tab
  // (the canvas marks it on the root) hears what it plays
  // mutation: web-instruments.followers-unheard
  it('with somebody following, what the visitor plays goes out', async () => {
    const page = loadPage({ followed: true, modules: true })
    await page.ready
    page.key('keydown', 'a')
    page.key('keyup', 'a')
    assert.deepEqual(JSON.parse(JSON.stringify(page.sent.map((e) => [e.detail.ch, e.detail.d]))), [
      ['note', { i: 'rhodes', n: 60, v: 0.85 }],
      ['off', { i: 'rhodes', n: 60 }],
    ])
  })

  // mutation: web-instruments.replay-echoes, web-instruments.peer-unread
  it("a peer's act plays here, lights its part in the peer's hue, and is never sent on", async () => {
    const page = loadPage({ session: 'session', modules: true })
    await page.ready
    page.on.pointerdown()
    const before = page.voiced.length
    page.peer(act('note', { i: 'rhodes', n: 60, v: 0.5 }))
    page.peer(act('off', { i: 'rhodes', n: 60 }))
    page.peer(act('note', { i: 'drums', p: 'snare', v: 1 }))
    page.peer(act('note', { i: 'bass', n: 28, v: 1 }))
    page.peer(act('patch', { i: 'rhodes', k: 'tone', v: 6 }))
    assert.deepEqual(page.sent, [], 'a replay went back out')
    assert.deepEqual(page.voiced.slice(before), [
      ['rhodes', 'C4'],
      ['release', 'rhodes', 'C4'],
      ['drum', 'snare'],
      ['sawPluck', 'E1'],
    ])
    assert.equal(page.knob.attrs['aria-valuenow'], '6', "the knob turns to the peer's value")
    const lit = page.made.filter((e) => e.className === 'k-cell peer')
    assert.equal(lit.length, 9, 'three cells each on the key, the pad and the fret')
    for (const c of lit) assert.equal(c.style.background, HUE)
    // and nothing it refuses reaches a voice or a control
    const after = page.voiced.length
    page.peer(act('note', { i: 'rhodes', n: 200, v: 0.5 }))
    page.peer(act('patch', { i: 'rhodes', k: 'tone', v: 9 }))
    assert.equal(page.voiced.length, after)
    assert.equal(page.knob.attrs['aria-valuenow'], '6')
  })

  // THE TAB IS A VIEW (primitives/rooms/view-sync.js): which instrument is up goes out
  // in a session or under a follow, and a peer's is switched to, unsaid.
  // mutation: web-instruments.tab-unsaid
  it('in a session or followed a tab switch goes out as a view; the landing and a lone visitor say nothing', () => {
    for (const opts of [{ session: 'session' }, { followed: true }]) {
      const page = loadPage(opts)
      assert.deepEqual(page.sent, [], 'the landing said something')
      page.tabs[3].fire('click')
      page.tabs[0].fire('click')
      assert.deepEqual(
        JSON.parse(JSON.stringify(page.sent.map((e) => [e.type, e.detail]))),
        [
          ['canvas:view', { what: 'tab', i: 'drums' }],
          ['canvas:view', { what: 'tab', i: 'epiano' }],
        ],
        JSON.stringify(opts)
      )
    }
    const alone = loadPage()
    alone.tabs[3].fire('click')
    assert.deepEqual(alone.sent, [])
    assert.equal(alone.selected(), 3)
  })

  // mutation: web-instruments.tab-echoes, web-instruments.tab-unread
  it("a peer's tab is switched to and never said back; a name no tab carries changes nothing", () => {
    const page = loadPage({ session: 'session' })
    const view = (detail) => page.on['canvas:peer-view']({ detail })
    view({ what: 'tab', i: 'synth', id: 3, color: HUE })
    assert.equal(page.selected(), 4)
    assert.deepEqual(page.sent, [], 'a peer tab went back out')
    assert.equal(
      page.history.written.at(-1)[2],
      '/web-instruments?a=1#synth',
      'the address follows'
    )
    for (const bad of [
      { what: 'tab', i: 'piano' },
      { what: 'tab', i: 3 },
      { what: 'photo', i: 'bass' },
      null,
    ])
      view(bad)
    assert.equal(page.selected(), 4)
    // and asked again, it says the tab it shows
    page.on['canvas:view-again']()
    assert.deepEqual(JSON.parse(JSON.stringify(page.sent.map((e) => e.detail))), [
      { what: 'tab', i: 'synth' },
    ])
  })

  // mutation: web-instruments.peer-opens-audio
  it("a peer's note before the visitor's hand is seen, not heard, and opens no audio", async () => {
    const page = loadPage({ session: 'session', modules: true })
    await page.ready
    page.peer(act('note', { i: 'rhodes', n: 60, v: 0.5 }))
    assert.equal(page.contexts(), 0, 'a peer opened the audio')
    assert.deepEqual(page.voiced, [])
    assert.equal(page.made.filter((e) => e.className === 'k-cell peer').length, 3, 'still lit')
  })

  // mutation: web-instruments.stack-leaks
  it("the page's sheet stays loaded on the canvas, so no selector in it is a bare class the canvas also uses", () => {
    // a bare .stack centred the canvas's rows over their covers
    assert.doesNotMatch(
      CSS,
      /(^|\n|,\s*)\.stack\b/,
      'a bare .stack selector is back in instruments.css'
    )
  })
})
