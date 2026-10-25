// The desk: the owner's tool registry, and the one place a utility is added.
//
// Every owner page (/admin, /admin/kit) wears the same shell,
// templates/desk-base.njk, and the shell's navigation is this table: a
// bottom tab bar on a phone, a rail on a desktop. Adding a utility is one
// line here plus `desk: '<id>'` on its route; the bar, the rail, the
// dashboard's launcher card and the aria-current marking all follow.
//
// `bar` puts a tool on the phone's tab bar, which holds four comfortably at
// 390px (glyph over a one-word label); everything else reaches the phone
// through the launcher card on /admin and the rail on a desktop. `external`
// is a tool on another origin: it gets rel=noopener and no current marking.
//
// The glyphs are drawn on the 11 grid like every other control on the site
// (BIBLE.md section 8: the close, the fan's arrows, the mark), as rows of
// '#' and '.', and compiled to one crispEdges path at load. The mark itself
// is not redrawn here: it is read off the shipped logo (img/icon/default.svg), so the desk wears the same A as the
// favicon and the hero, and a re-wired logo reaches the desk on its own.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const LOGO = join(import.meta.dirname, '..', 'static', 'img', 'icon', 'default.svg')

// the icon bake writes one `M{x} {y}h1v1h-1z` per ink cell; back to rows
// seam: test/desk.test.js
export function logoRows(svg = readFileSync(LOGO, 'utf8')) {
  const rows = Array.from({ length: 11 }, () => Array(11).fill('.'))
  for (const [, x, y] of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) rows[+y][+x] = '#'
  return rows.map((r) => r.join(''))
}

const GLYPHS = {
  mark: logoRows(),
  bell: [
    '.....#.....',
    '....###....',
    '...#####...',
    '...#...#...',
    '..##...##..',
    '..#.....#..',
    '..#.....#..',
    '.##.....##.',
    '.#.......#.',
    '.#########.',
    '....###....',
  ],
  grid: [
    '###.###.###',
    '###.###.###',
    '###.###.###',
    '...........',
    '###.###.###',
    '###.###.###',
    '###.###.###',
    '...........',
    '###.###.###',
    '###.###.###',
    '###.###.###',
  ],
  folder: [
    '...........',
    '.#####.....',
    '#.....#....',
    '#......####',
    '#.........#',
    '#.........#',
    '#.........#',
    '#.........#',
    '#.........#',
    '#.........#',
    '###########',
  ],
  bars: [
    '...........',
    '.........##',
    '.........##',
    '.....##..##',
    '.....##..##',
    '.....##..##',
    '.##..##..##',
    '.##..##..##',
    '.##..##..##',
    '.##..##..##',
    '###########',
  ],
  text: [
    '...........',
    '.##.#.####.',
    '...........',
    '.#.###.##..',
    '...........',
    '.####.#.##.',
    '...........',
    '.##.####.#.',
    '...........',
    '.#.##.###..',
    '...........',
  ],
  cog: [
    '....###....',
    '.#..###..#.',
    '.##.....##.',
    '..#######..',
    '###.....###',
    '###.....###',
    '###.....###',
    '..#######..',
    '.##.....##.',
    '.#..###..#.',
    '....###....',
  ],
  // the kit: a raised block, its shade edge drawn thick down the right and
  // along the foot, which is the whole idea of the kit in one glyph
  kit: [
    '...........',
    '#########..',
    '#.......##.',
    '#.......##.',
    '#.......##.',
    '#.......##.',
    '#.......##.',
    '#.......##.',
    '##########.',
    '.#########.',
    '...........',
  ],
  // sessions: a door with its knob, the room the owner opens for a few
  door: [
    '...........',
    '..#######..',
    '..#.....#..',
    '..#.....#..',
    '..#.....#..',
    '..#...#.#..',
    '..#.....#..',
    '..#.....#..',
    '..#.....#..',
    '..#.....#..',
    '###########',
  ],
  out: [
    '...........',
    '.######....',
    '.#....#....',
    '.#....#.#..',
    '.#....#.##.',
    '.#....#####',
    '.#....#.##.',
    '.#....#.#..',
    '.#....#....',
    '.######....',
    '...........',
  ],
}

// rows of '#' to one path: each run of ink is a 1-tall rect
// seam: test/desk.test.js
export function glyphPath(rows) {
  const d = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      if (row[x] !== '#') {
        x++
        continue
      }
      let w = 0
      while (row[x + w] === '#') w++
      d.push(`M${x} ${y}h${w}v1h-${w}z`)
      x += w
    }
  })
  return d.join('')
}

// seam: test/desk.test.js
export function glyphSvg(name) {
  const rows = GLYPHS[name]
  if (!rows) throw new Error(`desk: no glyph named ${name}`)
  return `<svg viewBox="0 0 11 11" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${glyphPath(rows)}"/></svg>`
}

// seam: test/desk.test.js, test/textmode.test.js
export const DESK_TOOLS = [
  { id: 'admin', label: 'admin', href: '/admin', glyph: 'mark', bar: true },
  // live rooms of the owner's own on the presence socket (lib/sessions.js)
  { id: 'rooms', label: 'sessions', href: '/admin/sessions', glyph: 'door', bar: true },
  { id: 'kit', label: 'sheet', href: '/admin/kit', glyph: 'kit', bar: true },
]

// the shell's view of the registry for one page: every tool with its glyph
// drawn and its href resolved, the current one marked
export function deskFor(request, current) {
  const tools = DESK_TOOLS.map((t) => ({
    ...t,
    title: t.title || t.label,
    svg: glyphSvg(t.glyph),
    current: t.id === current,
  }))
  const page = tools.find((t) => t.current)
  return {
    current,
    title: page ? page.title : current,
    tools,
    mark: glyphSvg('mark'),
    out: glyphSvg('out'),
  }
}
