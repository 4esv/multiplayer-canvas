// scripts/verify/page-presence.mjs
// BIBLE.md section 2, in a real browser: TWO READERS OF ONE PAGE SEE EACH
// OTHER ON THE SAME BLOCK.
//
// The pure guards hold the arithmetic (test/presence.test.js: an anchor
// taken on one column names the same fraction of the same block on
// another) and the wire (a page's frame goes to the readers of that page).
// Between them sits the seam nothing pure can see: the sheet as Chrome
// lays it out at a phone's width and at a desktop's, the pointer event,
// the socket, the other tab's cursor layer, and whether the hand painted
// on the other screen is on the block the first one pointed at.
//
// So: two tabs on the same /work/<slug>, one 390 wide and one 1280, in TWO
// browsers, because a headless Chrome keeps one tab visible and a hidden
// tab has no animation frames, so it never pumps its pointer. Each
// moves its pointer onto a block of its own; each must then draw the other
// on that block's box, on its own screen. Then the phone scrolls to the
// foot of the page and the desktop's hand, now above what it can see, must
// have become the edge marker at the top.
//
// Runs against a served site (`PORT=3327 node src/server.js` locally).
// Usage:
//   node scripts/verify/page-presence.mjs [baseUrl] [slug]
//   SHOTS=dir   also writes a screenshot of each tab there
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const SLUG = process.argv[3] || process.env.SLUG || 'nao'
// two browsers, two ports
const PORT = Number(process.env.CDP_PORT || 9223)
const PORTS = [PORT, PORT + 1]
const SHOTS = process.env.SHOTS || ''

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!CHROME) {
  console.error('no chrome binary found; set CHROME_PATH')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browsers = PORTS.map((port) => {
  const profile = mkdtempSync(join(tmpdir(), 'page-presence-'))
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      'about:blank',
    ],
    { stdio: 'ignore' }
  )
  return { port, profile, chrome }
})
function cleanup(code) {
  for (const b of browsers) {
    try {
      b.chrome.kill()
    } catch {
      /* already gone */
    }
    try {
      rmSync(b.profile, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
  process.exit(code)
}

// one debugger session per browser's page: two sockets, two evaluate()s
async function pageOf(port) {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* not listening yet */
    }
    await sleep(200)
  }
  throw new Error(`chrome never opened a debugging port on ${port}`)
}
async function session(name, wsUrl) {
  const ws = new WebSocket(wsUrl)
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
  // a call that never answers names itself instead of hanging the run
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq
      const t = setTimeout(() => {
        pending.delete(id)
        rej(new Error(`${name}: ${method} never answered: ${JSON.stringify(params).slice(0, 80)}`))
      }, 10000)
      pending.set(id, {
        res: (v) => {
          clearTimeout(t)
          res(v)
        },
        rej: (e) => {
          clearTimeout(t)
          rej(e)
        },
      })
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
  await send('Page.enable')
  await send('Runtime.enable')
  return { send, evaluate }
}

const failures = []
const stage = (m) => console.error('  .. ' + m)
const fail = (msg) => {
  console.error('FAIL ' + msg)
  failures.push(msg)
}
// poll a tab until an expression is truthy, or give up
async function until(tab, expr, ms = 6000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = await tab.evaluate(expr)
    if (v) return v
    await sleep(100)
  }
  return null
}

// the block a tab points at, its box, and where the other tab is drawn
const BLOCKS = `__lab.blocks()`
// scroll a block to the middle of the screen and wait for it to stop
// moving: the sheet scrolls smoothly, so a box read right after the write
// is a box in flight. scrollTop rather than scrollIntoView, whose promise
// an evaluate would wait on.
async function settle(tab, i) {
  const now = (await tab.evaluate(BLOCKS))[i]
  if (!now) return null
  await tab.evaluate(
    `document.getElementById('mscroll').scrollTop += ${now.y + now.h / 2} - innerHeight / 2; 'ok'`
  )
  let last = null
  for (let k = 0; k < 20; k++) {
    await sleep(150)
    const b = (await tab.evaluate(BLOCKS))[i]
    if (last && Math.abs(b.y - last.y) < 0.5) return b
    last = b
  }
  return last
}
const PEERS = `__lab.peers()`

try {
  const [first, second] = await Promise.all(PORTS.map(pageOf))
  stage('both browsers up')
  const tabs = [
    { name: 'phone', w: 390, h: 844, mobile: true, dpr: 3, url: first.webSocketDebuggerUrl },
    { name: 'desktop', w: 1280, h: 800, mobile: false, dpr: 1, url: second.webSocketDebuggerUrl },
  ]
  for (const t of tabs) {
    Object.assign(t, await session(t.name, t.url))
    stage(`${t.name}: session open`)
    await t.send('Emulation.setDeviceMetricsOverride', {
      width: t.w,
      height: t.h,
      deviceScaleFactor: t.dpr,
      mobile: t.mobile,
    })
    await t.send('Page.navigate', { url: `${BASE}/work/${SLUG}` })
  }
  await sleep(3000)
  stage('both navigated')
  for (const t of tabs) {
    stage(`${t.name}: waiting for the sheet`)
    const ready = await until(
      t,
      'typeof window.__lab === "object" && __lab.fan.sheet === ' + JSON.stringify(SLUG)
    )
    if (!ready) fail(`${t.name}: the sheet for ${SLUG} never booted at ${BASE}`)
  }
  if (failures.length) cleanup(1)
  // the room: each tab must know of the other before anything is pointed
  for (const t of tabs) {
    stage(`${t.name}: waiting for company`)
    const seen = await until(t, `${PEERS}.length >= 1`)
    if (!seen) fail(`${t.name}: never saw the other tab join the room`)
  }
  if (failures.length) cleanup(1)

  // each tab points at a block of its own, deep enough into the prose that
  // the two are on different screens of it, each a third across and two
  // thirds down
  const picks = [
    [tabs[0], 4],
    [tabs[1], 8],
  ]
  const blocksOf = {}
  for (const [t, i] of picks) {
    stage(`${t.name}: pointing at block ${i}`)
    const blocks = await t.evaluate(BLOCKS)
    blocksOf[t.name] = blocks
    const b = blocks[i]
    if (!b || !b.h) {
      fail(`${t.name}: block ${i} is missing or empty (${blocks.length} blocks)`)
      continue
    }
    // scroll it to the middle first, then point at it: the anchor is taken
    // where the pointer is, and a block off screen has no box under it
    const after = await settle(t, i)
    blocksOf[t.name] = await t.evaluate(BLOCKS)
    const x = after.x + after.w / 3
    const y = after.y + (after.h * 2) / 3
    if (y < 0 || y > t.h || x < 0 || x > t.w) {
      fail(
        `${t.name}: block ${i} did not come on screen (aim ${x.toFixed(0)},${y.toFixed(0)} in ${t.w}x${t.h})`
      )
      continue
    }
    await t.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await sleep(60)
    await t.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 1, y })
  }
  await sleep(600)

  // now each tab must draw the other on the block the other pointed at,
  // inside that block's box on ITS OWN screen
  for (const [pointer, i] of picks) {
    const viewer = tabs.find((t) => t !== pointer)
    const at = `${SLUG}#${i}`
    const seen = await until(
      viewer,
      `${PEERS}.some(p => p.at === ${JSON.stringify(at)} && p.layer === 'pcursors' && p.x !== null)`
    )
    if (!seen) {
      const peers = await viewer.evaluate(PEERS)
      fail(
        `${viewer.name} never drew the ${pointer.name} on ${at}; it sees ${JSON.stringify(peers)}`
      )
      continue
    }
    // the viewer brings that block to the middle of its own screen, where
    // the hand must be inside its box (off screen it is an edge marker,
    // which the last step holds)
    const box = await settle(viewer, i)
    await sleep(400) // the ease settles
    const peers = await viewer.evaluate(PEERS)
    const p = peers.find((q) => q.at === at)
    // the element is seated on its hot spot (presence.js TIP), so the tip
    // is the element's corner plus that; a few px of ease is allowed
    const tipX = p.x + 6
    const tipY = p.y + 3
    const inside =
      tipX >= box.x - 2 &&
      tipX <= box.x + box.w + 2 &&
      tipY >= box.y - 2 &&
      tipY <= box.y + box.h + 2
    const fx = (tipX - box.x) / box.w
    const fy = (tipY - box.y) / box.h
    console.log(
      `  ${viewer.name.padEnd(8)} sees the ${pointer.name.padEnd(8)} on ${at} at (${tipX.toFixed(0)}, ${tipY.toFixed(0)}) = ${(fx * 100).toFixed(0)}% across, ${(fy * 100).toFixed(0)}% down its block ${box.tag} ${box.w.toFixed(0)}x${box.h.toFixed(0)}`
    )
    if (!inside) fail(`${viewer.name}: the ${pointer.name}'s hand is outside block ${i}'s box`)
    // a third across, two thirds down, as pointed: the box is a different
    // shape on this screen and the fraction must still be the fraction
    if (Math.abs(fx - 1 / 3) > 0.08 || Math.abs(fy - 2 / 3) > 0.08)
      fail(
        `${viewer.name}: the ${pointer.name}'s hand is at ${(fx * 100).toFixed(0)}%/${(fy * 100).toFixed(0)}% of the block, not a third across and two thirds down`
      )
    if (p.edge)
      fail(
        `${viewer.name}: the ${pointer.name}'s hand is an edge marker (${p.edge}) while its block is on screen`
      )
  }

  // the edge: the phone scrolls to the foot; the desktop's block is now
  // above what it can see, so the hand becomes the marker at the top
  const phone = tabs[0]
  await phone.evaluate(`document.getElementById('mscroll').scrollTop = 1e6`)
  await sleep(1200)
  const edged = await until(
    phone,
    `${PEERS}.some(p => p.at === ${JSON.stringify(SLUG + '#8')} && /edge-up/.test(p.edge))`
  )
  if (!edged) {
    const peers = await phone.evaluate(PEERS)
    fail(
      `phone: scrolled past the desktop's block, its hand did not become the top edge marker: ${JSON.stringify(peers)}`
    )
  } else {
    const p = (await phone.evaluate(PEERS)).find((q) => q.at === `${SLUG}#8`)
    console.log(
      `  phone    scrolled to the foot: the desktop's hand is the top edge marker at y=${p.y.toFixed(0)}`
    )
    if (p.y > 2) fail(`phone: the edge marker sits at y=${p.y}, not on the top edge`)
  }
  await settle(phone, 8)
  await sleep(500)

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    for (const t of tabs) {
      const shot = await t.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(SHOTS, `page-presence-${t.name}.png`), Buffer.from(shot.data, 'base64'))
    }
    console.log(`  screenshots in ${SHOTS}`)
  }
} catch (e) {
  fail(`the check itself threw: ${e.message}`)
}

if (failures.length) {
  console.error(`\npage-presence: ${failures.length} failure(s)`)
  cleanup(1)
}
console.log('\npage-presence: two widths, one page, each on the other’s block')
cleanup(0)
