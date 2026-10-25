// The stylesheets, wherever they live: the site's (src/static/css) and the
// engine's kit (primitives/kit: kit.css and the tokens). A guard over "every
// stylesheet" reads both, by bare file name, so moving a sheet between the
// two never hides it from a sweep.
import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
export const CSS_DIRS = [join(ROOT, 'src/static/css'), join(ROOT, 'primitives/kit')]

/** The absolute path of a stylesheet by its file name. */
export function cssPath(name) {
  const hit = CSS_DIRS.map((d) => join(d, name)).find((p) => existsSync(p))
  if (!hit) throw new Error(`no stylesheet named ${name}`)
  return hit
}

/** Every stylesheet's file name, the site's first. */
export const cssFiles = () =>
  CSS_DIRS.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.css')))

/** A stylesheet's path from the repo root, for messages. */
export const cssRel = (name) => relative(ROOT, cssPath(name))
