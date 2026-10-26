---
name: multiplayer-canvas
description: The pixels are the magic. Everything that is not reading text is drawn on the cell, System 1 by way of Castlevania. Ink on one reflective grey ground that shows its grid, tiles as surfaces with square corners and no shadow, every control a lit and dithered picture of its state, material that moves in steps, one weight of DotGothic16 for every string, the site's own pixel blackletter (the mark's alphabet, lowercase and all) only for hero titles and the logo glyph, Hasklig for code, and every foreign tile quoting its host's own UI. Whatever you are not reading is drawn one step coarser. A ladybug named Maurice lives in the corner, and anyone can squish him. A commonplace canvas that holds from a watch to a wall.
# Machine-readable tokens (the @google/design.md format). The runtime source of
# truth is primitives/kit/canvas-tokens.css; these mirror it so the tooling
# (lint, WCAG contrast) has a structured view, and test/bible-sync.test.js
# fails the build if the two drift. There is ONE set of values: the *-dark
# half and the paired components that checked contrast in both directions
# went with the second theme.
colors:
  # ONE GROUND. There is no light/dark pair: no switch, no bulb, no stored
  # preference, and every accent has exactly one value chosen to sit on this
  # ground.
  ink: '#18181b'
  ground: '#e4e4e7'
  surface: '#ffffff'
  mute: '#505053'
  primary: '#18181b'
  code-bg: '#282c34'
  code-ink: '#abb2bf'
  # One Dark's hues, quoted with its ground (the syntax theme block in the
  # tokens); two sit under the text minimum and are frozen as quotation debt
  code-comment: '#5c6370'
  code-keyword: '#c678dd'
  code-name: '#e06c75'
  code-literal: '#56b6c2'
  code-string: '#98c379'
  code-number: '#d19a66'
  code-title: '#61aeee'
  code-class: '#e6c07b'
  brick: '#883c31'
  ochre: '#6c4e27'
  sage: '#46564d'
  # the floor of a cut: one tonal step UNDER the ground. A floor lighter
  # than the ground would draw a cut that sticks out.
  recess: '#d4d4d7'
  # the second ground, by decision: case-study pages stand on white,
  # experiment pages on the ground
  white: '#ffffff'
  # the parts ramp: the greys a part is dithered onto,
  # darkest first, with ink, mute and ground above. src/lib/kit-parts.js reads
  # them by name and test/kit.test.js holds every kit PNG to them.
  deep: '#0c0c0f'
  mid: '#99999c'
  bright: '#f4f4f5'
  # brick means armed or live: its ramp is brick between a deep and a light,
  # with Maurice's red (brick-fixed in the tokens) as the third step
  brick-deep: '#3a1612'
  brick-fixed: '#b81818'
  brick-light: '#e06a4a'
typography:
  meta:
    fontFamily: DotGothic16
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 20px
  body:
    fontFamily: DotGothic16
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  fs-1:
    fontFamily: DotGothic16
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 20px
  fs-2:
    fontFamily: DotGothic16
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  fs-3:
    fontFamily: DotGothic16
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  fs-4:
    fontFamily: DotGothic16
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 60px
  fs-6:
    fontFamily: DotGothic16
    fontSize: 64px
    fontWeight: '700'
    lineHeight: 80px
  code:
    fontFamily: Hasklig
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
spacing:
  px: 4px
  unit: 8px
  sp-hair: 2px
  sp-1: 4px
  sp-2: 8px
  sp-3: 12px
  sp-4: 16px
  sp-5: 20px
  sp-6: 24px
  sp-7: 32px
  sp-8: 40px
  sp-9: 56px
  sp-10: 80px
  module: 48px
  gutter: 48px
  air: 96px
  ctrl-h: 44px
  hero-btn-h: 56px
motion:
  press: 120ms
  quick: 150ms
  glide: 250ms
  slide: 320ms
  drift: 600ms
  marquee: 12s
  ease-hold: steps(1, end)
  ease-step: steps(4, end)
  ease-frames: steps(8, end)
rounded:
  DEFAULT: 0px
  sheet: 0px
components:
  body:
    backgroundColor: '{colors.ground}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.DEFAULT}'
  muted:
    backgroundColor: '{colors.ground}'
    textColor: '{colors.mute}'
    typography: '{typography.meta}'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.DEFAULT}'
  card-muted:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.mute}'
    typography: '{typography.meta}'
  inverted:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.ground}'
    typography: '{typography.body}'
  code-block:
    backgroundColor: '{colors.code-bg}'
    textColor: '{colors.code-ink}'
    typography: '{typography.code}'
  accent-brick:
    backgroundColor: '{colors.ground}'
    textColor: '{colors.brick}'
    typography: '{typography.body}'
  figure-fill-sage:
    backgroundColor: '{colors.sage}'
  figure-fill-ochre:
    backgroundColor: '{colors.ochre}'
  # the kit: each face a control can wear, with the label it carries
  page-case-study:
    backgroundColor: '{colors.white}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
  # the kit: the faces software draws in CSS; the hardware is a
  # baked picture and carries no text pair
  kit-inverted:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.bright}'
    typography: '{typography.body}'
  kit-armed:
    backgroundColor: '{colors.brick}'
    textColor: '{colors.bright}'
    typography: '{typography.body}'
  kit-screen:
    backgroundColor: '{colors.bright}'
    textColor: '{colors.ink}'
  kit-label:
    backgroundColor: '{colors.ground}'
    textColor: '{colors.mute}'
    typography: '{typography.body}'
  # the page that is read, inverted by its reader (section 1, the one stated
  # exemption from ONE GROUND): css/page-reader.css rebinds to these
  page-dark:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.bright}'
    typography: '{typography.body}'
  page-dark-muted:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.mid}'
    typography: '{typography.body}'
  page-dark-armed:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.brick-light}'
    typography: '{typography.body}'
---

# BIBLE.md

The multiplayer-canvas contract. One document, one runtime mirror
(`primitives/kit/canvas-tokens.css`), one geometry module
(`src/static/canvas/layout.js`). When code and this file disagree, one of them
is a bug and the fix must touch both. No rule here is decorative; every one
exists because a version without it looked worse, broke, or drifted.

Site voice rule that applies to this file too: no em-dashes (period, colon,
parens, or comma instead).

Be terse, always. Don't overstate, the reader is not dumb.

## 0. The standard: Lo-Hi tech

**North star.** A homogeneous, digital, interactive, multiplayer ode to
interfaces and the web. In one statement:

> This is an ode to interfaces, interaction and the digital. We're doing an
> anachronistic hyper-digital experience. We are creating a seamless
> experience that feels alive but unmistakeable digital, we are suspending
> disbelief and blending the best of interfaces (both physical and digital)
> with an experience that also seamlessly blends the multiplayer shared
> aspect of the internet with the individual interaction and intuitive UI. In
> a way what I keep subconsciously trying to set up these things like the
> slime where I want the user to feel like they're calling a bluff by
> interacting and then gets pleasantly surprised when it responds. It should
> be digital fantastical extraordinaire.

The aesthetic is Lo-Hi tech: smart analog, retro digital, where hardware,
software and art are one. The bar is beautiful and pixelated at once, and it
answers. Digital but alive.

**Tenets.**

- **I. Everything expected, and more.** Ambitious things, things that look
  like decoration but aren't, and unexpected interaction.
- **II. Alive, unmistakably digital.** It answers in cells and steps, never
  in blur.
- **III. The right idiom for the job.** A switch for a binary, indented radio
  buttons for one of many, toggles for many of many. Any era or technology,
  but only when it is the best way to do the job; never for reference's sake,
  and not all at once.
- **IV. For everyone, or for you.** Synced for everyone (most interactions
  and widgets) or local and yours. Never both, never a dual state. Presence on
  every page, anyone can follow anyone, and the owner can open a room of
  their own (section 2).
- **V. An accent on everything is no accent.** Everything is embellished, but
  some things only make sense in their context: the pixel fuzz is for hero
  titles.
  A trick done too many times stops being impressive.
- **VI. Form from function.** Every visual is useful: a scope drawing the
  wave you will hear, a key that lights when it sounds, a switch that shows
  its state. A readout nobody needs, a wall of numbers or a model name is
  show, and it goes. Dither is the same idea.

**Grammar.**

- **Pictures:** dithered realism. Every picture we own goes through the
  site's textmode path, the Bayer preset (`PRESETS` in
  `primitives/textmode-settings.js`, drawn by `js/textmode-draw.js`): the
  photographs, the renders and the OG cards. A photograph keeps its colour
  and gives up its continuous tone: each cell is a Bayer glyph of two
  neighbouring lightnesses of the grey ramp, and its dots take the cell's
  own hue at them.
  A raster lands on the cell. An object stands alone on the ground with no frame.
  A box is for software only, and a UI is never wrapped in a labelled
  container.
- **A card is the page, at billboard size.** An Open Graph card is drawn out
  of the site's own parts, never beside them: the ground with its grid, the
  sheet under its ink masthead, the pixel title the page sets, the kit's tag,
  the marks the home screen holds, and the page's own picture at twice its
  size, standing in a window the sheet's edges cut. It is derived from the
  content (a case study's title, tags, impact and first figure; an
  experiment's baked picture; a door's mark), so a rename is a rerun and no
  list is kept in step. Every length is a whole number of cells, the type is
  the one face at whole dots, and the card is snapped to the ramp, so it is
  flat on purpose: its pictures are ones the site already baked or the
  drawings the page already carries. `scripts/og/render.sh` draws them;
  `test/og.test.js` and `test/og-cards.test.js` hold one card per page, the
  derivation and the ramp.
- **Controls:** a control is a picture of its state, lit from the top left
  and dithered. The switch is the checkbox, and every state is drawn. The one
  set is `primitives/kit/kit.css` (section 1), its parts are
  `src/lib/kit-parts.js`, and `/admin/kit` is the sheet, the living specimen
  of everything (section 10).
- **The control grammar.** A state is drawn by what a person can do with
  it, so the brain reads it before the words do. Every control on the site is one row
  of this, and a row is chosen by the job, never by the look.
  - A binary you SET (a setting that stays): the flip switch, lever up for
    on (`.k-switch`, the `flip` part; the instruments' toggle is the same
    switch at a panel's size).
  - A binary you READ: the lamp (`.k-lamp`). A lamp is never pressed; what
    it waits on is a push button beside it.
  - A momentary act: the push button, which springs back (`.k-btn`,
    `.k-hw`).
  - An act that runs until stopped (play, listen, the map shown): the
    latching button, down while it runs, with its lamp lit.
  - One of a few, all in view: radio push-buttons, one down, a car radio's
    presets (`.k-rk`).
  - One of many, or one by name: a list that opens (the page bar's v; the
    platform's own picker for a font).
  - Many of many, a checklist: check boxes, the one place they stand.
  - The pages of a set: tabs, the index card's (`.k-tab`).
  - Walking a sequence: the snap scrollbar (`.k-scroll`).
  - A value along a line, where its place matters: the fader (`.k-fader`,
    `.k-range`). A value turned by feel: the knob.
  - A count you read: split-flap digits (`.k-flap`). Progress you read: the
    progress bar; a wait nobody can measure: the loader.
  - Words you give: a field whose caret stands where the next letter goes.
  - Somebody else's view: their hand in their hue, and following them
    frames your whole screen in that hue, the way Figma does.
    `test/kit.test.js` holds the two the site broke most (a setting drawn as
    a check box, a lamp that is pressed).
- **Panels:** one panel per tool. Sections are divided by rules one cell
  thick and small screen-printed labels, laid out along what the tool does
  (a synth's signal path runs left to right). No boxes inside boxes, and no tab spam:
  one of many is radio push-buttons.
- **Titles:** the pixel face, with the pointer dust, sets the hero titles and
  nothing else (section 10).
- **Type:** DotGothic16 (OFL, vendored with its licence under the CSP) is
  every other string: labels, readouts, the finder line, the counter, names
  and nav. It sits on the one ladder the kit and the canvas share, whole
  multiples of 16 (section 3). Dark on light is smear
  bold, the glyph drawn again one dot to the right (`--cv-smear`); that is a glyph weight, not a
  shadow, and it is the one named exception in `test/ink-chrome.test.js`.
  Light on dark stays regular. Control labels are `fs-3`.
- **Ink and line:** ink, mute, ground and bright; brick means armed or live.
  There is no lavender, amber or other accent. A widget may wear its
  host's colours (the quotation law, section 1). Lines are one cell, `--cv-px` (4px), the same
  line the canvas draws: the outline button, the checkbox, the field's underline, the fader's track
  and ticks, the rules, the focus ring, the dock, the panel and its
  sections. A baked part's rim is a cell too. Few backgrounds, no white
  cards; case studies are white and experiments gray.
- **Motion:** nothing shakes, strobes or flashes (the photosensitivity
  limit). Steps, never easing blur (section 9).
- **The page:** one navigation for every full page, a case study or an
  experiment, opened from the canvas or loaded direct: the PAGE BAR at the
  top of the sheet (section 6), a strip of tabs over the page's ring the
  way a browser holds its pages, because it is familiar. A tab is the
  index card's (the kit's card tab), and a page that is read carries the reader's settings (section 6). On the ground a
  collection turns on the kit's snap scrollbar, the same bar everywhere a
  collection is walked, so the intuition built on one side of the site
  works on the other.
- **Toolchain:** a part is rendered in grey from its shading function,
  dithered through the textmode Bayer preset (the site's own path; no second
  ditherer), baked to PNG, snapped to the cell and metadata-stripped
  (`scripts/img/bake-parts.mjs`). A new part is a new spec in that generator,
  never a hand SVG. The Bayer order has one source, `primitives/textmode-settings.js`:
  every dither in the tree (the map, the sky, the photograph pixelator, the
  dither frames) imports it, and nothing else writes a threshold matrix or
  builds one (`test/one-bayer.test.js`).

## 1. Material

- The native material is zinc black `#18181b` on zinc grey `#e4e4e7`, mute `#505053` for secondary
  text, bright `#f4f4f5` for light text on a dark face. It dresses everything
  that LIVES here: the hero, the chrome, the sheet, the case studies, the
  experiments. There is ONE ground: no switch, no bulb, no stored preference,
  no OS listener, and every accent is a single colour
  (`test/one-ground.test.js`).
- **The one stated exemption: a page that is READ.** A reader's eyes are not ours
  to choose, so the shell of a page that is read (`#modal.reading`, a case
  study now, the articles and reports after it) may take the inverted
  ground, bright words on ink, when the reader says so (Dark Mode) or, with
  nothing said, when their OS does. It is the tokens rebound inside the
  shell, the way a quotation rebinds a tile (the kit's inverted face:
  bright, mid for the muted, brick's light step for the armed, measured as
  `page-dark*` in the frontmatter); code keeps One Dark. The canvas, its
  chrome, the collections and every experiment stay on the one ground, and
  the boundary is guarded: two files may declare it (`css/page-reader.css`,
  `js/page-reader.js`), every rule under it starts at the shell, and the
  choice is written on the shell and nowhere else
  (`test/one-ground.test.js`).
- **THE QUOTATION LAW.** A widget whose data lives on another platform may
  wear that platform's own colours, verbatim, as a local rebinding of the ink
  tokens inside the tile (`.q-*` in canvas-home.css). The type face is never
  quoted. The guest palettes live in the guest section of canvas-tokens.css
  and nowhere else, and chrome never borrows them (`test/palette.test.js`,
  `test/contrast.test.js`). Where our version is better than the host's, ours
  stays.
- **Brick means armed or live.** `brick` is the one accent chrome may wear,
  and only for that: the lit lamp, the call that is called, the reset that
  asks "sure?" between its first press and its second. The content colours
  (`ochre`, `sage`) survive for the figures and the instrument
  sprites that still paint with them (`scripts/tokens/accents.mjs` is the
  inventory, `test/accents.test.js` holds it at zero vestigial); they never
  touch chrome, and the page restyles decide whether
  they stay.
- Content is exempt from the inks: code blocks (One Dark, quoted,
  the `--cv-code-*` block of the tokens) and figure illustrations keep their
  colour, and so does a photograph, through its dither (section 0): exempt
  from the inks, never from the ramp's lightnesses or the cell. Chrome never
  does.
- Live-presence cursors are the one sanctioned exception: each remote
  visitor's hand takes a generated hue (spaced around the wheel), not a
  token, so distinct identity scales past the accents. Only the fill
  leaves the palette; the two rings around it stay the ink and ground tokens.
  The hand is a drawn sprite (section 10): three layers, the colour and the
  same mark grown one cell and two (`test/cursor-ring.test.js`). Presence is
  neither chrome nor content, and nothing about it persists. [OWNER PASS]
- **THE PIXELS ARE THE MAGIC.** Other than the type face, everything is drawn
  on the cell. A tile is pixels too: square corners, no shadow. The display
  face sets the hero titles; every other string, small or
  long, is the type face (section 0). What this buys is the freedom of the
  cell: any edge, corner, tone, frame or transition can be drawn, dithered, stepped, run as Life
  or invaded on the same grid the logo is cut from, and it all reads as
  one thing. Cohesion here is pixels all the way down, not a modern frame
  with pixel garnish. No pixel title bars, no costume of a specific OS: the
  register is the cell, not a skin over it.
- **The surface.** `--cv-surface` is one step off the ground: white on the
  grey page. Every card, control and sheet stands on it
  (`test/contrast.test.js`). A quotation rebinds it to the host's own
  ground.
- **THE SECOND GROUND, BY DECISION.** Case-study pages stand on white
  (`--cv-white`); experiment pages stand on the ground. White is a ground
  here, not a card, so it has its own name even while it shares the
  surface's value (`test/bible-sync.test.js`).
- **The type face is DotGothic16**, for everything read, at one weight on
  the one ladder (section 3): 16 for labels and prose, 32 for control labels
  and leads, 64 for titles set in it. It is a dot-matrix gothic drawn on a
  16 grid, crisp at whole multiples of 16 and at nothing between, which is
  why every rung is one. Dark on
  light is smear bold (`--cv-smear`, section 0); light on dark is regular.
  The DISPLAY face is the pixel blackletter (pixel-type.js, data
  on the cell) and sets only the hero titles. The tally, the etched lines and every
  name on the ground (an experiment's, Maurice's, the slime's, a
  pile's) are the type face; a surface this section or
  section 5 still describes in the label hand or the display face is
  waiting on its move, and the rule wins where they disagree. Hasklig for code and only
  code, where "code" means a real `<code>` or `<pre>` holding something
  machine-readable, never chrome that merely resembles code.
  Counters, timestamps, stat values, captions and readouts are chrome and
  stay in the type face; where mono was buying non-jittering columns,
  `font-variant-numeric: tabular-nums` buys the same thing without a second
  typeface. No third face exists. Raw font-family strings live only in the
  two `@font-face` blocks and the two tokens in `canvas-tokens.css`;
  everything else reads `var(--cv-font)` or `var(--cv-font-code)`,
  measurement included (JS that measures text reads the token, it does not
  re-type its value; `test/font-rule.test.js`). The face file is vendored
  under `src/static/fonts` with its licence beside it, and
  `test/bible-sync.test.js` holds the token, the frontmatter, the file and
  the licence to one family, so the next swap is that token and its
  `@font-face` and nothing else. The sanctioned escapes are named in
  section 13.
- **A CODE BLOCK IS ONE PART.** A case study's fence is numbered lines
  (`lib/code-lines.js`) dressed by one stylesheet (`code.css`): Hasklig at the
  meta size on One Dark's own ground, a line that never wraps, and a gutter
  of numbers that sticks to the left edge while the block scrolls, drawn from
  the line's data so that a copy of the code never carries them. A page says
  only where the block stands (the sheet's column and its copy key), never
  what it is made of. `test/kit-code.test.js`.
- **THERE IS NO HAIRLINE, AND COLOUR IS THE TRANSITION.** Nothing on the
  canvas is separated by a one-pixel line, because a canvas built from a
  four-pixel cell cannot also draw the thinnest line a browser has: off the
  rested camera that line is fuzz. Two blocks are told
  apart by their COLOUR: a control is the tonal step from the ground to the
  surface, a chip is one step cut into the card it sits on, a divider is a
  whole cell of a cut tone, and two blocks of surface are parted by the ground
  showing through at the chrome's half-cell (`--cv-bd-cut`). `--cv-line` is
  that cut tone, ink at a fraction: the colour a divider is drawn in, and the
  name a quotation rebinds to its host's own line (`.q-*`) and the reader to
  its inverted ground. A line is a whole cell of it or nothing; the ground cut
  is the one named half (`test/px-tokens.test.js`).
- **THE RECESS.** A thing CUT INTO the ground is lit from the north-west, so
  its north and west walls are dark and its south and east catch the
  light: one cell of ink inside the top-left, one cell of ground inside the
  bottom-right, painted as background bands so they take no room, and a
  floor one tonal step under the ground (`--cv-recess`). The about zone
  wears it (section 5).
- **NO SHADOW.** No `box-shadow`, no `drop-shadow`, and no one-cell hard
  cast either (`test/ink-chrome.test.js`,
  `test/elevation.test.js`). The one `text-shadow` is the smear, by its token
  only, pinned to one dot and no blur. A thing that is raised is not told
  apart by a cast: it is a picture of itself.
- **A CONTROL IS A PICTURE OF ITS STATE.** The hardware of the kit (knob,
  bat toggle, push button, radio push-button tall and labelled, thin fader
  cap, lamp, call button, keycap, piano keys, patch pin) is a shading function in
  `src/lib/kit-parts.js`, lit from the top left by one light, sampled to
  cells and dithered by textmode through `PRESETS.parts` onto THE RAMP: `deep`, `ink`, `mute`, `mid`, `ground`,
  `bright`, darkest first, and for a lit jewel the brick ramp `brick-deep`,
  `brick`, `brick-fixed`, `brick-light`. The bake
  (`scripts/img/bake-parts.mjs`) writes one PNG per state under
  `src/static/img/kit/`, one px per dot and one cell per four px, shown
  one to one, so a part sits on the cell by construction. `test/kit.test.js`
  holds every PNG to exactly those greys, to the cells of its spec, to a
  Bayer glyph per cell, and every part to every state it claims. Software is
  drawn in CSS with lines of one cell (`--cv-px`) and nothing else: the
  outline button
  (hover fills ink, pressing flashes brick, `.is-hot` is armed), the checkbox, the field with
  its block caret, the section rules, the scope (a screen of cells), the
  chip (a word a panel reads out, raised to an ink block when it is the one
  that is true now, its word never moving), the tag (what a thing is about:
  a word in the code face, the one part of the kit set in it, in a block whose
  edge is one cell of the line tone,
  read and never pressed, in a row that wraps on a two-cell gap; it is made of
  tokens alone, so it is the same drawing on the ground, on a card and on a
  white page, and a quotation that rebinds the tokens re-dresses it), the
  dock, the bank (keys of one
  width in whole cells, one cell of rule between neighbours however the row
  wraps), and the form parts on their native elements, each still
  itself underneath and drawn again in ink: the select (the field's rule
  and a chevron of ink cut on the cell), the textarea (a box), the date
  (a field with the OS's picker under the chevron), the file drop (a box
  that lights under a drag), the progress (a bar filled in ink segments),
  the disclosure (`<details>` whose summary is the outline button), the
  fader and the checkbox on a native range and checkbox, the swatch, and
  the radio push-button as a link (`aria-current` is the one that is down,
  which is how the desk's nav is drawn). The chrome parts are the
  menu (`.k-menu`: outline buttons in one box, a rule between rows, the
  row the keys are on lit in ink; `.k-up` opens off a bar), the selection
  mark (`.k-sel`: a one-cell ink outline a cell off the thing, a solid
  handle on each corner, no glow), the loader (`.k-load`: a block of ink
  walking a one-cell meter in four steps) and the field in a bar
  (`.k-field.k-sm`, the words at 16). A page that is one tool divides
  its sections with one-cell rules (`.k-secs`), never boxes. Every pressable thing answers hover, pressed, focus (the one
  ring: ink, one cell thick and one cell out, or one cell in where out would
  be clipped; under a forced palette the same ring in `Highlight` or
  `CanvasText`, `test/focus-ring.test.js`) and disabled (unpowered: mute, regular,
  answering nothing), respects the tap floor (`--cv-ctrl-h`, grown by `--cv-world-k` in the
  world), wears the drawn hands of `presence.js` rather than the system's,
  and draws nothing in SVG by hand.
- **No corner is round.** `--cv-r` and `--cv-r-sheet` are zero, and nothing
  small is a circle either, and there is no circle token: a
  circle is cell data (the slime's dish, section 5). The
  tally and the chips are BLOCKS, not outlined cells
  (`test/elevation.test.js`, `test/ink-chrome.test.js`), and so is the tag: a
  block whose edge is one cell of the line tone, never ink
  (`test/kit-tag.test.js`).
- **A TILE HAS NO BORDER.** It is a BLOCK: it meets the ground at a sudden
  change of colour, and that is the whole edge. A half-cell border cannot be crisp: the zoom ladder rests where one
  CELL is a whole number of device pixels, so HALF a cell lands on a half
  pixel at every odd rung, the opening camera included. What still carries
  an edge is hero furniture and the controls that must read from across the
  room (the field, the close, the map), because a surface is
  barely off the ground; those take a WHOLE cell, which is crisp at every
  rung by construction. `--cv-bd-ink` is a whole cell. Nothing thinner
  frames anything. Every guest ground and `--cv-surface` sit a findable step
  off the ground (`test/contrast.test.js`); the step is the edge.
- **A forced palette takes the block AND its tones in one move**, repainting
  every ground and every edge to one system colour, which
  would leave the world a flat field with text floating on it. The boundary
  comes back there as a whole cell of CanvasText, and the cut-outs stay
  cut-outs. `test/forced-colors.test.js` checks the fallback EXISTS for every
  selector that dropped its border, rather than accepting any block that
  merely mentions a border property.
- No em-dashes anywhere on any surface.

## 2. The world

- One toroidal canvas, ONE WORLD. **The ground is a 4K screen of cells**
  (`GROUND` in layout.js), whole cells on both axes. It is fixed, identical
  for every visitor, and takes no viewport input at all: a phone and a
  billboard see the same coordinates, so anything synced travels as a
  straight fraction. The wrap exists so everything stays close, never so
  there is a universe to cross (`test/canvas-layout.test.js`).
- **WHAT THE ROOM SHARES, AND WHERE IT STOPS.** The canvas is one place and
  the people on it can see each other in it. Shared: every cursor, what each
  cursor is RESTING ON, and whether its button is down. A pointer on a card
  rings that card for everybody, with the same ring the visitor's own pointer
  would give it, and never a second visual state of its own. The statement is
  shared too, character by character (section 4), and its phrase: the hero is
  a pile of sentences and rides `front` with a stack named for it. Spectators
  (past `PARTICIPANT_CAP`) watch and cannot move anything, the same line the
  cursors draw. A spectator's tab does not PRETEND to move it either: the
  optimistic paint behind every shared hand (the squish, a pile's front, the
  slime's food) asks `presence.mayAct()` first, the same fact the send is
  gated on. The dish reads as not-tappable while it is (`aria-disabled`, no
  tab stop, the pointing hand let go).
  SYNCED MEANS SYNCED FOR EVERYONE. A widget has one state and the room
  holds all of it: never one half on the room and the other on a tab, never
  one half in the public room and the other half only in a session. What is
  shared in a session only is the heavy and expensive: the instruments.
  The line is MECHANICAL, not a promise: a client may say where it is and
  what it is looking at, it may squish Maurice, it may turn a pile to a
  member and it may drop food in the slime mould's dish (section 5); the
  inbound protocol has exactly those frames and no field for any other
  mutation to travel in, and in the public room at large no frame asks for
  a mutation of someone else's view: the acts, the views among them, reach
  only a session or the tabs following the sender (below)
  (`test/presence.test.js`, `test/shared-hover.test.js`).
- **THE PAGE SAYS WHERE THE ROOM STANDS, THE WIRE SAYS WHAT MOVES.** What
  the server holds about the room is in the document it sends (`#boot`:
  Maurice's instant, each pile's front, the dish, and the head count as
  `others`), and the first frame is painted from it, so the welcome that
  follows has nothing to correct. A tab that opened on the defaults and let
  the wire fix them showed a statement that blew apart to become another,
  a bug alive for a frame after the room had
  squished him, and a tally that turned from a zero nobody had counted. Two
  things are not baked, for the same reason: a cursor is a stream, moved
  again before the page parses, so the welcome's roster is the first honest
  word on it; and the sky's offset is motion, a spring stepped several times
  a second, so a number baked into the page is stale before it parses. The
  document's own `h1` is not the room's either: it stays on the first
  phrase for a crawler, and it is hidden while the canvas boots.
  The head count is a measurement, and the rule about measurements holds in
  every window where the roster has not been heard. Before the welcome a tab
  says what the page said, and a room named in the address (which the page
  knows nothing of) says nothing, never zero. A dropped socket leaves the
  last count standing, because an empty roster after a drop is the cursors
  gone and not the room, and changing rooms drops the last room's count. A
  count that appears is born on its digits, and only a change to one already
  showing turns (`test/first-paint.test.js`,
  `test/presence-optional.test.js`).
- **THE VIEW TRAVELS WHERE ACTS DO.**
  What a visitor is looking at is an act on a channel of its own, `view`
  (`primitives/presence/presence-protocol.js`), so the room's audience rules hold it
  unchanged: in the public room at large it goes nowhere and each
  visitor's view is their own; under a follow it goes from the one
  followed to the tabs following them; in a session it goes from everyone
  to everyone. Shared that way: a video or a sound on a page (playing or
  paused, where, how fast), the instrument up on the instruments card, the
  photograph a photo set shows, Listen (reading, paused or stopped, and the
  sentence), and the collection spread over the ground and which of its
  cards is up. Spreading a pile is the visitor's own in the public room, and
  shared inside a follow or a session. A page's view carries the page's slug and is dropped on any
  other page, and every view is read strictly, anything malformed dropped
  whole (`primitives/rooms/view-sync.js`). Applying one never says it back: a page
  script holds its own replay flag, and a state equal to the one just told
  is not news. A browser that refuses to start sound on a page nobody
  touched is never overruled in silence: the video plays along muted with
  a kit button beside it, "playing along, tap to hear", and Listen reads
  "Reading along, tap to hear" with the sentence still lit. A reading a
  peer started lights its sentence and never scrolls the reader's page. A
  fan the one followed spread stays up on the follower's screen for as
  long as they follow, until a hand of the follower's own folds it. The
  kit's pagers need nothing of their own: on the ground they already turn a
  pile for everyone (section 5), and the one over a fan's card is the
  fan's. The camera, the scroll and a page opened on its own are not
  views. The reader's settings (Dark Mode, Plain Type) and a video's volume
  and mute stay each reader's own in every room: they are accessibility,
  not content (`test/view-sync.test.js`, `test/web-instruments.test.js`).
- **The room SNAPSHOTS, it does not relay.** The room keeps each peer's
  LATEST position and ships one frame a tick (`SNAP_MS` in
  `primitives/presence/presence-room.js`) carrying everyone who moved. Positions are
  quantised (`QUANT`) to under a pixel of the world. The frame is IDENTICAL
  for every recipient, so it is serialised ONCE per tick; the sender's own
  entry rides along and the client skips its own id. The client eases
  between snapshots (`SMOOTH_TAU` in primitives/presence/presence.js), so the tick is the
  rate news ARRIVES at, not the rate anything is drawn at. Inbound is
  untouched: a client still sends `move`.
  A snapshot entry carries the hover key ONLY WHEN IT CHANGES. An entry has
  three states, `[id, x, y, down]` for unchanged, a trailing `0` for cleared
  and a trailing string for a new key, because null is already a fact on
  this wire. The room sends on a dirty flag rather than a compare against
  the last key sent, so a joiner is never stranded on a key a peer left
  (`test/presence.test.js`).
- **A leaving cursor pops.** When a peer leaves the page by any door, their
  hand swells and goes in three frames while a ring of pixels bursts from
  its tip in their own hue, and then it is gone. The room sees the
  departure the way it sees the arrival: as a thing that happened on the
  ground, not a row that vanished (unguarded).
- Zoom is the device adapter. The camera scales instead of the world
  reflowing. **THE HONEST TORUS: the camera never sees more than one
  world, and it gets every bit of freedom short of that.** It goes out
  until the view first reaches the world's width or its height (cover) and
  no further (`outZ`, layout.js `cameraBounds`, snapped UP the ladder only
  as far as it must, and it outranks the ceiling too). A view no longer
  than the world holds each world point at most once, so no place is ever
  on screen twice. What that leaves is the tile a screen edge cuts: its
  remaining part is at the opposite edge, where the world starts again,
  and it is drawn there (layout.js `wrapSpots`: a second spot only for a
  span the view's edge cuts, the two parts disjoint). The node stands at
  its own spot and every other part is a LIVE copy (`primitives/mirror.js`):
  inert and aria-hidden with no ids and no presence key, its canvases
  repainted from the node's every frame and the whole copy re-cloned on
  any change to the node, so it is the same tile now, never a frozen
  twin. The one thing a copy does not share is a pointer on it. A desktop
  and a phone mount tiles all the way out; a watch mounts down to its
  floor (`minZ`, the wrist's cap in section 5) and past it the PLAN paints
  the world on the map's cell, one canvas whatever is in view, by the
  same spots (`scripts/verify/world-fixed.mjs` measures it, and reads
  every node and copy back as parts of the tile: no two overlap, every
  copy is cut by a screen edge, a cut slime's copy matches it frame by
  frame). The ceiling is `MAXZ` in app.js. The
  opening zoom fits the derived open frame (`openFrame` in layout.js) into
  the screen MINUS the bar's band (section 8): the hero and its dock
  (section 4) with a gutter on every side, whichever axis binds. So the
  first thing anyone sees is the statement with the world visibly around
  it and the widget ring peeking at the edges: evidence there is somewhere
  to go, not a written promise of it. Pinch, trackpad pinch, ctrl-wheel and
  the +/- keys, which step a rung of the ladder a press (`stepZoom` in
  layout.js: a fixed fraction of a step was under half a rung on a screen of
  ordinary density, and the settle that followed took the camera back to where
  it was, so the key did nothing). Nothing but the mirror copies a tile, and nothing copies
  the seam (`test/zoom-floor.test.js`, `test/canvas-layout.test.js`,
  `test/mirror.test.js`, and the keys `test/zoom-keys.test.js`).
- **The ground shows its grid, not a rule.** Two textures, drawn (app.js
  `#grid` / `#gridFine`): a speck at every module corner at every camera,
  and the logo's own pixel as a checker as the camera nears true scale, each
  square one cell (`--cv-px`) so the screen at true scale IS the dither
  the identity is cut from. Both ride the camera's wrap the way the seam
  does; neither is information, so a forced palette drops them and the
  design still stands. The fine texture is level of detail: it comes up
  only where a cell can hold two squares (unguarded). [OWNER PASS]
- **THE SEAM is a stitch**: one cell of ink, one of ground, along the whole
  edge where world x wraps and where world y wraps (app.js `#seamV` /
  `#seamH`), ONE line per axis, since a view no longer than the world
  holds its edge once at most (layout.js `seamAt`), each spanning the whole frame, positioned by the camera's own
  wrap, thickness through `--cv-world-k` with the stitch length a world
  cell. Under a forced palette it is a plain rule in the system's ink. An
  unannounced wrap reads as a bug rather than as a torus. The seam is a
  GRID LINE, never an outline: a line that stops at a corner draws a
  rectangle floating on the ground, so the lines run the full frame and a
  seam crossing is a full cross (`test/forced-colors.test.js` keeps it off
  gradients; the rest unguarded). [OWNER PASS]
- **The camera rests on the pixel ladder.** A pixel is a pixel only at a
  whole number of DEVICE pixels; anywhere else the browser blends its edges
  and the grid, the mark, the type and the icons all go soft at once. So
  every zoom the camera comes to rest at is snapped to
  `z = k / (PX x dpr)` (layout.js `snapZoom`). Gestures run free between
  steps and glide onto one when they end; fits snap down, so the opening
  frame is never overflowed; floors snap up, so cover is never undershot.
  The wrist's extra step out never rests above the rung the fit rests on
  (a screen is allowed the frame it opens on), but cover outranks the fit
  and the ceiling alike (layout.js `cameraBounds`); under a device pixel
  per cell, where there is no ladder, cover keeps its raw value; and every
  landing puts the world origin on a device pixel
  (`snapCam`), so the lattice paints whole. The label hand and the icons
  draw on half cells and are exact at every other step; the cell itself is
  exact at all of them (`test/zoom-floor.test.js`).
- Camera, zoom and widget state persist in localStorage. The open page
  persists in the URL. A camera restores only into the frame it was saved
  against: the same world and a viewport close to the saved one (app.js
  `savedFrame`). Anything else re-opens at home, because a remembered point
  on a different frame is bare ground, not memory. A live resize keeps the
  camera; the guard is for the return (unguarded).
- NOTHING EVER TOUCHES. Minimum `air` (96px) between any two elements at
  any viewport. Things that belong together rest closer than strangers, but
  never under the floor (`test/canvas-layout.test.js`).
- Determinism is law. Same tiles, same world: layout is a pure function
  with no randomness and no viewport input. The hard passes (module snap,
  air resolution, the hug and its seam, wrap) make dysfunction impossible;
  the build fails if a single violation survives them
  (`test/canvas-layout.test.js`). The screen chrome is not one of those
  passes and takes no world pixels: it is a camera property (section 8).
- **The world seats its nodes, and nothing else may.** `.el` is
  `position: absolute` at `0,0` and app.js places every node with a
  transform. That one mechanism is what makes determinism VISIBLE rather
  than merely true, and it is a single CSS declaration deep: a later rule
  at equal specificity that re-declares `position` on a world node pulls
  it into the flow of `#scene`, and two viewers stop looking at the same
  place. Position a descendant, never the node. A pseudo-element does not
  need it at all; the node it hangs on is already positioned
  (`test/world-seat.test.js`).
- **THE ROOM IS EVERY PAGE, AND FOLLOWING IS A LINE.**
  A case study, an experiment or a feed entry opened over the ground is
  still the same room: the cursors of everyone reading that page are drawn
  on it, seated on its CONTENT. A position on a page travels as the page's
  slug, the index of the block the pointer is on and a fraction of that
  block's box (`anchor.js`), never as a pixel or a fraction of the
  document, so a hand on a word at a phone's width is on the same word at
  a billboard's (`test/presence.test.js` holds the round trip). A reader
  above or below the part of the page you can see is a chevron on that
  edge in their hue. The room cuts one frame per PLACE: a page's moves go
  to the readers of that page and the ground's to the visitors on the
  ground, a place with one person in it is sent nothing and sends nothing,
  and only a change of place goes to everyone, which is how the who's-here
  list and a follower learn where somebody went (`primitives/presence/presence-room.js`).
  Following is picking a cursor (a click on it, or a row of the who's-here
  list off the tally or `/who`) and going where it goes: the camera keeps
  it under the middle of the frame, a page it opens opens here, its block
  is scrolled to, the ground comes back when it leaves. Anybody may follow
  anybody this way, and it BREAKS when the follower goes to do something
  of their own: steering the view (a pan, a wheel, a finger on the page),
  their own hand walking more than three modules from where it was when
  the follow began (`follow.js` FOLLOW_SLACK), Escape, the x on the tag, or
  the peer leaving. A key is not steering: a follower plays along on the
  instrument the one followed opened without letting go.
  WHO follows whom is on the wire (this reverses the older rule that
  nothing about following was): the move frame carries the id followed and
  the room numbers each line in the order people joined it, so every tab
  draws a follower where following puts it, in line one beat behind the
  one in front, on the head's own recorded path (`conga.js`). Picking a
  follower attaches to the head of that line, at the back, and a follower
  whose leader goes on to follow somebody moves up with them: one queue per
  line, never a tree (`follow.js` headOf).
  A follow is a session of one direction: what the one followed plays (a
  note, a knob: the ACTS, below) goes to the tabs
  following it and to nobody else in the public room. A follower's acts
  go nowhere: the one followed never chose to hear a stranger
  (`presence-room.js` act).
  The VIEW is still the follower's alone: nothing anybody sends moves
  anybody else's camera, scroll or sheet (`follow.js`). Tenet IV,
  mechanical: a page's shared things (its cursors, and where a follower is
  drawn) are everyone's; a reader's own (the scroll, the sheet open or
  closed) are theirs, and nothing is both.
- **THREE MODES, EACH A SUPERSET OF THE LAST.** The PUBLIC ROOM is the
  default: hands, the light things shared (the bug, the piles, the dish),
  and a click-follow anybody may take (above), one to many and broken by
  walking off. A FOLLOW ROOM (`?follow`) is that follow made a room: every
  guest follows the owner on arrival and stays following, their own input
  lets nothing go, a host who drops out is waited for and picked again when
  back, and what the host plays goes to all of them while what they play
  goes nowhere (`presence-room.js` act drops it at the room). A SESSION
  (`?session`) is many to many, for jams, demos, walk-throughs and games:
  everyone can do everything and every act goes to all. When somebody in a
  session goes somewhere (opens a page, comes back to the ground), everybody
  else not already there and not following them is ASKED, never moved: a
  tag in their hue says where they went, [go] takes you there without
  following anybody, and the x, Escape or twelve seconds put it away. One
  such tag at a time, the newest.
- **A ROOM OF THE OWNER'S OWN IS THE FLAG IN THE ADDRESS.** Only the owner
  opens one: a bare `?follow` or `?session` on any page is a new room with
  a generated code, `?follow=<word>` is the room of that name, opened with
  it when nobody has (lower case, digits and dashes, up to thirty-two), and
  the desk's sessions tool opens either. Flags do nothing for anybody else:
  a bare one is dropped, an unknown code is refused, and a live code lets
  them in, in the room's own kind whatever the flag said. The owner's
  `&pin=` is the PIN (four digits), `off` (none), or absent (the desk's
  default); a guest's is the attempt. A PIN is four digits and twenty wrong
  tries an hour, and is taken off the address once read (`primitives/rooms/sessions.js`).
  The flag STAYS in the address while the tab is in the room, rewritten to
  `?<kind>=<code>` once the room answers, and rides every canvas
  navigation (`finder-url.js` withRoom), so a reload or a walk to another
  page stays in it; deleting it is leaving, on a load or a step through
  the history, and a refusal (ended, not the owner, locked out) takes it
  off and leaves the tab public. Whoever is in a room is in nothing else:
  the public room and a room of its own never see each other's hands.
  Inside, everything the public room shares is shared, and so are ACTS,
  relayed as they happen rather than on the snapshot tick: a note and its
  release, a knob. A selection on a page is shared the way
  it is in the public room (`highlight.js`), inside the room. Page scripts
  never touch the socket: they say `canvas:act` and hear `canvas:peer-act` on
  the window. A room ends when the owner ends it, after twenty minutes
  empty, or twelve hours after it began, and lives in memory: a restart
  ends it.

## 3. Geometry

Everything is derived from the cell and what is built of it: the cell
`PX = 4px`, the 8px unit (two cells), the module `M = 48px = 6u = 12 cells`,
and the type ladder for prose.

- **The cell is the logo's pixel.** The maker's mark (`MARK` in layout.js)
  is drawn at one cell a pixel, so its box is 44px, and 44 is also the
  control height, so the mark fills a bar button edge to edge at true scale.
  The spacing scale is whole cells at every step (sp-hair, the hairline, is
  the one half), the module is twelve, air twenty-four. Everything drawn ON
  the ground is N cells and seated on the cell lattice: the mark, the pixel
  type, tile edges (on the module, which is cells). Pixel ART keeps
  its own native grid at a rational size of the cell: the 24-grid dock
  glyphs draw at half a cell a pixel, the label hand
  of the type at half a cell; the display hand and the mark at one. `PX` in
  layout.js, `--cv-px` in the tokens, `test/bible-sync.test.js` holds the
  three together.
- **The third axis** (`iso.js`, held by `test/iso.test.js`). Pixel isometric
  is the same cell with depth: an edge along x steps two cells right and one
  down, along y two cells left and one down, along z two cells up. Every
  vertex lands on a cell and every slope is two across to one down, so a
  solid drawn this way rasterises to clean stairs at any integer scale and
  sits on the same lattice as a flat sprite, a glyph or a tile. That is what
  lets a thing on the canvas be flat or solid without anything else
  changing: the ground does not know which it is. In two inks a solid has no
  shading, it has DENSITY: the top face is ground inside an ink edge, the
  left face the checker, the right face solid ink. Three faces, three dither
  levels, one light that is nowhere in particular. `project`/`unproject` are
  exact inverses, `isoBox` sets a w x d x h solid as crispEdges SVG. Nothing
  on the ground is drawn with it today: the world lies flat, and
  this is the vocabulary a solid uses when one earns its place.
- **Spacing** rides the 8px grid (`sp-hair 2` and `sp-1 4` are the documented
  sub-grid exceptions, chip padding and hairline nudges only).
- **The module.** Every tile dimension is a whole multiple of M, declared in
  module units in `TILES` and multiplied once. Every cluster origin and every
  loose tile lands on the M grid. Gutter is `GUTTER` (one module) inside a
  block, air is `AIR` (two modules) between blocks. `test/canvas-layout.test.js`
  holds the lattice and the air.
- **Aspect vocabulary: φ lives in proportion.** The golden ratio is on the
  module as Fibonacci, and a tile is one of exactly six shapes, in modules:
  eight by eight (the square), eight by five (the shelf), five by eight (the
  portrait), five by five (the small square), three by three, and two by
  two (the icon). A tile across several slots (`span`) takes its width from
  the slot arithmetic and its height from two, three, five or eight
  modules. Each tile takes the shape nearest its footprint, by aspect first
  and area second, both measured as log ratios so a tie breaks the same way
  at any scale, and its content refits to the shape, never the reverse.
  A tile is square when it can be: the five by five is the tiles' unit, and
  only a tile whose content cannot stand in a square takes the portrait. The
  cards a stack holds take the six too. A new shape is a decision in this
  paragraph, not a one-off. `test/tile-vocabulary.test.js`.
- **Only the tiles take the Fibonacci steps.** Type stays on its ladder
  (below), because the face is crisp there and nowhere else, and spacing
  stays on the cell.
- **The type ladder** is whole multiples of 16: 16, 32, 48, 64, 112
  (`LADDER`), because the face is drawn on a 16 grid and is crisp at those
  sizes and at nothing between; a golden size would be a blurred glyph. The
  kit and the canvas read the same rungs. The token names are roles snapped
  to the nearest rung: meta, body and `fs-1` at 16; `fs-2` and `fs-3` at 32;
  `fs-4` at 48; `fs-6` at 64. The top rung has no token: the postcard is the
  one thing set that large. Display line height is five quarters of the size
  (`lineHeightFor`), on the cell; prose reads at 24px (three grid units) on
  the 16px body. No component sets a size or line height off the ladder.
  `test/bible-sync.test.js`.
- **The hero** is a world constant: the design-view atom slimmed to two
  thirds on both axes (`heroFixed`), holding only the statement. Its type is
  the largest of `HERO_STEPS` under `TYPE_SLOPE` of the hero's width
  (`heroType`), floor 32,
  ceiling 64: at its fixed width that is 48 on 60. Type never scales continuously; devices reframe it by zoom,
  never by reflow.
- **Placement is the bento** (`BENTO` in layout.js). The world is a ring of
  SLOTS around the hero's block on a coarse grid: a slot is `BENTO.unit`
  square, the gutter between slots is the strangers' AIR, and the ring is
  `BENTO.cols` slots across by `BENTO.rows` down with the hero and its dock
  in the hole. A tile keeps its own size and sits CENTRED in its slot, on the
  cell lattice, or, with `span`, in the slots it takes across as one box (the
  guard holds a covered slot to be nobody's seat); a slot may stay empty.
  Nothing is solved: `SLOTS` in layout.js is the hand's table, (column, row)
  on the ring, chosen by the compass and checked by the guard. The ring is
  seated inside the ground at the NEAR corner of the wrap corridor (`SEAM`),
  and that is arithmetic rather than taste: slot origins and the ground's own
  box both land on the module (the guard holds both), and the leftover is
  spent as the corridor; where the origin sits inside a corridor is
  invisible on a torus. The arithmetic is the comment above `SEAM`. Positions
  are arithmetic; the invariants are law, held by
  `test/canvas-layout.test.js`.
- **The compass.** Neighborhoods have directions from home, and `TAG_DIR`
  in layout.js is the table: northeast the reading and writing, east the life
  (weather), southeast the work (the case studies, on their own first-class
  bearing), southwest the person's own things (about, Maurice, the ways to
  reach them), and northwest the lab, the one bearing that points at a corner
  of the ring. Where the prose and `TAG_DIR` disagree, `TAG_DIR` is right
  and this paragraph is the bug. Each tag names a direction (`TAG_DIR`) and a
  tile's home vector is the normalized sum of its tags', so a single-tag
  tile points straight at its neighborhood and a dual-citizen bridges the
  corner between the two it belongs to. The hand's table honours it: the
  guard (`test/canvas-layout.test.js`) asserts every seated tile lands within
  a quarter turn of its home vector, and the icons, the dock's furniture, are
  not in it.
- There is no per-viewport WORLD fork and no stage scale. The watch, the
  phone and the billboard all hold the one world at their own zoom. The
  screen chrome does fork, into three discrete densities (section 8), for
  the reason the world does not: it is measured in screen pixels, so a
  watch screen and a wall are not the same problem.

## 4. The hero

- **The dock** (`DOCK`, `dockBox`, `dockSlots`, `openBlock` in layout.js).
  The ways to reach the owner stand in rows under the statement, on bare
  ground: a box as wide as the hero, an air below its foot (the etched tally
  overhangs the hero's box, and the rows want their own breath), holding the
  icon glyphs at the `DOCK` pitch in its rows, each row centred, in the
  hand's order (`DOCK.order`). Nothing is drawn behind them; the glyphs stand
  where they are. The dock's box is a fixed body in the world like the hero:
  the rings keep their air from it, the icons are its furniture seated on
  the cell inside it (never by the compass, never measured against anything
  else), and home centres the whole block. The icons keep their own nodes,
  so the finder, the relayed hover and the keyboard address them.
  `test/canvas-layout.test.js` holds the seats.

- Every phrase is a plain sentence ending with a period. The statement is
  centred and set whole in the display face, wrapped on its columns before
  it paints (`wrapText`), so nothing ever rewraps or shifts.
- **The statement is a pager, and the pager is the room's.** The hero is a
  pile of sentences (`PHRASES` in `hero-cycle.js`, which holds nothing
  else) turned one at a time: a click anywhere on the statement goes
  forward, the arrow keys go either way, and the snap scrollbar on its side
  under the words (section 8) goes to any phrase. Whoever turns it turns it
  for everyone, on the room's `front` of the hero pile, the frame a pile
  turns on; a joiner opens on the phrase the room is on, and a spectator's
  hand turns nothing. No clock turns it. A turn is the dust read both ways:
  the old phrase is blown apart and does not come back, and the next one
  arrives scattered and settles into itself (section 10).
  `test/room-state.test.js`.
- The first phrase ships server-rendered as the document's h1, so curl,
  reader mode and no-JS visitors meet the statement. It is where the document
  opens, not where the canvas does: `#prelude` is held back 600ms and only
  ever paints when a boot is slow enough to need it.
- The hero holds ONLY the statement. There are no doors: no row of
  shortcut buttons under it. The ground is legible on its own (the studies
  flank the about triptych), and a shortcut past a thing that
  is already obvious is furniture with nothing behind it. The sections are
  reached by the ground, the finder, the commands and the paths. No section
  ever gets a second item on the canvas.
- Under the statement: the etched lines ("drag, scroll and zoom to explore",
  then "the site wraps around in every direction") and the split-flap
  visitor tally ("000 others here"), the lines and the words in the type
  face, mute, the digits the kit's small split flaps (`.k-flaps.k-sm`)
  three cells off the words, permanent. Two instruction lines, because how the canvas moves is
  discoverable by trying it and the wrap is not. Instructions are carved
  into the ground, never floated as dismissable chrome. The maker's mark
  is stamped above the hero, `MARK` on the cell lattice, and
  the dust rises under a cursor crossing it (section 10); it says nothing
  on hover.
- Under prefers-reduced-motion a turn is a cut: the next phrase is shown
  whole, with no dust. Still the room's phrase, changing when the room's
  does: the preference asks for no animation, not for a different sentence
  from everyone else's.

## 5. Tiles: items, widgets and stacks

Every tile is obviously the thing it is, at a glance, in two inks. Beyond
looks, every tile is one of two kinds, and the kind decides its behavior;
a STACK is the third shape a tile can take, one tile that holds a collection
of either.

- **Stacks.** A collection is one tile: a pile with a name and a
  count. The pile shows the first member's card whole, as an inert facsimile,
  floating over two backs that step one even vector DOWN the cast, two cells
  a card (`PILE` in `src/static/canvas/layout.js`), so the front is the top
  of the pile and the deepest back its base. The backs are GROUND, edged on
  the south and east alone, the cast's own two sides, so each back shows a
  cell of ground and then a cell of line and the pile is ground the whole way
  down: never solid ink, never a border all the way round. A hand over the
  pile lifts the front two more cells off it; the pile
  never moves. Under it, the name in the type face, and on the line below
  the name the COUNT (how many, in the pile's own noun: `countLine` in layout.js),
  the same face and size one step dimmer, in the mute; and the PAGER: the kit's snap scrollbar (`.k-scroll`, section 0) stood on
  end beside the pile, a few cells short of it at each end (`PILE.pagerInset`
  in layout.js), six cells wide, its thumb at the
  member the pile shows. A stepper, a press on the track, a wheel notch or
  a key turns the pile to another member's card FOR EVERYONE: the front of
  a pile is the room's, over the presence wire (section 2), baked into the
  boot payload so a fresh tab opens on the shared front, and a remote turn
  moves the thumb. A held thumb scrubs the pile to this tab alone and the
  release commits. Opening the pile stays the visitor's own in the public
  room at large, and is shared inside a follow or a session (section 2,
  the views). The footprint is declared from the
  vocabulary (section 3) and the pile is composed inside it: the card keeps
  its member's shape on the largest module of whole cells the footprint
  holds, never more than M, and the facsimile lays its words out at that
  size, so a member's shelf stands in the shelf of its pile on a module two
  thirds of M.
  `stackFits` proves the composition sits inside it on the cell lattice.
  A pile is labelled with what it holds, never with the
  section it belongs to: the studies say "Case Studies". The members keep
  their own card shapes and are built
  by the same builder as everything else, seated by the FAN and never by the
  world. Guarded by `test/stacks.test.js`.
- **The fan.** A click on a stack spreads it over the frame: the members fly
  out of the pile to a grid fitted to the viewport (`fanLayout`: of every
  column count, the one that lets the cards be largest, ties to fewer rows,
  centred in the strip above the bar; under `FAN.minScale` the cards stop
  shrinking and the fan scrolls, one column at true size on a phone), each
  card a beat after the one before.
  The canvas goes one resolution step coarser under the fan (section 9) and
  inert; Esc, the scrim or the browser's back fold the fan back into the
  pile. THE FANNED STATE IS A PAGE: `/case-studies` (and `/work`) opens with
  the fan already spread and curl gets the collection as a list. Nested
  collections are allowed by the model and none exists
  yet.
- **The finder is one list.** Everything on the ground and
  everything inside a pile answers to the same field (section 8): a tile,
  a pile, a section, a card in a collection. Nothing is reachable from the
  ground and not from the field. Furniture is not in it: the hero, the
  mark, the tally.
- **Stacks, by name.** There is one: `work` (the case studies).
  `test/stacks.test.js` holds the list; a new collection is a new row there
  and here.
- **The zone.** What fits in a paragraph and a few links, or can
  be condensed to one, is not a page: it is a place on the ground. There is
  one zone, ABOUT, a TRIPTYCH of three blocks side by side: Me (the person),
  Work (the work text's opening paragraphs up to the folded pitch: what the owner
  does, specializes in, does on contract and wants more of) and Site (what
  you are looking at). The tile spans more than one slot of the ring for it,
  `span` in layout.js `TILES`. WORK is not a zone: `/work` is the case
  studies stack. A zone wider than a slot lands on
  its first slot at the slot's fit, so a phone reads it and pans for the
  rest. A zone never repeats what the ground
  already says: the ways to reach the owner (email, the feed) are the
  dock's (the
  envelope a mailto and nothing behind it). A zone is RECESSED: the floor
  of the cut is one tonal step under the ground, with a cell of ink along
  its north and west walls and a cell of ground along its south and east,
  lit by the one fixed light (section 1). A place you can walk into is cut
  into a wall, not floated over it. No border:
  the depth is the whole edge. The cut-out things on the ground stay bare and
  are NOT to be given one (the experiments, Maurice, the icon glyphs): a
  die-cut sticker has no wall to be set into. The title is
  set in the display face at one cell a pixel as a word (About), the words
  in the type face on the cut's
  floor. The title sits OVER the cut rather than inside it,
  centred on the zone's full span, in the slot's own slack and the ring's
  air, so it never reaches the row above. The title and the cut centre in
  the slot as one block (layout.js `ZONE_TITLE`), and that is what keeps
  the bar's top edge from cutting through the word at the opening camera
  (section 8). The copy is the server's (lib/zones.js, from the same sources curl
  reads) and stands in the no-JS prelude too, so a crawler and the canvas
  say the same thing. The /about command and the /about PATH fly the camera
  to the zone and write the place into the address; a direct load opens on
  it at true scale. /about is the only path that lands a camera
  (`LAND_ROUTES`); /work fans the studies. Only the case studies are
  pages. A zone answers to the finder like everything else: found, it
  is flown to and lit, and there is nothing to open. Guarded by
  `test/zones.test.js`.
- **Contact is the envelope.** A mailto hands the conversation to a place the
  visitor already owns. The /contact COMMAND lands the camera on the dock
  rather than launching the mail client itself: the command shows the
  choices; the envelope is still one press away and still a mailto. Guarded
  by `test/contact.test.js`.
- **A fan holds the world still.** While a collection is up
  the canvas neither pans nor pinches nor wheels: a press on a card is the
  card's, the wheel is the grid's (it scrolls the collection), and the
  world under the scrim is where it was when the fan closes. A grid that
  scrolls ends one margin past the bar, not under it, so the last card can
  be brought fully clear; and the head (the collection's name and count)
  stands over the cards on its own strip of scrim, never under them. The
  pages a fan can open are fetched the moment it is up, so the click that
  opens one paints from memory.
- **The wrist never holds more than two slots across.** What kills a
  watch is the world in view, so at the watch density the MOUNT floor
  is `WATCH_SLOTS` slots across (layout.js, `cameraBounds`), on the ladder,
  and past it the wrist sees the plan, never more tiles;
  the hero overflows the watch screen there and the wrist pans, and
  the crown scrolls a sheet, which is the trade. The
  device lies about itself: the size it reports is the adapted layout, not
  the panel. Guarded by `test/zoom-floor.test.js`.
- **The wrist gets tap and pan, and the numbers.** The Digital
  Crown zoom is opt-in (`?crown`); pinch-gesture zoom is off at the watch density; `?diag` puts
  the viewport, the scale, the zoom and a count of every zoom input on the
  screen, written to storage each tick so a killed run leaves its last
  numbers (only ever with the flag: the root url shows nothing); and two
  kills inside a minute (a boot that finds the last run's heartbeat with no
  clean exit) arm `?safe` on its own, quietly:
  no crown, no wheel or pinch zoom, no remembered camera, the floor at the
  opening frame. A device no bench reproduces is measured on the device.
- **A release the page never saw ends the gesture.** A mouse
  moving with no button down is not dragging anything: the drag ends there,
  dead, with no glide, and so does any gesture when the window loses focus
  or the tab is hidden.
- **The preview.** A member that is a page (a case study) opens from its fan
  as a card with a bottom: reading measure wide, a hairline all round, the
  big radius on every corner, its prose scrolling inside it, the fan and the
  world fixed below. It GROWS OUT OF ITS CARD: the sheet
  starts at the card's rect, scaled to it, and glides to its place on the
  slide token, and closing runs the same move backwards into the seat it
  left, before the layer lets go. A preview never slides up from the foot;
  the bottom sheet keeps that move for pages that have no seat. `<` and `>` (and the arrow keys, and a sideways swipe)
  walk to the adjacent studies: the card shrinks back into its own slot in
  the fan and the next grows out of its slot into the card's place. A swipe
  down from the top closes it, and so does a click on anything the card
  did not draw: the ground beside it is outside the page. A page scrolls one
  way; anything wider than the column scrolls inside its own box, never
  the page. `/work/<slug>` is that state, and closing a
  directly loaded card lands on its fan, not on home. Effects never stack:
  while the card is up the fan's scrim steps aside and the card's own
  backdrop dims the collection and the ground together, one effect between
  the thing shown and everything under it.

- **Items** are content with an address. Articles, experiments, photos, case
  studies. An EXPERIMENT
  still, cut out, and its name under it in the type face, no card, no kind,
  no date. They are the fun ones, demos, and a demo wants no masthead. The case studies live on the canvas like
  everything else here; /work fans them as the curated index over
  the same set, the relation articles keep with /feed. A local item opens a
  page (section 6). An item published elsewhere links straight to where it
  lives, in a new tab, and the tile itself announces the departure: the host
  as its kind label, a north-east arrow in the corner, the one-line summary
  saying what it is. Its /feed/<slug> stays a temporary-redirect handle, repointable in
  frontmatter. A departure never surprises; it never needs a hop either.
- **An experiment is an object; a case study is a card.** An experiment
  (`web_only: true`) is a `web` tile on the ground: a PNG the toolkit made
  (section 10) and its name, never a card. A case study is a card in the
  work pile. Guarded by `test/canvas-layout.test.js`.
- **An item's kind decides its address, in one place.** Four kinds, one
  fork: a case study lands under /work at /work/&lt;slug&gt;, writing
  in the collection at /feed/&lt;slug&gt;, and the canvas-native kinds (web
  experiments, photo sets) at a bare /&lt;slug&gt;, because they are not
  members of a collection: they live on the canvas as themselves. /feed and
  the RSS carry writing only. The fork is written once and read everywhere,
  routes, sitemap, llms.txt, sheets and tiles alike; a kind that routes one
  way on the canvas and another at its URL is the failure this prevents.
- **A photo set is an item whose page is its pictures.** No body to write,
  no layout per set: the folder of pictures IS the content, filename order,
  and the page is a carousel of them. Its pictures ship stripped: EXIF, GPS
  and every camera-identifying field are removed before a file is committed,
  and the build fails on any that are not. Publishing a picture of a dog in
  a garden is a decision; publishing the garden's coordinates is not one
  anybody makes on purpose.
- **Maurice.** A ladybug, his own photograph cut to its
  bounds and pixelated at half a cell a pixel
  (`/img/canvas/maurice.png`, metadata stripped like every picture), so
  he keeps his red and his shine and still sits on the lattice; his name
  under him in the type face, struck through while
  he is squished. The splat is drawn in the picture's own red
  (`--cv-brick-fixed`, sampled from it: the one red that is not on the
  accent ladder at all, because a ladybug is content). He lives in the
  south
  corridor, flush with the ground's foot, under the one seat on the foot row
  that holds no tile, off every ring (`placeWorld` seats him by hand). He sits still under a
  hand. A click SQUISHES him: for everyone, for `SQUISH_MS`, and
  the splat that takes his place is a little red lying flat on the ground
  in pixel isometric with the spray it threw. He is the one shared hand on
  the presence wire (section 2): the frame says `squish` and nothing else,
  the room decides how long and tells every open tab the instant he is
  back, the shell bakes that instant so a fresh tab opens on the shared
  bug, and a second stamp inside `SQUISH_MS` is not a second squish.
  The whimsy register (section 10) allows exactly this: rare, pixel, a game.
- **The slime mould.** A physarum simulation in a round dish on the
  northwest corner of the ring:
  on the ground, in the eight by eight square, its name
  (Sisyphus the Slime) two lines of the type face hanging off the dish's
  south edge past the tile's, centred under the dish. The dish sits in the
  tile's top left corner, so the circle lines up with the box it stands in
  (`dishBox` in slime.js). The dish is `DISH`, the smallest even cell count
  whose circle circumscribes a five by five square, inside the tile, and
  its rim is CELL DATA, a
  line one cell thick drawn through the path-from-grid and wired to the
  dust. The mould is the server's: one deterministic
  simulation in the process (`primitives/slime/server.js`, same seed same
  picture) on its own clock (`TICK_MS`) whether anyone watches or not, on
  the lab's rules with the departures `PARAMS` records in
  `primitives/slime/slime.js`, and a restart is a fresh inoculation. The
  picture goes out over the presence wire as cell data every `FRAME_MS`,
  and only to a tab that says `watch` (document visible and dish on
  camera): one KEYFRAME, then DELTAS against it, each naming the tick it
  was cut from, and a tab holding another picture asks for a keyframe
  rather than apply it; a tab that has not said yes is sent nothing. From
  the no until the next keyframe is decoded the tile wears `data-asleep`
  and the dish is desaturated and dimmed by one filter, at once, and its
  colour returns in frames (`--cv-dur-drift`, `--cv-ease-step`), never a
  fade. The shell bakes the current frame so a fresh tab never opens on an
  empty dish, and the browser only decodes and paints, one backing pixel a
  cell in the flat `TONES` on the grey ramp (mid, mute, ink), nothing
  mixed, dithered or smoothed, food in brick, because food is live. Food keeps the network a network: the dish holds `STANDING`
  pellets and grows the next after a random wait between `SPAWN_MIN_MS`
  and `SPAWN_MAX_MS`, each food cell feeds a smell field the foragers
  steer on, and a tap drops a pellet for everyone (the `feed` frame,
  section 2, one cell; outside the circle is a quiet no), painted on the
  tapping tab at once and confirmed by the room's next frame. Guarded by
  `test/slime.test.js`; against a served build, `npm run verify:slime`
  (an absent tab is sent nothing, a watching tab only deltas, a returning
  tab exactly one keyframe) and `npm run verify:slime-asleep` (headless
  Chrome: the dish sleeps off camera and in a hidden tab, and revives on
  the keyframe).
- **The window.** The weather tile is not a card. It is a square of sky
  in one ink frame, a cell wide, and the sky is the picture (`primitives/sky/outlook.js`). It is set from the payload
  like a sheet of pixel skies: the hour across (dawn, day, sunset, night,
  from the visitor's clock against the day's real sunrise and sunset, read
  modulo a day, and the `day` flag alone when those are missing) and the
  weather down (fine, clouds, overcast, rain, snow, fog; every condition
  the service sends lands on a row, and `test/outlook.test.js` walks the
  code table to prove it). The sky is flat bands stepping into each other
  through the Bayer map (the toolkit's one dither), never a gradient; their
  edges are ragged in sideways runs of whole cells, and a low sun pulls the
  warm bands up round itself. The sun is a plain disc and the moon a disc
  lit by the real phase of the moon, both on an arc from the real hour, low
  on the horizon at dawn and sunset. Clouds are a noise field on whole
  cells, wisps on a fair sky and a mottled deck on a grey one, each tone
  mixed into the sky under it, with no shadow; a thin fair cloud is
  brightest where it is densest and a deck darkest. Rain darkens and
  flattens the sky to two bands. Everything moves in whole
  steps on the wall clock (`STEP_MS`), the same drop on every tab, only
  while the tile is on camera: clouds drift, rain falls, snow sways, and a
  star goes out for one step, rarely. It stands still (one frame a minute,
  for the hour) under reduced motion, `?bare`, `?frozen` and the watch
  density. Nothing is written on the sky: the temperature, the condition
  and the place are the canvas's accessible label. One canvas, and its
  name under it on the ground (The Sky), the way the dish carries its own:
  the window is the whole five by five, sixty cells of
  sky, and
  the name hangs under it into the slot's slack as the dish's does.
  Guarded by `test/outlook.test.js`.
- **Every thing on the ground says what it is, in Title Case.** A tile, a
  pile, a widget, a glyph in the dock: each carries its `label` in
  `TILES`, set under it in the type face, every word capitalised but the
  small words inside a name (Sisyphus the Slime) and a brand in its own
  casing (RSS). The finder says the same name. Nothing is
  filed as an experiment on the ground: a thing is what it is (its tags say
  what it is about, never what shelf it came off). Guarded by
  `test/canvas-layout.test.js` and `test/canvas-widgets-kit.test.js`.
- **Widgets** are ambient state, not content: the weather window, the slime
  and Maurice. Widgets have no page and no URL. A thing that can stand on the
  ground does. Inner affordances (a flip, a step button, a small outbound
  arrow in the corner of a live widget) are part of the widget, not routes.
- **Dock icons** are identity chrome, desktop-icon style: the pixel glyph
  bare on the ground, no box (a tile around a glyph that needs none is the
  opposite of what the canvas is for: more things stand on the ground
  without a card, not fewer), the name below in the type face at meta, direct link
  out. They are the sanctioned direct departures.
- Data comes from the source or it does not ship: live upstreams SSR'd with a
  checked-in snapshot as the per-key fallback. Nothing is hand-typed.
- **The server owns the refresh, and it says so out loud.** One poll every
  five minutes, one payload, one truth. When that poll lands something new
  the process nudges every open tab over the presence socket with the names
  of the keys that moved, and each tab re-reads `/api/canvas`. The frame
  carries key names, never the data. Not mainly for the bytes (it measures
  under 8KB, so the saving is real but small) but because one payload on two
  transports is two things that can disagree, and the tab already has one
  path that applies fresh data. A push that took its own path would be a
  second way to be wrong. Clients still poll on their own timer as the
  floor, so a tab the room refused stays correct, just slower. What this
  buys is not speed, it is agreement: every visitor is looking at the same
  refresh of the same upstream, which is what lets live data onto a
  deterministic canvas at all.
- Clickable tiles are keyboard tiles: tab, Enter, Space.
- **A press acts. That is all it does.** The camera moves for
  anything deliberately asked for (the wheel, the finder, a zone's path, the
  map) and for nothing else. Keyboard focus is the one exception and it is
  narrow: an off-camera tile is `display:none`, so Tab would otherwise walk
  into things nobody can see, and the camera follows focus ONLY when the
  focused tile is not already in the frame.

## 6. Pages

- **Two grounds, by decision.** A page sits ON the canvas, never on
  a ground cut out of it. Case-study pages stand on white (`--cv-white`),
  experiment pages on the canvas ground itself. White is the one
  second ground and it is a decision, not a theme: nothing flips between
  them. The kit's controls read on both (`/admin/kit`).
- The modal IS the page. It opens as a bottom sheet leaving a strip of the
  canvas dimmed; scrolling slides the canvas off screen and the document takes over.
  The canvas is frozen underneath, and it GIVES underneath: the world sinks
  by a breath (`setRecede` in app.js) about the viewport center while a page
  rests on it and rises back
  when the page leaves, the elevation model felt, not just drawn. The
  page's foot clears the fixed bar by the bar's own arithmetic, so the
  last line of a document is never parked under the search field. Every
  modal is also a standalone URL, and a page may outlive its tile.
- Sheet type rides the ladder: h1 at 32; h2, body and meta at 16, the h2 set
  apart by weight.
- One universal top-right button: hamburger on the canvas, x in a page.
- **The page bar.** A full page carries ONE navigation and no
  other previous or next anywhere: a strip of TABS, the way a browser holds
  its pages, the sheet's full width, stuck to the top of the scroll owner
  (`#mscroll`) with a one-cell rule under it, on the sheet's own ground.
  One tab a page of the ring (the page's own kind only, the open collection
  setting the order), in the collection's order, each a real link; the page
  you are on is the lit tab (`aria-current`). A page of a ring is one of
  many, and a browser's tab is the index card's: a tab is the kit's CARD
  TAB (`.k-tab`, the Web Instruments tab's drawing), one piece with the page
  under it. Every tab is a one-cell outline open at its foot; the ones
  behind stand on the bar's rule, ground with mute words, and the page you
  are on is a cell taller, its floor the page's own ground, so it stands in
  the rule and the page runs up into it. The close box is on the lit tab and
  no other, as a browser tab's is, and goes back where the page came from
  (its collection, else the canvas, exactly as Esc does). The bar ends in
  the CORNER CLOSE, the kit's close box with its word, "Close", going the
  same way: the one top-right button a page has, in reach
  wherever the page is scrolled because the bar is. A case study's strip is
  named "Case Studies"; an experiment's is not named at all, because an
  experiment is not filed under a word for its kind anywhere a reader sees
  (; its meta line
  is its date, `test/served-labels.test.js`). A TAB SWITCHES IN PLACE
  : nothing
  closes, nothing shrinks into its card, the collection is not walked, the
  address follows by replaceState, and the new page comes in top to bottom
  in four frames (section 9). A link in the prose to a page of the ring, a
  followed reader's page and the swipe are the same switch. Opening and
  closing keep their rects. A tab is as wide as
  its nearness earns, the lit tab and its neighbours taking the most of the
  room, and never narrower than a readable title (`--tab-min`, sixteen
  characters; the lit tab adds its close box). Where the tabs do not fit (a
  phone, a long ring) the strip scrolls sideways under the finger and
  snaps to a tab, rather than cutting titles to a letter, and the lit tab is brought to the middle of
  the strip whenever the bar is painted. The corner close is outside the
  strip and never scrolls away. The arrows
  walk the tabs and wrap, with one Tab stop (a roving tabindex). Between
  the strip and the corner close stands the V, a small arrow with no box,
  a browser strip's tab search (its name says where this page is, in how
  many), and it opens every page of the ring as the kit's menu: each row a real link, the page's whole title
  over its one-line summary, never cut, the page you are on lit; a row
  switches in place as a tab does. The list is a native popover, so Esc and a
  tap outside close it with no script. ON A PHONE (the width where the
  corner close drops its word) the bar is what a phone browser's is: the
  tab you are on, the v and the X. The other
  tabs step aside, the lit one takes the strip and a tap on it opens the
  list, and its own close steps aside for the corner's. A ring of one
  carries no v. Nothing else rides
  the bar. The markup is `primitives/kit/kit-scroll.js`, SSR'd on a direct load and
  painted on a click, one string. It publishes its height as
  `--page-bar-h` (and the one-line head under it as `--page-head-h`) so an
  experiment sizes itself to the frame under it: an experiment is an app
  and fills the screen without overflowing where its content allows. The
  sideways swipe walks the same ring. Nothing in the bar is words, so a
  drag across the page never selects it. `test/page-bar.test.js`.
- **The reader's settings.** A page that is read (a case study now; the
  articles and reports after it wear the same shell) carries one small
  group under its meta line, kit controls with their words on them: Dark
  Mode and Plain Type are switches, Listen is an outline button that
  becomes Pause and Resume with a Stop beside it while it speaks. Dark Mode
  is the exemption of section 1. Plain Type sets the prose in the reader's
  own system sans a step larger, the one face this site names outright
  (`font-ok`), because it is the reader choosing; the title keeps its
  pixels. Listen is the browser's own voice (Web Speech, nothing leaves
  the device): the title, then the prose in order, a figure by what it
  shows, never a code block or the footnotes, the sentence being read lit
  by the Custom Highlight API (`::highlight(tts)`, the page never
  rewritten) and kept in the middle third of the screen; it stops when the
  page closes or switches or the browser tab is left, and it is not
  offered where the browser cannot speak. The choices are this reader's
  and live in this browser; storage that throws costs only their memory.
  The markup is `js/page-reader.js`, SSR'd and painted alike.
  `test/page-reader.test.js`.
- **The page's foot.** The way back to the top is where the web puts it:
  after the last of a long page's content, in its flow, one outline button
  (`.k-btn`) that says "back to the top" with the up chevron before the
  words. It shows only on a page whose scroll owner is
  over two screens tall, measured once the layout is real and again when
  the page's height changes (`app.js` footTop), and nothing stands beside
  it: it is the page's foot, not a second nav. `test/page-bar.test.js`.
  document.title follows the open page.
- **A link inside the page is the browser's jump.** A footnote, a line
  number and a heading point at a place in a page that is already up, and the
  browser takes the reader there on the sheet's own easing. The router does
  not paint the page again under that jump: a step of the history paints only
  when the address names another page, so the reader lands on the place and
  not near the top of a page that was rebuilt. `test/anchor-jump.test.js`.
- The search is a FINDER, not a menu and not a lens: typing
  finds WHERE things are and takes you there. The top result comes under
  the camera FRAMED and is lit by the frame (section 9): the camera lands at
  true scale when the frame has room and PULLS BACK when it does not, bounded
  by one slot on each axis, and a hand already deeper than true scale keeps
  its depth only while the thing still fits there. Everything seated on the
  ring is at most a slot, so for an ordinary tile this reads as "true scale,
  or what fits"; the about zone spans two slots and arrives on one of them
  rather than at a third scale on type nobody can read. It is the arrival rule for the finder and for
  keyboard focus (`frameZoom` in app.js), so a thing found is a thing
  on the screen. The aim carries the chrome band's half, so the thing is centred
  in the FREE frame and never under the bar. ArrowDown,
  Tab and ArrowUp walk the rest; one line over the field says which of how
  many, in the label hand. A result on the ground (a tile, a pile, a
  section) is flown to and lit. A result inside a collection lights its pile,
  flies the camera to it, and opens the collection only once the camera
  has landed, with the card lit; a hand that tabs on before the landing
  cancels the open, so walking the results fast is walking the ground. Enter is the thing's own click: a page opens, a link leaves, a
  pile fans, a section is already under you. The rank is the name itself,
  then a name that starts so, then a word anywhere in what the thing says,
  then a fuzzy name; ties by name. Nothing on the ground is hidden and
  nothing is re-menued, and the camera never comes back on its own: you
  were dropped where the thing is, and that is the point. Escape lets the
  query go and leaves you there. The finder works from anywhere: a query
  typed while a page is open closes the page. The line over the field that
  says which of how many is also the cycler: with more than one find, two
  steppers flank it at the tap floor (`test/touch-affordance.test.js`), so a touch screen walks
  the results the way the arrow keys do, and they take the pointer without
  taking the keyboard from the field.
  THE FINDER IS IN THE ADDRESS. The bar is open while the field has the focus or holds a
  query: `?search=` open and empty, `?search=<query>` (encodeURIComponent)
  holding one, no param shut. Typing REPLACES the entry, a beat after the
  last key, so a query typed letter by letter is one place in the history;
  every other param stays byte for byte (`primitives/rooms/finder-url.js`). A load
  that carries it opens the bar, puts the query in the field and runs the
  find, flight and all, except over a page or a fan loaded on its own path,
  where the query waits in the field (a find closes the page, and the page
  is what was sent). A command line (the slash roster, the unlisted doors)
  never reaches the address. The server serves the canvas for any
  `?search=` and the canonical stays the bare URL, so a shared find is not
  a second page to an index. `test/finder-url.test.js`.
- A page's own content never opens a second way out. A photo carousel steps
  with the kit's walker (`.k-scroll`, its steppers and its slider) and with
  the arrow keys, and Escape still means the rung
  it always meant, because the ladder below is the only ladder. Nothing
  inside a page traps focus either: tab leaves, always.
- "/" pops the quick-command roster, filtered past the slash (the names
  that start so first, then the fuzzy net), walked with arrows, completed
  with Tab, run with Enter. THE BAR IS A COMMAND LINE. , "do add params and flags". A line is read the way a shell reads
  one: words, quotes that hold words together, `--flag value`,
  `--flag=value` and a bare `--flag`, the word after a flag its value only
  where the command says that flag takes one. A flag the command does not
  have, a missing word or a word too many is one line under the field in
  the kit's voice, never a guess and never a dialog. A whole name shows
  its usage line, and from an empty field the arrows walk the lines run
  since the page loaded, in memory only (`canvas/commands.js`,
  `test/commands.test.js`). Everybody's commands are what the finder
  cannot do (move the camera without a query, one that is only for fun)
  and the ones that name where to go: a page by name, a random page, a
  page read aloud by its own Listen (named, since a full page covers the
  bar), a link to what the tab is looking at (never the
  pin), a room joined or left, and /help, which lists exactly what this
  viewer can type. /keys lists every key the page answers, and `?` opens it,
  the shortcut sheet every web app answers to that key, as Ctrl or Cmd with K
  opens the bar from anywhere, a field included, the key every command
  palette answers to (the browser's own Ctrl+K is let go only where there is
  no bar to take it); the list is one table
  (`KEYS`) held to the page's global key handler both ways
  (`test/keys.test.js`). A key held with Ctrl, Cmd or Alt is the browser's
  and the system's (zoom, find, back), never the page's: the page answers
  bare keys, and Shift, which is what makes a ? and a +, and AltGr, which is
  how some layouts type a / (`test/zoom-keys.test.js`). **/login is everybody's and is NEVER LISTED**: not
  suggested, not completed, not in /help; typed in full it goes, so it
  works on a machine that is not signed in. The owner's commands (the desk
  and its tools, rooms, logout) are listed and run only once
  the page has confirmed the owner's session, and to anyone else they are
  the same "no such command" a typo gets. /POOF is a COLLAPSE and a BIG BANG, and they are
  one event: the world falls into a point, the point sits still, and then
  everything comes back out of it. Its length is beats of a token
  (`POOF_PULL`, `POOF_BANG` in app.js), and the length is the point.
  THE COLLAPSE FEEDS THE BANG. Every cell of every tile falls INTO the middle
  of the ground, slowly at first and faster the closer it gets, turning as it
  goes the way anything falling into a well turns; nearest goes first, which
  is also the order the bang gives it back. What arrives is not destroyed, it
  ACCUMULATES, so the point visibly thickens as the world disappears into it,
  and the run ends holding that dot still. The stillness is inside the
  collapse rather than a gap after it: a gap is an empty screen, and the
  argument of the pair is that what the bang throws out is what the collapse
  swallowed. Falling out of the frame is the Finder's gesture for "this is
  gone" (poof, the move every DESTRUCTION on this origin plays), and nothing
  here is destroyed: falling in says where it went. It
  changes nothing and hides no load, which is the whole permission for it (the
  register, section 9: when a thing like this exists it is rare, pixelated and
  game-like).
  THE ORDER IS THE WHOLE MOVE. Nothing is assembled at the start: every cell
  of every tile is thrown out of one point as dust in a FILLED disc, the cloud
  coasts, and
  structure happens AFTERWARDS, out of that dust, as the particles slow and
  cross to the cells they belong to, nearest the point first, so the world
  forms outward the way the eruption went. The dust is the material, not an
  effect running beside it. The cloud is a disc and not a shell: the speeds
  run all the way down to nothing, weighted so an even spread of particles covers an even
  spread of AREA rather than of radius, and each grain leaves on its own
  delay, so at any instant there is a continuum from the point outward instead
  of one front. An explosion is full of the thing that exploded; only the
  shock wave is a ring.
  NOT ONE TILE IS SHOWN UNTIL THE LAST GRAIN HAS LANDED. A box that finishes
  condensing keeps being painted as dust sitting in its own silhouette, and
  the whole world is swapped in underneath in a single frame at the end, when
  the two are already the same picture.
  THE POINT IS ON THE GROUND, NOT ON THE SCREEN: the centre of the world, a
  place you could pan to. Pan during the eruption and the whole event travels
  with the ground, which is what it would do if it were really happening there;
  pan far enough and you are simply looking somewhere else while it happens,
  and the dust arrives from that direction. The boxes and the origin are
  therefore read EVERY frame rather than captured once, and a particle
  remembers its home as a fraction of its box, so a camera moved or zoomed
  mid-bang re-aims every grain for free.
  IT IS THE WHOLE WORLD, NOT THE VISIBLE SLICE: the claim of this canvas is
  that the world continues in every direction, so every tile is hidden, on
  camera or not (off-camera ones cannot be burst, but they can be hidden, and
  hiding them is what makes the empty ground true in every direction), and the flight re-reads and
  re-aims its copies every frame so a camera moved mid-bang never leaves
  something standing still. The restore is one function called from one place
  rather than a callback per tile, so a throttled tab or a reduced-motion
  visitor still ends up with a world instead of empty ground. The /poof
  choreography is unguarded. The door `/admin` still answers anybody who
  types it in full, and the server's gate decides what is behind it; only
  the owner is ever shown /admin. "/" from anywhere focuses the field. Esc is
  the one way out and it walks a ladder, rung by rung: a query releases,
  a page closes to the canvas, an open menu folds, a wandered camera
  flies home. Home is the floor.
- curl gets clean text, /llms.txt maps the site, robots and humans and hackers
  and pgp all have their .txt. Nobody is excluded.
- A page is a column of BLOCKS, and that column is what the room reads
  (section 2): the sheet's headings, meta line, paragraphs, figures,
  lists, code and frames in document order, outermost only, are the
  anchors a reader's cursor is seated on. A wrapper (a section, a column)
  is never a block: it is as tall as the page and would put every reader
  on one box.

## 7. The intra-tile armature

- **Nothing has an eyebrow.** No card opens with a kicker line: the title
  is the first line, the tags say what it is about, the date is the page's. No
  kind label over an article, no label over the sky or the dish. Unguarded.

Four slots, one grammar, every tile:

- **label**: meta size, mute, top of the cell (or boxed, for full-bleed art).
- **title**: fs-1, bold.
- **body**: body size.
- **figure**: fills the remainder.

Tags are the one thing a card, a page and a list row all say the same way
(`primitives/kit/tags.js` writes them, `.k-tag` draws them). A card's stand at its floor
in ONE row: a tag that does not fit on the first line is cut off whole, never
the summary, and the page lists them all. A page's stand under its meta line
inside the same block, so the page has the same blocks with or without them
(the anchors a follower reads, section 6). A list row's stand under its line.
A tag the kind already says is not drawn (a case study's own word is its
label). An experiment is the thing it is and wears no row of words over it.
The keywords of the work sheet are tags too. `test/kit-tag.test.js`.

A list row is one builder (`listRow` in `lib/canvas-sheets.js`): the title
that links, the line under it, the tags, ruled with the kit's one-cell rule.
The feed and the work sheet are both made of it, and an entry that lives
elsewhere says so on its own row (a new tab, the host on its line).
`test/collections.test.js`.

Cell padding is sp-4 everywhere. Gaps between slots are sp-2 or sp-3 only.
Kind identity lives in the figure and the frame treatment (a fat masthead, a
hatched board, EQ bars, a double border), never in bespoke spacing or type
sizes. If a tile needs a size or a gap the armature does not have, the
armature is wrong or the tile is; fix the system, not the instance.

## 8. Screen-space chrome

- The bar lives at the BOTTOM on every device (thumbs reach it, the canvas
  keeps the sky). It clears the iOS home indicator by the safe-area inset.
  Chrome positions and heights read spacing tokens; controls in a row read
  one explicit control-height token, never emergent line-height arithmetic.
  `test/bible-sync.test.js` holds `CHROME` in `src/static/canvas/layout.js`
  to the tokens (`--cv-sp-6`, `--cv-module`, `--cv-sp-3`, `--cv-ctrl-h`).
- **The bar is the field.** Home is Esc, /home or a tap on the map. The one other
  control is a CLOSE that appears only while a sheet or a fan is up, in the
  right inset's column. The field is centred at one fixed measure
  (`CHROME.searchW`), so the close's column binds both sides: `BAR_MIN_W`
  is the field plus twice the inset, the control and the gap, and the watch
  density begins under it. The inset is `sp-6`. The air comes from the
  inset, not from a wider field. The skip link aims at the field.
  `test/chrome-fit.test.js`.
- The chrome is the kit (section 0): the field is `.k-field.k-boxed` (a
  box of one-cell lines, since a rule under the words alone blended into
  the world under the bar, and the block caret), the roster the kit's menu
  opening upward and standing flush on the box, the close and the two toggles `.k-btn.k-ico` (`.is-on` is the one
  down), the finder's line a strip of the kit's icon buttons and a
  screen-printed label, the skip link `.k-btn.k-solid`, the fan's head
  `.k-meta`. A collection is walked with the snap scrollbar everywhere: the
  piles, a card's siblings under the card, and the statement, whose pager
  is a `.k-scroll` on its side. The close and the toggles carry pixel
  glyphs, the kit's chevrons where the kit has them. A focused control
  takes the kit's ring; a hovered row inverts. `test/canvas-chrome-kit.test.js`. The pointer over
  the ground is YOUR OWN HAND: open on the ground because it can be grabbed,
  closed while you drag it, in the hue the room gave you, ink until the
  welcome names you. It is not the drawing the room sees of you: the room
  draws you pointing and clicking, and what your hand does while you haul
  the canvas around is yours. `test/cursor-ring.test.js`.
  The command roster is the bar's one popup and grows UPWARD, best hit
  nearest the field. The explore hint is not chrome; it is etched into the
  world (section 4).
- **The owner's bar is the same box with its line in brick.** Brick is the one accent chrome may wear
  (armed or live, section 1), and only the line's colour changes: the width,
  the style and the box are the kit's, so the field keeps its outer size to
  the pixel and nothing measured off it (`CHROME.searchW`, the bar, the
  map) learns who is typing. Under a forced palette the line takes the
  system's own accent. The page cannot see the session (its cookie is
  HttpOnly), so the door sets a readable owner hint beside it, with the
  same life and scope and no authority at all; only a page holding the hint
  asks `/api/whoami`, once, and only that answer draws the line and opens
  the owner's commands. A guest never makes the request, and a hint the
  server does not back is wiped. `test/canvas-chrome-kit.test.js`,
  `test/auth.test.js`, `test/commands.test.js`.
- **The minimap**: the world in miniature, an actual map. Every tile's own
  plan picture (the tile as it renders, one pixel per world cell) lies on
  the ground where the tile sits, shrunk to the map by averaging, read a
  little darker so line art survives, and each map dot set back in the inks
  read off the tokens by the kit's ordered dither; a warm dot is brick. The
  frame the camera holds is drawn over it in ink with a cell of ground
  outside it, at every neighbouring wrap and clipped, so a frame over a
  seam shows in its pieces. The frame is on its own cell (`MAPPX` in
  `src/static/canvas/app.js`, section 10); the world under it is a finer
  dot (`MAPWORLD`), because at the frame's cell the world's thin ink
  averaged away. A drag on it names a world point and
  rests the camera on the ladder on release. It shares the bar's FOOT LINE:
  the field and the map stand on one baseline, a module up from the
  screen's bottom edge (`CHROME.foot`, mirrored by `--cv-module`), the map
  left of its toggle's column (the close takes that column while a sheet or
  a fan is up). Four modules wide (`CHROME.mapW`), open by default on a
  desktop and on a phone (`mapOpenAt`; on a phone it is the finger's
  trackpad until the search icon is tapped), where it shares the
  field's middle slot: the field comes in from the left, the map from the
  right, on the stepped ease, one up at a time. It sits under the fan
  and the sheet. It never paints blank
  before boot (`test/minimap-pre-boot.test.js`); its position is held by
  `test/chrome-fit.test.js`.
- **Three discrete densities, never a fluid scale.** Discrete is the point:
  the measures stay deterministic and guardable at every size, which is what
  the "nothing shrinks" law was really protecting. `layout.js` owns the
  thresholds (`BAR_MIN_W`, `BAR_MIN_H`, `DESKTOP_MIN_W`, read by
  `chromeDensity`); the stylesheet mirrors them in one media query and
  `test/chrome-fit.test.js` fails the build when the two drift.
  - **watch**, under `BAR_MIN_W` wide or under `BAR_MIN_H` tall: **no
    chrome at all**. `BAR_MIN_W` is the width the bar needs; `BAR_MIN_H` is
    the height at which a full control plus its inset claims a quarter of
    the screen. Under either, the bar is not shrunk, it is absent, and
    `chromeBand` reserves nothing to match. Everything the bar offers is
    already on the ground: the mark is stamped over the statement, work and
    about ride under it, and the finder serves a keyboard that screen does
    not have. So the smallest screen gets the same world as the largest
    with nothing floating over it.
    This density also holds the world without a FIXED layer: `#stage` is
    relative and `#scene` absolute inside it, rather than both being
    `position:fixed`. The camera is untouched, because a transform is not
    fixed positioning. `position:fixed` is the one technique watchOS's
    adapted layout gets wrong, and removing a technique is cheaper than
    opting out of the browser's whole layout mode.
    With a page open the page IS the document, and every other fixed layer
    goes (the scene, the backdrop, the gap and the collection's fan: a
    study opened out of its collection at 320 read as the collection with
    the page's bar floating over it). The chrome's menus are put away here,
    but a page's own list (the page bar's box) is the page's and opens.
    `test/sheet-over-canvas.test.js`.
  - **phone**, from `BAR_MIN_W` up to `DESKTOP_MIN_W`, the opening frame's
    own width.
  - **desktop**, from `DESKTOP_MIN_W`: the width at which the viewport can
    hold the opening frame unscaled. Phone and desktop carry the same bar;
    the line is stated so a chrome change has to say which state it lands
    on.
- **A density is a device, and every stylesheet reads the same three.**
  Every `@media` width or height in every stylesheet is one of the edges
  `layout.js` owns: the watch under `BAR_MIN_W` wide or `BAR_MIN_H` tall,
  the desktop from `DESKTOP_MIN_W`, written as the whole number for a
  `min-` and a hair under it for a `max-`. Nothing reflows at a width of its
  own. What reflows INSIDE a page (a panel, a form, a figure) does it with
  `@container`, at a Fibonacci number of modules: five, eight, thirteen or
  twenty-one (the desktop's own edge). Nothing else.
  `test/breakpoints.test.js`.
- **Clearance is a camera property, not a world reservation.** The bar is
  screen-fixed while the world scales, so one world constant cannot be right
  at more than one zoom. The world reserves nothing, and the OPENING CAMERA
  fits the frame into the screen minus the bar's band (`chromeBand`), with
  the statement centered in what is left. Same tiles, same coordinates,
  every visitor. `test/chrome-fit.test.js`.
- The chrome's guarantee, at the opening camera and every viewport: the
  opening frame clears the bar, so the statement and the whole dock do
  too, and the finder lands its result above the bar. Beyond
  that frame the bar floats over the ground as chrome does, and a tile under
  it is one gesture from clear; but no word the bar's top edge would slice:
  the about zone's title, below the frame, lands wholly clear of the band or
  wholly under it, at the raw fit and at every display density's rest on
  the ladder, across the viewport matrix. Its container is pointer-events transparent
  and only the controls themselves take a press. At the watch density there
  is no bar, so the guarantee is trivial and the band is zero: the camera
  fits the opening frame to the whole screen and nothing can be under
  anything. `test/chrome-fit.test.js`.
- **The control-height token is a promise about the SCREEN, so world
  furniture keeps it in screen space.** Everything in the world is drawn in
  world px and the camera then scales it, so a control the tokens size is
  only that size at zoom one. Shrinking the world to suit a thumb would be
  the tail wagging the dog, so the hit area separates from the drawing
  instead. `setSceneTransform` publishes the inverse camera scale as
  `--cv-world-k` and every world control (`.options button`, `.t-icon`)
  pads out to `--cv-ctrl-h` measured on the screen. Zoom in and the pad
  collapses back to the painted edge, so nothing is ever bigger than it
  looks by more than the floor. Sideways growth caps at `--cv-hit-x`, the
  free ground beside the control, so neighbours in a row cannot steal each
  other's presses. A snap scrollbar's stepper pads
  AWAY from its track, anchored on its inner edge, so neither the track nor
  a stepper takes the other's press. The pad is drawn INSIDE the control
  and never re-seats it: an `.el` is already `position: absolute`, so a pad
  on a tile anchors to it with no help. Naming `.t-icon` in that declaration is what
  un-seated the icon ring (section 2). `test/touch-affordance.test.js`. An
  instrument's controls hold the floor at every density too: on a watch or
  a phone the panel pans sideways inside its page on the kit's snap
  scrollbar (`.k-scroll`), and nothing shrinks.
- **A gesture belongs to whoever uses it, and nobody else may claim it.**
  Panning is the world's, vertical scrolling is the sheet's (`#mscroll`
  declares `pan-y` and the page around it declares `none` because there is no
  document under the canvas to scroll). Content inside the sheet is a
  document and does not get to refuse a scroll: anything taking `none`,
  `pan-x` or `pinch-zoom` there states its reason in a `touch-ok` comment.
  Scripts state nothing: `touch-action` lives in CSS, where the whole
  contract can be read at once, and a library that stamps `touchAction` on
  its element is a claim nobody wrote. `test/touch-affordance.test.js`.
- **An interactive frame owns the finger inside it.** The stage of an
  experiment you play with drags (the instruments'
  carousel) has priority: inside it there is no sheet scroll, no page swipe
  and no close. The entry's own markup declares `.owns-touch` on the frame,
  `canvas-home.css` answers it once with `touch-action: none` and its
  `touch-ok` reason, and the sheet's swipe and pull-down (`app.js`) stand
  down for a finger that started inside one. The sheet's gestures live on the
  ground around the frame: the prose above and below, the gutters beside. A
  frame that takes the finger has to leave the rest within reach, so on a
  phone the frame and its controls fit the screen together, clear of the bar.
  `test/touch-affordance.test.js` holds the cause;
  `npm run verify:frames` measures the outcome with real touches.
- **Selection stops at the frame of anything that is not words.** The sheet
  grants `user-select: text` because it is a document worth copying from,
  and that grant is inherited. The grant is taken back for `canvas`, `svg`,
  `img` and `video`. Drawn surfaces also drop the touch callout, since
  there is no file behind them to save; photographs keep theirs, since
  there is. The page's chrome (the bar, the reader's settings, the foot)
  takes no part in a selection either, so a drag up a page paints the
  prose column and never the tab strip over it. `test/page-bar.test.js`.
- **One layer scale.** Every `z-index` reads a `--cv-z-*` token, low to
  high. `--cv-z-under`, `--cv-z-ground`, `--cv-z-over`, `--cv-z-raised` and
  `--cv-z-hands` order the parts of one box (a tile, the scene, a page, a
  bar); `--cv-z-fan`, `--cv-z-sheet`, `--cv-z-chrome`, `--cv-z-menu`,
  `--cv-z-skip`, `--cv-z-move` and `--cv-z-diag` are the screen's. So the
  map sits under the fan and the page, and the bar over both. A layer means
  something only beside the layers it shares a stacking context with, and
  two things on one layer stack by source order. No raw number, in a
  stylesheet or a script. `test/z-layers.test.js`.

## 9. Motion

Motion is a state machine, the way Sisyphus the slime
move. A thing holds a pose and snaps to the next on a frame: keyframes held
with nothing between them (`--cv-ease-hold`), a count of
frames (`--cv-ease-step`, four; `--cv-ease-frames`, eight), or a tick (the
slime). Nothing tweens, nothing fades and nothing overshoots. Opacity never
animates: appearing and leaving are a cut or a wipe stepped on the cell, and
an offset inside a keyframe is whole cells. Durations are tokens
(`press 120ms, quick 150ms, glide 250ms, slide 320ms, drift 600ms`) and the
frames are those three names; a raw frame count folds into the nearest of
them. Component CSS hardcodes neither. Everything collapses under
prefers-reduced-motion.

- **The one curve is the camera's.** Every aimed move (home, search, focus,
  the ladder settle, the map) FLIES on van Wijk and Nuij's optimal
  pan-zoom path (`flightPath` / `flightAt` in `layout.js`, rho `RHO`): the
  camera pulls out in proportion to the ground it must cover, crosses at
  altitude, dives back in, one geodesic in (pan, zoom) space. Short hops
  degenerate to a straight glide on the same math. Time is the path length
  at one slide token per rho-unit, floored at a glide and capped at two
  drifts (`FLIGHT_MS`, `FLIGHT_MIN`, `FLIGHT_MAX` in `app.js`): a flight
  is never a cut and never a tour. The crest clamps at cover, so a flight
  never shows two of the world; s advances linearly, because the arc itself
  is the easing. Reduced motion jumps. `test/canvas-flight.test.js`. A
  flight is space, not material, so it is the one thing that eases, and it
  eases in `layout.js` arithmetic, never through a stylesheet token. A
  card does not lift: hover rings it in one cell of its ink and lights its
  way-out button, a press rings it brick, the kit's outline button's own
  two states (`test/canvas-widgets-kit.test.js`). The roster rows INVERT
  on hover, the way `System 1` highlights. Presses and the settle land in
  four frames, the way a sprite does.
- **Nothing arrives at boot, and there is no ordered dither.** Material is
  on the ground when the ground is; a thing appearing later arrives by
  geometry, in frames. Nothing is a fade. Close is instant.
  `test/motion-tokens.test.js` fails if the dither or a boot reveal returns.
- **The selection mark.** What the finder lit wears the kit's selection
  mark (`.k-sel`): a one-cell ink outline one cell off the thing's box and
  a solid handle three cells square on each corner, the way a drawing
  program marks a selection. Ink, because a pick is chosen, and chosen is
  ink everywhere on the site. Set in the node's own box, so it goes
  wherever the node goes (the ground or the layer) and scales with the
  camera like every other line. It is on or off in one step, it is still,
  and it leaves when the query does or when Enter goes in.
  `test/canvas-chrome-kit.test.js`.
  One hard rule keeps the calm: an entrance NEVER plays on a camera-caused
  wrap-in (a tile crossing the frame edge while you pan is not arriving,
  you are moving; app.js gates this with a reveal window). Unguarded.
- **Long moves land in frames.** A page grows out of its card and shrinks
  back into it in steps (`--cv-ease-frames`), and the tally digits BURN: a
  digit is a static card until it changes, then the old card burns away
  from the bottom up, a row a frame, and the new card rises out of nowhere from below, a row a frame
  (`cv-burn`, `cv-rise`). Nothing rolls. A pile sits: a hand over a stack
  lifts its front card two cells off the pile, so the
  collection says "pick me up" before it opens, and the pile underneath
  never moves. `test/motion-tokens.test.js`.
- **Depth is resolution.** Whatever you are not reading is drawn one step
  coarser: the same pixels, bigger. Not a blur and not a dimmer on its own.
  The world behind a fan is drawn at 24 world px a cell, the world behind a
  sheet at 48 (a module a cell), and a fan a sheet opened over at 24; one
  ladder, applied twice. The filters (home template, svg defs;
  canvas-home.css applies them by `fan-open` and `sheet-open`) run in
  `#scene`'s own space, so the cells are world cells and grow and shrink
  with the camera like every other pixel on the ground. A step snaps rather
  than eases, because a resolution step is a step. The scrims stay, for the
  type that sits on top. The canvas never disappears while you read: at the
  coarse step you can still see the shape of where you were standing without
  being able to read it by accident. Unguarded.
- **Picked up before put down.** Nothing appears from nowhere and nothing
  vanishes: everything comes out of the place it was and goes back to it. A
  stack's members fly out of the pile to their seats and fold back into it;
  a page grows out of its card and shrinks back into the same card on close.
  EVERY page, full ones included: a case study and an experiment fill the
  frame and still come out of their card. One vocabulary for changing what
  is on the screen. The seat a thing leaves stays where it was until the thing
  returns. This is what makes the canvas read as a desk rather than a
  router: every transition has a from and a to that you watched happen.
  `test/motion-tokens.test.js`.
- **A tab switch is its own move.** A page of the ring comes in where the
  last one stood, top to bottom in four frames on the quick token
  (`cv-tab-in`, a clip that steps, never a fade), the page it replaces gone
  at once; the lit tab goes down in one step, because a radio push-button
  clicks. It is not a trip to the collection: the rects are for opening
  and closing. Reduced motion swaps it with no frames. `test/page-bar.test.js`,
  `test/motion-tokens.test.js`.
- **The pile TURNS.** Walking a stack to another of its cards is material
  moving, so it moves: the card that was showing is gone at once (close is
  instant) and the next one comes UP OUT OF THE PILE, rising the two cells a
  hand lifts the front card by, in frames. The scrollbar's thumb beside it
  moves in one step, because a pager is a control and controls click.
  `test/motion-tokens.test.js`.
- **A line longer than its box WALKS** (kit.css `.k-marquee`,
  `primitives/kit/kit-marquee.js`). A line that fits stands still. A longer one waits,
  walks left through its box a cell a step until its end shows (as many steps
  as it has cells over, so the walk is on the grid), waits there, and is back
  at its start in one frame, since close is instant. Every marquee rides the
  one cadence, `--cv-dur-marquee` (12s), and starts `--mq-i` tenths of it
  late, so a list is read one line at a time and nothing walks in lockstep.
  The line is measured, never guessed, once per text: when it is built, when
  its box first has a size (off camera a tile is display:none, which also
  stops the walk), and once the face has loaded. Under reduced motion nothing
  walks: the line ends in an ellipsis and the whole text is still its text.
- **The collection moves in FRAMES, and nothing in it fades.** A member
  flying out of its pile to its seat is a long move of material, so it
  lands in steps, the same ladder a page grows out of its card on; leaving
  it shrinks into the pile,
  which needs no help vanishing. Walking to the next card in a preview is
  the same move twice, geometry only. A fade is not a surface, so no
  surface guard catches one; `test/motion-tokens.test.js` names the fades
  that must not return.
- **One invert, written once.** The command roster, the list rows
  and the calls to action all highlight by trading the two inks, over the
  press token, stepped: the colour is the whole transition, and a curve on
  120ms of ink is a curve nobody can see. One base button rule plus one
  selector list carries it. Unguarded.
- **What the finder lights is framed.** The frame is still once it is
  hanging, and leaves with nothing when the query does.
- **A move needs a first frame.** `#modal` is `display:none` until it
  opens, so a transition started in the same style recalculation has no
  rendered frame to leave from. The scroller is put back at the foot with
  its transition off and laid out once before it is let go, and the body
  dithers only after the chrome is open. A transition that never runs looks
  exactly like a transition that is fast. Whether a surface slides at all
  is the stylesheet's call and JS asks it (a zero duration means this one
  does not), rather than keeping its own copy of the density thresholds.
  `test/motion-tokens.test.js`.
- **The guard.** `test/motion-tokens.test.js` fails the build on a
  hardcoded duration anywhere in the canvas stylesheets or the canvas
  scripts, on a timing in any stylesheet that is not one of the three frame
  names (a curve, `ease`, `linear`, the glide, the spring, a literal
  count; a count read off the thing itself, the marquee's cells over, is a
  frame count), and on a transition or a keyframe that moves opacity. The
  escape is `/* motion-ok: reason */`, and the reason has to say something.
  It also carries a REGISTRY of the moves this section promises, so a move that is deleted or
  quietly turned back into a fade fails a test that names the promise it
  broke. A dropped animation is an absence, so the gate asserts presence.
- **There is no ink flip, because there is no theme.** A change of ground is
  the ground changing, not a thing arriving. Nothing on the page asks the OS
  what colour to be. The favicon and the app icon still do, and that is the
  browser's tab strip, not ours (section 10, `test/one-ground.test.js`).

## 10. The pixel hand

- Two pixel families, one hand. The identity mark (logo, favicon set, loader)
  on its own grid (`MARK` in layout.js is that grid at one cell a pixel) and
  the 24-grid dock glyphs both render at a 2 CSS px pitch on chrome,
  shape-rendering crispEdges, integer scales only. `test/pixel-sync.test.js`
  pins the mark across its
  surfaces and crispEdges on every unit-square SVG.
- Every raster bakes its own ground in. A raster cannot adapt to the
  surface behind it the way `favicon.svg` does with its scheme swap, so a
  transparent one is a coin toss against a dark launcher and the ground-grey chip
  is legible on either.
- **A purpose is a framing, so it gets its own file.** The manifest
  declares one asset per purpose and never two purposes on one asset:
  `any` is painted whole and fills its frame, with the same framing at
  every size, because one mark at two sizes has to read the same;
  `maskable` is cropped to a shape the platform picks, so the art SQUARE
  fits inside the platform's safe circle while the ground bleeds to all four
  edges; `monochrome` is the one exception to the ground rule, a silhouette
  on transparency, because Android's themed icons read the alpha channel
  and repaint the ink in the user's color. A single file answering two
  briefs always loses one of them, silently. The scales for each framing
  live beside the emits in `scripts/icon/wire.mjs`; `test/icon-purposes.test.js`
  proves each purpose from the decoded pixels. iOS is not in this scheme:
  `apple-touch-icon.png` is composited onto an opaque tile of the system's
  making, and the dark and tinted modes are re-renders of that same asset
  with no web field to aim a second file at.
- **A picture becomes rows of cells.**
  `scripts/img/pixelate.mjs <png> --cells W --palette [accent] [--outline]`
  is the way a picture becomes rows: box down to the cell, nearest of ink,
  ground and one accent (read from canvas-tokens.css, chosen for you when
  not named), printed in the checked-in text form (`test/pixelate.test.js`).
  It is a first draft on purpose: the parts a drawing is recognised by are
  set by hand on top, because a majority vote cannot draw them.
- **The pointer is a HAND, and every pixel of it is drawn.** Four hands
  (`HANDS` in `primitives/presence/presence.js`), three layers each: the colour in the
  peer's hue, the black inside it, the border outside that. Nothing is
  derived: a dilation decides the outline for you, and the outline is where
  a pointer reads. The one-cell channels between the fingers are MEANT to
  fill with black, which is how every link cursor on every platform
  separates them.
  Two POPULATIONS, and the split is the design (section 2):
  **point** and **click** are drawn for a peer, and the click is the only one
  that travels. **open** and **grab** are the visitor's own, set as a CSS
  cursor, and neither travels: nobody needs to watch somebody else drag the
  ground, and a drag is a continuous gesture with an audience of one.
  The layer ORDER is border, black, colour: one outline can never be right
  on every ground the pointer crosses, because a tile wearing its host's
  livery carries that host's background. So every colour cell owes black
  against it and every black cell owes border against it.
  Each hand carries its OWN HOT SPOT and they differ on purpose. A hot spot
  is the point the cursor aims at, so it stays on the target while the
  drawing moves around it: a pointing hand bending into a click keeps the
  fingertip on the thing and recoils the body, which is what every system
  cursor does. The peer's element carries both of its hands and the
  stylesheet shows one; the clicking one is offset by the difference
  between the hot spots (`CLICK_NUDGE`), so one transform on the element
  serves both.
  The visitor's hand is a state of the POINTER, decided in one place: on the
  root, inherited by everything, and never restated per control. Scrolling
  a collection is the grab hand: over a snap scrollbar's track the root
  offers the grab (`html.grabbable`, the one state that reads what is under
  the pointer, for the I-beam's reason), and a held scrub is a haul
  (`primitives/kit/kit-scroll.js` writes both).
  The PITCH is one px a cell (`ARROW_CELL`), not the chrome's two, and it is
  the one place this drawing leaves the ladder. A pointer is measured against
  the other pointers on the machine, never against the tile beside it. A
  pointer is the one mark on a screen that must never be interesting; its
  whole job is to say WHERE. `test/cursor-ring.test.js` holds the layers,
  both halos, the contrast against every ground, the populations, the hot
  spots and the one place the hand is decided.
- **The minimap is shrunk, then set in cells.** The world's pictures are
  averaged down to the map's dot and each dot put back in the inks by the
  ordered dither, so the corner is never a soft thumbnail and never a
  colour outside the inks; it is drawn whole, dot for dot, and the camera
  frame is four filled bars rather than a stroke.
  `test/minimap-pre-boot.test.js`.
- **THERE IS ONE HAND.** Every mark the canvas serves is CELL DATA: the sky
  glyph, the cursor and the minimap
  are drawn on the cell like everything else. There is no second,
  stroke-drawn register for instruments.
  **The one rasteriser** is `pixelGlyph` in app.js. It takes a drawing at its
  own viewBox, a unit a cell, and paints it once (filled shapes, stroked
  shapes never under one unit, so a thin stroke survives as a whole cell
  instead of thinning to nothing, and an opaque fill ERASES, so an
  occlusion drawn as a solid stays an occlusion in one bit). The output
  is unit squares set by the same renderer the titles use, so every trick on
  this canvas (the dust, the dither, the invasion) runs on one buffer.
  Who goes through it: the dock marks. The stroke-drawn SOURCES stay
  in the tree as sources; none of them is served as drawn
  (`test/pixel-sync.test.js` keys on the unit-square idiom).
  The postcard is the one exception and it is not an exception to this rule:
  it is a print plan rendered off the canvas, and a map measures a place
  rather than re-drawing what stands on it (its own bullet, below).
- **Hero titles are the display face; every other
  string is the type face.** Two bitmap faces, data rather than webfonts
  (`FACES` in pixel-type.js): the DISPLAY face, a pixel blackletter on its cell
  (ascender, x-height on the caps' baseline, descender), caps in the gothic
  cut (two-pixel stems pulled in) and a LOWERCASE in the same hand (the pen enters every stem on a
  diagonal, the round letters come to a point where it turned), redrawn
  toward Alagard rather than importing it, because a buffer that sets a word
  can also dissolve it, dither it in, run Life on it or be invaded, which a
  woff2 could only be drawn in. Never import a font for it. The display face
  sets the hero titles and nothing else, as words, at one cell a pixel,
  standing on the ground; the zone titles still in it are waiting on their
  move. The LABEL hand, one-pixel
  strokes with two descender rows at half a cell, stays in the file for the
  mark's small register. No UI text is set in either bitmap face: icon
  names, counts, the etched line, the tally and the fan count are the type
  face at meta in mute. Each glyph carries its own width and advances by it plus
  one pixel, so a period is not a W. Everything a person READS stays
  the type face: paragraphs, titles and summaries inside a tile, the sheet, because
  pixel body copy would be a wall, and the rule that keeps the two hands
  apart is the card edge: the ground is the pixel world, a card is a window
  onto content. The hero statement is the type face at its one weight.
  Widths vary per glyph.
  `test/pixel-type.test.js` holds the faces.
- **Glyphs are cell data.** The dock marks came as vendor paths on their
  own lattices. They are rasterised once at boot onto that lattice (a canvas
  the size of the lattice, every shape the roster holds filled, the alpha
  read back) and set again as unit squares by the same renderer the titles
  use: pixel for pixel the same drawing, and the same buffer every trick
  runs on.
- **The dust.** A cursor crossing a glyph or a title disturbs the cells
  under its path: each lit cell within `DUST_REACH` of the pointer hops one
  cell in a direction the tick decides and settles back later, the drawing
  redrawn from the grid every tick (`DUST_MS`) and put back whole when the
  last cell has landed. It runs on the dock marks, the zone titles, the
  maker's mark and the doors' titles, and it is the only answer any of them
  gives a hand: no lift, no label. Nothing fades, nothing runs on its own:
  only the path the hand takes. The direction and the dwell are a hash of the
  cell and the ROOM's tick (presence.now()), so every tab disturbed by the
  same cursor at the same moment draws the same dust, and a peer's pointer
  (relayed with its hover key over the presence wire,
  `test/presence.test.js`) raises it here exactly as your own does there.
  It is one module, `primitives/dust.js`, that
  the canvas and the door pages both run: a host hands it its clock and says
  when it is off (reduced motion, `?bare`, `?nodust`), and nothing else is
  written twice (`test/dust.test.js`).
- **A door's title is a title.** The not-found page, the server-error page
  and the login each open on one real heading, set in the display face by the
  same `pixelTitle` the canvas's cards and pages use, at two cells a glyph
  pixel, and it is dust (`js/door.js`): a cursor or a finger crossing it
  disturbs it as it disturbs the statement on the home screen. The part that
  dresses a pixel title is one stylesheet (`ptitle.css`) that the canvas shell
  and the door shell both link, and the sheets of the canvas and of the doors
  keep only their own pitch (`test/door-title.test.js`).
- **The not-found page is thin ground.** A pointer, or a finger, crossing it
  carves the page away a cell at a time, and what is under the page is black
  (`canvas/abyss.js`, started by `js/door.js`). The cell is the pixel a door's
  title is set at, so a letter and the ground it stands on are one grain; the
  brush takes the cells under its path, its rim goes by the Bayer order the
  kit's dither is drawn in so a hole has the stippled edge of a screen of
  cells and not a circle's, and a finger takes a wider brush than a mouse. A
  cell that is carved stays carved for the visit and a reload puts the page
  back. One cell in four comes away as a crumb that hops off over the black in
  the page's own colour and is gone: nothing fades, and a visitor who asked
  for no motion gets the carve and no crumbs. The words stand on a plate that
  the carve is told to keep, to the cell, so the black stops at a lattice line
  and never meets a letter or a key (ink on ink is no key at all); the canvas
  is under the plate, takes the touch the plate does not, and under a forced
  palette it is left out and the page is whole (`test/abyss.test.js`).
- **The postcard is an instrument, so it is drawn in line.** The plan of
  the world (one renderer, a camera and a size in, a two-ink SVG out; the
  card, the shareable view and the print are three call sites of it) states
  every footprint as a stroked rectangle and every name in the type face, and the
  pixel hand stays out of it entirely, because a map measures a place and
  does not re-draw what stands on it. Its hand is two weights, the hairline
  and its double, held in CARD space (`CARD` in `src/lib/postcard.js`) so
  the drawing reads the same on a card and a printed sheet
  (`test/postcard.test.js`).
- The home button is a control: it inverts on hover and focus like
  everything else on the bar. The maker's mark lives on the canvas above the
  hero; the pinned identity surfaces are the canvas mark, the favicon and the
  OG brand mark.
- **The whimsy register.** When a micro-interaction, a motif or an easter egg
  exists, it is pixelated, game-like and fun: sprite bursts, stepped frames,
  a square recoiling, ink laid down in blocks. Arcade, not corporate-
  tasteful. The test it passes is that a non-player can tell something
  happened without knowing the rules. Celebrate with one piece, never the
  whole stage. This is a REGISTER, not a quota. It says what whimsy looks
  like here, never that more of it is owed. Add these moments rarely and only
  when earned; a surface that celebrates constantly is noise. Current
  members: the search commands, the dust, the aura, and Maurice.
  Unguarded.

### The toolkit

One aesthetic, driven by math, pixels and old system design. Each concern
has one module, and elegance comes from using it rather than beside it.

| Concern                 | The one module                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| type                    | `primitives/pixel-type.js`                                                                                               |
| sprites                 | `src/static/canvas/pixel-sprite.js`                                                                                      |
| photo to cells          | `scripts/img/pixelate.mjs`                                                                                               |
| dither and textmode     | the vendored textmode.js, presets in `primitives/textmode-settings.js`. The site's only dither                           |
| ordered dither on icons | `scripts/icon/dither.mjs`                                                                                                |
| projection              | `src/static/canvas/iso.js`                                                                                               |
| geometry                | `src/static/canvas/layout.js`                                                                                            |
| parts                   | `src/lib/kit-parts.js` (shading functions) baked by `scripts/img/bake-parts.mjs` through `PRESETS.parts` into `img/kit/` |
| controls                | `primitives/kit/kit.css`, every control working on both grounds at /admin/kit                                            |

- **A new visual names its row.** A gap is filled by extending that row's
  module, never by a parallel tool, and the PR says which row it extended.
- **The sheet is the inventory, and it is read off the code.** `/admin/kit`
  (owner only, unindexed) holds every piece the site is made of, on plates:
  the display, the type, how code looks, the kit's hardware, the surfaces
  the parts are made into, how things move, the gags and easter eggs we
  sneak in and the rules they keep, the assets' gate, what is missing and
  what is surplus, and the voice. What can be derived is derived (swatches
  from the tokens, moves from the stylesheets, commands from the bar's own
  table, tile shapes from `TILES`, code from the markdown pipeline the case
  studies use). What cannot (what a move is for, which gag lives where, which
  piece is still missing) is written once in `src/lib/sheet.js` and held to
  the code by `test/sheet.test.js`. A new piece goes on the sheet in the
  commit that adds it, and a piece the sheet calls missing is a decision, not
  a note to self.
- **Pixel type is connected.** Every glyph in every face is one
  8-connected stroke; a glyph that is several pieces by design (i, j, the
  colon) names its count. Guarded by `test/pixel-type.test.js`.
- **What is still off the cell.** `scripts/verify/off-cell.mjs` lists, from the
  tree, every surface not yet on the toolkit: inline and loose SVG, soft
  chrome (radius, shadow, gradient, fade), a font other than the type face outside
  code, images off the cell. Its output is the work list, not a gate.
- **The interface, measured.** A size is a number read off the painted page,
  because a stylesheet cannot say where a box lands or how big a word is drawn
  once the world has scaled it. `scripts/verify/interface.mjs` loads the public
  pages in a real browser, on a phone, a laptop and a desktop monitor (each at
  the density it really has, since the camera rests on a ladder of rungs that
  depends on it), and prints three things: every pressable's hit area (the
  invisible pads counted, the way a finger finds it) against the tap floor,
  with the reason for each one let be under it (a link in running text, a
  slider track whose steppers and keys do its work, world furniture at the
  ground's edge held by hit pads); the size every word is drawn at on the
  screen; and the length of a line of running text in characters. Its output
  is the work list, and `--strict` makes the first reading a gate.

## 11. Guards (the sinning registry)

`npm run check` fails when the system drifts. Each guard names its rule and
its test; a guard listed as pending is a documented gap, not a promise.

Every guard here is PURE except one, and the exception is deliberate. Purity
keeps the gate fast, but it leaves a seam: the plan can be right, the
stylesheet can parse, every row below can be green, and the browser can still
paint a node somewhere else (section 2). So one check drives a real browser
against the BUILT IMAGE in the deploy pipeline, before the VPS pulls, and it
is blocking. It is marked `deploy gate` rather than `armed` because
`npm run check` does not run it: nothing local is slower for it, and nothing
reaches production without it.

| Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Guard                                                           | Status                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------- |
| Token frontmatter is structurally valid and every component pair clears WCAG on the one ground                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `design.md lint BIBLE.md`                                       | armed                           |
| Every route ships title, description, canonical                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `test/page-furniture.test.js`                                   | armed                           |
| Every page has an OG card and no card is an orphan; every card is derived from its page (its title, tags and figure are the page's own, so a rename is a rerun), drawn from the site's own parts on whole cells, and every card pixel is a grey token                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `test/og.test.js`, `test/og-cards.test.js`                      | armed                           |
| Raw hex only in canvas-tokens.css (+ allowlist), scanned across css, njk, js and json; the literals a var() cannot reach (theme-color, manifest colors) equal their token                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `test/palette.test.js`                                          | armed                           |
| Every color token is scoped against the ground it is painted on: covered by WCAG 2 and passing its text or graphics minimum, or out of the standard's reach with the clause named, or frozen as debt. No color arrives unclassified, no exemption arrives unexplained, and native pairs get no allowlist. APCA is reported, never gated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `test/contrast.test.js`                                         | armed                           |
| Every kit PNG uses only the ramp greys, sits on the cell, is a Bayer glyph per cell and every part has every state; every pressable control answers hover, pressed, focus and disabled; motion is stepped; the face is the one token; nothing pressable is under the tap floor; /admin/kit is owner-only, unindexed, every part working on both grounds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `test/kit.test.js`                                              | armed                           |
| The sheet is read off the code: every keyframe is described and every description is a keyframe, every gag's files exist and every composition claim is true, every plate is on the page and in its index, every swatch is a live token, the display face appears only as the hero title and one marked specimen, and a terminal gets the same plates as text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `test/sheet.test.js`                                            | armed                           |
| The chip and the bank are the kit's: the chip's word stays put when it is raised, the desk and the sheet draw no status of their own, a bank's keys are whole cells on one pitch and overlap by exactly their rule, and the not-found page offers its ways out as a bank                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `test/kit-chip-bank.test.js`                                    | armed                           |
| The tag is one drawing and one builder: the code face, a cell of line-tone frame on the surface, eight cells tall, answering nothing; a card, a page head, a feed row, a work row and the keywords all draw it through the kit and the builder, the kind is not said twice, and an experiment wears none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `test/kit-tag.test.js`                                          | armed                           |
| A code block is one part: its gutter and its surface are written once in `code.css` and no other stylesheet restates them, it reads to the same thing on a case study, on the kit's plate and on a text file (asked of the cascade), the digit count is one variable both renderers set, and a number is drawn from data, sticks and cannot be copied                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `test/kit-code.test.js`                                         | armed                           |
| The rows of a collection are one row: the title that links, a line and the tags, drawn by one builder for the feed and the work sheet, a word escaped, an entry that lives elsewhere opening in a new tab, and no row drawn by hand                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `test/collections.test.js`                                      | armed                           |
| Every full page carries exactly one page bar of tabs, one lit, the close on it and the corner close at the bar's end and no other previous/next, on a direct load and on a click alike; a tab is the kit's card tab, the lit one on the page's ground; the bar sticks and is never selected; a tab keeps a readable width and a strip that does not fit scrolls, its lit tab in view; the sheet, a programmatic focus target, paints no ring; the ring never mixes kinds; the arrows walk the tabs; a tab switches its page in place in frames and never by the round trip; the snap scrollbar is a named slider; the piles turn on it, inset, and a remote turn moves the thumb; the v opens every page of the ring whole, title and summary, the lit row this page, and a row switches in place; on a phone (and on the watch) the bar is the lit tab, which is the dropdown, the v and one X | `test/page-bar.test.js`                                         | armed                           |
| A field's caret stands at the insertion point, a block after the words and a one-cell bar between two letters, hidden over a range; the platform's caret shows in ink until the script has measured; the whole height of a field takes a tap; both bundles that carry a field wire it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `test/kit-caret.test.js`                                        | armed                           |
| Every surface has a way out that is not the back button: the desk's head carries the site's glyph home on a phone and the rail's mark does on a desktop, and a phone's tab bar scrolls from its first tab rather than centring its overflow off both edges, and the door's name links home                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `test/desk.test.js`                                             | armed                           |
| The control grammar: a binary you set is a flip switch and never a check box, a lamp is read and never pressed (the MIDI lamp's question is a push button beside it); following frames the whole screen in the followed one's hue, taking no pointer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `test/kit.test.js`, `test/presence.test.js`                     | armed                           |
| Every accent token has a consumer that needs it; `scripts/tokens/accents.mjs` computes the inventory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `test/accents.test.js`                                          | armed                           |
| No shadow of any kind (box-shadow, drop-shadow, in CSS, scripts, templates or entries) and no escape for one; the one text-shadow is `var(--cv-smear)`, pinned to one dot and no blur; radii only through the radius tokens or the circle allowlist; borders and outlines only in the widths the guard allows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `test/ink-chrome.test.js`                                       | armed                           |
| No cast: no cast tokens exist, the parts ramp greys exist, and no runtime writes a token that `:root` already substituted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `test/elevation.test.js`                                        | armed                           |
| Every px in every stylesheet is 0, a token value, or carries a px-ok reason: no one- or three-pixel line rides through as a hairline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `test/px-tokens.test.js`                                        | armed                           |
| Every `@media` width or height in every stylesheet is a density edge `layout.js` owns (a `min-` on it, a `max-` a hair under it), and every `@container` size is a Fibonacci number of modules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `test/breakpoints.test.js`                                      | armed                           |
| One focus ring: every focus rule draws the ink ring a cell thick, a cell out or a cell in, and under a forced palette the same ring in `Highlight` or `CanvasText`; no other width, offset or colour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `test/focus-ring.test.js`                                       | armed                           |
| Arm, then act: a destructive button acts on its second press, disarms on its own after four seconds, and every page arms it through `primitives/kit/kit-arm.js`, never a copy of its own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `test/kit-arm.test.js`                                          | armed                           |
| One Bayer: no threshold matrix and no Bayer generator in `src/` or `scripts/` outside `primitives/textmode-settings.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `test/one-bayer.test.js`                                        | armed                           |
| Every tile in `TILES` is one of the six shapes, and a tile across slots is as wide as its slots and two, three, five or eight modules tall; so is every card a stack holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `test/tile-vocabulary.test.js`                                  | armed                           |
| Motion is a state machine: every stylesheet times a transition or an animation with a frame token (hold, step, frames), never a curve, `ease`, `linear`, the glide or the spring; nothing moves opacity; a `motion-ok` escape says why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `test/motion-tokens.test.js`                                    | armed                           |
| Every `z-index` in a stylesheet reads a `--cv-z-*` layer, and no script writes a raw one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `test/z-layers.test.js`                                         | armed                           |
| canvas-tokens.css, layout.js GEOM, and this frontmatter agree, and every token is complete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `test/bible-sync.test.js`                                       | armed                           |
| The token resolver itself: brace-aware walk, light-dark(), var() chains, calc() with round() and pow(), @property never outranking :root                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `test/lib/css-tokens.test.js`                                   | armed                           |
| Layout invariants: viewport-blind determinism, module snap (the docked icons on the cell), air floor, stamp-strip reservation, zero chrome reservation, seam exactness, resolver silence, the dock (under the hero, as wide, every icon inside in the hand's order), compass quarter-turn, ink balance on both axes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `test/canvas-layout.test.js`                                    | armed                           |
| Canvas SSR, routes, retro/terminal variants, headers, sitemap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | existing suite                                                  | armed                           |
| The pixel hand: the identity mark is one drawing across canvas stamp, favicon and OG; the home button matches its wired variant; every inline unit-square pixel SVG carries crispEdges; dither frames climb                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `test/pixel-sync.test.js`                                       | armed                           |
| ONE GROUND: nothing shipped declares a dark context (no media query, class or attribute) outside the page shell's two files, every token resolves to exactly one value, and none of the flip's machinery is left (the bulb, the `html.theming` crossfade, `data-theme-mode`, the dither sheet, `theme.js`, the bulb rasteriser). Two stated exemptions: every fill the icons emit must answer the OS, and a page that is read may invert its ground, answering its reader and then the OS, with every rule under it starting at `#modal.reading` and the choice written on the shell alone                                                                                                                                                                                                                                                                                                      | `test/one-ground.test.js`                                       | armed                           |
| A page that is read carries the reader's settings under its meta line on a direct load and on a click alike, wired; the voice reads prose and never code or footnotes, lights its sentence without rewriting the page, stops with the page, the switch or the browser tab, and is offered only where the browser can speak; the choices survive storage that throws; Plain Type is the reader's own sans; a code block takes the keyboard; what a full page covers leaves the keyboard's way                                                                                                                                                                                                                                                                                                                                                                                                    | `test/page-reader.test.js`                                      | armed                           |
| A jump to a place in the page that is up (a footnote, a line number, a heading) is the browser's: the router paints on a step of the history only when the address names another page, and a step to another page still paints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `test/anchor-jump.test.js`                                      | armed                           |
| A root-mounted page is never filed under a word for its kind: no published response, in a browser, curl or an old browser, nor llms.txt, the feeds or the page JSON, says it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `test/served-labels.test.js`                                    | armed                           |
| The presence pointer has an edge on the canvas: three drawn layers, colour never meets the ground and black never meets it either, one of the two outlines clears the graphics minimum against EVERY ground the pointer crosses (the ground, a tile surface and each guest's own), the two outlines take opposite inks, the two populations of hand stay separate, each hand keeps its own hot spot, and the visitor's hand is decided in one place                                                                                                                                                                                                                                                                                                                                                                                                                                             | `test/cursor-ring.test.js`                                      | armed                           |
| Pixel type: every glyph is a rectangle of ink inside its face's cell, the display A is the maker's mark pixel for pixel, the display hand keeps two-pixel stems, every string set on the ground has its glyphs, the renderer emits crispEdges unit squares at the face's world size                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `test/pixel-type.test.js`                                       | armed                           |
| Stacks: every member names a stack, ids are unique across world and members, every pile fits its declared footprint on the cell lattice with its card its member's shape on a module of whole cells no larger than M, every pile sits the same way with its front over its base, the fan fits every viewport in the matrix at a readable scale with no overlap, a phone's lane holds every card between the margins and opens on a centred one, each fan route answers, and the server serves each fan as a page and as a list                                                                                                                                                                                                                                                                                                                                                                  | `test/stacks.test.js`                                           | armed                           |
| The marquee: a longer line walks a cell a step on the one cadence (`--cv-dur-marquee`), the lines of a list start a tenth apart, and under reduced motion nothing walks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `test/music-windows.test.js`                                    | armed                           |
| The finder in the address: `?search=` reads and writes the bar's three states, encodes any query, keeps every other param byte for byte, replaces the entry and never pushes, and a `?search=` URL is the canvas with the bare canonical; the room in the address (`?follow=`, `?session=`) is read to one kind and a lowercased code of the rooms grammar, written back without its PIN, and every other param rides untouched                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `test/finder-url.test.js`                                       | armed                           |
| The bar is a command line: words, quotes and the three flag shapes, a flag's value only where the command takes one, errors said and never guessed; /login never listed and always runs; the owner's commands neither listed nor run for a guest; the desk copy is the server's registry; /share never carries the pin; the owner hint is readable, lives and dies with the session and opens nothing; the owner's field is the guest's box in brick (`test/canvas-chrome-kit.test.js`)                                                                                                                                                                                                                                                                                                                                                                                                         | `test/commands.test.js`, `test/auth.test.js`                    | armed                           |
| Ctrl or Cmd with K opens the bar from anywhere, a field included, and leaves the browser its own chord where there is no bar to take it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `test/keys.test.js`                                             | armed                           |
| The keys the page answers are one table and one command: /keys lists them and ? opens it, never while a field has the keyboard, and the table and the page's global key handler say the same keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `test/keys.test.js`                                             | armed                           |
| The dust is one module run by the canvas and the doors: a cell under the cursor hops one cell the host's clock decides, is home after its dwell and rests before it can be lifted again, only inside the reach; the scatter moves every cell; a title is one wire a word; the canvas keeps no copy and the door runs the module                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `test/dust.test.js`                                             | armed                           |
| A door's title is a real heading: the not-found page, the server-error page and the login each serve one h1 in the display face with its word for readers, link the part and the script, set it at two cells a glyph pixel and give it the touch; the part is one stylesheet the canvas does not restate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `test/door-title.test.js`                                       | armed                           |
| The carve takes the core of the brush whole and its rim by the Bayer order, never past the radius and never into the page that is kept; a stroke leaves a trail with no gap; a box said after the carve makes what was carved page again and a new set replaces the last; a page that changes size keeps its carve; crumbs come off one cell in four, hop away from the brush for their dwell whatever the hash and never stand still; a cell tiles with its neighbours at any ratio                                                                                                                                                                                                                                                                                                                                                                                                            | `test/abyss.test.js`                                            | armed                           |
| The mount sizes its canvas to the page in device pixels, reads the pointer from the canvas's corner, carves under it in the ink with a wider brush for a finger, lifts the pen when a hand leaves or lets go, draws a crumb in the page's colour over the black only and puts every one back, stops its clock when the air is empty, throws none for a visitor who asked for no motion, holds a cap, and keeps the boxes it is told to, rounded outward                                                                                                                                                                                                                                                                                                                                                                                                                                         | `test/abyss.test.js`                                            | armed                           |
| The not-found page is a canvas, aria-hidden, behind a plate that holds its title, line and keys, and the server-error page and the login have neither; the door starts the carve only with both and no forced palette, hears the pointer on the root element, reads its pixel and its two inks off the page and keeps the plate; the canvas fills the page and takes the touch, the plate is positioned above it, and the door's padding is less the plate's; the carve's cell and a door title's pixel are one                                                                                                                                                                                                                                                                                                                                                                                 | `test/abyss.test.js`                                            | armed                           |
| A press of a zoom key is a rung of the pixel ladder (never a fraction the settle takes back) and a key held with Ctrl, Cmd or Alt is the browser's, read before any bare key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `test/zoom-keys.test.js`                                        | armed                           |
| Zones and contact: every zone names a bearing the compass has, /about and /work land on their zone and ship it in the prelude, /contact and its endpoint answer not found, the envelope is seated in the ring on the self bearing and the home document still says the address                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `test/zones.test.js`, `test/contact.test.js`                    | armed                           |
| One asset per icon purpose, proved from the decoded pixels: every manifest icon is on disk at its declared size, carries exactly one purpose, and satisfies it (`any` opaque and filling, `maskable` opaque with all ink inside the safe circle, `monochrome` transparent); the apple-touch icon stays opaque                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `test/icon-purposes.test.js`                                    | armed                           |
| No em-dashes on any surface (templates, content, BIBLE, readme)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `test/em-dash.test.js`                                          | armed                           |
| The third axis: project and unproject are exact inverses on the cell, a box has three faces on whole cells, isoBox is pure SVG                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `test/iso.test.js`                                              | armed                           |
| Every route's og:image resolves to a file on disk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `test/og.test.js` (pointer check)                               | armed                           |
| One typeface: no stylesheet names a family outright without a `font-ok` reason, and the canvas measures the hero from the token rather than a re-typed stack                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `test/font-rule.test.js`                                        | armed                           |
| Camera flights ride the van Wijk and Nuij geodesic: forward arc, exact landing, monotone ground track, one crest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `test/canvas-flight.test.js`                                    | armed                           |
| Nothing meaningful is drawn in a colour a forced palette takes: a `:focus-visible` keeps an outline, a boundary is a border and not a cast, a seam is not a gradient, and every `forced-color-adjust` states its reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `test/forced-colors.test.js`                                    | armed                           |
| One refresh, one message, one payload: a data push serialises once, reaches spectators, names only the keys that moved, and stays silent otherwise; cursors and the participant cap survive it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `test/presence.test.js`                                         | armed                           |
| The inbound wire carries a position and a hover key and has no field for anything else, a malformed key never takes the cursor down with it, and the roster hands a joiner the highlights already lit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `test/presence.test.js`                                         | armed                           |
| A room is the owner's to open and anybody's to join: a stranger's `new` or unknown code is refused, a PIN is four digits with twenty tries an hour, a live room keeps its own kind, and an act goes to all in a session, from the host only in a follow room, and in the public room only to the sender's followers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `test/sessions.test.js`                                         | armed                           |
| Following is a line with one head: a pick attaches to the head, a hand walked past FOLLOW_SLACK or the follower's own steering lets go of a click-follow, a key does not, and a held follow in a follow room lets go only when the room is left; a tab acts only when a session or a follower would hear it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `test/session-client.test.js`                                   | armed                           |
| A view is an act on a channel of its own, so a follow hears the one followed and a session hears everyone: read strictly and only for the page open here; a video's play, pause, seek and rate go out stamped with the page, a scrub at most four a second, and a peer's are applied past half a second of drift and never said back; a play the browser refuses plays along muted and says so beside the video; the instrument up, a photo set's photograph and Listen's sentence go out and come back the same way, a peer's photograph jumped to and a peer's reading never scrolling the page, a refused voice saying so on Listen; a fan the one followed spread is held until the follower's own hand; a page opened again while the last close travelled home keeps its chrome                                                                                                           | `test/view-sync.test.js`                                        | armed                           |
| The slime mould's dish (`DISH`) is the circle that circumscribes the square tile on the cell, its rim is cell data, it sits in the ring's northwest corner, its top and left edges the tile's, with its name centred under it, replays byte for byte from a seed, keeps every agent inside the circle, finds and eats what it is fed, puts two bits a cell on the wire and decodes to what it encoded, and the service steps unwatched, sends only to tabs that said they can see the dish (a keyframe once, deltas after, one keyframe on return, nothing to the rest) and lands a feed on the next step; a spectator's tap paints nothing and the dish says so; an absent tab's dish is asleep from the no it sends to the keyframe it decodes, grey and dimmed, and steps back to colour                                                                                                     | `test/slime.test.js`                                            | armed                           |
| Every tile carries a label in `TILES`, every label is Title Case (small words inside a name aside), and every widget sets its name under it in the type face, the sky included                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `test/canvas-layout.test.js`, `test/canvas-widgets-kit.test.js` | armed                           |
| A pile carries its count on the line under its name, the same face and size in the mute, in its own noun and in the singular for one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `test/stacks.test.js`                                           | armed                           |
| Scrolling a collection is the grab hand: the root offers it over a snap scrollbar's track, before the press, and a held scrub is a haul                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `test/cursor-ring.test.js`                                      | armed                           |
| A relayed hover paints exactly what a local one paints, in the same rule and under forced colours; the set of things a peer may light is closed, named, and holds no control that mutates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `test/shared-hover.test.js`                                     | armed                           |
| What the room holds is not a tab's: `hero-cycle.js` exports the phrases and nothing else                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `test/room-state.test.js`                                       | armed                           |
| The page says where the room stands: the boot payload carries the head count beside Maurice and the piles' fronts, the first frame is painted from them (statement, Maurice, tally), and the tally is never told a zero nobody took, through the first load, a dropped socket and a change of room                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `test/first-paint.test.js`                                      | armed                           |
| Every picture we own is on the cell and the ramp: the photographs at the width they are shown, every raster under img/ whole cells (the OG cards and the plan excepted), a photograph two neighbouring ramp lightnesses to a cell in its own colour, each a Bayer glyph                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `test/pictures.test.js`                                         | armed                           |
| The wire's shared words are stated once (`primitives/presence/wire.js`): the tab and the room gate moves on one `RATE_MS`, the stale push and the tab's repaint ask one `changedKeys`, and the tab listens for each push by the `SERVER_PUSH` word the server sends                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `test/wire.test.js`                                             | armed                           |
| The chrome fits every screen across the viewport matrix: three densities and nothing between them, every control inside the viewport with its gap kept, the bar under a quarter of the viewport height, the opening frame clearing the bar, the about zone's title wholly clear of the bar's band or wholly under it at the opening camera (raw, and rested at each display density) and seated by the drawn title's own measure, and the stylesheet's thresholds mirroring layout.js                                                                                                                                                                                                                                                                                                                                                                                                           | `test/chrome-fit.test.js`                                       | armed                           |
| The postcard plan is the world and stays deterministic: every footprint sits where the world puts it, one camera and size hash to one drawing, the camera floors at cover, the wrap is completed, and no colour is stated in the module                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `test/postcard.test.js`                                         | armed                           |
| No shipped image carries metadata: every raster and vector asset is decoded and every chunk that is not pixels is reported, EXIF and GPS and camera identity included, and a format with no reader counts as unproven                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `test/image-metadata.test.js`                                   | armed                           |
| An item's kind decides its address in one place, and the four kinds route where section 5 says they do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `test/lib/entry-kind.test.js`, `test/photo-sets.test.js`        | armed                           |
| No script claims a gesture behind the stylesheet's back, every scroll-blocking `touch-action` states a `touch-ok` reason, the sheet's selection grant is taken back for everything that is not words, and the world's tap floor stays wired to the camera scale at both ends                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `test/touch-affordance.test.js`                                 | armed                           |
| `.el` is the only rule that seats a world node: no other selector re-declares `position` on a node's own box, so a node's world coordinates cannot depend on the camera                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `test/world-seat.test.js`                                       | armed                           |
| A sheet's title and meta are escaped wherever they become markup and left raw wherever they stay text: no `innerHTML` literal interpolates either field bare under either name the sheet goes by (a routed page, a section door), the shell prints both without `\| safe`, and `document.title` still takes the raw one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `test/sheet-escaping.test.js`                                   | armed                           |
| Every /img URL the site emits (every route's HTML, the BOOT payload, the entry bodies the canvas mounts) carries `?v=` and the hash of its file's bytes, the canvas builds none outside BOOT's map, and only an image asked for at its current hash is served `immutable`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `test/img-version.test.js`                                      | armed                           |
| The paint agrees with the plan: in a real browser, against the built image, every node the world places is painted where `window.__layout()` says it is, across the viewports and cameras it names, and the run fails if it went quiet instead of clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `scripts/verify/world-fixed.mjs`                                | deploy gate (blocking in smoke) |
| The interface is measured, not assumed: in a real browser on a phone, a laptop and a desktop monitor, every pressable's hit area against the tap floor with the reason for each exception, the size words are drawn at, and the length of running lines (an audit; `--strict` gates the first)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `scripts/verify/interface.mjs`                                  | by hand                         |

## 12. Retirements

Retired parts are removed from the tree, not kept dormant. The git history
holds them.

## 13. Deliberate oddities

A canvas site is meant to be poked at, and anything found by poking that is
not written down reads as a defect to whoever finds it next. Everything here
is intentional. Anything NOT here that breaks a rule above is a bug.

- **`--cv-ink-fixed` and `--cv-ground-fixed` are print anchors, not a
  screen pair.** entry.css reads them only inside `@media print`, forcing
  ink on white, because the screen ground is a grey that would otherwise
  print as a grey box.
- **The error pages set the route in Hasklig.** `/404` and `/500` put the path
  and the request id in a real `<code>`: they are machine literals you might
  retype or quote back, which is exactly what the code face is for.
- **The retro branch has no typeface at all.** The retro variant ships no
  stylesheet and wraps the page in `<pre>`, so a relic browser renders
  everything in its own monospace. That is the point of the branch, not a
  font decision.
- **`--cv-reading` carries more characters than its count.** `ch` is the
  width of "0", and a dot-matrix zero is half an em. The measure is tuned on
  the token and nowhere else.
- **The dither frames still exist on disk.** `img/dither-0..5.svg` and
  their mint script stay: the whimsy register steps through frames, and a
  future earned moment may want them. Nothing outside that register may
  reach for them; an appearance that dithers instead of settling is a
  bug. `test/pixel-sync.test.js` holds the frames.
- **Forced colors is a two-engine fix, and the site says so.** When the OS
  takes the palette (Windows High Contrast and its kin) the browser repaints
  every colour the page states, drops `box-shadow` and `text-shadow` to
  `none`, and drops any `background-image` that holds no `url()`. This skin
  survives most of that by construction, because structure rides on borders,
  but anything DRAWN with a fill does not: a bar, a caret block, a gradient
  sky, a hatched square, an inset ring, an ink invert used as a state. Each
  of those is restored in system colours inside
  `@media (forced-colors: active)`, and the shapes that vanish are guarded
  structurally by `test/forced-colors.test.js`, because a screenshot taken
  on a Mac cannot see any of it happen. Four behaviours reverse an obvious
  guess. A colour that already IS a system colour passes through the forcing
  untouched, which is what lets a fallback be written at all. Chromium
  stamps every inline `<svg>` subtree with a UA
  `forced-color-adjust: preserve-parent-color`, so SVG `fill` and `stroke`
  keep whatever they were given and only `currentColor` follows the forced
  ink: the instrument art needs its neutrals re-pinned, and a focus state
  built from a stroke swap is not a focus state. Chromium paints its
  `Canvas` text backplate OVER an author background, so a `Highlight` plus
  `HighlightText` plate lands black on black; every selected state here is
  a ring in `Highlight` with the text left on `CanvasText`. And the UA picks
  its system colours from the tag, never from an ARIA role, so a real
  `<button>` gets `ButtonText` where the canvas tiles (`div[role=button]`,
  stamped by `keyable`) get `CanvasText`; on a theme where those differ,
  the bar and the tiles will not match, and that is the cost of tiles being
  divs. **Safari is a stub.** WebKit ships the `forced-colors` media query
  as a hardcoded `none` and supports no `forced-color-adjust`, so none of
  this runs there and Safari never enters the mode to need it. The site is
  covered on Chromium and Gecko.
- **The postcard is a plan, not a screenshot.** A camera and a size go into
  one renderer and a two-ink SVG comes out, and what it draws is the
  world's FOOTPRINTS: every tile's rectangle at its true position and size,
  the hero wearing the site's name, and each name printed wherever the name
  fits its box whole. No weather, no quoted host livery, nothing a tile
  holds. A tile's interior is a
  browser rendering live data at request time, so picturing it would take a
  second rendering engine, and a second engine starts disagreeing with the
  first the day it ships; a plan cannot disagree, because it reads the same
  solver the canvas runs. Two things follow that look like faults and are
  not. Labels thin out as the camera pulls back and stop entirely under the
  type ladder's floor, which is a map behaving like a map. And a footprint
  two modules or under says its name UNDERNEATH itself, the way a map labels
  a place too small to write inside. `test/postcard.test.js`.

Where this document and the code disagree and the disagreement is a decision
rather than a typo, it is recorded here rather than quietly fixed. Nothing is
on that list today. A register of known disagreements is the one place in
this document that rot compounds, because the next reader trusts it to be
the complete set. Close entries here in the same commit that closes them in
the code.
