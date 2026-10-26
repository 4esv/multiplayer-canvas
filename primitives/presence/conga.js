// multiplayer-canvas/presence/conga: who follows whom, drawn as a line walking the leader path a
//   beat later.
// Inputs: entries { id, f (followed id or null), fs } and per-peer position histories.
// Outputs: linesOf(entries) -> Map(head -> ids behind it); record and sampleAt for the trailing path. Pure.
//
// THE CONGA (2026-09-25). Who follows whom is on the wire now (the move
// frame's `f`, primitives/presence/presence-protocol.js), so every tab can draw a follower
// where following puts it: in line behind the one it follows, walking the
// same path a beat later. This module is the arithmetic of that and nothing
// else: pure, so the line can be held in a test with hands written by hand.
//
// A LINE, NOT A TREE. Following somebody who is following somebody else
// puts you in the same line, behind everyone already in it. The wire says
// whom you picked (your camera goes where they go, follow.js), and the
// drawing flattens that to the head of the chain, because two dancers who
// picked different people in one line would otherwise be drawn on the same
// spot of the same path. Order in the line is the order the room saw people
// join it (`fs`, the room's follow sequence), so every tab draws the same
// line in the same order.
//
// A PATH, NOT A SPRING. Each dancer is where the head WAS, one beat per place
// in line, read off the head's own recorded path. A spring toward the one in
// front cuts corners and bunches up when the head stops; a path does
// neither.
//
// AND THE PATH KEEPS ITS OWN CLOCK. A beat is a beat of the head's MOVING,
// not of the wall: the path is recorded only when the head goes somewhere,
// and each point carries `m`, the time the head has spent moving so far. A
// line reads its beats back from the newest point's `m`, so a head that
// stops keeps its line strung out behind it, still, the way it came in,
// rather than the whole line walking on into the head and stacking on it
// (which is what a wall clock did: the first live check measured every
// dancer at 0px from a resting head). A long pause counts as one short
// step, so the line picks up where it left off when the head moves again.

// one beat: how far behind the one in front each place in the line walks
export const GAP_MS = 320
// how much of a head's path is kept, in moving time: enough for a long
// line, and the line past it waits at the oldest point rather than vanishing
// seam: test/session-client.test.js
export const TRAIL_MS = 10000
// the most one gap between two recorded points adds to the path's clock: a
// head that pauses for a minute has moved for a moment, not a minute
const STEP_MS = 100

/**
 * Group followers into lines.
 * @param {{id:number, f:number|null, fs:number}[]} entries everyone in the room, this tab included
 * @returns {Map<number, number[]>} the head of each line -> the ids behind it, in joining order
 *
 * A follower whose chain leads to nobody in the room is in no line (it is
 * drawn where its own hand is). A chain that loops (two people following
 * each other) has no head; the lowest id in the loop is taken as one, so
 * the loop is still a line and still the same line on every tab.
 */
export function linesOf(entries) {
  const by = new Map(entries.map((e) => [e.id, e]))
  const headOf = (id) => {
    const seen = new Set()
    let cur = id
    while (true) {
      seen.add(cur)
      const e = by.get(cur)
      const next = e && e.f
      if (!next || !by.has(next)) return cur === id ? null : cur
      if (seen.has(next)) {
        // a loop: its lowest id heads it, and that one walks alone
        const loop = [...seen].slice([...seen].indexOf(next))
        const low = Math.min(...loop)
        return low === id ? null : low
      }
      cur = next
    }
  }
  const lines = new Map()
  for (const e of entries) {
    if (!e.f) continue
    const head = headOf(e.id)
    if (head === null || head === e.id) continue
    if (!lines.has(head)) lines.set(head, [])
    lines.get(head).push(e.id)
  }
  for (const ids of lines.values())
    ids.sort((a, b) => (by.get(a).fs || 0) - (by.get(b).fs || 0) || a - b)
  return lines
}

// the short way round the ring, as the canvas's own cursors ease (presence.js)
const ring = (a, b, t) => {
  let d = b - a
  if (d > 0.5) d -= 1
  else if (d < -0.5) d += 1
  return (((a + d * t) % 1) + 1) % 1
}

/**
 * Where a recorded path was, some moving time back from its newest point.
 * @param {{m:number, x:number, y:number, at:string|null}[]} hist oldest first
 * @param {number} back how far behind the head, in ms of its moving
 * @returns {{x:number, y:number, at:string|null}|null} null for an empty path
 *
 * Between two points on the same ground it is the point between them: on
 * the ground the short way round the ring, on a page a straight line inside
 * the block. Two points on different grounds (a page opened between them)
 * are not a line, so the older one stands until the newer is reached.
 * Before the oldest point the oldest stands: the back of a long line waits
 * where the path begins rather than being nowhere.
 */
export function sampleAt(hist, back) {
  if (!hist.length) return null
  const last = hist[hist.length - 1]
  const t = last.m - back
  if (t <= hist[0].m) return pick(hist[0])
  if (t >= last.m) return pick(last)
  let lo = 0
  let hi = hist.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (hist[mid].m <= t) lo = mid
    else hi = mid
  }
  const a = hist[lo]
  const b = hist[hi]
  if (a.at !== b.at) return pick(a)
  const k = b.m === a.m ? 0 : (t - a.m) / (b.m - a.m)
  if (a.at) return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, at: a.at }
  return { x: ring(a.x, b.x, k), y: ring(a.y, b.y, k), at: null }
}
const pick = (p) => ({ x: p.x, y: p.y, at: p.at })

/**
 * Record where the head is, if it went anywhere, and forget what is older
 * than the trail.
 * @param {{t:number, m:number, x:number, y:number, at:string|null}[]} hist mutated
 * @param {number} t the wall clock
 * @param {number} x
 * @param {number} y
 * @param {string|null} at
 */
export function record(hist, t, x, y, at) {
  at = at ?? null
  const last = hist[hist.length - 1]
  // standing still is not a step: the path, and its clock, wait
  if (last && last.at === at && Math.abs(last.x - x) < 1e-5 && Math.abs(last.y - y) < 1e-5) {
    last.t = t
    return
  }
  const m = last ? last.m + Math.min(STEP_MS, Math.max(0, t - last.t)) : 0
  hist.push({ t, m, x, y, at })
  let drop = 0
  // keep one point older than the window, so a sample at its far edge
  // still has something to stand on
  while (drop + 1 < hist.length && hist[drop + 1].m < m - TRAIL_MS) drop++
  if (drop) hist.splice(0, drop)
}
