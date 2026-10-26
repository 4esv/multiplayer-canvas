// The textmode draw path, shared: the bakes (scripts/img) paint through it, so a look comes out the same
// wherever a preset is used.
//
// It is the path the Safari extension runs, ported across: configure the
// source every frame, then image() it at the grid's size, then the post
// effects. Settings are primitives/textmode-settings.js's shape, already normalized.

import { CONTOUR_DEFAULT_CHARACTERS } from '/js/vendor/textmode/textmode.contour.esm.js'
import { BAYER_MAP, bayerGlyph, fontSrc } from 'multiplayer-canvas/dither'

// The Bayer tileset as textmode.js takes one: a sheet of 4x4 cells in one
// row. It is a mask, not a picture: the glyph shader reads a pixel as lit
// when it is opaque and bright, so a lit pixel is bytes 255 and an unlit one
// opaque 0. Drawn once, from the contract's own numbers.
let bayerSheet = null
function bayerTileset() {
  if (!bayerSheet) {
    const n = BAYER_MAP.length
    bayerSheet = document.createElement('canvas')
    bayerSheet.width = n * 4
    bayerSheet.height = 4
    const g = bayerSheet.getContext('2d')
    const mask = g.createImageData(n * 4, 4)
    for (let level = 0; level < n; level++)
      bayerGlyph(level).forEach((lit, i) => {
        const at = ((i >> 2) * n * 4 + level * 4 + (i & 3)) * 4
        mask.data.fill(lit ? 255 : 0, at, at + 3)
        mask.data[at + 3] = 255
      })
    g.putImageData(mask, 0, 0)
  }
  return { source: bayerSheet, columns: BAYER_MAP.length, rows: 1, map: BAYER_MAP }
}

// A settings fontId onto an instance. The built-in face needs nothing; a
// file is fetched and parsed by the library; the dither is a tileset.
export async function loadFace(t, fontId) {
  if (fontId === 'bayer') return t.loadTileset(bayerTileset())
  const src = fontSrc(fontId)
  if (src) return t.loadFont(src)
}

// The settings, applied to the source. Called every frame on purpose: it is
// a handful of uniform writes, and it means a slider never has to know which
// of the two conversion passes it belongs to.
function configure(src, settings) {
  src
    .characters(settings.glyphRamp)
    .invert(settings.invert)
    .charColorMode(settings.charColorMode)
    .charColor(settings.charColor)
    .cellColorMode(settings.cellColorMode)
    .cellColor(settings.cellColor)
    .background(settings.cellColor)

  // One pass is the fast path the library optimises; two passes (edges over
  // tones) have to be declared as a list.
  if (settings.brightnessEnabled && !settings.contour.enabled) {
    src.conversionMode('brightness')
    return
  }

  const passes = []
  if (settings.brightnessEnabled) {
    passes.push({
      mode: 'brightness',
      characters: settings.glyphRamp,
      charColorMode: settings.charColorMode,
      charColor: settings.charColor,
      cellColorMode: settings.cellColorMode,
      cellColor: settings.cellColor,
    })
  }
  if (settings.contour.enabled) {
    passes.push({
      mode: 'contour',
      characters: CONTOUR_DEFAULT_CHARACTERS,
      invert: settings.contour.invert,
      charColorMode: settings.contour.charColorMode,
      charColor: settings.contour.charColor,
      cellColorMode: settings.contour.cellColorMode,
      cellColor: settings.contour.cellColor,
      options: {
        threshold: settings.contour.threshold,
        colorSensitivity: settings.contour.colorSensitivity,
      },
    })
  }

  if (passes.length) src.conversions(passes)
  else src.conversionMode('brightness')
}

// One frame: the ground, the source as glyphs, the effects. `fx` is false
// until the filter plugin has registered (asking for a filter before then is
// a silent no-op, not an error).
export function paint(t, src, settings, fx) {
  t.background(settings.background)
  if (!src) return
  // A video with no frame decoded yet has no pixels to sample; drawing it
  // paints a black rectangle over the last good frame.
  if (!src.originalWidth || !src.originalHeight) return
  configure(src, settings)
  const grid = t.grid
  if (!grid) return
  t.image(src, grid.cols, grid.rows)
  if (!fx) return
  for (const item of settings.postFx) {
    if (item.enabled) t.filter(item.filter, item.amount)
  }
}
