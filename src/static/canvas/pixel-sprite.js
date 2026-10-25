// A sprite is rows of text: one string a row, one character a cell.
//
//   .  nothing     k  ink     p  ground     b o m s  an accent
//
// (the ink cell's class is `ink`, not its letter: a bare `.k` is the kit's
// prefix, kit.css, and a rule for one would read as a kit part)
//
// (brick, ochre, mute, sage: the letter is the token's initial, and
// a sprite gets ink, ground and ONE of them, BIBLE.md sections 1 and 10.) Every
// lit cell is a unit square in the class its letter names, which the
// stylesheet that hosts the sprite paints from the tokens: canvas-home.css
// for the splat, instruments.css for the instruments. No colour lives here.
// Any letter that is not an accent or the ground is ink, so an old sprite
// (SPLAT_ROWS: 'b' and nothing else) reads exactly as it always did.
//
// scripts/img/pixelate.mjs prints rows in this form from a picture.
import { PX } from './layout.js'

const FILLS = new Set(['p', 'b', 'o', 'm', 's'])

const spriteCells = (rows) => {
  const cells = []
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== '.')
        cells.push(
          `<rect class="${FILLS.has(ch) ? ch : 'ink'}" x="${x}" y="${y}" width="1" height="1"/>`
        )
    })
  )
  return cells.join('')
}

// Standing alone, a sprite is an <svg> at PX a cell. With `at: [x, y]` it is a
// nested <svg> placed at that cell of a parent whose own units are cells, which
// is how a stage is built out of several (a kit out of its drums).
export const pixelSprite = (rows, cls, at) => {
  const w = rows[0].length,
    h = rows.length
  const box = at
    ? `x="${at[0]}" y="${at[1]}" width="${w}" height="${h}"`
    : `width="${w * PX}" height="${h * PX}"`
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" ${box} shape-rendering="crispEdges" aria-hidden="true">${spriteCells(rows)}</svg>`
}
