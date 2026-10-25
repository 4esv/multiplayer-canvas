// test/mirror.test.js
// A cut tile's copy is the same tile NOW (canvas/mirror.js, BIBLE.md
// section 2). The copies of the old fake were cloned once and froze: a live
// widget across the seam showed a stale twin. These drive the mirror on a
// minimal fake DOM, so a copy that stops repainting, stops following a
// change, or keeps a name the real node answers to turns this red.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createMirror } from '../primitives/mirror.js'

// a canvas whose pixels are a version number: drawImage copies it
class Canvas {
  constructor() {
    this.tag = 'canvas'
    this.width = 8
    this.height = 8
    this.px = 0
    this.attrs = {}
    this.children = []
  }
  getContext() {
    return {
      clearRect: () => {
        this.px = 0
      },
      drawImage: (src) => {
        this.px = src.px
      },
    }
  }
  cloneNode() {
    // a real cloneNode copies the box, never the pixels
    const c = new Canvas()
    c.width = this.width
    c.height = this.height
    c.attrs = { ...this.attrs }
    return c
  }
}
class El {
  constructor(tag = 'div', attrs = {}, children = []) {
    this.tag = tag
    this.attrs = { ...attrs }
    this.children = children
    this.style = { cssText: '', transform: '' }
    this.dataset = {}
    this.classes = new Set()
    this.classList = { add: (c) => this.classes.add(c) }
    this.inert = false
    this.isConnected = true
    this.parent = null
    this.text = ''
  }
  setAttribute(k, v) {
    this.attrs[k] = v
  }
  removeAttribute(k) {
    delete this.attrs[k]
  }
  all() {
    return this.children.flatMap((c) => [c, ...(c.all ? c.all() : [])])
  }
  querySelectorAll(sel) {
    if (sel === 'canvas') return this.all().filter((c) => c.tag === 'canvas')
    return this.all().filter((c) => 'id' in c.attrs || 'data-hk' in c.attrs)
  }
  cloneNode() {
    const c = new El(
      this.tag,
      this.attrs,
      this.children.map((k) => k.cloneNode(true))
    )
    c.text = this.text
    c.dataset = { ...this.dataset }
    return c
  }
  appendChild(c) {
    c.parent = this
    this.children.push(c)
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this)
    this.parent = null
  }
  replaceWith(c) {
    const i = this.parent.children.indexOf(this)
    c.parent = this.parent
    this.parent.children[i] = c
    this.parent = null
  }
}

function rig() {
  const scene = new El('div')
  const sky = new Canvas()
  const row = new El('span', { 'data-hk': 'recent#0', id: 'r0' })
  const node = new El('div', { id: 'weather', 'data-hk': 'weather' }, [sky, row])
  node.dataset.hk = 'weather'
  node.style.cssText = 'width: 432px; height: 432px'
  scene.appendChild(node)
  let changed = null
  let watching = 0
  const mirror = createMirror({
    parent: scene,
    observe(n, cb) {
      watching++
      changed = cb
      return { disconnect: () => watching-- }
    },
  })
  const copies = () => scene.children.filter((c) => c !== node)
  return {
    scene,
    node,
    sky,
    row,
    mirror,
    copies,
    change: () => changed?.(),
    watching: () => watching,
  }
}

describe('a cut tile is mirrored live', () => {
  it('copies only the spots past the node, inert, hidden, and with no names of its own', () => {
    const { node, mirror, copies } = rig()
    mirror.sync(node, [[10, 20]])
    assert.equal(copies().length, 0, 'a tile that is not cut has no copy')
    mirror.sync(node, [
      [10, 20],
      [-3830, 20],
    ])
    assert.equal(copies().length, 1)
    const [c] = copies()
    assert.equal(c.inert, true)
    assert.equal(c.attrs['aria-hidden'], 'true')
    assert.ok(!('id' in c.attrs) && !('data-hk' in c.attrs), 'the copy answers to the node name')
    assert.equal(c.querySelectorAll('[id],[data-hk]').length, 0, 'a row inside keeps its name')
    assert.equal(c.dataset.copyOf, 'weather')
    assert.equal(c.style.transform, 'translate(-3830px,20px)')
    mirror.sync(node, [[10, 20]])
    assert.equal(copies().length, 0, 'the copy goes when the cut does')
  })

  // mutation: mirror.canvas-frozen
  it('repaints a copy canvas every frame the original has moved on', () => {
    const { node, sky, mirror, copies } = rig()
    sky.px = 1
    mirror.sync(node, [
      [0, 0],
      [-3800, 0],
    ])
    const copySky = () => copies()[0].querySelectorAll('canvas')[0]
    assert.equal(copySky().px, 1, 'a new copy starts on the picture the node shows')
    for (const v of [2, 3, 4]) {
      sky.px = v
      mirror.frame()
      assert.equal(copySky().px, v, `frame ${v}: the copy shows a stale sky`)
    }
  })

  // mutation: mirror.dom-frozen
  it('re-clones a copy when the node changes, and follows the node box', () => {
    const { node, row, mirror, copies, change } = rig()
    mirror.sync(node, [
      [0, 0],
      [0, -2100],
    ])
    row.text = 'Temperature, Sean Paul'
    change()
    node.style.cssText = 'width: 432px; height: 432px; visibility: hidden'
    mirror.frame()
    const c = copies()[0]
    assert.equal(c.children[1].text, 'Temperature, Sean Paul', 'the copy still shows the old row')
    assert.match(c.style.cssText, /visibility: hidden/)
    assert.equal(c.style.transform, 'translate(0px,-2100px)')
    assert.equal(copies().length, 1)
  })

  it('lets go of a node that left, and stops watching it', () => {
    const { node, mirror, copies, watching } = rig()
    mirror.sync(node, [
      [0, 0],
      [5, -2100],
    ])
    assert.equal(watching(), 1)
    node.isConnected = false
    mirror.frame()
    assert.equal(copies().length, 0)
    assert.equal(watching(), 0)
    assert.deepEqual(mirror.copiesOf(node), [])
  })

  // mutation: mirror.frame-not-called
  it('runs every frame of the canvas loop, not only when the camera moves', () => {
    const app = readFileSync(join(import.meta.dirname, '..', 'src/static/canvas/app.js'), 'utf8')
    const tick = app.slice(
      app.indexOf('function tick(){'),
      app.indexOf('requestAnimationFrame(tick);')
    )
    assert.match(tick, /\n {2}mirror\.frame\(\);/, 'tick() does not drive the mirror')
  })
})
