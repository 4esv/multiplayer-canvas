# multiplayer-canvas

A site on a shared, wrapping canvas. Everyone who has the site open
sees everyone else's cursor. Articles, case studies and experiments stand on
the ground as tiles, and each one opens as a page over it.

The repo is two things:

- **A site you can fork.** Fastify and Nunjucks render the pages on the
  server. `curl` gets plain text and old browsers get HTML 3.2. It has an
  RSS feed, a sitemap, `llms.txt`, OG cards, a service worker and a passkey
  login for the owner. There is no client-side framework.
- **A set of primitives you can borrow.** Pixel type, the wrapped camera,
  live presence, rooms, a slime mould, a weather window and a small kit of
  controls. Each one is a self-contained ES module or stylesheet under
  `primitives/`, and you import each one by name.

Node 24 or newer.

## Quickstart (fork the whole site)

```sh
npm ci && npm run dev
```

Open http://localhost:3000. The server reloads when you save a file. Copying
`.env.example` to `.env` is optional, since every value in it has a default.

```sh
npm run check          # lint, guard registry, design lint, format, tests
npm run verify:mutate  # every registered guard proven to fail when its rule breaks
npm run build          # minify and content-hash the static tree into dist/
npm start              # serve; uses dist/ when it exists
```

## Folder map

```
primitives/        the borrowable parts, one module or stylesheet each
  presence/        live cursors: browser client, server room, wire protocol
  rooms/           private rooms, room URLs, following, shared views
  slime/           the slime mould and its shared server clock
  sky/             the weather window and its shared push
  kit/             controls (kit.css), design tokens, small control scripts
src/               the site
  server.js        Fastify app: routes, CSP, static files, the import map
  routes/          one file per surface (home, feed, work, about, rooms, auth)
  templates/       Nunjucks: canvas shell, entry pages, terminal and retro
  static/          the canvas app, site CSS and JS, fonts, images
  lib/ services/   markdown, layout data, stores, the weather fetch
content/           the words: feed entries and the about text
examples/          one small page per primitive, plus a tiny server
scripts/           asset build, OG cards, image and token bakes, browser gates
test/              node:test suites, including text guards
site.config.js     who the site is: name, URL, author, links, weather place
BIBLE.md           the design contract: tokens, geometry, motion, the guards
```

The site imports its own primitives by the same names you would
(`multiplayer-canvas/torus`). In Node that goes through `package.json`
`exports`. In the browser it goes through an import map the server writes
into every page.

## Borrow a primitive

```sh
npm install github:4esv/multiplayer-canvas
```

Every import below is a path in `package.json` `exports`. The Node snippets
run as written, and `test/readme.test.js` runs them. The browser snippets
each have a working page in `examples/`. To try those pages, run
`node examples/serve.mjs` and open http://localhost:8080.

In a browser, serve `node_modules/multiplayer-canvas/primitives/` at a URL
and map the names to it, one entry per name you use (the example pages
show the full list):

```html
<script type="importmap">
  { "imports": { "multiplayer-canvas/torus": "/primitives/torus.js" } }
</script>
```

The primitives import each other by relative path, so serving the folder
whole is enough.

### grid and torus

A cell (`PX`, 4px) and a module (`M`, 48px). A camera on a world that wraps
at both edges, with a zoom ladder that always lands on whole device pixels.

<!-- readme: node -->

```js
import { PX, M } from 'multiplayer-canvas/grid'
import { wrapPos, nearestWrap, snapZoom } from 'multiplayer-canvas/torus'

console.log(PX, M) // 4 48
// a 240px tile at x=4900 in a 5000px world, camera at 0, 1200px view:
console.log(wrapPos(4900, 0, 5000, 1200, 240)) // -100: it shows at the left edge
console.log(nearestWrap(4900, 100, 5000)) // -100: the copy closest to x=100
console.log(snapZoom(0.37, 2)) // 0.375: a zoom that is crisp at 2x
```

### pixel-type

Two bitmap faces (`display`, `label`) as data. A line comes out as one crisp
SVG path, or as a grid of cells you can play with.

<!-- readme: node -->

```js
import { pixelText, wrapText, gridOf } from 'multiplayer-canvas/pixel-type'

const { svg, w, h } = pixelText('HELLO', 'display', { scale: 2 })
console.log(w, h) // 336 96
console.log(svg.startsWith('<svg')) // true: put it in innerHTML
console.log(wrapText('a short sentence on two lines', 'label', 60))
console.log(gridOf('HI', 'display', 0).length) // rows of booleans
```

### dust

A cursor that crosses a pixel-type title knocks its cells loose, and they
settle back. Browser only. See `examples/pixel-type.html`.

```js
import { pixelText, gridOf } from 'multiplayer-canvas/pixel-type'
import { createDust } from 'multiplayer-canvas/dust'

box.innerHTML = pixelText('HELLO', 'display', { scale: 2 }).svg
const dust = createDust()
dust.wire(box.querySelector('svg'), gridOf('HELLO', 'display', 0))
box.addEventListener('pointermove', (e) => dust.under(box, e.clientX, e.clientY))
```

### dither

Ordered (Bayer) dithering, one pixel at a time or as a matrix.

<!-- readme: node -->

```js
import { bayer, bayerLit } from 'multiplayer-canvas/dither'

for (let y = 0; y < 4; y++) {
  let row = ''
  for (let x = 0; x < 16; x++) row += bayerLit(x / 15, x, y) ? '#' : '.'
  console.log(row) // a left-to-right ramp
}
console.log(bayer(8).length) // 8 rows of thresholds
```

### slime

A slime mould in a round dish that grows toward the food you drop. The
simulation is pure. `paintDish` draws it on a 2D canvas, as in
`examples/slime.html`.

<!-- readme: node -->

```js
import { createSlime, step, feed, tones, DISH } from 'multiplayer-canvas/slime'

const mould = createSlime(42)
feed(mould, 20, 20)
for (let i = 0; i < 50; i++) step(mould)
const t = tones(mould) // one tone 0..3 per cell inside the dish
console.log(
  DISH,
  t.some((v) => v > 0)
) // 86 true
```

`multiplayer-canvas/slime/server` runs one shared mould on a server clock
and streams it to everyone over the presence room.

### sky

A weather window: a square of pixel sky for the hour and the weather. It
returns RGBA ready for `ImageData`. The colours come from `tokens.css`. See
`examples/sky.html`.

```js
import { frame, INKS, SIZE, STEP_MS } from 'multiplayer-canvas/sky'

const css = getComputedStyle(document.documentElement)
const inks = Object.fromEntries(
  Object.entries(INKS).map(([k, v]) => [k, css.getPropertyValue(v).trim()])
)
let n = 0
setInterval(() => {
  const rgba = frame({ cond: 'light rain', day: true }, Date.now(), n++, inks)
  ctx.putImageData(new ImageData(rgba, SIZE, SIZE), 0, 0)
}, STEP_MS)
```

`multiplayer-canvas/sky/server` holds one shared push, so anyone can move the
clouds for everyone.

### presence

Live cursors. On the server, a room joins sockets and relays their moves. In
the browser, a client posts this tab's position and draws everyone else's.
They talk JSON over a WebSocket at `/ws/cursors`. `examples/serve.mjs` is a
complete server in about 40 lines (it uses `ws`).

Server:

```js
import { createRoom } from 'multiplayer-canvas/presence/room'
import { parseFrame } from 'multiplayer-canvas/presence/protocol'

const room = createRoom()
wss.on('connection', (socket) => {
  if (!room.join(socket)) return socket.close(1013, 'busy')
  socket.on('message', (raw) => {
    const f = parseFrame(String(raw))
    if (f?.kind === 'move') room.move(socket, f)
  })
  socket.on('close', () => room.leave(socket))
})
```

Browser (`examples/presence.html`):

```js
import { initPresence } from 'multiplayer-canvas/presence'
import { wrapPos } from 'multiplayer-canvas/torus'

const p = initPresence({ scene: document.querySelector('#scene'), wrapPos })
addEventListener('pointermove', (e) => p.post(e.clientX / innerWidth, e.clientY / innerHeight))
const W = innerWidth,
  H = innerHeight
const view = {
  camX: 0,
  camY: 0,
  WORLD_W: W,
  WORLD_H: H,
  VW: W,
  VH: H,
  Z: 1,
  edge: { top: 0, bottom: H },
}
requestAnimationFrame(function tick(t) {
  p.frame(view, t)
  requestAnimationFrame(tick)
})
```

The protocol is pure and checks every inbound frame:

<!-- readme: node -->

```js
import { parseFrame } from 'multiplayer-canvas/presence/protocol'

console.log(parseFrame(JSON.stringify({ type: 'move', fx: 0.25, fy: 0.5 })).kind) // 'move'
console.log(parseFrame(JSON.stringify({ type: 'move', fx: 7, fy: 0 }))) // null: off the world
```

Also in the presence folder:

- `presence/anchor` places a cursor on a page of text, whatever the reader's width.
- `presence/conga` works out who follows whom.
- `presence/wire` holds the constants both ends share.

### rooms

Private rooms on the same socket. A room has a short code, an optional PIN,
and idle and age limits. Its address carries the room.

<!-- readme: node -->

```js
import { startSession, findSession, checkSessionPin, endSession } from 'multiplayer-canvas/rooms'
import { withRoom, roomFromUrl } from 'multiplayer-canvas/rooms/url'

const rec = startSession({ kind: 'session', pin: true })
console.log(findSession(rec.code) === rec, checkSessionPin(rec, rec.pin)) // true 'ok'
const q = withRoom('?search=slime', { kind: 'session', code: rec.code })
console.log(roomFromUrl(q).code === rec.code) // true
endSession(rec.code)
```

`rooms/follow` lets you follow somebody's cursor until you move your own.
`rooms/view-sync` shares what a page is showing, such as a video and its
time.

<!-- readme: node -->

```js
import { createFollow } from 'multiplayer-canvas/rooms/follow'

const follow = createFollow((id) => console.log('following', id))
follow.pick(3) // following 3
follow.input() // following null: your own input lets go
```

### mirror

On a wrapped world, a tile cut by the view's edge shows its other half at
the opposite edge. `createMirror({ parent, observe })` keeps an inert, live
copy there. It needs no DOM globals, so you can test it with fakes.

### pixel-moves

The motion vocabulary on a canvas overlay. `zoomRects(from, to)` marches
rectangles from one box to another. `poof(el)` breaks a thing into cells.
`bigBang` and `implode` fill and empty a surface. Each one calls `done` when
it ends. All of them honour `prefers-reduced-motion`.

```js
import { poof } from 'multiplayer-canvas/pixel-moves'

button.addEventListener('click', () => poof(card, { done: () => card.remove() }))
```

### kit

`tokens.css` is every design token, in light and dark. `kit.css` is the
controls: buttons, fields, switches, tabs, the snap scrollbar, marquees and
tags. A few small scripts drive them. See `examples/kit.html`.

```html
<link rel="stylesheet" href="/primitives/kit/canvas-tokens.css" />
<link rel="stylesheet" href="/primitives/kit/kit.css" />
```

```js
import { scrollMarkup, wireScroll } from 'multiplayer-canvas/kit/scroll'
import { armed } from 'multiplayer-canvas/kit/arm'

const titles = ['one', 'two', 'three']
pager.innerHTML = scrollMarkup({ titles })
wireScroll(pager.firstElementChild, { titles, onCommit: (i) => show(i) })
armed(deleteButton, async () => removeThing()) // the first press arms, the second acts
```

<!-- readme: node -->

```js
import { tagsMarkup } from 'multiplayer-canvas/kit/tags'
import { marqueeRun } from 'multiplayer-canvas/kit/marquee'

console.log(tagsMarkup(['notes', 'audio'])) // <ul class="k-tags" ...>
console.log(marqueeRun(300, 160)) // { d: 140, n: 35 }: walk 140px in 35 steps
```

`kit/caret` puts a block caret at the insertion point of a `.k-field`.

## Add content

Every entry is one markdown file in `content/feed/`. Frontmatter decides
where it goes.

- **Article:** no `type`. It shows on `/feed`, in `/feed.xml` and at `/feed/<slug>`.
- **Case study:** `type: case-study`. It shows on `/work`, at `/work/<slug>`.
- **Experiment:** `web_only: true`. It is mounted at `/<slug>` and can bring
  its own `extra_css` and `extra_js`. See `content/feed/web-instruments.md`.
- **Link:** `external_url:` and no body. The tile and the feed link straight
  out.

```markdown
---
title: Hello, world
date: 2026-10-23
updated: 2026-10-23
slug: hello-world
tags: [notes]
summary: One line that says what this is.
---

Plain markdown.
```

After you add or retitle an entry, run `bash scripts/og/render.sh` to draw
its share card (this needs Chrome). The test suite fails while a card is
missing. The about text is `content/about.md`.

## Configure

- `site.config.js`: the site's name, URL, description, author, profile
  links and the weather window's location. Most forks edit only this file.
- `.env`: port, host, log level, proxy trust and store paths. Every key in
  `.env.example` is optional.
- `BIBLE.md`: the design contract. `test/bible-sync.test.js` keeps it in
  step with `primitives/kit/canvas-tokens.css` and
  `src/static/canvas/layout.js`.

The owner signs in with a passkey at `/login`. On first boot the server
prints a one-time setup code; enter it at `/login` to enrol your passkey.
`node scripts/auth/reset.mjs` wipes the passkey and mints a new code. The
owner can open private rooms and see `/admin`.

## Deploy

The `Dockerfile` builds the assets in one stage and runs the site as a
non-root user in a second. `docker-compose.yml` binds the site to
`127.0.0.1:3000` and keeps `data/` (passkeys, rooms, audit trail) on a
volume:

```sh
docker compose up -d --build
docker compose logs site   # the passkey setup code is printed here on first boot
```

Put a reverse proxy that terminates TLS in front of it, for example nginx:

```
server {
	server_name example.com;
	location / { proxy_pass http://127.0.0.1:3000; }
}
```

The proxy must pass WebSocket upgrades on `/ws/cursors` through, which
needs the `Upgrade` and `Connection` headers forwarded (`proxy_http_version 1.1;`
and `proxy_set_header Upgrade $http_upgrade;`).

## Possible next steps

- Publish the primitives to npm, so `npm install multiplayer-canvas` works
  without GitHub.

## Credits

Built by Axel Stevens. Third-party
code, fonts and data are listed at `/credits` on a running site, and their
licences sit next to the vendored files.

## License

MIT. See `LICENSE`.
