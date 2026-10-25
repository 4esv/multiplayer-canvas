// canvas/marks.js: the marks the canvas draws, as data (no DOM, no clock).
// app.js draws them into tiles; the OG cards draw them on a card. One drawing
// each, so a mark is the same mark wherever it stands.

// pixel-art marks, fill:currentColor so they invert with the tile on hover
// and ride the ink token. Both are drawn here, on a 24-cell lattice (two px
// a pixel in the dock's 48px seat): the feed's dot and two waves, and an
// envelope with its flap.
export const ICON_SVG = {
  rss: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M3 4h4v1h-4zM3 5h7v1h-7zM3 6h9v1h-9zM7 7h6v1h-6zM9 8h6v1h-6zM11 9h5v1h-5zM3 10h3v1h-3zM12 10h4v1h-4zM3 11h6v1h-6zM13 11h4v1h-4zM3 12h7v1h-7zM14 12h4v1h-4zM6 13h5v1h-5zM15 13h3v1h-3zM8 14h4v1h-4zM15 14h4v1h-4zM9 15h4v1h-4zM16 15h3v1h-3zM10 16h3v1h-3zM16 16h3v1h-3zM10 17h3v1h-3zM17 17h3v1h-3zM3 18h2v1h-2zM11 18h3v1h-3zM17 18h3v1h-3zM3 19h3v1h-3zM11 19h3v1h-3zM17 19h3v1h-3zM3 20h3v1h-3zM11 20h3v1h-3zM17 20h3v1h-3z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 5h20v1h-20zM2 6h3v1h-3zM19 6h3v1h-3zM2 7h1v1h-1zM5 7h1v1h-1zM18 7h1v1h-1zM21 7h1v1h-1zM2 8h1v1h-1zM6 8h2v1h-2zM16 8h2v1h-2zM21 8h1v1h-1zM2 9h1v1h-1zM8 9h1v1h-1zM15 9h1v1h-1zM21 9h1v1h-1zM2 10h1v1h-1zM9 10h2v1h-2zM13 10h2v1h-2zM21 10h1v1h-1zM2 11h1v1h-1zM11 11h2v1h-2zM21 11h1v1h-1zM2 12h1v1h-1zM11 12h2v1h-2zM21 12h1v1h-1zM2 13h1v1h-1zM21 13h1v1h-1zM2 14h1v1h-1zM21 14h1v1h-1zM2 15h1v1h-1zM21 15h1v1h-1zM2 16h1v1h-1zM21 16h1v1h-1zM2 17h1v1h-1zM21 17h1v1h-1zM2 18h20v1h-20z"/></svg>',
}

// the classic A, one drawing: the maker's mark above the hero and on the OG
// cards. A fork that wants its own mark redraws it here and in
// img/icon/default.svg (the favicon source).
export const MARK_A =
  '<svg viewBox="0 0 11 11" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M5 1h1v1h-1zM6 1h1v1h-1zM4 2h1v1h-1zM5 2h1v1h-1zM6 2h1v1h-1zM3 3h1v1h-1zM6 3h1v1h-1zM7 3h1v1h-1zM2 4h1v1h-1zM3 4h1v1h-1zM7 4h1v1h-1zM2 5h1v1h-1zM3 5h1v1h-1zM7 5h1v1h-1zM8 5h1v1h-1zM2 6h1v1h-1zM3 6h1v1h-1zM4 6h1v1h-1zM5 6h1v1h-1zM7 6h1v1h-1zM8 6h1v1h-1zM2 7h1v1h-1zM3 7h1v1h-1zM7 7h1v1h-1zM8 7h1v1h-1zM2 8h1v1h-1zM3 8h1v1h-1zM7 8h1v1h-1zM8 8h1v1h-1zM1 9h1v1h-1zM2 9h1v1h-1zM3 9h1v1h-1zM6 9h1v1h-1zM7 9h1v1h-1zM8 9h1v1h-1z"/></svg>'
