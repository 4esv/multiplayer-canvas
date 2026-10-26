// multiplayer-canvas/sky/server: the one shared push on the sky: any visitor nudges the clouds for
//   everyone.
// Inputs: startSky(), pushSky(dx, dy), watchSky(socket, on).
// Outputs: the push offset, sprung home on a server clock and published to the room. Node.
//
// The window's one shared push. The weather tile's
// clouds (and only its clouds; never its sun or moon) answer a hand, and the room
// sees one sky: the offset lives here, a push from any participant moves
// it, and the spring that brings it home is stepped on this clock. The
// arithmetic is primitives/sky/outlook.js, shared with the browser.
//
// THE WIRE IS THE SLIME'S (primitives/slime/slime.js), read first and
// kept: the same /ws/cursors socket, the same `watch` frame (with
// of:'sky'), frames only to the tabs that said they can see the tile, a
// fresh watcher owed one frame at once, the ask floored per socket. What
// differs is the size of the picture. The sky's state is two whole numbers,
// so a keyframe and a delta are the same frame, and the delta rule becomes
// "only when the cells change": a sky at rest sends nothing to anybody,
// watching or not, and a room nobody watches is sent nothing at all.
//
// Nothing persists. A restart is a sky at rest, which is what it always
// comes back to anyway.
import { STEP_MS, createPush, shove, settle, cellsOf } from './outlook.js'
import { SERVER_PUSH } from '../presence/wire.js'
import { presenceRoom } from '../presence/presence-room.js'

// the spring steps on the window's own step, so a frame is a step
// seam: test/sky.test.js
export const TICK_MS = STEP_MS
// seam: test/sky.test.js
export const KEY_GATE_MS = 1000

const push = createPush()
let timer = null
// socket -> the clock at its last keyframe, 0 while it is FRESH (owed one)
const watchers = new Map()
// the cells the room last sent, which every non-fresh watcher holds
let sent = '0,0'

/**
 * A participant's push, whole cells either way; the route has parsed and
 * capped it. Lands on the next step.
 */
export function pushSky(dx, dy) {
  shove(push, dx, dy)
}

/**
 * A tab says whether it can see the window: on makes it fresh (one frame
 * at once), off takes it out. Floored per socket like the slime's.
 * @param {object} socket
 * @param {boolean} on
 * @param {number} [now] server ms (tests pass their own clock)
 */
export function watchSky(socket, on, now = Date.now()) {
  if (!on) {
    watchers.delete(socket)
    return
  }
  const keyed = watchers.get(socket)
  if (keyed === undefined || now - keyed >= KEY_GATE_MS) watchers.set(socket, 0)
}
// seam: test/sky.test.js
export const skyWatchers = () => watchers.size

function tick(now = Date.now()) {
  settle(push)
  const cells = cellsOf(push)
  const key = cells.join(',')
  const changed = key !== sent
  sent = key
  if (!watchers.size) return
  const out = []
  for (const [s, keyedAt] of watchers) if (changed || !keyedAt) out.push(s)
  if (!out.length) return
  presenceRoom.sendTo(out, { type: SERVER_PUSH.sky, x: cells[0], y: cells[1] })
  for (const s of out) if (!watchers.get(s)) watchers.set(s, now || 1)
}

/** Start the clock (idempotent). Called from server start, not from build. */
export function startSky() {
  if (timer) return
  timer = setInterval(() => tick(), TICK_MS)
  timer.unref?.()
}

// the test seam: step the shared sky by hand, with a clock of the test's
export const _sky = { push, tick }
