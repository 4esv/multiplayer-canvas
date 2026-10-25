// test/exports.test.js
// THE BORROWING DOOR. Every primitive is reachable by the name a borrower
// types, `multiplayer-canvas/<key>`, through package.json `exports`, and
// carries the names the README promises. Node resolves the package's own
// name from inside it, so these imports take the same path an installed
// copy would.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

// pixel-moves reads the reduced-motion query once at import, as a page does
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} })

// key -> names it must export (the ones the README's snippets use)
const PROMISED = {
  'pixel-type': ['pixelText', 'pixelTitle', 'layoutText', 'FACES'],
  dust: ['createDust'],
  'pixel-moves': ['zoomRects', 'poof', 'bigBang', 'implode'],
  dither: ['bayer', 'bayerLit', 'BAYER4', 'normalize'],
  grid: ['PX', 'M'],
  torus: ['wrapPos', 'wrapSpots', 'nearestWrap', 'snapZoom', 'stepZoom'],
  mirror: ['createMirror'],
  presence: ['initPresence'],
  'presence/room': ['createRoom', 'presenceRoom', 'publish'],
  'presence/protocol': ['parseFrame', 'parseMove'],
  'presence/wire': ['RATE_MS', 'changedKeys'],
  'presence/anchor': ['anchorOf', 'pointOf'],
  'presence/conga': ['linesOf', 'sampleAt'],
  rooms: ['startSession', 'findSession', 'endSession', 'onSessionEnd'],
  'rooms/url': ['roomFromUrl', 'withRoom', 'searchFromUrl', 'withSearch'],
  'rooms/follow': ['createFollow'],
  'rooms/view-sync': ['shareView', 'viewOf'],
  slime: ['createSlime', 'step', 'paintDish', 'feed'],
  'slime/server': ['startSlime', 'watchSlime'],
  sky: ['frame', 'phaseOf', 'cellsOf'],
  'sky/server': ['startSky', 'watchSky'],
  'kit/scroll': ['scrollMarkup', 'wireScroll'],
  'kit/caret': ['wireCarets'],
  'kit/arm': ['arm', 'disarm'],
  'kit/marquee': ['marqueeMarkup', 'wireMarquees'],
  'kit/tags': ['tagsMarkup'],
}

const STYLES = ['kit.css', 'tokens.css']

describe('package exports', () => {
  // mutation: exports.unpromised-key
  it('every JS export is promised here, and every promise is exported', () => {
    const keys = Object.keys(PKG.exports)
      .filter((k) => k !== './package.json' && !k.endsWith('.css'))
      .map((k) => k.slice(2))
    assert.deepEqual(keys.sort(), Object.keys(PROMISED).sort())
  })

  for (const [key, names] of Object.entries(PROMISED)) {
    it(`multiplayer-canvas/${key} imports by name and carries ${names.join(', ')}`, async () => {
      const mod = await import(`multiplayer-canvas/${key}`)
      for (const n of names) assert.ok(n in mod, `${key} lacks ${n}`)
    })
  }

  for (const key of STYLES) {
    // mutation: exports.stylesheet-missing
    it(`multiplayer-canvas/${key} points at a stylesheet that exists`, () => {
      const target = PKG.exports[`./${key}`]
      assert.ok(target, `no export for ${key}`)
      assert.ok(existsSync(join(ROOT, target)), target)
      assert.match(readFileSync(join(ROOT, target), 'utf8'), /--cv-|\.k-/)
    })
  }

  // mutation: exports.ships-the-site
  it('the package ships the primitives and nothing of the site', () => {
    assert.deepEqual(PKG.files.sort(), ['LICENSE', 'README.md', 'primitives/'])
    // npm packs `main` whatever `files` says, so the site's entry stays out of it
    assert.equal(PKG.main, undefined)
    for (const target of Object.values(PKG.exports))
      assert.ok(target.startsWith('./primitives/') || target === './package.json', target)
  })

  // mutation: exports.header-missing
  it('every primitive opens with its name, its inputs and its outputs', () => {
    for (const [key, target] of Object.entries(PKG.exports)) {
      if (key === './package.json') continue
      const head = readFileSync(join(ROOT, target), 'utf8').slice(0, 1200)
      assert.ok(
        head.startsWith(
          `${target.endsWith('.css') ? '/*' : '//'} multiplayer-canvas/${key.slice(2)}:`
        ),
        target
      )
      assert.match(head, /Inputs/i, `${target} names no inputs`)
      assert.match(head, /Outputs/i, `${target} names no outputs`)
    }
  })

  // mutation: exports.primitive-reaches-site
  it('no primitive imports from outside primitives/', () => {
    for (const target of Object.values(PKG.exports)) {
      if (!target.endsWith('.js')) continue
      const src = readFileSync(join(ROOT, target), 'utf8')
      for (const [, spec] of src.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+'([^']+)'/gm)) {
        if (spec.startsWith('node:')) continue
        assert.ok(spec.startsWith('.'), `${target} imports ${spec}`)
        const resolved = join(ROOT, target, '..', spec)
        assert.ok(resolved.startsWith(join(ROOT, 'primitives')), `${target} reaches ${spec}`)
      }
    }
  })
})
