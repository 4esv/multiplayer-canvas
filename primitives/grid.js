// multiplayer-canvas/grid: the cell and the module, the two numbers the canvas is drawn on.
//
// Inputs: none. Outputs: PX (one cell, in CSS px) and M (one module: twelve
// cells, where tile sizes and origins live). Everything else on the canvas
// is a whole number of one of these, which is what keeps it crisp.
//
// import { PX, M } from 'multiplayer-canvas/grid'

// ---- the constants everything derives from ----------------------------------
// The cell: the logo's pixel, and the atom everything on the ground is N of.
// The mark is an 8 x 9 glyph in an 11-cell box; at 4px a cell the box is
// 44px, the 8px unit is two cells and the module twelve, so the one grid
// carries the logo, the spacing scale and the tiles without a fraction
// anywhere (BIBLE.md section 3). The screen chrome's control height is 44
// too, which is not a coincidence anyone planned and is kept on purpose.
export const PX = 4
export const M = 48 // the module (6u, 12 cells): tile dims and origins live on it
