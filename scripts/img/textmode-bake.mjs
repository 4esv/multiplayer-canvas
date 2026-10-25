// The one ditherer, for the bakes: cells in, a picture on the ramp out.
//
// Every picture the site owns is drawn the way the kit's parts are (BIBLE.md
// section 1): a grid of cells, each one grey, handed to textmode.js in a
// browser through PRESETS.parts and js/textmode-draw.js, the draw path the
// desk uses. A cell is dithered one BAND of its ramp at a
// time: a cell whose grey falls between two neighbouring ramp tokens is
// drawn as a Bayer glyph of the lighter over the darker, its level the
// cell's place in the band. So every px of the result is a ramp token, a
// cell is at most two neighbouring ones, and nothing here thresholds a
// pixel: textmode does.
//
// The parts (bake-parts.mjs) and the photographs (bake-photos.mjs) all
// come through here. A card of type
// (scripts/og/render.sh) is flat, not a picture, so it only snaps (onRamp).
//
// Deterministic: no clock, no randomness. Runs against a served tree (the
// page imports the modules from the origin); WebGL headless needs
// swiftshader.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { RAMPS, readRamps } from '../../src/lib/kit-parts.js'
import { decodePng } from '../icon/png.mjs'

// the preset's cell, in px: a 4x4 glyph of 1px dots
export const CELL = 4

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

// sRGB to CIE L*, 0..100: where a colour sits between two greys is a
// question about lightness, not about the bytes
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
export function lightness([r, g, b]) {
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y
}

// sRGB <-> CIE Lab (D65), for a photograph: its dots keep their cell's hue
// and chroma at the lightness the dither gives them, so it keeps its colour
// and gives up its continuous tone (BIBLE.md section 0)
const D65 = [0.95047, 1, 1.08883]
const EPS = 216 / 24389
const KAPPA = 24389 / 27
const fwd = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116)
const inv = (t) => (t ** 3 > EPS ? t ** 3 : (116 * t - 16) / KAPPA)
const gamma = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
export function lab([r, g, b]) {
  const [R, G, B] = [r, g, b].map(lin)
  const x = fwd((0.4124 * R + 0.3576 * G + 0.1805 * B) / D65[0])
  const y = fwd(0.2126 * R + 0.7152 * G + 0.0722 * B)
  const z = fwd((0.0193 * R + 0.1192 * G + 0.9505 * B) / D65[2])
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const linearOfLab = ([L, a, b]) => {
  const fy = (L + 16) / 116
  const x = inv(fy + a / 500) * D65[0]
  const y = L > KAPPA * EPS ? fy ** 3 : L / KAPPA
  const z = inv(fy - b / 200) * D65[2]
  return [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.204 * y + 1.057 * z,
  ]
}
/**
 * The colour at lightness `L` with the hue of `[a, b]`, its chroma pulled
 * toward grey only as far as sRGB needs, so the lightness is the one asked
 * for and never the one a clip would leave.
 */
export function atLightness(L, [a, b]) {
  const fits = (k) => linearOfLab([L, a * k, b * k]).every((c) => c >= 0 && c <= 1)
  let k = 1
  if (!fits(1)) {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2
      if (fits(m)) lo = m
      else hi = m
    }
    k = lo
  }
  return linearOfLab([L, a * k, b * k]).map((c) => Math.round(gamma(Math.min(1, Math.max(0, c)))))
}

/** The grey ramp's tokens as lightness, darkest first. */
export function greyLightness(greys = readRamps().grey) {
  return greys.map((h) => lightness(hexToRgb(h)))
}

/**
 * A lightness's place on the grey ramp, 0 (the darkest token) to n - 1 (the
 * lightest): between two tokens it is the fraction of the way from one to
 * the next. Past either end it is that end. `ls` is greyLightness().
 */
export function rampPlace(l, ls) {
  if (l <= ls[0]) return 0
  for (let i = 0; i < ls.length - 1; i++)
    if (l <= ls[i + 1]) return i + (l - ls[i]) / (ls[i + 1] - ls[i])
  return ls.length - 1
}

/**
 * The passes: for each ramp, each pair of neighbouring tokens, the cells
 * that fall between them and how far along (0 at the darker, 1 at the
 * lighter). `cells` is [x, y, ramp, q], q a place on that ramp (0..n-1).
 */
export function bandsOf(cells, ramps = readRamps()) {
  const bands = []
  for (const [ramp, names] of Object.entries(RAMPS))
    for (let lo = 0; lo < names.length - 1; lo++)
      bands.push({ ramp, lo, dark: ramps[ramp][lo], light: ramps[ramp][lo + 1], cells: [] })
  for (const [x, y, ramp, place] of cells) {
    const n = RAMPS[ramp].length
    // the lightest token is the top of the last band, not a band of its own
    const q = Math.max(0, Math.min(place, 0.9999 * (n - 1)))
    const lo = Math.floor(q)
    bands.find((b) => b.ramp === ramp && b.lo === lo).cells.push([x, y, q - lo])
  }
  return bands
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Headless Chrome on a CDP port: { send, evaluate, close }. `args` ride on the command line. */
export async function browser(port, args = []) {
  const bin = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
    .filter(Boolean)
    .find((p) => existsSync(p))
  if (!bin) throw new Error('no chrome binary found; set CHROME_PATH')
  const profile = mkdtempSync(join(tmpdir(), 'textmode-bake-'))
  const chrome = spawn(
    bin,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-sandbox',
      '--enable-unsafe-swiftshader',
      '--force-color-profile=srgb',
      ...args,
      'about:blank',
    ],
    { stdio: 'ignore' }
  )
  const close = () => {
    chrome.kill()
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {
      /* best effort: chrome may still be writing its profile */
    }
  }
  let url
  for (let i = 0; i < 100 && !url; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      url = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl
    } catch {
      /* not listening yet */
    }
    if (!url) await sleep(200)
  }
  if (!url) {
    close()
    throw new Error(`chrome never opened its debugging port ${port}`)
  }
  const ws = new WebSocket(url)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (!m.id || !pending.has(m.id)) return
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
  })
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq
      pending.set(id, { res, rej })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400))
    return r.result.value
  }
  await send('Runtime.enable')
  return { send, evaluate, close }
}

/**
 * The sheet through textmode: `cols` x `rows` cells, `bands` from bandsOf,
 * on a page of the served origin (the modules are imported from it). A cell
 * in no band is left clear. Returns the picture as decoded RGBA, one px per
 * dot.
 */
export async function dither(evaluate, { cols, rows, bands }) {
  const png = await evaluate(`(async () => {
    const { textmode } = await import('/js/vendor/textmode/textmode.esm.js')
    const { loadFace, paint } = await import('/js/textmode-draw.js')
    const { PRESETS } = await import('multiplayer-canvas/dither')
    const LOOK = PRESETS.parts
    const CELL = ${CELL}
    const W = ${cols} * CELL
    const H = ${rows} * CELL
    const bands = ${JSON.stringify(bands)}
    // the sheet everything is cut into: clear where there is no picture
    const out = document.createElement('canvas')
    out.width = W
    out.height = H
    const o = out.getContext('2d')
    const img = o.createImageData(W, H)
    for (const band of bands) {
      if (!band.cells.length) continue
      // the band's source: each cell one grey, its brightness the distance
      // to the DARKER end, so the dots (the lighter grey, drawn over the
      // darker ground) come in as the cell moves toward the lighter end
      const src = document.createElement('canvas')
      src.width = W
      src.height = H
      const g = src.getContext('2d')
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, W, H)
      for (const [cx, cy, fr] of band.cells) {
        const v = Math.round(255 * (1 - fr))
        g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'
        g.fillRect(cx * CELL, cy * CELL, CELL, CELL)
      }
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      canvas.style.cssText = 'position:fixed;left:0;top:0'
      document.body.append(canvas)
      const tm = textmode.create({ canvas, pixelDensity: 1, fontSize: LOOK.fontSize, loadingScreen: { transition: 'none' } })
      const settings = { ...LOOK, charColor: band.light, cellColor: band.dark, background: band.dark }
      let source = null
      tm.setup(async () => {
        await loadFace(tm, LOOK.fontId)
        source = tm.createTexture(src)
      })
      await new Promise((done) => {
        let frames = 0
        tm.draw(() => {
          paint(tm, source, settings, false)
          if (source && ++frames === 4) done()
        })
      })
      await new Promise((r) => requestAnimationFrame(r))
      const read = document.createElement('canvas')
      read.width = W
      read.height = H
      const r = read.getContext('2d')
      r.drawImage(canvas, 0, 0)
      const frame = r.getImageData(0, 0, W, H).data
      for (const [cx, cy] of band.cells)
        for (let y = cy * CELL; y < (cy + 1) * CELL; y++)
          for (let x = cx * CELL; x < (cx + 1) * CELL; x++) {
            const i = (y * W + x) * 4
            img.data[i] = frame[i]
            img.data[i + 1] = frame[i + 1]
            img.data[i + 2] = frame[i + 2]
            img.data[i + 3] = 255
          }
      tm.destroy()
      canvas.remove()
    }
    o.putImageData(img, 0, 0)
    return out.toDataURL('image/png')
  })()`)
  return decodePng(Buffer.from(png.split(',')[1], 'base64'))
}

/**
 * A flat picture (type, blocks of token colour) onto the ramp: every opaque
 * px to the nearest of `colours` (hex). Nothing is dithered: a px between
 * two colours is an edge, and an edge picks a side.
 */
export function onRamp(rgba, colours) {
  const inks = colours.map(hexToRgb)
  const out = Buffer.from(rgba)
  for (let i = 0; i < out.length; i += 4) {
    if (!out[i + 3]) continue
    let best = inks[0]
    let bestD = Infinity
    for (const c of inks) {
      const d = (out[i] - c[0]) ** 2 + (out[i + 1] - c[1]) ** 2 + (out[i + 2] - c[2]) ** 2
      if (d < bestD) [best, bestD] = [c, d]
    }
    out[i] = best[0]
    out[i + 1] = best[1]
    out[i + 2] = best[2]
    out[i + 3] = 255
  }
  return out
}
