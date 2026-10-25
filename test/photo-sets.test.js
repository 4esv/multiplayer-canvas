// test/photo-sets.test.js
// The photo-set content type, end to end, against a content tree built here.
//
// No photo set ships in content/feed/: the pictures and the words on this
// site are the author's, and a test is not the place to invent either. So this
// points CONTENT_DIR and CONTENT_IMAGE_DIR at temp directories (the same
// override the auth store carries for the same reason), fills
// them with one entry of every kind, and drives the real server: real
// routes, real sheet builders, real sitemap, real llms.txt.
//
// Building the whole tree rather than only the new kind is deliberate. The
// interesting failure when a fourth kind arrives is not "photos are broken",
// it is "photos work and articles quietly moved", so the older three are
// asserted here too, in a tree where the new one exists.
import site from '../site.config.js'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { tinyJpeg, tinyWebp } from './lib/exif-fixture.js'

// Env before import: config.js freezes at module load, and the server pulls
// it in transitively.
const CONTENT = mkdtempSync(join(tmpdir(), 'photoset-content-'))
const IMAGES = mkdtempSync(join(tmpdir(), 'photoset-img-'))
process.env.CONTENT_DIR = CONTENT
process.env.CONTENT_IMAGE_DIR = IMAGES

const STATIC = join(import.meta.dirname, '../src/static')

// The set mixes formats the way a folder off a phone and a laptop actually
// would. The PNG is a real file, so the size the markup states is one a real
// decoder agrees with. The tree ships no WebP or JPEG since its pictures
// went through the ditherer (which writes PNG), so those two are the
// containers crafted in test/lib/exif-fixture.js, sized by the same header
// reader the set uses.
const SOURCES = [
  ['01.png', 'img/og/default.png', 1200, 630],
  ['02.webp', tinyWebp, 3, 2],
  ['03.jpg', tinyJpeg, 3, 2],
]

const entry = (front) => `---\n${front}\n---\n`

mkdirSync(join(IMAGES, 'holiday'), { recursive: true })
mkdirSync(join(IMAGES, 'curated'), { recursive: true })
for (const [name, from] of SOURCES)
  for (const set of ['holiday', 'curated']) {
    const to = join(IMAGES, set, name)
    if (typeof from === 'function') writeFileSync(to, from())
    else copyFileSync(join(STATIC, from), to)
  }
// A stray non-image in the folder: the set is the pictures, not the folder.
writeFileSync(join(IMAGES, 'holiday', 'notes.txt'), 'not a picture')

writeFileSync(
  join(CONTENT, 'holiday.md'),
  entry('title: Holiday\ndate: 2026-08-01\ntype: photos\nsummary: A set of pictures.')
)
writeFileSync(
  join(CONTENT, 'curated.md'),
  entry(
    'title: Curated\ndate: 2026-07-01\ntype: photos\nsummary: A hand-ordered set.\n' +
      'photos:\n' +
      '  - src: 03.jpg\n    alt: the third one, described by hand\n' +
      '  - 01.png\n' +
      '  - src: 99.png\n    alt: a file that is not there'
  )
)
writeFileSync(
  join(CONTENT, 'a-study.md'),
  entry('title: A Study\ndate: 2026-06-01\ntype: case-study\nsummary: A case study.') + '\nBody.\n'
)
writeFileSync(
  join(CONTENT, 'an-essay.md'),
  entry('title: An Essay\ndate: 2026-05-01\nsummary: An essay.') + '\nBody.\n'
)
writeFileSync(
  join(CONTENT, 'a-toy.md'),
  entry('title: A Toy\ndate: 2026-04-01\nweb_only: true\nsummary: A toy.') + '\nBody.\n'
)
writeFileSync(
  join(CONTENT, 'elsewhere.md'),
  entry(
    'title: Elsewhere\ndate: 2026-03-01\nexternal_url: https://example.com/elsewhere\nsummary: Off site.'
  )
)

const { build } = await import('../src/server.js')

let app
before(async () => {
  app = await build({ logger: false })
})
after(async () => {
  await app.close()
  rmSync(CONTENT, { recursive: true, force: true })
  rmSync(IMAGES, { recursive: true, force: true })
})

// every /img URL carries its bytes' hash (issue #319); the pictures are named without it
const bare = (src) => src.replace(/\?v=[0-9a-f]{8}$/, '')
const V = '\\?v=[0-9a-f]{8}'

const get = (url, ua) => app.inject({ method: 'GET', url, headers: ua ? { 'user-agent': ua } : {} })

describe('a photo set is a page whose body is its pictures', () => {
  it('serves at /<slug>, root-mounted like the other canvas-native kinds', async () => {
    const r = await get('/holiday')
    assert.equal(r.statusCode, 200)
    assert.match(r.body, /<section class="photoset"/)
  })

  it('carries one slide per picture, in filename order', async () => {
    const r = await get('/holiday')
    const srcs = [...r.body.matchAll(/<img src="(\/img\/holiday\/[^"]+)"/g)].map((m) => bare(m[1]))
    assert.deepEqual(srcs, ['/img/holiday/01.png', '/img/holiday/02.webp', '/img/holiday/03.jpg'])
  })

  it('states each picture’s real size so the page does not jump as it loads', async () => {
    const r = await get('/holiday')
    for (const [name, , width, height] of SOURCES) {
      assert.ok(
        new RegExp(`src="/img/holiday/${name}${V}" alt=`).test(r.body) &&
          new RegExp(`/img/holiday/${name}${V}"[^>]*width="${width}" height="${height}"`).test(
            r.body
          ),
        `${name} should declare ${width}x${height}`
      )
    }
  })

  // mutation: photo-sets.second-picture-eager
  it('asks for the first picture and lazily for the rest', async () => {
    // A set of forty must not be forty downloads on open. The script
    // promotes neighbours from here.
    const r = await get('/holiday')
    assert.match(
      r.body,
      /\/img\/holiday\/01\.png\?v=\w{8}"[^>]*loading="eager" fetchpriority="high"/
    )
    assert.match(r.body, /\/img\/holiday\/02\.webp\?v=\w{8}"[^>]*loading="lazy"/)
    assert.match(r.body, /\/img\/holiday\/03\.jpg\?v=\w{8}"[^>]*loading="lazy"/)
  })

  it('ignores whatever else is in the folder', async () => {
    const r = await get('/holiday')
    assert.ok(!r.body.includes('notes.txt'))
  })

  it('brings its own stylesheet and script without frontmatter saying so', async () => {
    const r = await get('/holiday')
    assert.match(r.body, /<link rel="stylesheet" href="\/css\/photoset\.css" data-sheet-css>/)
    // a module: it imports the kit's walker (js/kit-scroll.js)
    assert.match(r.body, /<script type="module" src="\/js\/photoset\.js"><\/script>/)
  })

  it('arrives fully dressed (title, description, canonical)', async () => {
    const r = await get('/holiday')
    assert.ok(r.body.includes(`<title>Holiday · ${site.name}</title>`))
    assert.match(r.body, /<meta name="description" content="A set of pictures\.">/)
    assert.ok(r.body.includes(`<link rel="canonical" href="${site.url}/holiday">`))
  })

  it('301s its trailing slash like every other page', async () => {
    const r = await get('/holiday/')
    assert.equal(r.statusCode, 301)
    assert.equal(r.headers.location, '/holiday')
  })
})

describe('the carousel is operable, and says so to assistive tech', () => {
  let body
  before(async () => {
    body = (await get('/holiday')).body
  })

  it('names itself a carousel and labels the strip', () => {
    assert.match(body, /aria-roledescription="carousel" aria-label="Holiday"/)
    assert.match(
      body,
      /class="photoset-track" tabindex="0" role="group" aria-label="Holiday, 3 photos"/
    )
  })

  it('makes the scrolling region focusable (a scroller is a keyboard destination)', () => {
    assert.match(body, /class="photoset-track" tabindex="0"/)
  })

  it('numbers each slide', () => {
    for (const n of [1, 2, 3]) {
      assert.ok(
        body.includes(`aria-roledescription="slide" aria-label="${n} of 3"`),
        `slide ${n} is unlabelled`
      )
    }
  })

  // the one way a collection is walked: the kit's snap scrollbar, its
  // steppers real buttons named by where they go, a slider named by the set
  it('walks on the kit walker, whose steps are real buttons with real names', () => {
    const bar = body.match(
      /<div class="photoset-bar">[\s\S]*?<\/div><p class="photoset-count"/
    )?.[0]
    assert.ok(bar, 'no walker in the bar')
    assert.match(bar, /<div class="k-scroll" style="--k-n:3;--k-at:0">/)
    assert.match(
      bar,
      /<button type="button" class="k-btn k-ico k-step k-prev" aria-label="previous: [^"]+">/
    )
    assert.match(
      bar,
      /<button type="button" class="k-btn k-ico k-step k-next" aria-label="next: [^"]+">/
    )
    assert.match(bar, /role="slider" tabindex="0"[^>]* aria-label="Holiday"/)
    assert.doesNotMatch(body, /photoset-step/, 'a second walker of its own')
  })

  it('announces the position from a live region', () => {
    assert.match(
      body,
      /class="photoset-count" role="status" aria-atomic="true"><span data-photoset-at>1<\/span> \/ 3/
    )
  })

  it('gives every picture alt text', () => {
    const imgs = [...body.matchAll(/<img [^>]*alt="([^"]*)"/g)].map((m) => m[1])
    assert.equal(imgs.length, 3)
    for (const alt of imgs) assert.ok(alt.length > 0, 'a picture shipped with empty alt')
  })
})

describe('frontmatter can take over the order and the words', () => {
  it('uses the declared order, not the filenames', async () => {
    const r = await get('/curated')
    const srcs = [...r.body.matchAll(/<img src="(\/img\/curated\/[^"]+)"/g)].map((m) => bare(m[1]))
    assert.deepEqual(srcs, ['/img/curated/03.jpg', '/img/curated/01.png'])
  })

  it('uses the alt text he wrote', async () => {
    const r = await get('/curated')
    assert.match(r.body, /alt="the third one, described by hand"/)
  })

  it('falls back to a positional description rather than inventing one', async () => {
    // The fallback names the set he titled and which picture this is. It
    // does not describe what is in the frame, because nothing here knows.
    const r = await get('/holiday')
    assert.match(r.body, /alt="Holiday, photo 1 of 3"/)
    assert.match(r.body, /alt="Holiday, photo 3 of 3"/)
  })

  it('drops a listed picture that is not in the folder instead of shipping a broken image', async () => {
    const r = await get('/curated')
    assert.ok(!r.body.includes('99.png'))
    assert.ok(!r.body.includes('a file that is not there'))
  })
})

describe('where a photo set sits in the topology', () => {
  it('is not writing: no /feed/<slug>, no RSS item, not on the feed index', async () => {
    assert.equal((await get('/feed/holiday')).statusCode, 404)
    const rss = await get('/feed.xml')
    assert.ok(!rss.body.includes('holiday'), 'the writing feed carries writing')
    const feed = await get('/feed')
    assert.ok(!feed.body.includes('>Holiday<'), 'the feed index carries writing')
  })

  it('is a locally hosted page, so it is in the sitemap at its real URL', async () => {
    const r = await get('/sitemap.xml')
    assert.ok(r.body.includes(`<loc>${site.url}/holiday</loc>`))
    assert.ok(!r.body.includes(`<loc>${site.url}/feed/holiday</loc>`))
  })

  it('gets its own section in llms.txt, not filed under experiments', async () => {
    const r = await get('/llms.txt')
    assert.match(r.body, /^## Photos$/m)
    assert.ok(r.body.includes(`[Holiday](${site.url}/holiday)`))
    const photosAt = r.body.indexOf('## Photos')
    const experimentsAt = r.body.indexOf('## Experiments')
    assert.ok(r.body.indexOf('[Holiday]') > photosAt, 'Holiday filed outside the Photos section')
    assert.ok(r.body.indexOf('[A Toy]') > experimentsAt && r.body.indexOf('[A Toy]') < photosAt)
  })

  it('rides the canvas pages index wearing its kind', async () => {
    const r = await get('/')
    const boot = JSON.parse(r.body.match(/id="boot">([\s\S]*?)<\/script>/)[1])
    assert.equal(boot.pages.holiday.path, '/holiday')
    assert.equal(boot.pages.holiday.meta, 'Photos · 2026-08-01')
  })

  it('closes back to the canvas, the way everything root-mounted does', async () => {
    const r = await get('/holiday')
    assert.match(r.body, /<p class="backlink"><a href="\/">← canvas<\/a><\/p>/)
  })
})

describe('the older three kinds still land where they always did', () => {
  it('a case study is at /work/<slug> and nowhere else', async () => {
    assert.equal((await get('/work/a-study')).statusCode, 200)
    assert.equal((await get('/feed/a-study')).statusCode, 404)
    assert.equal((await get('/a-study')).statusCode, 404)
  })

  it('an article is at /feed/<slug>', async () => {
    assert.equal((await get('/feed/an-essay')).statusCode, 200)
    assert.equal((await get('/work/an-essay')).statusCode, 404)
  })

  it('a web_only entry is root-mounted', async () => {
    assert.equal((await get('/a-toy')).statusCode, 200)
    assert.equal((await get('/feed/a-toy')).statusCode, 404)
  })

  it('an external entry still 302s off site from its local handle', async () => {
    const r = await get('/feed/elsewhere')
    assert.equal(r.statusCode, 302)
    assert.equal(r.headers.location, 'https://example.com/elsewhere')
  })

  it('the RSS is still articles only', async () => {
    const r = await get('/feed.xml')
    assert.ok(r.body.includes('An Essay'))
    assert.ok(!r.body.includes('A Study'))
    assert.ok(!r.body.includes('A Toy'))
  })
})

describe('the modal and the terminal get the same set', () => {
  it('/api/page serves it as a photos page with its assets', async () => {
    const r = await get('/api/page/holiday')
    assert.equal(r.statusCode, 200)
    const page = JSON.parse(r.body)
    assert.equal(page.type, 'photos')
    assert.ok(page.css.includes('/css/photoset.css'))
    assert.ok(page.modules.includes('/js/photoset.js'))
    assert.match(page.html, /data-photoset/)
  })

  it('curl gets the pictures as URLs, not an empty page', async () => {
    // The slides are figures, and the text path drops figures whole, so a
    // photo set would otherwise print its title and nothing at all.
    const r = await get('/holiday', 'curl/8.7.1')
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /text\/plain/)
    for (const [name] of SOURCES) {
      assert.ok(r.body.includes(`${site.url}/img/holiday/${name}`), `${name} is not reachable`)
    }
    assert.ok(r.body.includes('Holiday, photo 1 of 3'))
  })

  it('an old browser gets the same list, escaped into its pre block', async () => {
    const r = await get('/holiday', 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)')
    assert.equal(r.statusCode, 200)
    assert.ok(r.body.includes('/img/holiday/01.png'))
  })
})
