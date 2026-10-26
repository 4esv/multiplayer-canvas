// Production asset pipeline. Runs in the Docker assets stage (never in dev:
// `npm run dev` serves src/static/ raw). Minifies css/js, content-hashes
// filenames, bundles the two module entrypoints, and writes the logical →
// hashed map to dist/asset-manifest.json. Templates resolve through that map
// via the asset() global (src/lib/template-helpers.js); the service worker
// gets the same map injected as a self.__ASSET_MANIFEST prologue so its
// precache list always points at live URLs and its cache version bumps
// itself whenever any asset changes.
//
//   src/static/** and primitives/** (committed, readable)
//     → dist/static/**       (minified, hashed, served when NODE_ENV=production)
//     → dist/asset-manifest.json
//
// Categories:
//   js/vendor/**             skipped - vendored libraries exist only to be
//                            bundled into the scripts that import them
//   *.min.js, *.min.css      already minified - hashed copy
//   other css/js             minified, hashed
//   sw.js                    minified, manifest prologue prepended, NOT hashed
//                            (its registration URL must stay stable)
//   everything else          verbatim copy (fonts/images already immutable)

import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import esbuild from 'esbuild'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src', 'static')
const OUT = join(ROOT, 'dist', 'static')
const MANIFEST_PATH = join(ROOT, 'dist', 'asset-manifest.json')
const PRIMITIVES = join(ROOT, 'primitives')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

// Module entrypoints whose imports (absolute /js/... or /canvas/... URLs in
// dev) get bundled into a single file for production.
// The owner surfaces joined this list on 2026-09-15, when they started
// importing the shared move module (primitives/pixel-moves.js). Production hashes
// asset filenames and only TEMPLATES resolve the manifest, so a runtime
// import of a logical path would 404 on the box; bundling is how every other
// module entry on this site already solves that. All four were IIFEs with no
// top-level globals, which is why type="module" was safe to switch them to.
// textmode.js is here for the older half of the same reason: it imports the
// vendored library and the shared settings contract, and a bare specifier
// resolved at runtime does not survive hashing.
const BUNDLE_ENTRIES = new Set([
  'canvas/app.js',
  'js/admin.js',
  'js/desk.js',
  // the textmode draw path the bakes paint through (scripts/img)
  'js/textmode-draw.js',
  // the kit specimen sets its readouts in the pixel type
  'js/kit.js',
  // web-instruments imports its art from the canvas tree (2026-09-19). It
  // shipped unbundled for a day: both imports 404'd on the box, the catch
  // that keeps the sound alive without a picture swallowed it, and the page
  // served four empty buttons over a blank stage. test/bundle-entries.test.js
  // now computes this list from the import graph instead of trusting it.
  'js/instruments.js',
  // the case-study flow imports the vendored pretext
  'canvas/case-study.js',
  // the copy key and the prose-to-code mapping import the ref grammar
  'canvas/code-refs.js',
  // the photo set walks on the kit's walker, and the sessions desk arms
  // through the kit's one arm (the snap)
  'js/photoset.js',
  'js/rooms.js',
  // the doors' titles are dust, and the dust is the canvas's module
  'js/door.js',
])

// Resolves the absolute-URL import specifiers ('/js/vendor/three.module.js')
// the browser uses in dev against the static tree on disk.
const absoluteUrlImports = {
  name: 'absolute-url-imports',
  setup(build) {
    // the engine by its package name (package.json exports), the way the
    // site imports it and a borrower would
    build.onResolve({ filter: /^multiplayer-canvas\// }, (args) => {
      const file = PKG.exports[`.${args.path.slice('multiplayer-canvas'.length)}`]
      if (!file) return { errors: [{ text: `no export ${args.path}` }] }
      return { path: join(ROOT, file) }
    })
    build.onResolve({ filter: /^\/primitives\// }, (args) => {
      if (!args.importer) return undefined
      return { path: join(ROOT, args.path) }
    })
    build.onResolve({ filter: /^\// }, (args) => {
      // Only import specifiers; entrypoints arrive here as absolute fs paths.
      if (!args.importer) return undefined
      return { path: join(SRC, args.path) }
    })
  },
}

function walk(dir, base = SRC) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => relative(base, join(e.parentPath, e.name)))
}

function hashedName(rel, content) {
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 8)
  const ext = extname(rel)
  return `${rel.slice(0, -ext.length)}-${hash}${ext}`
}

const manifest = {}

function emit(rel, content, { hash = true } = {}) {
  const outRel = hash ? hashedName(rel, content) : rel
  const outPath = join(OUT, outRel)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, content)
  if (hash) manifest[`/${rel}`] = `/${outRel}`
  return outRel
}

async function minifyCss(rel, base = SRC) {
  const { code } = await esbuild.transform(readFileSync(join(base, rel), 'utf8'), {
    loader: 'css',
    minify: true,
  })
  return code
}

async function minifyJs(rel, base = SRC) {
  const { code } = await esbuild.transform(readFileSync(join(base, rel), 'utf8'), {
    loader: 'js',
    minify: true,
  })
  return code
}

async function bundleJs(rel) {
  const result = await esbuild.build({
    entryPoints: [join(SRC, rel)],
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
    plugins: [absoluteUrlImports],
  })
  return result.outputFiles[0].text
}

async function main() {
  rmSync(join(ROOT, 'dist'), { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const files = walk(SRC).sort()
  for (const rel of files) {
    const posix = rel.split('\\').join('/')
    if (posix.startsWith('js/vendor/')) continue
    // pretext exists only to be bundled into canvas/app.js, same as js/vendor
    if (posix.startsWith('canvas/vendor/')) continue
    if (posix === 'sw.js') continue // needs the finished manifest; handled below

    if (BUNDLE_ENTRIES.has(posix)) {
      emit(posix, await bundleJs(posix))
    } else if (/\.min\.(js|css)$/.test(posix)) {
      emit(posix, readFileSync(join(SRC, rel)))
    } else if (posix.endsWith('.css')) {
      emit(posix, await minifyCss(rel))
    } else if (posix.endsWith('.js')) {
      emit(posix, await minifyJs(rel))
    } else {
      cpSync(join(SRC, rel), join(OUT, rel))
    }
  }

  // The engine (primitives/), under /primitives/: css hashed like the rest,
  // js minified but NOT hashed, because its modules import each other by
  // relative path and the import map (src/lib/import-map.js) names them
  // as they are.
  for (const rel of walk(PRIMITIVES, PRIMITIVES).sort()) {
    const posix = rel.split('\\').join('/')
    if (posix.endsWith('.css')) emit(`primitives/${posix}`, await minifyCss(rel, PRIMITIVES))
    else if (posix.endsWith('.js'))
      emit(`primitives/${posix}`, await minifyJs(rel, PRIMITIVES), { hash: false })
  }

  // Service worker: same minify, plus the manifest prologue. The cache
  // version derives from the manifest, so any asset change rolls the cache
  // - no manual bump to forget.
  const manifestJson = JSON.stringify(manifest)
  const version = `canvas-${createHash('sha256').update(manifestJson).digest('hex').slice(0, 12)}`
  const prologue = `self.__ASSET_MANIFEST=${manifestJson};self.__CACHE_VERSION=${JSON.stringify(version)};`
  emit('sw.js', prologue + '\n' + (await minifyJs('sw.js')), { hash: false })

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`built ${files.length} files → dist/static (${Object.keys(manifest).length} hashed)`)
  console.log(`cache version ${version}`)
}

await main()
