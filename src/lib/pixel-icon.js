// The 11x11 pixel icon primitive: scripts/icon/wire.mjs rasterises a grid
// into the favicon set through it. Pixels are 0 (ground) or
// 1 (ink); color is the consumer's decision (currentColor inline, concrete
// ink in standalone files).

export const GRID = 11

// One path, one square per ink pixel. crispEdges keeps the grid honest at
// fractional raster sizes (the SVG favicon at 16px).
export function pixelsToPath(pixels) {
  const parts = []
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (pixels[y][x]) parts.push(`M${x} ${y}h1v1h-1z`)
    }
  }
  return parts.join('')
}
