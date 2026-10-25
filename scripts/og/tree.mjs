// What a card reads off the tree and cannot read off the content: the canvas's
// baked picture of each experiment. Kept apart from cards.mjs so that stays
// pure, and from render.mjs so a test can read what the renderer reads.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { decodePng } from '../icon/png.mjs'

/**
 * The canvas's baked still of each entry that has one, by slug:
 * { src, w, h }, the size read off the PNG itself.
 * @param {{slug: string}[]} entries
 * @param {string} root the repo root
 */
export function readStills(entries, root) {
  const stills = {}
  for (const e of entries) {
    const src = `/img/canvas/${e.slug}.png`
    const file = join(root, 'src/static', src)
    if (!existsSync(file)) continue
    const { width, height } = decodePng(readFileSync(file))
    stills[e.slug] = { src, w: width, h: height }
  }
  return stills
}
