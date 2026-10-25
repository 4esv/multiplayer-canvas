// multiplayer-canvas/pixel-type: bitmap type as data: two faces (display, label) set as crisp SVG
//   paths or as grids of cells.
// Inputs: a string and a face name; a whole-number scale.
// Outputs: pixelText -> { svg, cols, rows, w, h }; layoutText, wrapText, gridOf (rows of
//   booleans), pathFromGrid, lifeStep. No DOM; works in node and the browser.
//
// pixel-type.js: the site's type on the ground, as pixels.
//
// Two bitmap faces and one renderer. Glyphs are data (rows of '.' and '#'),
// not a webfont, on purpose: type that is a pixel buffer can be set, and it
// can also be dissolved, dithered in, run as Life or invaded, on the same
// grid the canvas is built from, so every later trick reads the letters it
// plays with. A woff2 could only be drawn.
//
// The faces (BIBLE.md section 10):
//   display  up to 8 x 9, a gothic cut (2026-09-11). Caps, digits, e and o
//            redrawn 2026-10-22; glyphs vary in width (an I is four).
//            Its A IS the maker's mark: the logo is a glyph of this face
//            and the face is the logo's alphabet (test/pixel-type.test.js
//            pins the two identical), which is why the A alone kept its
//            old drawing. Uppercase and digits only; it sets the doors and
//            the titles of things on the ground. One glyph pixel = one cell
//            (--cv-px). Since 2026-09-11 the face has a LOWERCASE in the same
//            hand, on a 12-row cell: 3 ascender rows, 6 of x-height on the
//            caps' baseline, 3 of descender. Titles are words now (About,
//            Work, Contact, Case studies), and a cap-only glyph keeps its 9
//            rows: the renderer top-aligns, so every glyph shares the baseline.
//   label    5 x 7 with two descender rows, one-pixel strokes: the small
//            hand for names, counts and the etched line. One glyph pixel =
//            half a cell, the hairline lattice the 24-grid icons already
//            draw on, so a label reads at the size today's meta type does.
//
// Both are monospaced per glyph, not per face: a glyph carries its own
// width and the advance is that width plus a one-pixel gap, so a period
// does not take the room of a W.
//
// PURE. No DOM, no measurement. pixelText() returns an SVG string in the
// unit-square idiom (one `h1v1h-1z`-shaped run per row segment, crispEdges,
// fill currentColor, so it rides the ink token like every other glyph)
// plus its size in world px; the caller sizes nothing.

const rows = (s) =>
  s
    .trim()
    .split('\n')
    .map((r) => r.trim())

// ---- display: up to 8 x 9 ---------------------------------------------------------
const DISPLAY_GLYPHS = {
  // the mark. Rows 1..9, cols 1..8 of MARK_A's 11-grid, unchanged: the one
  // glyph the gothic cut did not touch, because its pixels are the favicon,
  // the icon set and the loaders, and because it was already calligraphic.
  A: rows(`
    ....##..
    ...###..
    ..#..##.
    .##...#.
    .##...##
    .####.##
    .##...##
    .##...##
    ###..###`),
  B: rows(`
    #####..
    ##..##.
    ##..##.
    #####..
    ##..###
    ##...##
    ##...##
    ##..###
    ######.`),
  C: rows(`
    .#####.
    ##...##
    ##.....
    ##.....
    ##.....
    ##.....
    ##.....
    ##...##
    .#####.`),
  D: rows(`
    .####..
    ##..##.
    ##...##
    ##...##
    ##...##
    ##...##
    ##...##
    ##..##.
    #####..`),
  E: rows(`
    #######
    ##.....
    ##.....
    ##.....
    #####..
    ##.....
    ##.....
    ##.....
    #######`),
  F: rows(`
    .######
    ##...##
    ##.....
    ##.....
    #####..
    ##.....
    ##.....
    ##.....
    ##.....`),
  G: rows(`
    ..####..
    .##..##.
    ##......
    ##......
    ##..####
    ##....##
    ##....##
    .##..##.
    ..####..`),
  H: rows(`
    ##...##
    ##...##
    ##...##
    ##...##
    #######
    ##...##
    ##...##
    ##...##
    ##...##`),
  I: rows(`
    ####
    .##.
    .##.
    .##.
    .##.
    .##.
    .##.
    .##.
    ####`),
  J: rows(`
    ..#####
    ....##.
    ....##.
    ....##.
    ....##.
    ....##.
    ##..##.
    ##..##.
    .####..`),
  K: rows(`
    ##...##
    ##..##.
    ##.##..
    ####...
    ###....
    ####...
    ##.##..
    ##..##.
    ##...##`),
  L: rows(`
    ####....
    .##.....
    .##.....
    .##.....
    .##.....
    .##.....
    .##.....
    .##...#.
    #######.`),
  M: rows(`
    ##...##
    ###.###
    ##.#.##
    ##.#.##
    ##...##
    ##...##
    ##...##
    ##...##
    ##...##`),
  N: rows(`
    ##.###.
    ###..##
    ##...##
    ##...##
    ##...##
    ##...##
    ##...##
    ##...##
    ##...##`),
  O: rows(`
    ..####..
    .##..##.
    ##....##
    ##....##
    ##....##
    ##....##
    ##....##
    .##..##.
    ..####..`),
  P: rows(`
    #####..
    ##..##.
    ##...##
    ##...##
    #####..
    ##.....
    ##.....
    ##.....
    ##.....`),
  Q: rows(`
    ..####..
    .##..##.
    ##....##
    ##....##
    ##....##
    ##....##
    ##....##
    .##.###.
    ..###.##`),
  R: rows(`
    #####..
    ##..##.
    ##..##.
    ##..##.
    #####..
    ##.##..
    ##..##.
    ##...##
    ##...##`),
  S: rows(`
    ..####.
    .##..#.
    .##....
    ..###..
    ....##.
    .....##
    .....##
    .#..##.
    .####..`),
  T: rows(`
    ########
    ##.##.##
    ...##...
    ...##...
    ...##...
    ...##...
    ...##...
    ...##...
    ...##...`),
  U: rows(`
    ###..###
    .##..##.
    .##..##.
    .##..##.
    .##..##.
    .##..##.
    .##..##.
    .##.###.
    ..###.##`),
  V: rows(`
    ##...##
    ##...##
    ##...##
    ##...##
    .##.##.
    .##.##.
    ..###..
    ..###..
    ...#...`),
  W: rows(`
    ##.##.##
    ##.##.##
    ##.##.##
    ##.##.##
    ##.##.##
    ##.##.##
    ##.##.##
    ##.##.##
    .######.`),
  X: rows(`
    ###..###
    .##..##.
    .##..##.
    ..####..
    ...##...
    ..####..
    .##..##.
    .##..##.
    ###..###`),
  Y: rows(`
    ###..###
    .##..##.
    .##..##.
    ..####..
    ...##...
    ...##...
    ...##...
    ...##...
    ..####..`),
  Z: rows(`
    #######
    .....##
    ....##.
    ...##..
    ...##..
    ..##...
    .##....
    ##.....
    #######`),
  // ---- the lowercase (2026-09-11): the textura hand under the caps. Rows
  // 0..2 are the ascender, 3..8 the x-height, 9..11 the descender, so a
  // lowercase word sits on the caps' baseline and a title can be a word.
  // The pen enters every x-height stem on a diagonal and the round letters
  // come to a point where it turned: the two marks that make blackletter
  // read at six pixels. Widths vary by glyph like the caps.
  a: rows(`
    ......
    ......
    ......
    .###..
    ...##.
    .#####
    ##..##
    ##..##
    .#####`),
  b: rows(`
    .#....
    ##....
    ##....
    ##.##.
    ###.##
    ##..##
    ##..##
    ###.##
    ##.##.`),
  c: rows(`
    ......
    ......
    ......
    .###..
    ##..#.
    ##....
    ##....
    ##..#.
    .###..`),
  d: rows(`
    ....#.
    ....##
    ....##
    .##.##
    ##.###
    ##..##
    ##..##
    ##.###
    .##.##`),
  e: rows(`
    ......
    ......
    ......
    .###..
    ##..##
    ######
    ##....
    ##...#
    .####.`),
  f: rows(`
    ..###
    .##..
    .##..
    ####.
    .##..
    .##..
    .##..
    .##..
    .###.`),
  g: rows(`
    ......
    ......
    ......
    .#####
    ##..##
    ##..##
    ##..##
    .#####
    ....##
    ....##
    ##..##
    .####.`),
  h: rows(`
    .#....
    ##....
    ##....
    ##.##.
    ###.##
    ##..##
    ##..##
    ##..##
    ##..##`),
  i: rows(`
    ...
    .##
    ...
    .#.
    .##
    .##
    .##
    .##
    ###`),
  j: rows(`
    ....
    ..##
    ....
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    ..##
    #.##
    .##.`),
  k: rows(`
    .#....
    ##....
    ##....
    ##..##
    ##.##.
    ####..
    ###...
    ##.##.
    ##..##`),
  l: rows(`
    .#..
    .##.
    .##.
    .##.
    .##.
    .##.
    .##.
    .##.
    .###`),
  m: rows(`
    ........
    ........
    ........
    .#.##.##
    ########
    ##.##.##
    ##.##.##
    ##.##.##
    ##.##.##`),
  n: rows(`
    ......
    ......
    ......
    .#.##.
    ######
    ##..##
    ##..##
    ##..##
    ##..##`),
  o: rows(`
    ......
    ......
    ......
    .###..
    ##..##
    ##..##
    ##..##
    ##..##
    .###..`),
  p: rows(`
    ......
    ......
    ......
    .#.##.
    ###.##
    ##..##
    ##..##
    ###.##
    ##.##.
    ##....
    ##....
    ###...`),
  q: rows(`
    ......
    ......
    ......
    .##.##
    ##.###
    ##..##
    ##..##
    ##.###
    .##.##
    ....##
    ....##
    ...###`),
  r: rows(`
    .....
    .....
    .....
    .#.##
    ###.#
    ##...
    ##...
    ##...
    ###..`),
  s: rows(`
    .....
    .....
    .....
    .####
    ##...
    .###.
    ...##
    ...##
    ####.`),
  t: rows(`
    ....
    .##.
    .##.
    ####
    .##.
    .##.
    .##.
    .##.
    .###`),
  u: rows(`
    ......
    ......
    ......
    .#..#.
    ##..##
    ##..##
    ##..##
    ##.###
    .##.##`),
  v: rows(`
    ......
    ......
    ......
    .#..#.
    ##..##
    ##..##
    ##..##
    .####.
    ..##..`),
  w: rows(`
    ........
    ........
    ........
    .#.#..#.
    ##.##.##
    ##.##.##
    ##.##.##
    ########
    .##..##.`),
  x: rows(`
    ......
    ......
    ......
    ##..##
    .####.
    ..##..
    ..##..
    .####.
    ##..##`),
  y: rows(`
    ......
    ......
    ......
    .#..#.
    ##..##
    ##..##
    ##..##
    .#####
    ....##
    ....##
    ##..##
    .####.`),
  z: rows(`
    ......
    ......
    ......
    ######
    ....##
    ...##.
    .##...
    ##....
    ######`),
  0: rows(`
    ..####..
    .##..##.
    ##....##
    ##..#.##
    ##.#..##
    ###...##
    ##....##
    .##..##.
    ..####..`),
  1: rows(`
    ...##...
    ..###...
    .####...
    ...##...
    ...##...
    ...##...
    ...##...
    ...##...
    .######.`),
  2: rows(`
    .#####.
    ##...##
    .....##
    .....##
    ..####.
    .##....
    ##.....
    ##...##
    #######`),
  3: rows(`
    .#####.
    ##...##
    .....##
    ..####.
    .....##
    .....##
    .....##
    ##...##
    .#####.`),
  4: rows(`
    ....##..
    ...###..
    ..####..
    .##.##..
    ##..##..
    #######.
    ....##..
    ....##..
    ...####.`),
  5: rows(`
    #######
    ##.....
    ##.....
    ######.
    .....##
    .....##
    .....##
    ##...##
    .#####.`),
  6: rows(`
    ..####.
    .##....
    ##.....
    ######.
    ##...##
    ##...##
    ##...##
    ##...##
    .#####.`),
  7: rows(`
    #######
    .....##
    ....##.
    ....##.
    ...##..
    ...##..
    ..##...
    ..##...
    ..##...`),
  8: rows(`
    .#####.
    ##...##
    ##...##
    .#####.
    ##...##
    ##...##
    ##...##
    ##...##
    .#####.`),
  9: rows(`
    .#####.
    ##...##
    ##...##
    .######
    .....##
    .....##
    .....##
    ##..##.
    .####..`),
  '.': rows(`
    ..
    ..
    ..
    ..
    ..
    ..
    ..
    ##
    ##`),
  ',': rows(`
    ..
    ..
    ..
    ..
    ..
    ..
    ##
    ##
    #.`),
  ':': rows(`
    ..
    ..
    ##
    ##
    ..
    ..
    ##
    ##
    ..`),
  '!': rows(`
    ##
    ##
    ##
    ##
    ##
    ##
    ..
    ##
    ##`),
  '?': rows(`
    .####.
    ##..##
    ....##
    ...##.
    ..##..
    ..##..
    ......
    ..##..
    ..##..`),
  "'": rows(`
    ##
    ##
    #.
    ..
    ..
    ..
    ..
    ..
    ..`),
  '-': rows(`
    ....
    ....
    ....
    ....
    ####
    ....
    ....
    ....
    ....`),
  '/': rows(`
    ......##
    ......##
    .....##.
    ....##..
    ...##...
    ..##....
    .##.....
    ##......
    ##......`),
  '&': rows(`
    ..###...
    .##.##..
    .##.##..
    ..###...
    .###..##
    ##.##.#.
    ##..###.
    .##..##.
    ..####.#`),
  '·': rows(`
    ..
    ..
    ..
    ..
    ##
    ##
    ..
    ..
    ..`),
  // the degree sign sits on the cap line: a ring in the two-pixel hand,
  // cut square at the corners like the bowls, so a reading ("54°") sets in
  // one face (#305)
  '°': rows(`
    .####.
    ##..##
    ##..##
    .####.`),
}

// ---- label: 5 x 7, two descender rows -----------------------------------------
const LABEL_GLYPHS = {
  A: rows(`
    .###.
    #...#
    #...#
    #####
    #...#
    #...#
    #...#`),
  B: rows(`
    ####.
    #...#
    #...#
    ####.
    #...#
    #...#
    ####.`),
  C: rows(`
    .####
    #....
    #....
    #....
    #....
    #....
    .####`),
  D: rows(`
    ####.
    #...#
    #...#
    #...#
    #...#
    #...#
    ####.`),
  E: rows(`
    #####
    #....
    #....
    ####.
    #....
    #....
    #####`),
  F: rows(`
    #####
    #....
    #....
    ####.
    #....
    #....
    #....`),
  G: rows(`
    .####
    #....
    #....
    #.###
    #...#
    #...#
    .####`),
  H: rows(`
    #...#
    #...#
    #...#
    #####
    #...#
    #...#
    #...#`),
  I: rows(`
    ###
    .#.
    .#.
    .#.
    .#.
    .#.
    ###`),
  J: rows(`
    ..###
    ...#.
    ...#.
    ...#.
    ...#.
    #..#.
    .##..`),
  K: rows(`
    #...#
    #..#.
    #.#..
    ##...
    #.#..
    #..#.
    #...#`),
  L: rows(`
    #....
    #....
    #....
    #....
    #....
    #....
    #####`),
  M: rows(`
    #...#
    ##.##
    #.#.#
    #.#.#
    #...#
    #...#
    #...#`),
  N: rows(`
    #...#
    ##..#
    #.#.#
    #..##
    #...#
    #...#
    #...#`),
  O: rows(`
    .###.
    #...#
    #...#
    #...#
    #...#
    #...#
    .###.`),
  P: rows(`
    ####.
    #...#
    #...#
    ####.
    #....
    #....
    #....`),
  Q: rows(`
    .###.
    #...#
    #...#
    #...#
    #.#.#
    #..#.
    .##.#`),
  R: rows(`
    ####.
    #...#
    #...#
    ####.
    #.#..
    #..#.
    #...#`),
  S: rows(`
    .####
    #....
    #....
    .###.
    ....#
    ....#
    ####.`),
  T: rows(`
    #####
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..`),
  U: rows(`
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    .###.`),
  V: rows(`
    #...#
    #...#
    #...#
    #...#
    .#.#.
    .#.#.
    ..#..`),
  W: rows(`
    #...#
    #...#
    #...#
    #.#.#
    #.#.#
    ##.##
    #...#`),
  X: rows(`
    #...#
    #...#
    .#.#.
    ..#..
    .#.#.
    #...#
    #...#`),
  Y: rows(`
    #...#
    #...#
    .#.#.
    ..#..
    ..#..
    ..#..
    ..#..`),
  Z: rows(`
    #####
    ....#
    ...#.
    ..#..
    .#...
    #....
    #####`),
  a: rows(`
    .....
    .....
    .###.
    ....#
    .####
    #...#
    .####`),
  b: rows(`
    #....
    #....
    ####.
    #...#
    #...#
    #...#
    ####.`),
  c: rows(`
    .....
    .....
    .####
    #....
    #....
    #....
    .####`),
  d: rows(`
    ....#
    ....#
    .####
    #...#
    #...#
    #...#
    .####`),
  e: rows(`
    .....
    .....
    .###.
    #...#
    #####
    #....
    .####`),
  f: rows(`
    ..##
    .#..
    ###.
    .#..
    .#..
    .#..
    .#..`),
  g: rows(`
    .....
    .....
    .####
    #...#
    #...#
    .####
    ....#
    ....#
    .###.`),
  h: rows(`
    #....
    #....
    ####.
    #...#
    #...#
    #...#
    #...#`),
  i: rows(`
    .#.
    ...
    ##.
    .#.
    .#.
    .#.
    ###`),
  j: rows(`
    ...#
    ....
    ...#
    ...#
    ...#
    ...#
    ...#
    #..#
    .##.`),
  k: rows(`
    #....
    #....
    #..#.
    #.#..
    ##...
    #.#..
    #..#.`),
  l: rows(`
    ##.
    .#.
    .#.
    .#.
    .#.
    .#.
    ###`),
  m: rows(`
    .....
    .....
    ##.#.
    #.#.#
    #.#.#
    #.#.#
    #...#`),
  n: rows(`
    .....
    .....
    ####.
    #...#
    #...#
    #...#
    #...#`),
  o: rows(`
    .....
    .....
    .###.
    #...#
    #...#
    #...#
    .###.`),
  p: rows(`
    .....
    .....
    ####.
    #...#
    #...#
    ####.
    #....
    #....
    #....`),
  q: rows(`
    .....
    .....
    .####
    #...#
    #...#
    .####
    ....#
    ....#
    ....#`),
  r: rows(`
    .....
    .....
    #.##.
    ##..#
    #....
    #....
    #....`),
  s: rows(`
    .....
    .....
    .####
    #....
    .###.
    ....#
    ####.`),
  t: rows(`
    .#..
    .#..
    ###.
    .#..
    .#..
    .#.#
    ..#.`),
  u: rows(`
    .....
    .....
    #...#
    #...#
    #...#
    #..##
    .##.#`),
  v: rows(`
    .....
    .....
    #...#
    #...#
    #...#
    .#.#.
    ..#..`),
  w: rows(`
    .....
    .....
    #...#
    #...#
    #.#.#
    #.#.#
    .#.#.`),
  x: rows(`
    .....
    .....
    #...#
    .#.#.
    ..#..
    .#.#.
    #...#`),
  y: rows(`
    .....
    .....
    #...#
    #...#
    #...#
    .####
    ....#
    ....#
    .###.`),
  z: rows(`
    .....
    .....
    #####
    ...#.
    ..#..
    .#...
    #####`),
  0: rows(`
    .###.
    #...#
    #..##
    #.#.#
    ##..#
    #...#
    .###.`),
  1: rows(`
    ..#..
    .##..
    ..#..
    ..#..
    ..#..
    ..#..
    .###.`),
  2: rows(`
    .###.
    #...#
    ....#
    ...#.
    ..#..
    .#...
    #####`),
  3: rows(`
    #####
    ...#.
    ..#..
    ...#.
    ....#
    #...#
    .###.`),
  4: rows(`
    ...#.
    ..##.
    .#.#.
    #..#.
    #####
    ...#.
    ...#.`),
  5: rows(`
    #####
    #....
    ####.
    ....#
    ....#
    #...#
    .###.`),
  6: rows(`
    ..###
    .#...
    #....
    ####.
    #...#
    #...#
    .###.`),
  7: rows(`
    #####
    ....#
    ...#.
    ..#..
    .#...
    .#...
    .#...`),
  8: rows(`
    .###.
    #...#
    #...#
    .###.
    #...#
    #...#
    .###.`),
  9: rows(`
    .###.
    #...#
    #...#
    .####
    ....#
    ...#.
    ###..`),
  '.': rows(`
    .
    .
    .
    .
    .
    .
    #`),
  ',': rows(`
    ..
    ..
    ..
    ..
    ..
    .#
    .#
    #.`),
  ':': rows(`
    .
    .
    #
    .
    .
    #
    .`),
  ';': rows(`
    ..
    ..
    .#
    ..
    ..
    .#
    .#
    #.`),
  '!': rows(`
    #
    #
    #
    #
    #
    .
    #`),
  '?': rows(`
    .###.
    #...#
    ....#
    ...#.
    ..#..
    .....
    ..#..`),
  "'": rows(`
    #
    #
    .
    .
    .
    .
    .`),
  '"': rows(`
    #.#
    #.#
    ...
    ...
    ...
    ...
    ...`),
  '-': rows(`
    ...
    ...
    ...
    ###
    ...
    ...
    ...`),
  '#': rows(`
    .#.#.
    #####
    .#.#.
    .#.#.
    #####
    .#.#.
    .....`),
  '=': rows(`
    .....
    .....
    #####
    .....
    #####
    .....
    .....`),
  '+': rows(`
    ...
    ...
    .#.
    ###
    .#.
    ...
    ...`),
  '/': rows(`
    ....#
    ....#
    ...#.
    ..#..
    .#...
    #....
    #....`),
  '(': rows(`
    .#
    #.
    #.
    #.
    #.
    #.
    .#`),
  ')': rows(`
    #.
    .#
    .#
    .#
    .#
    .#
    #.`),
  '&': rows(`
    .#...
    #.#..
    #.#..
    .#...
    #.#.#
    #..#.
    .##.#`),
  '·': rows(`
    .
    .
    .
    #
    .
    .
    .`),
  '°': rows(`
    .#.
    #.#
    .#.
    ...
    ...
    ...
    ...`),
  _: rows(`
    .....
    .....
    .....
    .....
    .....
    .....
    #####`),
  '@': rows(`
    .###.
    #...#
    #.###
    #.#.#
    #.###
    #....
    .####`),
  // the case-study figures (#300) label an approximate duration and a
  // dialog's close box, and a figure keeps every word it had
  '~': rows(`
    .....
    .....
    .#...
    #.#.#
    ...#.
    .....
    .....`),
  '✕': rows(`
    .....
    #...#
    .#.#.
    ..#..
    .#.#.
    #...#
    .....`),
}

// A face: its glyphs, the cell height every glyph is set in (descender rows
// included), the one-pixel gap after each glyph, the width of a space, and
// the world px one glyph pixel measures. Display rides the cell; the label
// hand rides half of it (see the header).
export const FACES = {
  display: { glyphs: DISPLAY_GLYPHS, rows: 12, gap: 1, space: 4, px: 4 },
  label: { glyphs: LABEL_GLYPHS, rows: 9, gap: 1, space: 3, px: 2 },
}

// what a face can set. A string with a character outside the face is a
// build-time fact, so the renderer refuses it loudly rather than dropping
// the glyph: a title with a hole in it is the kind of bug that ships.
// seam: test/pixel-type.test.js
export const hasGlyphs = (text, face) =>
  [...text].every((ch) => ch === ' ' || ch in FACES[face].glyphs)
// seam: test/pixel-type.test.js
export const missingGlyphs = (text, face) => [
  ...new Set([...text].filter((ch) => ch !== ' ' && !(ch in FACES[face].glyphs))),
]

// the glyph run: where each character sits and how wide the line is, in
// glyph pixels. Pure layout, shared by the renderer and the tests.
// seam: test/pixel-type.test.js
export function layoutText(text, face) {
  const f = FACES[face]
  if (!f) throw new Error(`pixel-type: no face named ${face}`)
  const missing = missingGlyphs(text, face)
  if (missing.length) throw new Error(`pixel-type: ${face} has no glyph for ${missing.join(' ')}`)
  const run = []
  let x = 0
  for (const ch of text) {
    const g = ch === ' ' ? null : f.glyphs[ch]
    const w = g ? g[0].length : f.space
    run.push({ ch, x, w, g })
    x += w + f.gap
  }
  // the trailing gap belongs to nothing
  return { run, cols: Math.max(0, x - f.gap), rows: f.rows }
}

// WRAPPING, in the face's own cells. The hero is the only thing that sets
// more than a few words in this face, and it has to break somewhere: a
// statement is a sentence, not a title.
//
// It measures in GLYPH PIXELS and takes its bound in them too, because a
// caller that wrapped on world px would have to know the scale, and a scale
// is the one thing a pixel drawing must not have opinions about. Multiply by
// the face's px and your scale at the call site.
//
// Breaks on spaces only. A word longer than the bound is left long rather
// than broken mid-word: hyphenating pixel type would need a hyphen glyph
// placed by rule, and the phrases are the author's own, so a line that
// overruns is a sentence to rewrite rather than a case to handle.
/**
 * @param {string} text
 * @param {string} face
 * @param {number} maxCols bound in glyph pixels
 * @returns {string[]} the lines, in order
 */
export function wrapText(text, face, maxCols) {
  const words = String(text)
    .split(' ')
    .filter((w) => w !== '')
  if (!words.length) return []
  const lines = []
  let line = words[0]
  for (let i = 1; i < words.length; i++) {
    const merged = line + ' ' + words[i]
    if (layoutText(merged, face).cols > maxCols) {
      lines.push(line)
      line = words[i]
    } else line = merged
  }
  lines.push(line)
  return lines
}

// one <path> for the whole line: each row's ink runs become unit-height
// rectangles (`M x y h n v1 h-n z`), so the drawing is exactly the pixels
// and nothing between them needs anti-aliasing to lie about
// seam: test/pixel-type.test.js
export function pathFor(text, face) {
  const { run } = layoutText(text, face)
  const parts = []
  for (const { x, g } of run) {
    if (!g) continue
    g.forEach((row, y) => {
      let c = 0
      while (c < row.length) {
        if (row[c] !== '#') {
          c++
          continue
        }
        let n = 0
        while (row[c + n] === '#') n++
        parts.push(`M${x + c} ${y}h${n}v1h-${n}z`)
        c += n
      }
    })
  }
  return parts.join('')
}

const escAttr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

// the type, set. `scale` is an integer multiple of the face's pixel (a
// display title at 2 is 64 x 72); anything else would put ink between the
// cells. The svg carries its own world size, so it seats in a flex row or a
// button like a word would.
export function pixelText(text, face, { scale = 1, className = 'px' } = {}) {
  if (!Number.isInteger(scale) || scale < 1)
    throw new Error(`pixel-type: scale must be a positive integer, got ${scale}`)
  const f = FACES[face]
  const { cols, rows } = layoutText(text, face)
  const w = cols * f.px * scale
  const h = rows * f.px * scale
  const svg =
    `<svg class="${className} ${className}-${face}" viewBox="0 0 ${cols} ${rows}" width="${w}" height="${h}" ` +
    `shape-rendering="crispEdges" aria-hidden="true" focusable="false">` +
    `<path fill="currentColor" d="${pathFor(text, face)}"/></svg>`
  return { svg, cols, rows, w, h }
}

// ---- the buffer, as a buffer -------------------------------------------------
// The payoff of type as data: a set line is a grid of cells, and a grid can
// be played with. gridOf() lays a line out as rows of booleans with `pad`
// empty cells around it (room for a glyph to grow into), pathFromGrid() draws
// any grid back with the same idiom pixelText uses, and lifeStep() is Conway's
// rule, one generation. app.js runs a few generations over a zone's title on
// hover and puts the word back: a wink, in the pixel register, rare.
export function gridOf(text, face, pad = 2) {
  const { run, cols, rows } = layoutText(text, face)
  const w = cols + 2 * pad
  const h = rows + 2 * pad
  const g = Array.from({ length: h }, () => Array(w).fill(false))
  for (const { x, g: glyph } of run) {
    if (!glyph) continue
    glyph.forEach((row, y) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '#') g[y + pad][x + c + pad] = true
    })
  }
  return g
}
export function pathFromGrid(g) {
  const parts = []
  g.forEach((row, y) => {
    let c = 0
    while (c < row.length) {
      if (!row[c]) {
        c++
        continue
      }
      let n = 0
      while (row[c + n]) n++
      parts.push(`M${c} ${y}h${n}v1h-${n}z`)
      c += n
    }
  })
  return parts.join('')
}
// seam: test/pixel-type.test.js
export function lifeStep(g) {
  const h = g.length
  const w = h ? g[0].length : 0
  const next = Array.from({ length: h }, () => Array(w).fill(false))
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let n = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dy && !dx) continue
          const yy = y + dy
          const xx = x + dx
          if (yy >= 0 && yy < h && xx >= 0 && xx < w && g[yy][xx]) n++
        }
      next[y][x] = g[y][x] ? n === 2 || n === 3 : n === 3
    }
  return next
}

// A TITLE THAT WRAPS WHERE IT STANDS (#300). The case-study page and its card
// set the same title in the same face, and neither knows its width until the
// browser lays it out: the page is a phone or a desk, the card is a slot. So
// the title is one svg a WORD and the browser does the wrapping, the way it
// wraps any other words, while every word stays a pixel drawing. Nothing is
// ever scaled by a fraction: the host sets `--tpx`, the world px one glyph
// pixel measures, and CSS multiplies each word's own cols and rows by it
// (`.ptitle` in canvas-home.css). The attributes carry the face's own pitch,
// so a title with no stylesheet still draws on the cell.
export function pixelTitle(text, face = 'display', { tag = 'span', className = '' } = {}) {
  const f = FACES[face]
  const words = String(text)
    .split(' ')
    .filter((w) => w !== '')
    .map((w) => {
      const { cols, rows } = layoutText(w, face)
      return (
        `<svg class="pw" viewBox="0 0 ${cols} ${rows}" width="${cols * f.px}" height="${rows * f.px}" ` +
        `style="--c:${cols};--r:${rows}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">` +
        `<path fill="currentColor" d="${pathFor(w, face)}"/></svg>`
      )
    })
  const cls = `ptitle ptitle-${face}${className ? ' ' + className : ''}`
  return `<${tag} class="${cls}" style="--sp:${f.space}">${words.join('')}<span class="px-vh">${escAttr(text)}</span></${tag}>`
}
