// test/lib/img-version.test.js
// The hash is the file's, and a re-bake moves it. Against a
// temp /img root, so a byte change is something this test can make.
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import site from '../../site.config.js'

// Env before import: config.js freezes at module load.
const ROOT = mkdtempSync(join(tmpdir(), 'img-version-'))
process.env.CONTENT_IMAGE_DIR = ROOT
mkdirSync(join(ROOT, 'canvas'), { recursive: true })
writeFileSync(join(ROOT, 'canvas', 'shot.png'), 'old picture')

const { imgManifest, imgUrl, imgVersion, versionImgs } =
  await import('../../src/lib/img-version.js')

after(() => rmSync(ROOT, { recursive: true, force: true }))

const hash8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8)

describe('imgVersion', () => {
  it('is the first 8 hex of the sha256 of the bytes', () => {
    assert.equal(imgVersion('canvas/shot.png'), hash8('old picture'))
  })

  it('moves when the bytes do, without a restart', () => {
    const before = imgUrl('/img/canvas/shot.png')
    writeFileSync(join(ROOT, 'canvas', 'shot.png'), 'new picture, same name')
    // a re-bake inside the same mtime tick still changes the size
    const after = imgUrl('/img/canvas/shot.png')
    assert.notEqual(after, before)
    assert.equal(after, `/img/canvas/shot.png?v=${hash8('new picture, same name')}`)
  })

  it('sees a same-size re-bake once the mtime moves', () => {
    writeFileSync(join(ROOT, 'canvas', 'shot.png'), 'NEW PICTURE, SAME NAME')
    utimesSync(join(ROOT, 'canvas', 'shot.png'), new Date(), new Date(Date.now() + 5000))
    assert.equal(imgVersion('canvas/shot.png'), hash8('NEW PICTURE, SAME NAME'))
  })

  it('names nothing for a missing file, a climb out of the root, or the art proxy', () => {
    assert.equal(imgVersion('canvas/nope.png'), null)
    assert.equal(imgVersion('../etc/passwd'), null)
    assert.equal(imgVersion('art/i/image/abc.jpg'), null)
  })
})

describe('imgUrl and versionImgs', () => {
  const v = () => imgVersion('canvas/shot.png')

  it('versions a root-relative and an absolute URL alike', () => {
    assert.equal(imgUrl('/img/canvas/shot.png'), `/img/canvas/shot.png?v=${v()}`)
    assert.equal(
      imgUrl(`${site.url}/img/canvas/shot.png`),
      `${site.url}/img/canvas/shot.png?v=${v()}`
    )
  })

  it('leaves a URL with a query, or one that names no file, as it was', () => {
    assert.equal(imgUrl('/img/canvas/shot.png?v=abc'), '/img/canvas/shot.png?v=abc')
    assert.equal(imgUrl('/img/canvas/nope.png'), '/img/canvas/nope.png')
  })

  it('rewrites every /img URL in markup, once', () => {
    const html = '<img src="/img/canvas/shot.png"><video poster="/img/canvas/shot.png">'
    const once = versionImgs(html)
    assert.equal(once.split(`/img/canvas/shot.png?v=${v()}"`).length - 1, 2)
    assert.equal(versionImgs(once), once)
  })

  it('maps every picture under the root for the canvas', () => {
    assert.deepEqual(imgManifest(), { 'canvas/shot.png': `/img/canvas/shot.png?v=${v()}` })
  })
})
