// THE SHEET (/admin/kit): every piece the site is made of, on one page.
//
// A style guide that is typed beside the code rots, so this one is read off
// it. What can be derived is derived: the swatches and the scales are read
// from canvas-tokens.css, the moves from the @keyframes in the stylesheets,
// the commands from the bar's own table, the tile shapes from TILES, the
// syntax palette from highlight.css, the code from the markdown pipeline
// the case studies use. What cannot be derived (what a move is FOR, which
// gag lives where, which piece is still missing) is written here, once, and
// test/sheet.test.js fails when the two disagree: a keyframe nobody
// described, a described move that no longer exists, a gag whose file is
// gone, a part the sheet never shows.
//
// The register of this file is the site's: terse, no em-dashes, nothing
// overstated. Plates are numbered because a plate number is the thing you
// say out loud to point at one.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderMarkdown } from './markdown.js'
import { bayerGlyph, PRESETS } from 'multiplayer-canvas/dither'
import { pixelText } from 'multiplayer-canvas/pixel-type'
import { COMMANDS } from '../static/canvas/commands.js'
import {
  PX,
  M,
  AIR,
  LADDER,
  BAR_MIN_W,
  BAR_MIN_H,
  DESKTOP_MIN_W,
  TILES,
  STACKS,
} from '../static/canvas/layout.js'

// the site's stylesheets and the engine's kit (kit.css, the tokens)
const CSS_DIRS = [
  join(import.meta.dirname, '../static/css'),
  join(import.meta.dirname, '../../primitives/kit'),
]
const cssPath = (f) =>
  CSS_DIRS.map((d) => join(d, f)).find((p) => existsSync(p)) || join(CSS_DIRS[0], f)
const read = (f) => readFileSync(cssPath(f), 'utf8')

// ---------------------------------------------------------------- derived

let TOKENS
/** Every `--name: value;` in canvas-tokens.css, as written. */
function tokens() {
  if (TOKENS) return TOKENS
  TOKENS = new Map()
  for (const m of read('canvas-tokens.css').matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gim))
    TOKENS.set(m[1], m[2].trim().replace(/\s+/g, ' '))
  return TOKENS
}
const tok = (name) => tokens().get(name) ?? ''
const swatch = (name, role = '') => ({
  css: name,
  name: name.replace(/^--/, ''),
  value: tok(name),
  role,
})

/** Every @keyframes in the stylesheets, with the declarations that use it. */
function keyframes() {
  const found = new Map()
  const sheets = CSS_DIRS.flatMap((d) => readdirSync(d))
    .filter((f) => f.endsWith('.css'))
    .sort()
  const text = new Map(sheets.map((f) => [f, read(f)]))
  for (const [file, css] of text)
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g))
      found.set(m[1], { name: m[1], file, uses: [] })
  for (const [, css] of text)
    for (const m of css.matchAll(/animation(?:-name)?:\s*([^;}]+)[;}]/g)) {
      const decl = m[1].trim()
      found.get(decl.split(/\s+/)[0])?.uses.push(decl)
    }
  return found
}

const bare = (s) => s.replace(/var\(--cv-([\w-]+)\)/g, '$1')

/** The duration and the frame count a use of a keyframe is written with. */
function timing(decl) {
  const dur = /(calc\([^)]*var\(--cv-dur-[\w-]+\)\)|var\(--cv-dur-[\w-]+\)|\b0s\b)/.exec(decl)
  const ease = /(var\(--cv-ease-[\w-]+\)|steps\((?:[^()]|\([^()]*\))*\))/.exec(decl)
  return { dur: dur ? bare(dur[1]) : '', ease: ease ? bare(ease[1]) : '' }
}

/** Which highlight.js classes wear which token of the syntax theme. */
function syntax() {
  const out = new Map()
  for (const m of read('highlight.css').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const color = /color:\s*var\(--cv-code-([\w-]+)\)/.exec(m[2])
    if (!color) continue
    const classes = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\.hljs-/.test(s))
      .map((s) => s.replace(/^\.hljs-/, ''))
    if (classes.length) out.set(color[1], [...(out.get(color[1]) ?? []), ...classes])
  }
  return [...out].map(([name, classes]) => ({ ...swatch(`--cv-code-${name}`), classes }))
}

// Two names for one value is a decision when the contract says so: the print
// anchors (BIBLE.md section 13) and white, a ground that shares the surface's
// value and is not a card (section 1). Inside one family of names a shared
// value is one rung with several roles (fs-meta, fs-0 and fs-1 are all sixteen,
// and say meta, body and label); a name says what a thing is FOR, and a reader
// of the stylesheet is told. Across families it is a coincidence (sp-4 and
// fs-0 are both sixteen, and are not the same thing).
const DECIDED = [
  ['ink', 'ink-fixed'],
  ['bright', 'ground-fixed'],
  ['surface', 'white'],
]
const family = (name) => name.split('-')[0]

/** Tokens that carry one value under several names, sorted by what that means. */
function aliases() {
  const byValue = new Map()
  for (const [name, value] of tokens())
    if (name.startsWith('--cv-') && !name.startsWith('--cv-code-'))
      byValue.set(value, [...(byValue.get(value) ?? []), name.replace('--cv-', '')])
  const groups = [...byValue]
    .filter(([, names]) => names.length > 1)
    .map(([value, names]) => ({ value, names }))
  const decided = (g) => DECIDED.some((d) => d.every((n) => g.names.includes(n)))
  const axes = (g) => g.names.every((n) => /-[xy]$/.test(n))
  const together = (g) =>
    g.names.some((n, i) => g.names.some((m, j) => j > i && family(n) === family(m)))
  return {
    roles: groups.filter((g) => !decided(g) && !axes(g) && together(g)),
    decided: groups.filter(decided),
  }
}

// ---------------------------------------------------------------- curated

// Every @keyframes on the site, said in a line. The test keeps this and the
// stylesheets one list. `demo` names a self-contained demonstration the page
// can run with the real keyframe (the rest are in context, and say where).
// seam: test/sheet.test.js
export const MOVES = {
  'cv-stand-in': {
    what: 'the server-rendered statement waits 600ms and shows only if the boot is slow',
    kind: 'timer',
  },
  'cv-settle': { what: 'a menu or a list lands in four frames, a rise and never a fade' },
  'cv-burn': { what: 'a tally digit burns away from the bottom up, a row a frame' },
  'cv-rise': { what: 'the new digit rises from nowhere below, a row a frame' },
  'cv-pop-arrow': { what: 'a leaving cursor swells a frame at a time and is cut' },
  'cv-pop-burst': { what: 'a ring of pixels bursts from a leaving cursor in its own hue' },
  'cv-turn-up': { what: 'the next card of a pile rises two cells out of the pile it was in' },
  'cv-slot-left': { what: 'the finder comes in from the left, a module of travel, on a turn only' },
  'cv-slot-right': { what: 'the map comes in from the right, a module of travel, on a turn only' },
  'cv-tab-in': { what: 'a page of the ring is redrawn top to bottom in four frames, a wipe' },
  'dk-wipe': { what: 'a desk page is redrawn in eight frames on a navigation (view transition)' },
  'k-blink': { what: 'the block caret blinks in whole steps, only while the field has focus' },
  'k-walk': {
    what: 'the loader: a block of ink walks a one-cell meter in four steps',
    demo: 'load',
  },
  'k-marquee': {
    what: 'a line longer than its box walks a cell a step, waits, resets in one frame',
  },
}

// The three waveforms and what they are for. A material is updated in one
// of three ways and the camera is the only thing that eases.
// seam: test/sheet.test.js
export const WAVES = [
  { token: 'ease-hold', steps: 1, for: 'a held pose: the next one lands whole (impacts)' },
  { token: 'ease-step', steps: 4, for: 'a press, a settle, a turn: small regions, four frames' },
  { token: 'ease-frames', steps: 8, for: 'a long move: a page out of its card, a desk redraw' },
]

// What a visitor can meet. Taxonomy first, because the rule is the register
// and not the quota (BIBLE.md section 10): rare, pixel, game-like.
// seam: test/sheet.test.js
export const GAG_KINDS = [
  { id: 'toy', name: 'toys', note: 'you can hit it, and it answers' },
  { id: 'physics', name: 'physics jokes', note: 'the medium commenting on itself' },
  { id: 'copy', name: 'copy', note: 'one line in the site voice that earns a half smile' },
  { id: 'hardware', name: 'hardware in-jokes', note: 'the part is the punchline' },
  { id: 'door', name: 'hidden doors', note: 'unlisted, never hidden from anyone who types it' },
  { id: 'room', name: 'the room', note: 'other people, drawn on the same ground' },
]

// seam: test/sheet.test.js
export const GAGS = [
  {
    id: 'maurice',
    name: 'Maurice the ladybug',
    kind: 'toy',
    where: 'the south corridor of the canvas',
    trigger: 'click him',
    what: 'he is squished for everyone for a while, and lies flat in pixel isometric with his spray',
    refs: [
      'src/static/canvas/app.js',
      'primitives/presence/presence-room.js',
      'src/static/img/canvas/maurice.png',
    ],
  },
  {
    id: 'sisyphus',
    name: 'Sisyphus the Slime',
    kind: 'toy',
    where: 'the northwest dish',
    trigger: 'tap the dish',
    what: 'a mould the server grows drops a pellet for everyone, and sleeps grey when nobody watches',
    refs: ['primitives/slime/slime.js', 'primitives/slime/server.js'],
  },
  {
    id: 'instruments',
    name: 'Web Instruments',
    kind: 'toy',
    where: '/web-instruments',
    trigger: 'press a key',
    what: 'a keyboard, a bass, a ukulele, drums and a synth, and a scope drawing what you will hear',
    refs: ['src/static/js/instruments.js', 'content/feed/web-instruments.md'],
  },
  {
    id: 'dust',
    name: 'the dust',
    kind: 'physics',
    where: 'the mark, the titles, the dock glyphs and the title of a door',
    trigger: 'cross them with the pointer',
    what: 'the cells under the path hop a cell and settle, the same dust on every tab at once',
    refs: ['primitives/dust.js', 'src/static/js/door.js'],
  },
  {
    id: 'thin-page',
    name: 'the thin page',
    kind: 'physics',
    where: 'the 404',
    trigger: 'cross it with the pointer or a finger',
    what: 'the page is carved away a cell at a time, with a stippled edge, and what is under it is black',
    refs: ['src/static/canvas/abyss.js', 'src/templates/pages/404.njk'],
  },
  {
    id: 'poof',
    name: '/poof',
    kind: 'physics',
    where: 'the command line',
    trigger: 'type /poof',
    what: 'the whole world falls into a point, sits still, and comes back out of it as dust',
    refs: ['primitives/pixel-moves.js', 'src/static/canvas/app.js'],
  },
  {
    id: 'wrap',
    name: 'the torus',
    kind: 'physics',
    where: 'every edge of the ground',
    trigger: 'go far enough',
    what: 'you arrive where you started, over a seam drawn as a one-cell stitch',
    refs: ['src/static/canvas/layout.js'],
  },
  {
    id: 'dish-sleep',
    name: 'the sleeping dish',
    kind: 'physics',
    where: 'the slime, off camera or in a hidden tab',
    trigger: 'look away',
    what: 'it goes grey and dim, and its colour comes back in frames when you return',
    refs: ['primitives/slime/slime.js', 'primitives/slime/server.js'],
  },
  {
    id: 'tally',
    name: 'the tally',
    kind: 'hardware',
    where: 'under the statement',
    trigger: 'someone arrives or leaves',
    what: 'split-flap digits burn away and rise a row a frame, like a departure board',
    refs: ['primitives/kit/kit.css', 'src/static/css/canvas-home.css'],
  },
  {
    id: 'grammar',
    name: 'the grammar column',
    kind: 'hardware',
    where: 'this sheet',
    trigger: 'read the second column',
    what: 'every control is named for the everyday thing it borrows: a doorbell, a stompbox',
    refs: ['src/templates/kit/index.njk'],
  },
  {
    id: 'bluff',
    name: 'call the bluff',
    kind: 'copy',
    where: 'this sheet and the whole approach',
    trigger: 'click what looks like a picture',
    what: 'the north star: they call a bluff by touching it, and it answers',
    refs: ['src/templates/kit/index.njk'],
  },
  {
    id: 'commands',
    name: 'the slash commands',
    kind: 'copy',
    where: 'the bar',
    trigger: 'type /',
    what: 'blow it all up, a page any page, who is here: the roster is its own copy',
    refs: ['src/static/canvas/commands.js'],
  },
  {
    id: 'not-found',
    name: 'the 404',
    kind: 'copy',
    where: 'a path that is not there',
    trigger: 'mistype',
    what: 'it says it never did exist or it moved, and asks you to pick a direction',
    refs: ['src/templates/pages/404.njk'],
  },
  {
    id: 'txt',
    name: 'the .txt files',
    kind: 'door',
    where: '/llms.txt, /humans.txt',
    trigger: 'curl it',
    what: 'robots, humans, hackers and pgp all have one: nobody is excluded',
    refs: ['src/routes/llms.js'],
  },
  {
    id: 'login',
    name: '/login',
    kind: 'door',
    where: 'the command line',
    trigger: 'type it in full',
    what: 'it is never suggested, completed or listed, and it works on a machine that is not signed in',
    refs: ['src/static/canvas/commands.js'],
  },
  {
    id: 'conga',
    name: 'the conga line',
    kind: 'room',
    where: 'anyone who follows anyone',
    trigger: 'click a cursor',
    what: 'followers queue behind the one they follow, one beat behind, on the leader’s own path',
    refs: ['primitives/presence/conga.js', 'primitives/rooms/follow.js'],
  },
  {
    id: 'pop',
    name: 'a leaving cursor pops',
    kind: 'room',
    where: 'any page',
    trigger: 'someone leaves',
    what: 'their hand swells in three frames and bursts in their own hue',
    refs: ['primitives/presence/presence.js', 'src/static/css/canvas-home.css'],
  },
  {
    id: 'observe',
    name: 'the observation frame',
    kind: 'room',
    where: 'while following',
    trigger: 'follow someone',
    what: 'your whole screen is framed in their hue, the way Figma does it',
    refs: ['primitives/rooms/follow.js'],
  },
]

// The rules a gag keeps. Short, because a long rule is not remembered.
// seam: test/sheet.test.js
export const GAG_RULES = [
  'rare, pixel, game-like: arcade, not corporate-tasteful',
  'celebrate with one piece, never the whole stage',
  'a non-player can tell something happened without knowing the rules',
  'nothing shakes, strobes or flashes; reduced motion is a cut',
  'a trick done too many times stops being impressive',
]

// Composition: which kit parts a surface is made of, so "composed from one
// sheet" is a claim the test can check against the files.
// seam: test/sheet.test.js
export const COMPOSITION = [
  {
    surface: 'the bar',
    files: ['src/static/canvas/app.js', 'src/templates/canvas/home.njk'],
    parts: ['k-field', 'k-btn', 'k-menu', 'k-flaps'],
  },
  {
    surface: 'a case study',
    files: [
      'src/lib/canvas-sheets.js',
      'src/static/js/page-reader.js',
      'primitives/kit/kit-scroll.js',
    ],
    parts: ['k-switch', 'k-btn', 'k-tab', 'k-menu'],
  },
  {
    surface: 'the desk',
    files: ['src/templates/desk-base.njk', 'src/templates/admin/index.njk'],
    parts: ['k-sec', 'k-lamp', 'k-btn'],
  },
  {
    surface: 'an experiment',
    files: ['content/feed/web-instruments.md'],
    parts: ['k-card', 'k-rk', 'k-radio'],
  },
  {
    surface: 'a list',
    files: ['src/lib/canvas-sheets.js'],
    parts: ['k-rb', 'k-meta', 'k-tag'],
  },
  {
    surface: 'the login',
    files: ['src/templates/login/index.njk'],
    parts: ['k-field', 'k-btn', 'k-caret'],
  },
  {
    surface: 'the not-found page',
    files: ['src/templates/pages/404.njk'],
    parts: ['k-bank', 'k-btn'],
  },
]

// Pieces the site does not have yet, or has once per surface and should have
// once. Each says why, with the number that proves it. A status of `baked`
// or `part` means it is on the sheet and in the kit, and `open` is a decision
// the sheet found and cannot make.
// seam: test/sheet.test.js
export const MISSING = [
  {
    id: 'page-bar',
    name: 'the page bar as a part',
    why: 'its tab strip is 34 rules scoped under #modal.fullpage #sheet in canvas-home.css, so it cannot stand anywhere else',
    status: 'proposed',
  },
  {
    id: 'code-block',
    name: 'the code block as a part',
    why: 'the numbered gutter was written twice, with two names for the digit count and two gaps; it is code.css now, one block wherever code stands, and a page says only where it stands',
    status: 'part',
  },
  {
    id: 'lattice-grid',
    name: 'a grid that sits on the cell',
    why: 'fr tracks land on fractions: at 1440 wide a desk section is 373.33px and a tool panel starts at x 942.39',
    status: 'proposed',
  },
  {
    id: 'status-chip',
    name: 'the status chip',
    why: 'not configured, empty, none: the desk drew it with a rule of its own; it is the kit’s chip now, on the board, and the plate numbers here wear it too',
    status: 'part',
  },
  {
    id: 'key-row',
    name: 'keys of one width',
    why: 'the 404 offered four buttons of four widths, none on the cell; a bank of keys is one width in whole cells and wraps two by two on a phone',
    status: 'part',
  },
  {
    id: 'meter',
    name: 'a level meter',
    why: 'a level you read has a progress bar and a scope, and no segmented lamp bar',
    status: 'proposed',
  },
  {
    id: 'scrub',
    name: 'a number you drag',
    why: 'the kit has a fader and a knob and no precise numeric field, the idiom of a parameter panel',
    status: 'proposed',
  },
  {
    id: 'no-signal',
    name: 'a no-signal picture',
    why: 'a source that is down degrades silently to its snapshot, and an empty list says nothing',
    status: 'proposed',
  },
  {
    id: 'key-legend',
    name: 'a key legend',
    why: 'the keys (/, Esc, the arrows, plus and minus) were real and nowhere listed; /keys lists them and ? opens it, one table held to the page’s key handler',
    status: 'part',
  },
  {
    id: 'smooth-scroll',
    name: 'the scroll that glides',
    why: 'the page scroller and the photo strip glide on the browser’s own easing (scroll-behavior in entry.css and photoset.css; reduced motion cuts both), the one place motion is a curve and not a staircase. Left alone: stepping a scroll changes how a page reads, and that call is yours',
    status: 'open',
  },
]

// seam: test/sheet.test.js
export const VOICE = [
  {
    rule: 'no em-dashes anywhere',
    good: 'period, colon, parens or comma',
    bad: 'a dash for a pause',
  },
  {
    rule: 'name a control for the thing it borrows',
    good: 'a doorbell',
    bad: 'momentary action button',
  },
  {
    rule: 'labels on the ground are Title Case',
    good: 'Sisyphus the Slime',
    bad: 'sisyphus the slime',
  },
  {
    rule: 'say it terse, the reader is not dumb',
    good: 'it goes grey and dim',
    bad: 'the experience gracefully degrades',
  },
  {
    rule: 'instructions are carved, never floated',
    good: 'drag, scroll and zoom to explore',
    bad: 'a dismissable tooltip',
  },
  {
    rule: 'a departure never surprises',
    good: 'the host as the label and a north-east arrow',
    bad: 'a link that opens a tab unannounced',
  },
  { rule: 'an error is one line under the field', good: 'no such command', bad: 'a dialog' },
  {
    rule: 'nothing has an eyebrow',
    good: 'the title is the first line',
    bad: 'a kicker over the title',
  },
]

// ---------------------------------------------------------------- plates

const CODE = [
  '```js id=sheet-js',
  '// a comment is quiet and italic',
  "import { cell } from './kit.js'",
  '',
  'const PX = 4 // the cell, in pixels',
  'class Part extends Cell {',
  '  press(key) {',
  "    if (key === 'Enter' && this.armed) return `ring ${PX * 2}`",
  '    return null',
  '  }',
  '}',
  '```',
  '',
  'Prose points at its code: <a class="ref" href="#sheet-js-L6-L8">the press</a> lights its line, and `--cv-px` is an inline chip.',
  '',
  '```sh',
  'npm run check   # green, or it does not ship',
  '```',
].join('\n')

// the six shapes a tile may take, in modules (BIBLE.md section 3)
const SHAPES = ['8x8', '8x5', '5x8', '5x5', '3x3', '2x2']

function shapes() {
  const used = new Map()
  for (const t of TILES) {
    const k = `${t.mw}x${t.mh}`
    used.set(k, [...(used.get(k) ?? []), t.id])
  }
  const row = (k, vocabulary) => {
    const [w, h] = k.split('x').map(Number)
    return { key: k, w, h, ids: used.get(k) ?? [], vocabulary }
  }
  return [
    ...SHAPES.map((k) => row(k, true)),
    ...[...used.keys()].filter((k) => !SHAPES.includes(k)).map((k) => row(k, false)),
  ]
}

const guestName = {
  sky: 'the sky',
}

function guests() {
  const groups = new Map()
  for (const name of tokens().keys()) {
    const m = /^--guest-([a-z]+)-/.exec(name)
    if (m) groups.set(m[1], [...(groups.get(m[1]) ?? []), swatch(name)])
  }
  return [...groups].map(([k, items]) => ({ name: guestName[k] ?? k, items }))
}

function build() {
  const kf = keyframes()
  return [
    {
      id: 'display',
      no: 'P0',
      title: 'the display',
      note: 'what this screen can and cannot do',
      scale: [
        ['cell', tok('--cv-px'), 'the logo’s pixel, and every line there is'],
        ['unit', tok('--cv-sp-2'), `${(2 * PX) / PX} cells`],
        ['module', tok('--cv-module'), `${M / PX} cells, and every tile is whole modules`],
        ['air', tok('--cv-air'), `${AIR / PX} cells, the least between strangers`],
        [
          'control',
          tok('--cv-ctrl-h'),
          `${parseFloat(tok('--cv-ctrl-h')) / PX} cells, the tap floor`,
        ],
      ],
      ground: [
        '--cv-ink',
        '--cv-ground',
        '--cv-surface',
        '--cv-white',
        '--cv-recess',
        '--cv-mute',
        '--cv-bright',
      ].map((n) => swatch(n)),
      ramp: ['--cv-deep', '--cv-ink', '--cv-mute', '--cv-mid', '--cv-ground', '--cv-bright'].map(
        (n) => swatch(n)
      ),
      brick: ['--cv-brick-deep', '--cv-brick', '--cv-brick-fixed', '--cv-brick-light'].map((n) =>
        swatch(n)
      ),
      content: ['--cv-ochre', '--cv-sage'].map((n) => swatch(n)),
      guests: guests(),
      bayer: Array.from({ length: 17 }, (_, level) => ({ level, cells: bayerGlyph(level) })),
      preset: {
        cell: `${PRESETS.parts.fontSize}px`,
        face: PRESETS.parts.fontId,
        levels: PRESETS.parts.glyphRamp.length,
      },
      densities: [
        {
          name: 'watch',
          rule: `under ${BAR_MIN_W} wide or ${BAR_MIN_H} tall`,
          note: 'no chrome at all',
        },
        {
          name: 'phone',
          rule: `${BAR_MIN_W} up to ${DESKTOP_MIN_W - 1} wide`,
          note: 'the same bar, the world zoomed',
        },
        {
          name: 'desktop',
          rule: `${DESKTOP_MIN_W} and up`,
          note: 'the opening frame fits unscaled',
        },
      ],
      aliases: aliases(),
    },
    {
      id: 'type',
      no: 'P1',
      title: 'type',
      note: 'one face, one weight, one ladder',
      ladder: LADDER.map((px) => ({
        px,
        roles:
          {
            16: 'meta, body, labels',
            32: 'control labels, leads',
            48: 'display lines',
            64: 'titles',
            112: 'the postcard, alone',
          }[px] ?? '',
        token: { 16: '--cv-fs-0', 32: '--cv-fs-3', 48: '--cv-fs-4', 64: '--cv-fs-6' }[px] ?? '',
        sample:
          {
            16: 'The quick brown fox jumps over the lazy dog.',
            32: 'Control label',
            48: 'Hero scale',
            64: 'Title',
          }[px] ?? '',
      })),
      // the display face is for hero titles and the logo glyph; here it is
      // shown as a specimen and nowhere as copy
      specimen: [
        'Hello',
        'abcdefghijklm',
        'nopqrstuvwxyz',
        'ABCDEFGHIJKLM',
        'NOPQRSTUVWXYZ',
        '0123456789 .,!?-',
      ].map((line) => pixelText(line, 'display').svg),
      reading: tok('--cv-reading'),
      smear: tok('--cv-smear'),
    },
    {
      id: 'code',
      no: 'P2',
      title: 'code',
      note: 'One Dark, quoted, on its own ground',
      html: renderMarkdown(CODE),
      syntax: syntax(),
      ground: [swatch('--cv-code-bg'), swatch('--cv-code-ink')],
    },
    {
      id: 'hardware',
      no: 'P3',
      title: 'hardware',
      note: 'every control is a picture of its state',
      existing: true,
    },
    {
      id: 'surfaces',
      no: 'P4',
      title: 'surfaces',
      note: 'what the parts are made into',
      shapes: shapes(),
      stacks: STACKS.map((s) => s.id),
      tileTypes: [...new Set(TILES.map((t) => t.type))].map((type) => ({
        type,
        n: TILES.filter((t) => t.type === type).length,
      })),
      composition: COMPOSITION,
    },
    {
      id: 'motion',
      no: 'P5',
      title: 'motion',
      note: 'a state machine: hold a pose, snap to the next',
      waves: WAVES.map((w) => ({
        ...w,
        stairs: Array.from({ length: w.steps }, (_, i) => ((i + 1) * 8) / w.steps),
      })),
      durations: ['press', 'quick', 'glide', 'slide', 'drift', 'marquee'].map((n) => {
        const value = tok(`--cv-dur-${n}`)
        const ms =
          /s$/.test(value) && !/ms$/.test(value) ? parseFloat(value) * 1000 : parseFloat(value)
        return { name: n, value, cells: n === 'marquee' ? null : Math.round(ms / 10) }
      }),
      moves: [...kf.values()]
        .sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))
        .map((k) => ({
          ...k,
          ...timing(k.uses[0] ?? ''),
          used: k.uses.length > 0,
          ...(MOVES[k.name] ?? { what: '' }),
        })),
    },
    {
      id: 'personality',
      no: 'P6',
      title: 'personality',
      note: 'the gags and easter eggs we try to sneak in, and the rules they keep',
      kinds: GAG_KINDS.map((k) => ({ ...k, gags: GAGS.filter((g) => g.kind === k.id) })),
      rules: GAG_RULES,
      commands: COMMANDS.filter((c) => c.listed !== false && !c.owner),
    },
    {
      id: 'assets',
      no: 'P7',
      title: 'assets',
      note: 'one gate: a source, a preset, the cell, the ramp',
      gate: [
        ['render', 'a shading function or a photograph, in grey or in its own colour'],
        ['cells', 'averaged to the cell, four pixels, never a fraction of one'],
        ['dither', 'a 4 by 4 Bayer glyph per cell between the two nearest greys'],
        ['strip', 'every chunk that is not pixels removed, EXIF and GPS first'],
        ['name', 'its url carries the hash of its bytes, so a rebake reaches a warm cache'],
      ],
      images: [
        ['a ladybug', '/img/canvas/maurice.png', 'a photograph at half a cell, its red kept'],
        ['an instrument', '/img/instruments/rhodes.png', 'a sprite drawn for its stage'],
        ['an OG card', '/img/og/default.png', 'four greys, 1200 by 630, shown at half'],
      ],
    },
    {
      id: 'missing',
      no: 'P8',
      title: 'missing and surplus',
      note: 'what the site lacks, what it carries that nothing uses, and what is yours to decide',
      missing: MISSING,
      surplus: [...kf.values()]
        .filter((k) => k.uses.length === 0)
        .map((k) => ({
          name: `@keyframes ${k.name}`,
          why: `declared in ${k.file}, and no rule or script uses it`,
        })),
    },
    {
      id: 'voice',
      no: 'P9',
      title: 'voice',
      note: 'how the site talks',
      rules: VOICE,
    },
  ]
}

let PLATES
/** The sheet, as plates the template walks. Built once per process. */
export function plates() {
  PLATES ??= build()
  return PLATES
}
