// multiplayer-canvas/mirror: the other half of a tile the view edge cuts on a wrapped world: a
//   live, inert copy at the opposite edge.
// Inputs: createMirror({ parent, observe }) with the layer to add copies to and an observe(node,
//   cb) that returns { disconnect }.
// Outputs: a handle { sync, drop, frame, copiesOf } that places, repaints and removes the copies.
//   DOM, but no globals, so tests drive it on fakes.
//
// canvas/mirror.js
// THE OTHER HALF OF A CUT TILE (BIBLE.md section 2, the honest torus).
//
// Out at cover the view is as long as the world on one axis, so a tile the
// view's edge cuts comes back in at the opposite edge: the part that ran off
// one side is the part that shows on the other. The node can only stand in
// one place, so the other part is a COPY, and a copy is only honest if it is
// the same tile right now. The first copies were cloned once and left: a
// live widget held across the seam showed a stale twin until the camera
// moved. A copy here never goes stale:
//   - every frame it has copies, each canvas in the node is drawn into the
//     same canvas of every copy (the weather, the slime: whatever painted it)
//   - any change to the node's DOM (a new phrase, a turned record, a peer's
//     hover class) re-clones its copies on the next frame
//   - the node's own box (width, height, visibility) rides every frame
// Copies are paint, never interface: inert, aria-hidden, no ids, no data-hk,
// so a peer's hover, a search and the tab order all find the one real node.
// A pointer on a copy does nothing, which is the one thing it cannot share.
//
// No DOM globals: the caller hands in the parent and an observe(node, cb)
// that returns something with disconnect(), so the test drives it on fakes.
// seam: test/mirror.test.js
export function createMirror({ parent, observe }) {
  const held = new Map() // node -> { copies, dirty, watch }

  function dress(node) {
    const c = node.cloneNode(true)
    c.inert = true
    c.setAttribute('aria-hidden', 'true')
    // the names a peer's hover, a lookup or a label resolve by stay unique
    for (const el of [c, ...c.querySelectorAll('[id],[data-hk]')]) {
      el.removeAttribute('id')
      el.removeAttribute('data-hk')
    }
    c.classList.add('wrap-copy')
    c.dataset.copyOf = node.dataset.hk || ''
    return c
  }
  function paint(node, copy) {
    const src = node.querySelectorAll('canvas')
    const dst = copy.querySelectorAll('canvas')
    if (src.length !== dst.length) return false
    for (let i = 0; i < src.length; i++) {
      const s = src[i],
        d = dst[i]
      if (d.width !== s.width) d.width = s.width
      if (d.height !== s.height) d.height = s.height
      const g = d.getContext('2d')
      if (!g) continue
      g.clearRect(0, 0, d.width, d.height)
      try {
        g.drawImage(s, 0, 0)
      } catch {
        /* a canvas with nothing drawn yet has nothing to copy */
      }
    }
    return true
  }
  function seat(node, copy, [x, y]) {
    copy.style.cssText = node.style.cssText
    copy.style.transform = `translate(${x}px,${y}px)`
  }

  // the node shows at spots[0] itself; every other spot gets a copy
  function sync(node, spots) {
    const extra = spots.slice(1)
    let h = held.get(node)
    if (!extra.length) {
      if (h) drop(node)
      return
    }
    if (!h) {
      h = { copies: [], dirty: false, watch: null, spots: extra }
      h.watch = observe(node, () => {
        h.dirty = true
      })
      held.set(node, h)
    }
    h.spots = extra
    while (h.copies.length < extra.length) {
      const c = dress(node)
      parent.appendChild(c)
      paint(node, c)
      h.copies.push(c)
    }
    while (h.copies.length > extra.length) h.copies.pop().remove()
    h.copies.forEach((c, i) => seat(node, c, extra[i]))
  }
  function drop(node) {
    const h = held.get(node)
    if (!h) return
    h.watch?.disconnect()
    for (const c of h.copies) c.remove()
    held.delete(node)
  }
  // once a frame: the copies catch up with whatever the node did since
  function frame() {
    for (const [node, h] of held) {
      if (node.isConnected === false) {
        drop(node)
        continue
      }
      if (h.dirty) {
        h.dirty = false
        h.copies = h.copies.map((old) => {
          const c = dress(node)
          old.replaceWith(c)
          return c
        })
      }
      h.copies.forEach((c, i) => {
        seat(node, c, h.spots[i])
        if (!paint(node, c)) h.dirty = true
      })
    }
  }
  const copiesOf = (node) => held.get(node)?.copies || []
  return { sync, drop, frame, copiesOf }
}
