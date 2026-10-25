// ============================================================================
// The canvas. One toroidal world, ink on one ground. The hero sits in the
// hole of a bento ring (layout.js) with its dock of icons under it; the
// tiles stand in the ring's slots, seated by a hand table and checked by
// the compass (TAG_DIR). Live data rides the boot payload and /api/canvas.
// ============================================================================
import { pixelText, pixelTitle, gridOf, pathFromGrid, wrapText, FACES } from 'multiplayer-canvas/pixel-type';
import { PX, M, BENTO, TILES, MEMBERS, dims, heroFixed, heroType, placeWorld, chromeBand, chromeDensity, CHROME, mountsAt, wrapPos, wrapSpots, seamAt, mapOpenAt, slotShared, openFrame, flightPath, flightAt, nearestWrap, etchedBox, TYPE_LINE, openBlock, FAN, cameraBounds, snapZoom, stepZoom, snapCam, pileGeometry, countLine, fanLayout, stackForPath, landForPath, LAND_PATHS } from '/canvas/layout.js';
import { initPresence, cursorImage, CLICK_NUDGE } from 'multiplayer-canvas/presence';
import { createDust, DUST_MS } from 'multiplayer-canvas/dust';
import { anchorOf, atOf, parseAt, pointOf } from 'multiplayer-canvas/presence/anchor';
import { createFollow } from 'multiplayer-canvas/rooms/follow';
import { createHighlights, ownSelection, rangeOnPage } from '/canvas/highlight.js';
import { createMirror } from 'multiplayer-canvas/mirror';
import { PHRASES } from '/canvas/hero-cycle.js';
import { changedKeys } from 'multiplayer-canvas/presence/wire';
import { wireViewSync, shareView, onView, holdsFan } from 'multiplayer-canvas/rooms/view-sync';
import { DISH, LABEL_GAP as SLIME_LABEL_GAP, LINE_GAP as SLIME_LINE_GAP, PARAMS as SLIME, dishBox, inside as inDish, decode as decodeSlime, applyDelta as applySlimeDelta, paintDish, rimGrid } from 'multiplayer-canvas/slime';
import { pixelSprite } from '/canvas/pixel-sprite.js';
import { frame as outlookFrame, INKS as OUTLOOK_INKS, SIZE as OUTLOOK_SIZE, STEP_MS as OUTLOOK_STEP, PUSH_IN, PUSH_MAX } from 'multiplayer-canvas/sky';
import { zoomRects, implode, bigBang } from 'multiplayer-canvas/pixel-moves';
import { LEFT_GLYPH, RIGHT_GLYPH, UP_GLYPH, scrollMarkup, wireScroll, pageBarMarkup, wireTabs, litIntoView } from 'multiplayer-canvas/kit/scroll';
import { wireCarets } from 'multiplayer-canvas/kit/caret';
import { searchFromUrl, withSearch, roomFromUrl, withRoom } from 'multiplayer-canvas/rooms/url';
import { commandsFor, parseCommand, complete, matchPage, randomPage, shareUrl, deskTool, ROOM_CODE, ROOM_PIN, roomSearch, leaveSearch, hasOwnerHint, ownerFrom, hintClears, KEYS } from '/canvas/commands.js';
import { readerMarkup, applyReader, wireReader } from '/js/page-reader.js';
import { tagsMarkup, visibleTags } from 'multiplayer-canvas/kit/tags';
import { ICON_SVG } from '/canvas/marks.js';
import { entryCard } from '/canvas/quote-cards.js';
import { BAYER4 } from 'multiplayer-canvas/dither';

const $ = s => document.querySelector(s);
const scene = $('#scene');
// the zoom scales the scene about its top-left; the default 50% 50% origin
// would drift the world on every zoom step
scene.style.transformOrigin = '0 0';

// Upstream strings (a weather label, an entry title) enter
// innerHTML and quoted attributes below; one escape at every seam, the same
// rigor the server's sheet builders already apply.
//
// A sheet's own title and meta line count as such a seam even though the only
// writer is frontmatter in this repo. The SSR'd sheet renders them through
// Nunjucks autoescape (templates/canvas/home.njk); the client-side mount of
// the SAME two fields did not until 2026-08-19, which made two paths that
// are supposed to be identical by construction differ in the one way that
// matters. Body HTML is the exception and stays raw on purpose: the sheet
// builders and the markdown renderer produce it already escaped.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// Reduced motion: no character animation, phrases swap whole. Declared up
// here with the other environment reads: mkTile runs during module init, so
// a const declared further down is still in its temporal dead zone when the
// first tile paints.
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- flags, the breaker, the counters (2026-09-12) ------------------------------
// The wrist reported a zoom seizure and a reload loop AFTER the crown fix
// shipped, so the crown was not the loop, or not the whole of it, and this
// is the third round of guessing at a device no bench reproduces. So: no
// more guessing. DIAG puts the numbers on the screen where the wrist can
// photograph them, and SAFE stops the crash cycle whatever is driving it.
//   ?diag   an overlay in the corner: viewport, scale, zoom, and a count of
//           every input that can move the zoom, refreshed twice a second and
//           written to storage each tick so the run before a crash survives
//   ?safe   no crown, no wheel zoom, no pinch zoom, no restored camera, and
//           the floor is the opening frame: tap and pan only
//   ?crown  the Digital Crown scroller, opt-in again (it shipped on by
//           default for one deploy and the wrist said no)
// SAFE also arms itself, on DEATHS and never on navigations: the page beats
// a heartbeat into storage every two seconds while it is alive and marks a
// clean exit on pagehide; a boot that finds a recent heartbeat with no clean
// mark is a page the browser killed and reloaded. Two kills inside a minute
// and the reload must not walk straight back into whatever killed it. (The
// first cut counted boots, and armed on the deploy gate's own three loads.)
const FLAGS = new URLSearchParams(location.search);
const DIAG = { wheel: 0, scroll: 0, gesture: 0, resize: 0, touch: 0, zoom: 0, render: 0, kills: 0, last: '' };
let SAFE = FLAGS.has('safe');
try{
  const now = Date.now();
  const alive = JSON.parse(localStorage.getItem('canvas-alive') || 'null');
  const kills = JSON.parse(localStorage.getItem('canvas-kills') || '[]').filter(t => now - t < 60000);
  if(alive && !alive.clean && now - alive.t < 30000) kills.push(now);
  localStorage.setItem('canvas-kills', JSON.stringify(kills));
  DIAG.kills = kills.length;
  if(kills.length >= 2){ SAFE = true; DIAG.last = 'safe: killed twice in a minute'; }
  const beat = (clean) => { try{ localStorage.setItem('canvas-alive', JSON.stringify({ t: Date.now(), clean })); }catch{ /* none */ } };
  beat(false);
  setInterval(() => beat(false), 2000);
  addEventListener('pagehide', () => beat(true));
}catch{ /* no storage, no breaker */ }
const CROWN_ON = FLAGS.has('crown') && !SAFE;
// ?bare strips the render's extras (no will-change layers, no grid or seam
// repaint, no minimap, no presence frames, no dust) so one wrist test says
// whether the death is rendering cost or something else
const BARE = FLAGS.has('bare') || FLAGS.has('frozen');
if(BARE) document.documentElement.classList.add('bare');
// ?frozen: after the first paint the render writes nothing to the DOM at
// all (the camera still moves in memory), so a wrist that dies on a pan
// under it is dying in the input path, not the render
const FROZEN = FLAGS.has('frozen');
// THE LOG: every event that could matter, written to storage the moment it
// happens (synchronously, a ring of forty), so a run the browser kills
// leaves its last steps behind; the overlay shows the previous run's tail.
const LOGGING = FLAGS.has('diag') || SAFE || BARE;
const T0 = performance.now();
let prevLog = [];
try{ prevLog = JSON.parse(localStorage.getItem('canvas-diag-log') || '[]'); }catch{ /* none */ }
if(FLAGS.has('diag') || FLAGS.has('safe') || FLAGS.has('bare') || FLAGS.has('frozen') || SAFE){
  document.addEventListener('load', e => { const t = e.target; if(t && t.tagName === 'IMG') logEv('img ' + t.naturalWidth + 'x' + t.naturalHeight); }, true);
  let moves = 0;
  addEventListener('pointermove', () => { if(++moves % 10 === 0) logEv('move x' + moves); }, {passive: true});
}
const logEv = (n) => {
  if(!LOGGING) return;
  DIAG.log = DIAG.log || [];
  DIAG.log.push(`${Math.round(performance.now() - T0)} ${n} z${typeof Z === 'number' ? Z.toFixed(2) : '?'} r${DIAG.render}`);
  if(DIAG.log.length > 40) DIAG.log.shift();
  try{ localStorage.setItem('canvas-diag-log', JSON.stringify(DIAG.log)); }catch{ /* none */ }
};

// ---- world geometry --------------------------------------------------------
// The world is one fixed rectangle solved at DESIGN_VIEW (layout.js
// placeWorld, the tiered-shells solver): every device sees the same
// coordinates and adapts by ZOOM instead of a per-viewport re-layout.
// Z is the camera zoom (screen px per world px). The camera goes out to
// cover (outZ, layout.js cameraBounds): the view no larger than the world, so
// no place is ever on screen twice. Tiles mount all the way there except on a
// watch, which mounts down to minZ and has the plan paint the world past it. The 360px stage-scale and
// the TINY hero-split are retired in this mode: zoom is the device adapter.
let VW = innerWidth, VH = innerHeight;
let HERO_W = 0, HERO_H = 0, WORLD_W = 0, WORLD_H = 0;
// the solved world as placeWorld hands it over
let WORLD = null;
// minZ is the MOUNT floor (tiles mount at or above it), outZ the CAMERA's:
// out to cover, drawn as a plan past minZ on a watch
let Z = 1, minZ = 0.05, outZ = 0.05, mountZ = 0.05;
const MAXZ = 1.5;
// the floor outranks the ceiling: on a screen wider than the world at MAXZ
// (layout.js cameraBounds) the camera holds cover
const clampZ = z => Math.max(outZ, Math.min(MAXZ, z));
// The pixel ladder (layout.js snapZoom, BIBLE.md section 2): a cell is only
// crisp at a whole number of DEVICE pixels, so every zoom the camera RESTS at
// is snapped to z = k / (PX x dpr). Gestures move freely between steps and
// settle onto one when they end; fits snap down (never past the frame they
// fit), floors snap up (never past the ground). restZ is that snap plus the
// clamp, and it is what every deliberate zoom target reads.
const DPR = () => Math.max(1, window.devicePixelRatio || 1);
const restZ = (z, mode = 'near') => clampZ(snapZoom(z, DPR(), mode));
// the camera corner, with the world origin on a device pixel: the lattice,
// the mark and every seated node then paint whole rather than straddling
function restCam(){ camX = snapCam(camX, Z, DPR()); camY = snapCam(camY, Z, DPR()); }
// the viewport measured in WORLD units: what wrapPos and the camera math see
const viewW = () => VW/Z;
const viewH = () => VH/Z;
// over-reserved on a laptop). The frame fits the screen MINUS the bar's band
// and the hero centers in what is left, so the opening frame clears the bar
// everywhere while the world reserves nothing anywhere.
const bandH = () => chromeBand(VW, VH);
// never under the mount floor: the opening frame is always a mounted one
// (layout.js cameraBounds fit, which the camera floor no longer implies)
const fitZ = () => { const of = openFrame(); return Math.max(minZ, restZ(Math.min(VW / of.w, Math.max(1, VH - bandH()) / of.h), 'down')); };
function updateZoomBounds(){
  if(!WORLD) return;
  // cover everywhere, and one step out from the opening frame on a watch,
  // where the whole world at once is more than the device can mount
  // (layout.js zoomFloor carries the measurements)
  // the floor snaps UP the ladder: a step below it would show a repeat
  // ...and never above the rung the opening frame fits on (layout.js
  // cameraBounds): a true 205px watch opened with its doors off the screen
  const b = cameraBounds(VW, VH, WORLD, DPR(), MAXZ);
  minZ = b.minZ; outZ = b.outZ; mountZ = b.mountZ;
  // safe mode never pulls out past the opening frame: fewer tiles mounted
  // is the one lever that helped the last time a wrist reported reloads
  if(SAFE) outZ = mountZ = minZ = Math.max(minZ, b.fit);
  // and the camera re-rests: a window dragged to another display changes
  // the ladder under it
  const nz = restZ(Z);
  if(nz !== Z){ Z = nz; renderDirty = true; }
}
// zoom keeping the world point under (px,py) fixed on screen
function zoomAt(z, px, py){
  const nz = clampZ(z);
  if(nz === Z) return;
  DIAG.zoom++; logEv('zoom ' + nz.toFixed(3));
  camX += px/Z - px/nz; camY += py/Z - py/nz;
  Z = nz; renderDirty = true;
}
function computeWorld(){
  VW = innerWidth; VH = innerHeight;
  const stage = document.getElementById('stage');
  stage.style.width = VW+'px'; stage.style.height = VH+'px';
  // no compact mode: the hero is a world constant and the bar's search is
  // one fixed measure, so no device gets its own styling fork
  // the hero is a WORLD constant: heroFixed() in layout.js is the one
  // source (app and unit tests read the same derivation)
  ({ w: HERO_W, h: HERO_H } = heroFixed());
  updateZoomBounds();
}
computeWorld();
// home aims at the world point that must sit at the VIEWPORT centre for the
// hero to sit centred in the strip ABOVE the bar: the hero rides half a band
// high, so the sky over it equals the ground under it down to the bar's top
// edge. homeX/homeY are the camera corner that lands the same frame.
// home centres the BLOCK, the hero and the dock under it (layout.js openBlock)
const homeAimX = () => { const b = openBlock(heroBox()); return b.x + b.w/2; };
const homeAimY = (z = Z) => { const b = openBlock(heroBox()); return b.y + b.h/2 + bandH()/(2*z); };
const homeX = () => homeAimX() - viewW()/2;
const homeY = () => homeAimY() - viewH()/2;

// ---- content: real data, snapshotted ----------------------------------------
// live tile data, SSR'd into #boot by the server (canvas-data.js: live
// upstreams with per-key snapshot fallback, so the payload is never empty).
// Degrade to a skeleton if the tag ever goes missing.
const BOOT = (()=>{ try{ return JSON.parse(document.getElementById('boot').textContent); }
  catch{ console.warn('boot payload missing: serving skeleton'); return null; } })();
// the site's name (site.config.js), for the tab title as the camera moves
const SITE_NAME = BOOT?.siteName || 'canvas';
// every picture's URL, from the server's map (issue #319): each carries the
// hash of its bytes, so a re-baked picture is a new URL and reaches a warm
// cache on the next load. Build no /img URL anywhere else.
const imgSrc = p => BOOT?.img?.[p] || '/img/'+p;
// let, not const: refreshCanvas() rebinds it on the server's own cadence
let WEATHER = BOOT?.weather || {tempF:'', cond:'', place:''};
// where the room has a pile, as the page was rendered (boot.fronts), or
// `fallback` when nobody has turned it or the number is not one this tab can
// index. The first paint opens on this and the welcome confirms it, so the
// wire has nothing to correct: no statement that blows apart to become
// another, no board that jumps to a move, because the page said one thing
// and the room another.
const bootFront = (id, max, fallback) => {
  const i = BOOT?.fronts?.[id];
  return Number.isInteger(i) && i >= 0 && i <= max ? i : fallback;
};
// Maurice is his photograph now (the tile builder, /img/canvas/maurice.png);
// only the splat is drawn, 10 x 5 cells, in the red sampled from the picture.
// (the bug that was drawn by hand from the picture went out the same night)
//
// Brick and ink (the classes are painted in canvas-home.css), drawn as unit
// squares like every other pixel here.
// squished: a little red, flat on the ground in pixel isometric (a diamond,
// not a disc: the splat lies on the ground's plane), with the spray it threw
const SPLAT_ROWS = ['....bb..b.', '.bbbbbbb..', 'bbbbbbbbbb', '.bbbbbbb.b', 'b...bb....'];
// ---- GLYPHS AS CELL DATA (BIBLE.md section 10, 2026-09-11) --------------------
// The social marks are vendor drawings on their own 24-cell (or 21-cell)
// lattices, and they were paths. Rasterised once here, at boot, onto that
// lattice (a canvas the size of the lattice, one path fill, the alpha read
// back) they become the same kind of thing a title is: a grid of cells,
// set as unit squares by pathFromGrid. Pixel for pixel the same drawing,
// and now the same buffer every trick runs on.
// A shape's own ink, or the nearest ancestor's: svg attributes inherit down
// the tree and these drawings lean on that (a <g stroke> over three paths).
const svgAttr = (el, name) => {
  for(let n = el; n && n.getAttribute; n = n.parentNode) {
    const v = n.getAttribute(name);
    if(v != null) return v;
  }
  return null;
};
// THE ONE RASTERISER (BIBLE.md section 10). Every mark on the canvas is cell
// data: the identity hand always was, and since 2026-09-15 so is the
// instrument hand, because a site drawn on a 4px cell cannot also run a
// second hand of 2.5px strokes without the two reading as a fight. Filled
// shapes and STROKED ones both land here: the drawing is painted once at its
// own viewBox resolution, a unit a cell, and a stroke is never drawn under
// one unit, so it survives as a whole cell instead of thinning to nothing.
// A shape painted in the ground
// (the sun behind the partly-cloudy cloud) ERASES, so an occlusion drawn as
// an opaque fill stays an occlusion in one bit.
const GLYPHS = {};
// A drawing's own units are its cells: every mark the roster holds is drawn
// on its lattice, so a lit subpixel is a lit cell.
function pixelGlyph(key, svgHtml){
  if(GLYPHS[key]) return GLYPHS[key];
  const doc = new DOMParser().parseFromString(svgHtml, 'image/svg+xml');
  const svg = doc.documentElement;
  const [vx, vy, vw, vh] = (svg.getAttribute('viewBox') || '0 0 24 24').split(/\s+/).map(Number);
  const rw = Math.max(1, Math.round(vw)), rh = Math.max(1, Math.round(vh));
  const c = document.createElement('canvas'); c.width = rw; c.height = rh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = 'black'; ctx.strokeStyle = 'black';
  ctx.translate(-vx, -vy); // a lattice that starts off zero (the rss mark) lands at zero
  // every shape the roster holds: the vendor marks come as paths, rects and
  // polygons, the instruments as circles, lines and stroked paths
  for(const el of svg.querySelectorAll('path, rect, polygon, circle, line')){
    const t = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(svgAttr(el, 'transform') || '');
    ctx.save();
    if(t) ctx.translate(Number(t[1]), Number(t[2]));
    const num = (name, dflt) => { const v = svgAttr(el, name); return v == null ? dflt : Number(v); };
    const p = new globalThis.Path2D();
    if(el.tagName === 'rect'){
      p.rect(num('x', 0), num('y', 0), num('width', 0), num('height', 0));
    } else if(el.tagName === 'circle'){
      p.arc(num('cx', 0), num('cy', 0), num('r', 0), 0, Math.PI * 2);
    } else if(el.tagName === 'line'){
      p.moveTo(num('x1', 0), num('y1', 0)); p.lineTo(num('x2', 0), num('y2', 0));
    } else if(el.tagName === 'polygon'){
      const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      for(let i = 0; i + 1 < pts.length; i += 2) i ? p.lineTo(pts[i], pts[i + 1]) : p.moveTo(pts[i], pts[i + 1]);
      p.closePath();
    } else {
      p.addPath(new globalThis.Path2D(el.getAttribute('d') || ''));
    }
    // fill: absent means fill (the vendor marks), 'none' means outline only,
    // anything else is an opaque shape and so a hole in a one-bit drawing
    const fill = svgAttr(el, 'fill');
    if(fill !== 'none'){
      ctx.globalCompositeOperation = fill && fill !== 'currentColor' ? 'destination-out' : 'source-over';
      ctx.fill(p, svgAttr(el, 'fill-rule') === 'evenodd' ? 'evenodd' : 'nonzero');
      ctx.globalCompositeOperation = 'source-over';
    }
    const stroke = svgAttr(el, 'stroke');
    if(stroke && stroke !== 'none'){
      // never under one cell: a stroke that thinned away would leave a
      // drawing with holes in it
      ctx.lineWidth = Math.max(num('stroke-width', 1), 1);
      ctx.lineJoin = svgAttr(el, 'stroke-linejoin') || 'miter';
      ctx.lineCap = svgAttr(el, 'stroke-linecap') || 'butt';
      ctx.stroke(p);
    }
    ctx.restore();
  }
  const data = ctx.getImageData(0, 0, rw, rh).data;
  const gw = rw, gh = rh;
  const g = Array.from({ length: gh }, (_, y) => Array.from({ length: gw }, (_, x) => data[(y * rw + x) * 4 + 3] > 127));
  const cls = svg.getAttribute('class') || '';
  const out = { g, svg: `<svg class="${cls}" viewBox="0 0 ${gw} ${gh}" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${pathFromGrid(g)}"/></svg>` };
  GLYPHS[key] = out;
  return out;
}
// THE DUST (BIBLE.md section 10) is canvas/dust.js: this page hands it the
// room's clock and says when it is off. The door pages (js/door.js) run the
// same module on their titles.
// ?nodust turns the dust off for a session, to bisect a stutter by hand. It
// sits beside BARE and REDUCED, which already do the same job for other
// reasons; delete it once that is settled.
const NODUST = new URLSearchParams(location.search).has('nodust');
const { wire: wireDust, tick: dustTick, under: dustUnder, title: dustTitle, scatter } = createDust({
  now: () => presence.now(),
  enabled: () => !(BARE || NODUST || REDUCED),
});
// the dock's marks and where they go: the feed, and the address from
// site.config.js (it rides the boot payload)
const SOCIALS = {
  rss:  {svg: ICON_SVG.rss,  url:'/feed.xml'},
  mail: {svg: ICON_SVG.mail, url: BOOT?.contact ? 'mailto:' + BOOT.contact : '/about'},
};

// tiles. Articles and experiments stand on the ground as THEMSELVES, not
// as "feed items": the canvas holds content, never section indexes.
// `tags` are topic membership for the layout compass ONLY (layout.js):
// never rendered, and deliberately separate from `type` (rendering kind).
// The geometry (module, blocks, seats) lives in /canvas/layout.js: pure,
// deterministic, unit-tested (test/canvas-layout.test.js). This file only
// feeds it live data and writes the result onto the nodes.
// The tile set is a CONSTANT: a tile set that varies with live data means
// two clients can solve two different worlds and every synced fraction lies.
const LIVE_TILES = TILES;
// the topbar band height comes from layout.js CHROME_TOP (one source; the
// tokens are its CSS mirror)


// ---- routed pages (the modal IS the page) -----------------------------------
// The index rides the boot payload: every entry mounts NATIVELY in the sheet
// (/api/page/<slug> hands over the real markup and assets), the section doors
// (work/feed/about) fetch their live sheets from /api/sheet. NOTE: experiments
// are canvas content, not feed entries; feed and RSS carry articles only.
const PAGES = BOOT?.pages || {};

// ---- persisted state ---------------------------------------------------------
// trial state rides its own key so the shipped model's v1 state stays intact
const LSKEY = 'canvas-canvas-v2-zoomtrial';
let camX = 0, camY = 0, vx = 0, vy = 0, hadCam = false, hadZ = false;
// The frame the camera was saved against. A restored camera is only honest
// while it means what it meant: on a materially different viewport (a
// desktop bookmark opened on a phone) or a changed world (tiles shipped or
// retired since the visit) the saved point can frame bare ground with the
// hero nowhere in sight, which reads as a broken site, not a remembered
// one. boot() compares this frame after the world lands and re-opens at
// home when it no longer holds.
let savedFrame = null;
try{
  const s = JSON.parse(localStorage.getItem(LSKEY) || '{}');
  if(typeof s.camX === 'number'){ camX = s.camX; camY = s.camY; hadCam = true; }
  if(typeof s.z === 'number' && s.z > 0){ Z = s.z; hadZ = true; } // clamped once the world lands
  if(typeof s.vw === 'number') savedFrame = { vw: s.vw, vh: s.vh, ww: s.ww, wh: s.wh };
}catch{ /* a corrupt or foreign LSKEY reads as no saved state */ }
let noPersist = false;
const persist = () => { if(!noPersist) localStorage.setItem(LSKEY,
  JSON.stringify({camX,camY,z:Z,vw:VW,vh:VH,ww:WORLD_W,wh:WORLD_H})); };
let saveT; const save = () => { clearTimeout(saveT); saveT = setTimeout(persist,200); };
addEventListener('beforeunload', persist);

// ---- build tiles ---------------------------------------------------------------
const nodes = {};
// data-hk is the tile's name on the presence wire: what a peer says its
// cursor is over, so every other tab can light the same thing (presence.js,
// lib/presence-protocol.js). Every tile carries one, and the STYLESHEET
// decides what a hover on it looks like, exactly as it does for your own
// pointer: a tile with no :hover rule shows nothing for a peer either,
// because there is nothing to show. Controls INSIDE a tile are a different
// matter and are named separately, or not at all: see the doors below.
function addNode(t, n, w, h){
  n.dataset.hk = t.id;
  scene.appendChild(n);
  nodes[t.id] = {n, t, wx:0, wy:0, w, h, hidden:false};
}
// THE ONE DOOR OFF THE CANVAS (test/outbound.test.js): every tile that
// leaves the site opens through here, so a fork that wants to count the
// clicks that leave adds it in one place and misses no keyboard visitor.
function exit(url){
  // a mailto opened as a tab leaves a blank tab behind on the browsers that
  // hand it to a mail client; the address is asked for in place
  if(url.startsWith('mailto:')){ location.href = url; return; }
  window.open(url, '_blank', 'noopener');
}

// clickable tiles are keyboard tiles: tab to them, Enter or Space to open
function keyable(n, label, fn){
  n.tabIndex = 0; n.setAttribute('role','button'); n.setAttribute('aria-label', label);
  n.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fn(); } });
}

function mkTile(t, seat = true){
  const n = document.createElement('div');
  const d = dims(t);
  n.className = 'el t-' + t.type;
  n.style.width = d.w+'px'; n.style.height = d.h+'px';
  if(t.type==='article'){
    // An external entry's click goes straight where the piece lives, in a
    // new tab (BIBLE.md section 5); a native one opens its page.
    const host = t.ext ? new URL(t.ext).hostname.replace(/^www\./,'') : '';
    const kind = t.kind || host || 'article';
    const open = t.ext ? ()=>exit(t.ext) : ()=>openPage(t.slug);
    // no eyebrow (2026-09-11): the title is the first line, the chips say
    // the kind, and the date is the page's
    // THE CASE-STUDY CARD IS THE PAGE'S TITLE, SMALLER (#300): the same
    // pixelTitle in the same face the page sets, at half a cell (--tpx on
    // .cs-card), so the card and the page it opens read as one thing. The
    // pile's front and the /work fan are both this node.
    const title = t.kind === 'case study' ? pixelTitle(t.label, 'display', { tag: 'h3' }) : `<h3>${t.label}</h3>`;
    if(t.kind === 'case study') n.classList.add('cs-card');
    n.innerHTML = entryCard({ title });
    if(t.kind === 'case study') dustTitle(n.querySelector('h3.ptitle'));
    n.classList.add('openable');
    n.addEventListener('click', open);
    keyable(n, kind+': '+t.label, open);
    // let the tile talk: summary, date, and tags come from the entry itself,
    // riding the boot payload (BOOT.arts) so nothing pops in after paint;
    // the fetch survives only as the fallback for a stale boot. paint is
    // anatomy-blind: it fills whichever slots the card has.
    const paint = pg => {
      const sum = n.querySelector('.summary');
      if(sum) sum.textContent = pg.summary || '';
      const lbl = n.querySelector('.lbl');
      if(lbl && pg.date) lbl.textContent = `${kind} · ${pg.date}`;
      const qd = n.querySelector('.qdate');
      if(qd && pg.date) qd.textContent = `· ${pg.date}`;
      const tags = n.querySelector('.k-tags');
      // the kit's tags (js/tags.js): a tag that repeats the kind is chrome saying itself twice
      for(const x of visibleTags(pg.tags, kind)){
        const s=document.createElement('span'); s.className='k-tag'; s.textContent=x; tags.appendChild(s);
      }
    };
    const pre = BOOT?.arts?.[t.slug];
    if(pre) paint(pre);
    else fetch('/api/page/'+t.slug).then(r=>r.ok?r.json():null).then(pg=>{ if(pg) paint(pg); }).catch(()=>{});
  } else if(t.type==='web'){
    // an experiment is a THING on the ground (2026-09-11): the baked still,
    // cut out, and its name under it in the label hand. No card, no kind,
    // no date: these are the fun ones, demos, and a demo wants no masthead.
    // The name is cell data, so the dust rises on it.
    n.innerHTML = `<div class="cell"><div class="pv"><img class="shot" src="${imgSrc(`canvas/${t.slug}.png`)}" alt="" loading="lazy" decoding="async"></div><div class="name k-lbl">${esc(t.label)}</div></div>`;
    n.querySelector('.shot').addEventListener('error', e=>e.target.remove());
    n.addEventListener('click', ()=>openPage(t.slug));
    keyable(n, t.label+': open', ()=>openPage(t.slug));
  } else if(t.type==='stack'){
    buildStack(t, n);
  } else if(t.type==='zone'){
    buildZone(t, n);
  } else if(t.type==='weather'){
    // THE WINDOW (issue #305): a square of sky in a plain frame, the hour
    // and the weather over the configured place now. One <canvas> at a backing pixel a
    // half cell, drawn by canvas/outlook.js (banded sky through the Bayer
    // dither, sun or moon, clouds, rain; nothing written on it) and
    // stepped by paintOutlook below. The label says what the picture says.
    n.innerHTML = `<canvas class="sky" width="${OUTLOOK_SIZE}" height="${OUTLOOK_SIZE}" role="img" aria-label="${esc(outlookLabel())}"></canvas><div class="name k-lbl">${esc(t.label)}</div>`;
    // THE SKY IS SHARED (round six): a sweep across the window pushes its
    // clouds (only ever the clouds: the sun and the moon never move under a
    // hand, and a clear sky pushes nothing), a tap gusts away from the
    // finger, a key gusts from the left; the room's offset comes back to every tab
    // watching (onSky, below). The sweep is measured against the tile, so a
    // drag that pans the camera carries the tile with the hand and pushes
    // nothing.
    const sky = n.querySelector('.sky');
    const rel = (e)=>{ const r = sky.getBoundingClientRect(); return r.width && r.height ? [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] : null; };
    let was = null;
    sky.addEventListener('pointermove', e=>{
      const at = rel(e); if(!at) return;
      if(was) skySweep((at[0] - was[0]) * OUTLOOK_SIZE / 2, (at[1] - was[1]) * OUTLOOK_SIZE / 2);
      was = at;
    });
    sky.addEventListener('pointerleave', ()=>{ was = null; });
    sky.addEventListener('click', e=>{ const at = rel(e); if(at) skyGust(Math.round((0.5 - at[0]) * 2 * PUSH_IN) || PUSH_IN, Math.round((0.5 - at[1]) * 2 * PUSH_IN)); });
    // the button's name carries the reading, since it hides the canvas's own
    keyable(n, outlookLabel() + ': push the sky', ()=>skyGust(PUSH_IN, 0));
  } else if(t.type==='icon'){
    const s = SOCIALS[t.s], name = t.label || s.name || t.s;
    // the glyph is CELL DATA (2026-09-11): the vendor drawing rasterised once
    // onto its own lattice and set as unit squares, so the same buffer the
    // titles run on can be disturbed under a cursor (dust, below)
    const glyph = pixelGlyph(t.s, s.svg);
    n.innerHTML = `<div class="cell"><div class="mark">${glyph.svg}</div><div class="name k-lbl">${esc(name)}</div></div>`;
    wireDust(n.querySelector('.mark svg'), glyph.g);
    // every mark in the ring has its link: a glyph with nowhere to go is
    // not put on the ground (the dimmed "handle pending" state and its native
    // tooltip went out with #336; a faded glyph read as broken, not as soon)
    const gosocial = ()=>exit(s.url);
    n.addEventListener('click', gosocial); keyable(n, name, gosocial);
  } else if(t.type==='bug'){
    // Maurice (BIBLE.md section 5): alive, or a splat for five minutes, for
    // everyone. The instant he is back is the room's (presence.onSquish);
    // the click squishes him here at once and the room's answer wins.
    // Maurice is a photograph now (2026-09-11): the ladybug picture cut to
    // its bounds and pixelated to 15 cells across at a quarter cell a
    // pixel, so he keeps his red and his shine and still sits on the
    // lattice; the splat is drawn in the picture's own red (--cv-brick-fixed
    // is sampled from it)
    n.innerHTML = `<div class="cell"><div class="mark"><img class="bug" src="${imgSrc('canvas/maurice.png')}" width="16" height="12" alt="" decoding="async">${pixelSprite(SPLAT_ROWS, 'splat')}</div><div class="name k-lbl">${esc(t.label)}</div></div>`;
    // the room's own length (five minutes live, five seconds while developing),
    // baked into the boot; the room's answer overrides this guess anyway.
    // A spectator's guess would never be answered (the room drops the
    // frame), so a spectator makes none (issue #260)
    const squish = ()=>{ if(!presence.mayAct() || mauriceUntil > presence.now()) return; setMaurice(presence.now() + (Number(BOOT?.maurice?.ms) || 5 * 60 * 1000)); presence.squish(); };
    n.addEventListener('click', squish);
    keyable(n, 'Maurice, a ladybug: squish him', squish);
  } else if(t.type==='slime'){
    // THE SLIME MOULD (BIBLE.md section 5, 2026-09-17): the motion lab's
    // physarum in a round dish, drawn on the cell from the frame the server
    // paints (canvas/slime.js is the arithmetic, services/slime.js the
    // clock). The dish is a <canvas> at one backing pixel a cell, shown a
    // cell a cell; the RIM is a line one cell thick over it, cell data
    // through pathFromGrid and wired to the dust, so a cursor entering the
    // dish breaks the rim the way it breaks a title. His name under it is
    // the type face, two lines (#336).
    // A tap drops food where it lands: on this tab at once, and on every
    // tab when the room's next frame comes back with it. Unless this tab
    // spectates (issue #260): then the send would be silent and the next
    // frame would erase the guess, so the guess is not made. The dish reads
    // as not-tappable meanwhile (aria-disabled, no tab stop, plain cursor),
    // set by presence.onSpectate below the frame decoder.
    const box = dishBox();
    const rim = rimGrid();
    const at = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px`;
    n.innerHTML = `<div class="cell"><canvas class="dish" width="${DISH}" height="${DISH}" style="${at}" role="img" aria-label="a slime mould growing in a dish"></canvas>`
      + `<svg class="rim" viewBox="0 0 ${DISH} ${DISH}" width="${box.w}" height="${box.h}" style="${at}" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path fill="currentColor" d="${pathFromGrid(rim)}"/></svg></div>`
      + t.label.split('\n').map((line, i)=>`<div class="name k-lbl" style="left:${box.x}px;width:${box.w}px;top:${box.y + box.h + SLIME_LABEL_GAP + i * (TYPE_LINE + SLIME_LINE_GAP)}px">${esc(line)}</div>`).join('');
    wireDust(n.querySelector('.rim'), rim);
    const dish = n.querySelector('.dish');
    const cellAt = (e)=>{
      const r = dish.getBoundingClientRect();
      if(!r.width || !r.height) return null;
      const x = Math.floor((e.clientX - r.left) / r.width * DISH);
      const y = Math.floor((e.clientY - r.top) / r.height * DISH);
      return inDish(x, y) ? [x, y] : null;
    };
    const drop = (at)=>{ if(!at || !presence.mayAct()) return; slimeFood(at[0], at[1]); presence.feed(at[0], at[1]); };
    dish.addEventListener('click', e=>drop(cellAt(e)));
    // the keyboard feeds the middle of the dish: a tap has a place, a key does not
    keyable(n, 'Sisyphus the Slime: feed him', ()=>drop([DISH >> 1, DISH >> 1]));
  }
  if(seat) addNode(t, n, d.w, d.h);
  return n;
}
// hero (special node: viewport-proportional)
// NOTE: the ids are the JS handles; the duplicate classes are the style
// hooks. CSS keys on the classes, never the ids.
const heroN = document.createElement('div');
heroN.className = 'el hero'; heroN.id = 'hero';
// the dots come AFTER the statement in the cell, which is what puts them
// under it: the cell is a centred column, so its order is the layout. They
// were above it for a few minutes; below reads as the statement's own pager,
// where above read as a rule over a heading.
heroN.innerHTML = `<div class="cell"><div id="heroText" class="heroText"></div><div id="heroDots" class="hero-dots"></div></div>`;
scene.appendChild(heroN);
// THE STATEMENT'S WORDS ARE THE DOCUMENT'S H1 once the prelude's has gone
// (mountHero keeps them). Not inside the hero: a tile off camera is not
// drawn at all, so a heading in it was gone the moment the camera left
// (/about lands on the zone), and inside the statement's button a screen
// reader never reads it. First in the canvas, drawn nowhere (.px-vh).
const heroHead = document.createElement('h1');
heroHead.className = 'px-vh';
scene.prepend(heroHead);
// THE STATEMENT IS ON THE WIRE (2026-09-16). A peer crossing it tears it for
// everyone, the way crossing an icon or a zone title already did.
//
// It works because the hero is ALREADY shared: the phrase is the room's
// (turnHero, over the pile's front frame) and the wrap is a world constant
// (HERO_W comes from heroFixed, not from the viewport), so every tab has the
// same lines broken in the same places at the same coordinates. A relayed
// point therefore lands on the same glyph cell everywhere, which is the
// whole requirement for shared dust and the reason a per-visitor hero could
// not have had it.
//
// This was briefly wired the other way, with the hero named directly in the
// pointermove handler so its dust stayed local. That was a smaller decision
// than it looked: the statement is the most looked-at thing on the ground, and
// a room where you can see somebody else disturb it is the point of the room.
heroN.dataset.hk = 'hero';
nodes.hero = {n:heroN, t:{id:'hero'}, wx:0, wy:0, w:HERO_W, h:HERO_H, hidden:false};
const heroBox = () => ({ x: nodes.hero.wx, y: nodes.hero.wy, w: nodes.hero.w, h: nodes.hero.h });
// seat a fixed node from a box the layout derived off the hero
function seat(o, box){
  o.wx = box.x; o.wy = box.y; o.w = box.w; o.h = box.h;
  o.n.style.width = box.w+'px'; o.n.style.height = box.h+'px';
  renderDirty = true;
}
// ---- ZONES (BIBLE.md section 5) -----------------------------------------------
// What fits in a paragraph and a few links is a place on the ground, not a
// page: the title in the display face (the logo's alphabet, where it belongs),
// the words in the type face, straight on the ground with no card around them. The
// copy is the server's (boot.zones, lib/zones.js) so curl and the canvas say
// the same thing.
const ZONES = Object.fromEntries((BOOT?.zones || []).map(z => [z.id, z]));
function buildZone(t, n){
  const z = ZONES[t.id] || { title: t.label.toUpperCase(), html: '' };
  // the title is the display face, set as pixel data (pixel-type.js): the
  // zone is named the way its door is, in the mark's own alphabet
  const word = (z.label || t.label).replace(/^\w/, (c) => c.toUpperCase());
  const title = pixelText(word, 'display');
  n.innerHTML = `<div class="cell zonecell"><h2 class="ztitle" data-title="${esc(z.title)}">${title.svg}<span class="px-vh">${esc(z.label || t.label)}</span></h2>
    <div class="zbody${z.split ? ' zsplit' : ''}">${z.html}</div></div>`;
  n.setAttribute('aria-label', z.label || t.label);
  // the title is cell data too: a cursor crossing it raises the dust
  wireDust(n.querySelector('.ztitle svg'), gridOf(word, 'display', 0));
  // links in a zone are real links; a same-site one rides the canvas router
  n.querySelectorAll('a[href^="/"]').forEach(a => a.addEventListener('click', e => {
    if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const slug = slugForPath(a.getAttribute('href'));
    const fan = stackForPath(a.getAttribute('href'));
    if(fan){ e.preventDefault(); openStack(fan); }
    else if(slug){ e.preventDefault(); openPage(slug); }
  }));
}

// ---- STACKS (BIBLE.md section 5) ---------------------------------------------
// A collection is one tile on the ground and a fan on the screen. The members
// are real tiles, built by mkTile like everything else but never seated:
// they live in #fan (a fixed layer over the canvas) and are laid out by
// fanLayout in screen space when their stack opens. The pile on the ground
// shows the FRONT member (an inert facsimile of its card) over two ground
// backs, with the name and the count under it. The fanned state is a route,
// so a link can land on it.
// THE FANNED STATE IS A PAGE, and it reads as one: a region named by its
// head, the head its h1 (the canvas under it is inert, the statement's h1
// with it), each card's title a level under the head (buildStack).
const fanN = document.createElement('div');
fanN.id = 'fan';
fanN.hidden = true;
fanN.setAttribute('role', 'region');
fanN.setAttribute('aria-labelledby', 'fanTitle');
fanN.innerHTML = `<div class="fanscrim"></div><div class="fanhead"><h1 id="fanTitle" class="k-meta"></h1><span class="fancount k-meta"></span></div><div class="fangrid" role="list" aria-label="collection"></div>`;
const fanTitle = fanN.querySelector('#fanTitle');
// inside #stage, right before #modal: #stage is position:fixed and so a
// stacking context, and a sibling of it at any z-index paints over everything
// inside it, the sheet included (which is how the first cut put the fan over
// the preview card). In the same context, 50 sits under the modal's 60 and
// the bar's 70 as intended.
$('#modal').before(fanN);
const fanGrid = fanN.querySelector('.fangrid');
const fanMembers = {}; // stack id -> member nodes, in order
const fanDefs = {};    // stack id -> member tile defs, same order
function membersOf(t){
  return MEMBERS.filter(m => m.stack === t.id);
}
const stackTile = id => LIVE_TILES.find(t => t.id === id && t.type === 'stack');
// which member each pile shows (BIBLE.md section 5): the room's, baked into
// the boot payload and turned over the wire; a tab with no socket turns
// its own
const stackFront = Object.assign({}, BOOT?.fronts || {});
// the snap scrollbar beside each pile (js/kit-scroll.js), by stack id, so a
// turn from anywhere (a stepper, the room, a scrub) moves the thumb
const stackBars = {};
// `peek` is a scrub in flight: the card under the thumb shows, the room is
// not told, and the thumb is the scrollbar's own until the hand lets go
function paintFront(id, node, peek){
  const n = node || nodes[id]?.n;
  const defs = fanDefs[id] || []; if(!n || !defs.length) return;
  const i = Math.min(defs.length - 1, Math.max(0, peek ?? (stackFront[id] || 0)));
  const host = n.querySelector('.card.front'); if(!host) return;
  // a turn replaces a card that was already showing; the first paint does not
  const turning = !node && !REDUCED && !!host.firstChild;
  host.innerHTML = '';
  // the front of the pile is a member's card, as a facsimile: inert paint,
  // ids stripped, so the pile shows a real card without being one
  const f = fanMembers[id][i].cloneNode(true);
  f.hidden = false;
  f.inert = true;
  f.setAttribute('aria-hidden', 'true');
  f.removeAttribute('role');
  f.removeAttribute('tabindex');
  f.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  f.classList.remove('member');
  f.classList.add('facsimile');
  f.style.transform = 'none';
  host.appendChild(f);
  // THE PILE TURNS (BIBLE.md section 9). It used to be an innerHTML swap
  // and nothing else: the pager's dot moved, the card under it changed
  // between two frames, and the one gesture that says "there is more than
  // one of these in here" said it by teleporting. A turn is material, so
  // it moves the way material moves. The card that was showing is gone at
  // once (close is instant) and the next one comes UP OUT OF THE PILE,
  // rising the two cells a hand lifts the front card by, resolving through
  // the ordered dither. Frames, never a curve, and never a fade. `node` is
  // buildStack laying the pile down for the first time, which is an
  // arrival the boot sweep already dithers: only a turn turns.
  if(turning) turnUp(f);
  if(peek == null) stackBars[id]?.set(i);
}
// the rise itself is a keyframe (canvas-home.css cv-turn-up) rather than two
// frames of inline style: the facsimile is not a scene node, so nothing
// rewrites its transform per frame and CSS can own the whole move.
function turnUp(f){
  f.classList.add('turnup');
  f.addEventListener('animationend', () => f.classList.remove('turnup'), { once: true });
}
// `send` is this tab's own hand; the room's echo arrives with send=false.
// A spectator's hand does nothing here (issue #260): the room would drop the
// frame and never echo it, so the pile would turn on this tab alone and stay
// turned, out of step with everyone, until the next reload.
function setFront(id, i, send){
  if(send && !presence.mayAct()) return;
  stackFront[id] = i;
  paintFront(id);
  if(send) presence.front(id, i);
}
function buildStack(t, n){
  const defs = membersOf(t);
  for(const old of fanMembers[t.id] || []) old.remove();
  fanDefs[t.id] = defs;
  fanMembers[t.id] = defs.map(m => {
    const mn = mkTile(m, false);
    mn.classList.add('member');
    mn.hidden = true;
    mn.setAttribute('role', 'listitem');
    // a card's title is one level under the fan's head, whatever tag the
    // card's own anatomy (and its stylesheet) sets it in
    for(const h of mn.querySelectorAll('h1, h2, h3, h4, h5, h6')) h.setAttribute('aria-level', '2');
    fanGrid.appendChild(mn);
    return mn;
  });
  const g = pileGeometry(t, defs[0] ? dims(defs[0]) : undefined);
  const card = (c, cls, z) => `<div class="card ${cls}" style="left:${c.x}px;top:${c.y}px;width:${g.card.w}px;height:${g.card.h}px;z-index:${z}"></div>`;
  // THE PAGER IS A SNAP SCROLLBAR (BIBLE.md section 5, #338): the kit's
  // .k-scroll on end beside the pile, as tall as the pile, the thumb at the
  // front card's slot. It turns the pile to another member's card, and it
  // turns it for EVERYONE: the front of a pile is the room's, over the
  // presence wire; a remote turn moves the thumb.
  // A scrub shows the card under the thumb to this tab alone and the
  // release commits it. Opening the pile is still the visitor's own.
  const titles = defs.map(d => (d.slug && PAGES[d.slug]?.title) || d.label || t.count);
  // THE COUNT, ON ITS OWN LINE (#339): the name, then under it how many,
  // in the same face and size one step dimmer (mute is the note beside a
  // name).
  const count = countLine(t, defs.length);
  n.innerHTML = `<div class="cell stackcell"><div class="pile">${g.backs.map((b, i) => card(b, 'back', g.backs.length - i)).join('')}${card(g.front, 'front', g.backs.length + 1)}</div>
    <span class="pager" style="left:${g.pager.x}px;top:${g.pager.y}px;height:${g.pager.h}px">${scrollMarkup({ titles, at: stackFront[t.id] || 0, vert: true, label: `${t.label}: which card` })}</span>
    <div class="slabel" style="left:${g.label.x}px;top:${g.label.y}px;width:${g.label.w}px"><div class="name k-lbl">${esc(t.label)}</div>${count ? `<div class="count k-lbl">${esc(count)}</div>` : ''}</div></div>`;
  const pager = n.querySelector('.pager');
  stackBars[t.id] = wireScroll(pager.querySelector('.k-scroll'), {
    titles,
    onCommit: i => setFront(t.id, i, true),
    // a spectator's scrub would show a card the room never turns to
    onScrub: i => { if(presence.mayAct()) paintFront(t.id, null, i ?? undefined); },
  });
  paintFront(t.id, n);
  // the scrollbar's gestures are its own: the canvas does not pan under a
  // drag, open the pile under a click, or step the camera under a key
  pager.addEventListener('click', e => e.stopPropagation());
  pager.addEventListener('pointerdown', e => e.stopPropagation());
  pager.addEventListener('keydown', e => e.stopPropagation());
  const open = ()=>openStack(t.id);
  n.addEventListener('click', open);
  // The pile is the press and the scrollbar its sibling, never inside it:
  // a button holding buttons is one control to a screen reader, which reads
  // none of them. The tile is the group the two stand in, named for the pile.
  n.setAttribute('role', 'group');
  n.setAttribute('aria-label', t.label);
  const pile = n.querySelector('.pile');
  keyable(pile, `${t.label}: ${count || defs.length}, open the collection`, open);
}
LIVE_TILES.forEach((t) => mkTile(t)); // not forEach(mkTile): the index would arrive as `seat`
// the etched line: instructions and the visitor tally, carved into the
// ground below the hero doors. World-space (a nodes entry, so it pans,
// zooms and wraps like everything else), permanent: no dismissal, the
// canvas simply says how it works. Two lines: how the canvas moves, then
// what the moving finds, because a world that repeats is the one thing
// about this canvas nobody can discover by looking (you would have to pan
// a whole world to meet the same tile twice). The tally is three
// split-flap digits; presence.onCount drives them and the digit swaps at
// the half turn.
const etchedN = document.createElement('div');
etchedN.id = 'etched';
// the class is the style hook: a cut tile's copy loses its ids (mirror.js)
etchedN.className = 'etched';
// set in the type face (#336: the pixel face is for the hero titles and
// the logo alone), and the tally is the kit's split flaps (.k-flaps), the
// part that exists for a number everyone shares, a cell's air off its words.
// It is born hidden: the zeros in it are placeholders, not a count, and the
// first count it is told (the page's, then the room's) is what it shows.
etchedN.innerHTML = `<span class="lines"><span class="line k-meta">drag, scroll and zoom to explore</span><span class="line k-meta">the site wraps around in every direction</span></span>
  <span class="others" aria-live="polite" hidden><span class="k-flaps k-sm">${'<span class="k-flap" data-d="0"><span class="card">0</span></span>'.repeat(3)}</span><span class="olbl k-meta">others here</span></span>`;
scene.appendChild(etchedN);
nodes.etched = {n:etchedN, t:{id:'etched', type:'etched'}, wx:0, wy:0, w:0, h:0, hidden:false};
// THE MARK LEFT THE GROUND (2026-09-16). The classic A was stamped above the
// hero for as long as the hero was set in the type face, because the statement and
// the logo were two different hands and the ground needed the logo to say
// whose ground it was. The statement is now set in the mark's OWN alphabet
// (mountHero), and every phrase opened on a word starting with the mark's A,
// so the A above it was the same letter in the same face twice, once as a word and once as a
// monogram. Condensing the two was the whole point of moving the hero into
// this face; leaving the monogram there would have been doing the work and
// not taking the result.
// MARK_A itself stays: it is the avatar on a quotation (.qav), which is the
// one place the monogram is still doing a monogram's job.
function positionEtched(){ seat(nodes.etched, etchedBox(heroBox())); }
// the seam, drawn. The world is a torus: its boundary is not a wall but the
// line where the same ground starts again, and it is the one fact about this
// canvas nobody can see by looking (which is why the etched line says it).
// So the seam is DRAWN: the vertical line where world x wraps, the
// horizontal line where world y wraps, each spanning the whole viewport.
//
// It was a world-sized box with a border first, and that box was the bug:
// its line stopped at its own corners, so a seam read as a rectangle
// floating on the ground, shifting from canvas to canvas as you panned,
// rather than as the grid the torus actually is. The lines span the frame
// now, so a seam crossing is a full cross and a pan slides one continuous
// line across the screen.
//
// Screen geometry, not world geometry: the position is the camera's wrap
// (one modulo per axis, in render(), the only place that knows where the
// camera is) and the weight is stated in screen px through --cv-world-k
// (setSceneTransform publishes 1/scale, the same inverse the world's tap
// targets use), so the line holds at the cover camera where a 2px world
// line would be a quarter of a pixel. Not a nodes entry: the seam is the
// ground's own structure, so it stays under the lens like the ground does.
const seamV = document.createElement('div');
seamV.id = 'seamV';
seamV.className = 'seam seam-v';
seamV.setAttribute('aria-hidden', 'true');
const seamH = document.createElement('div');
seamH.id = 'seamH';
seamH.className = 'seam seam-h';
seamH.setAttribute('aria-hidden', 'true');
scene.append(seamV, seamH);
// the grid (BIBLE.md sections 2 and 3): the ground shows the lattice it is
// built on. Two layers under everything: the module lattice (12 cells,
// where every tile edge lands) at every camera, and the cell lattice (the
// logo's pixel) that comes up as the camera nears 1:1, where a cell is wide
// enough on the device to hold a line and ground on both sides of it. Both
// are drawn as repeating hairlines positioned by the camera's own wrap, the
// way the seam is; the fine layer's opacity is the level of detail, so the
// grid never turns into gray at the cover camera. Texture, not information:
// a forced palette drops it and loses nothing (canvas-home.css).
const gridN = document.createElement('div');
gridN.id = 'grid';
gridN.setAttribute('aria-hidden', 'true');
const gridFineN = document.createElement('div');
gridFineN.id = 'gridFine';
gridFineN.setAttribute('aria-hidden', 'true');
scene.prepend(gridN, gridFineN);
function renderGrid(){
  if(!WORLD_W || !WORLD_H) return;
  // where the lattice origin lands in scene units, wrapped on its own
  // period and rounded to a device pixel so a hairline paints whole
  const q = Z * DPR();
  const at = (c, period) => Math.round(((((-c) % period) + period) % period) * q) / q;
  gridN.style.backgroundPosition = `${at(camX, M)}px ${at(camY, M)}px`;
  gridFineN.style.backgroundPosition = `${at(camX, PX)}px ${at(camY, PX)}px`;
  // level of detail: a cell under four device px cannot hold a line and
  // ground; at eight it can, and the lattice is full
  const cell = PX * q;
  gridFineN.style.opacity = String(Math.max(0, Math.min(1, (cell - 4) / 4)));
}
// ---- the minimap (BIBLE.md section 8) -------------------------------------------
// The world in the corner, as it looks: an actual map (author, 2026-09-26:
// "the minimap should be a full size screenshot of the world ran through
// textmode or shrunken otherwise. An actual minimap"). Every tile's own
// picture (the plan's, below: the tile as it renders, one pixel per world
// cell) laid on the ground where the tile sits, shrunk to the map's cell by
// averaging, and each map cell set back in the site's inks through the
// same ordered dither the kit's parts wear, so the corner is the world in
// miniature and still made of cells. Built once per size, per ink and per
// picture that lands, and blitted each frame; the camera's frame is drawn
// over it. It used to be grey footprints on the ground, which said where things
// were and nothing of what they were.
// The frame the camera holds, wrapped where it crosses a seam. Screen chrome,
// drawn on a canvas in the two inks (read off the tokens, never typed). A
// drag on it moves the camera; the map is a slider for the world.
//
// IN CELLS since 2026-09-15 (section 10). It used to be the one instrument
// left on the screen: translucent ink at 22%, a hairline around the hero and
// a 2px stroked frame that sat wherever the arithmetic put it, which on a
// surface built from a 4px cell read as the one soft thing in the corner.
// The map has its own cell now, MAPPX at two CSS px, and the ground is 96 x 54
// of them: EXACTLY a tenth of the world's 960 x 540, so one map cell is ten
// world cells and nothing is ever drawn on a fraction. Footprints are solid
// blocks in the mute, the hero is a solid block in the ink, and the camera
// frame is four filled bars rather than a stroke.
const minimap = document.getElementById('minimap');
const MAPPX = 2; // the map's own cell, in CSS px: the frame's line
// the world's picture is set finer than the frame, a CSS px a dot (two
// device px on a phone), because the world is line art: at the frame's
// cell each dot averaged ten world cells and the thin ink averaged away
const MAPWORLD = 1;
let mapInk = null;
function mapColors(){
  const cs = getComputedStyle(document.documentElement);
  mapInk = {
    ink: cs.getPropertyValue('--cv-ink').trim(),
    ground: cs.getPropertyValue('--cv-ground').trim(),
    mute: cs.getPropertyValue('--cv-mute').trim(),
    brick: cs.getPropertyValue('--cv-brick').trim(),
  };
}
// the frame the camera holds, as world corners, wrapped by its centre so
// the rectangle stays whole; the map draws it at every neighbouring wrap
// and clips, so a frame over a seam shows in its pieces
function frameCorners(){
  const cx = ((camX + viewW()/2) % WORLD_W + WORLD_W) % WORLD_W, cy = ((camY + viewH()/2) % WORLD_H + WORLD_H) % WORLD_H;
  const hw = viewW()/2, hh = viewH()/2;
  return { x: cx - hw, y: cy - hh, w: 2 * hw, h: 2 * hh };
}
// THE WORLD, SHRUNK: every tile's plan picture on the ground at the map's
// cell, averaged down, then each cell put back in the inks (ink, mute,
// ground, and brick where the picture is warm) by the 4x4 Bayer order, the
// kit's dither, imported from its one source (js/textmode-settings.js). A
// tile whose picture has not landed yet is its footprint in the mute until
// it does.
let mapWorld = null;
const rgbOf = (css) => {
  const t = document.createElement('canvas').getContext('2d');
  t.fillStyle = css;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(t.fillStyle);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128];
};
const lumOf = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
function mapWorldPicture(cw, ch){
  const pics = Object.keys(nodes).filter(id => nodes[id].t && nodes[id].t.type !== 'stamp' && planPic(id)).length;
  if(mapWorld && mapWorld.cw === cw && mapWorld.ch === ch && mapWorld.ink === mapInk && mapWorld.pics === pics) return mapWorld.canvas;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.fillStyle = mapInk.ground; c.fillRect(0, 0, cw, ch);
  const k = cw / WORLD_W;
  for(const id in nodes){
    const o = nodes[id];
    if(!o.t || o.t.type === 'stamp' || !o.w || !o.h) continue;
    const pic = planPic(id);
    if(pic) c.drawImage(pic, o.wx * k, o.wy * k, o.w * k, o.h * k);
    else { c.fillStyle = mapInk.mute; c.fillRect(o.wx * k, o.wy * k, o.w * k, o.h * k); }
  }
  // each cell back in the inks: a grey between two of the ramp is the
  // lighter over the darker by the Bayer order; a warm cell is brick
  const ramp = [mapInk.ink, mapInk.mute, mapInk.ground].map(rgbOf).map(v => ({ v, l: lumOf(v) })).sort((a, b) => a.l - b.l);
  const brick = rgbOf(mapInk.brick);
  const img = c.getImageData(0, 0, cw, ch), d = img.data;
  for(let y = 0; y < ch; y++) for(let x = 0; x < cw; x++){
    const i = (y * cw + x) * 4;
    const px = [d[i], d[i + 1], d[i + 2]];
    const hi = Math.max(...px), lo = Math.min(...px);
    let out;
    if(hi > 60 && (hi - lo) / hi > 0.35 && px[0] === hi) out = brick;
    else {
      // line art shrunk averages its ink toward the ground, so a cell is read
      // darker than its plain mean (a curve, not a threshold): a line one
      // cell thin still lands as a dot. The curve is the ground's, so the
      // ground itself stays ground and only what is darker than it deepens
      const top = ramp[ramp.length - 1].l, raw = lumOf(px);
      const l = raw >= top ? raw : top * Math.pow(raw / top, 1.8);
      let a = ramp[0], b = ramp[ramp.length - 1];
      for(let n = 0; n < ramp.length - 1; n++) if(l >= ramp[n].l && l <= ramp[n + 1].l){ a = ramp[n]; b = ramp[n + 1]; }
      const t = b.l === a.l ? 0 : Math.min(1, Math.max(0, (l - a.l) / (b.l - a.l)));
      out = t > (BAYER4[(y % 4) * 4 + (x % 4)] + 0.5) / 16 ? b.v : a.v;
    }
    d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  mapWorld = { canvas: cv, cw, ch, ink: mapInk, pics };
  return cv;
}
// the world, shrunk, and the frame the camera holds over it
function drawMinimap(){
  if(!minimap || !WORLD_W || minimap.hidden) return;
  const w = minimap.clientWidth; if(!w) return;
  const dpr = DPR();
  const h = Math.round(w * WORLD_H / WORLD_W / MAPPX) * MAPPX;
  if(minimap.style.height !== h + 'px') minimap.style.height = h + 'px';
  if(minimap.width !== Math.round(w*dpr) || minimap.height !== Math.round(h*dpr)){ minimap.width = Math.round(w*dpr); minimap.height = Math.round(h*dpr); }
  if(!mapInk) mapColors();
  const c = minimap.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const k = w / WORLD_W;
  // every edge of the frame lands on the map's cell
  const snap = (v) => Math.round(v * k / MAPPX) * MAPPX;
  // the world, one map cell per MAPPX, drawn whole (never smoothed up)
  c.imageSmoothingEnabled = false;
  c.drawImage(mapWorldPicture(Math.round(w / MAPWORLD), Math.round(h / MAPWORLD)), 0, 0, w, h);
  // the camera frame: four bars a cell thick in ink, each with a cell of
  // ground outside it so the frame reads over a dark tile as well as the
  // ground, at every neighbouring wrap so a frame over a seam still shows in
  // its pieces, clipped to the map
  const f = frameCorners();
  c.save();
  c.beginPath(); c.rect(0, 0, w, h); c.clip();
  const bars = (x, y, fw, fh, t) => {
    c.fillRect(x, y, fw, t);
    c.fillRect(x, y + fh - t, fw, t);
    c.fillRect(x, y, t, fh);
    c.fillRect(x + fw - t, y, t, fh);
  };
  for(const ox of [-1, 0, 1]) for(const oy of [-1, 0, 1]){
    const x = snap(f.x + ox * WORLD_W), y = snap(f.y + oy * WORLD_H);
    const fw = Math.max(MAPPX, snap(f.w)), fh = Math.max(MAPPX, snap(f.h));
    c.fillStyle = mapInk.ground; bars(x - MAPPX, y - MAPPX, fw + 2 * MAPPX, fh + 2 * MAPPX, MAPPX);
    c.fillStyle = mapInk.ink; bars(x, y, fw, fh, MAPPX);
  }
  c.restore();
  // NOTE: the first draw is what shows the map; until then it is laid out but
  // unseen, so it never sits in the corner as a blank tile (#242)
  if(minimap.style.visibility) minimap.style.visibility = '';
}
// ---- the plan: the world past the mount floor (#303) ------------------------
// Out past the mount floor (only a watch has one short of cover,
// layout.js MOUNT_OUT) the camera holds more world than the device should
// mount, so nothing mounts and this one canvas paints the world: ground, and
// every tile's REAL PICTURE where the tile would be, never a flat footprint
// (a world of blobs made no sense to look at). The pictures are the tiles as
// they render, pixelated once at one pixel per world cell through the
// toolkit (scripts/img/bake-plan.mjs), loaded the first time the plan draws:
// one decode per tile, done once. Each lands on the tile's own rect at the
// camera's scale, so the switch from plan to mounted moves nothing
// (scripts/verify/world-fixed.mjs holds it at the floor). It takes no
// pointer: the scene under it still owns pan, pinch and wheel.
const planEl = document.getElementById('plan');
const planPics = {};
// where the last plan put each picture, in screen px, for the audit
let planDrawn = [];
function planPic(id){
  if(!(id in planPics)){
    const img = document.createElement('img');
    planPics[id] = null;
    img.onload = () => { planPics[id] = img; renderDirty = true; };
    img.src = imgSrc(`canvas/plan/${id}.png`);
  }
  return planPics[id];
}
function drawPlan(on){
  if(!planEl) return;
  if(planEl.hidden === on) planEl.hidden = !on;
  if(!on || !WORLD_W) return;
  const dpr = DPR();
  if(planEl.width !== Math.round(VW*dpr) || planEl.height !== Math.round(VH*dpr)){ planEl.width = Math.round(VW*dpr); planEl.height = Math.round(VH*dpr); }
  if(!mapInk) mapColors();
  const c = planEl.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = mapInk.ground; c.fillRect(0, 0, VW, VH);
  // a cell drawn whole wherever it covers a device pixel or more; under
  // that nothing on the canvas is crisp (layout.js snapZoom), so it blends
  c.imageSmoothingEnabled = PX * Z * dpr < 1;
  planDrawn = [];
  for(const id in nodes){
    const o = nodes[id];
    if(!o.t || o.t.type === 'stamp' || !o.w || !o.h) continue;
    const pic = planPic(id);
    if(!pic) continue;
    // a picture the frame's edge cuts is drawn at both edges, its two parts
    // (layout.js wrapSpots): never the same part twice
    for(const x of wrapSpots(o.wx, camX, WORLD_W, viewW(), o.w))
      for(const y of wrapSpots(o.wy, camY, WORLD_H, viewH(), o.h)){
        c.drawImage(pic, x * Z, y * Z, o.w * Z, o.h * Z);
        planDrawn.push({ id, x: x * Z, y: y * Z, w: o.w * Z, h: o.h * Z });
      }
  }
}
// ---- the map's toggle and the phone's shared slot (#303) --------------------
// Open on a desktop and on a phone (layout.js mapOpenAt), and a
// density change puts it back to that density's default. A desktop's map
// sits in the corner beside its toggle; a phone has one middle slot, the
// field's, and the map takes it in turns: the field comes in from the left,
// the map from the right, never both. The watch has no chrome and no map.
const topbarN = document.getElementById('topbar');
const mapBtn = document.getElementById('mapBtn'), findBtn = document.getElementById('findBtn');
let mapDensity = chromeDensity(innerWidth, innerHeight), mapOpen = mapOpenAt(mapDensity);
function sizeMap(){
  if(!minimap) return;
  const d = chromeDensity(innerWidth, innerHeight);
  if(d !== mapDensity){ mapDensity = d; mapOpen = mapOpenAt(d); topbarN.classList.remove('swap'); }
  const shared = slotShared(d);
  minimap.hidden = d === 'watch' || !mapOpen;
  minimap.style.width = CHROME.mapW + 'px';
  minimap.dataset.at = shared ? 'slot' : 'corner';
  topbarN.dataset.slot = shared && mapOpen ? 'map' : 'search';
  findBtn.hidden = !shared;
  findBtn.setAttribute('aria-pressed', String(!mapOpen));
  mapBtn.setAttribute('aria-pressed', String(mapOpen));
  // the kit's lit face says the same thing the attribute does
  findBtn.classList.toggle('is-on', !mapOpen);
  mapBtn.classList.toggle('is-on', mapOpen);
  syncMapBtn();
}
// the right column is the close's while a sheet or a fan is up
function syncMapBtn(){ if(mapBtn) mapBtn.hidden = mapDensity === 'watch' || !$('#close').hidden; }
// drag the frame: the pointer names the world point the camera centres on
let mapDrag = false;
function mapAim(e){
  const r = minimap.getBoundingClientRect();
  return { wx: (e.clientX - r.x) / r.width * WORLD_W, wy: (e.clientY - r.y) / r.height * WORLD_H };
}
if(minimap){
  minimap.addEventListener('pointerdown', e=>{
    if(modalOpen() || curFan) return;
    e.preventDefault(); mapDrag = true; homeTween = null; vx = vy = 0;
    try{ minimap.setPointerCapture(e.pointerId); }catch{ /* pointer already gone */ }
    const { wx, wy } = mapAim(e);
    camX = wx - viewW()/2; camY = wy - viewH()/2; renderDirty = true;
  });
  minimap.addEventListener('pointermove', e=>{
    if(!mapDrag) return;
    const { wx, wy } = mapAim(e);
    camX = wx - viewW()/2; camY = wy - viewH()/2; renderDirty = true;
  });
  const mapEnd = ()=>{ if(!mapDrag) return; mapDrag = false; restCam(); renderDirty = true; save(); scheduleZoomSettle(); };
  minimap.addEventListener('pointerup', mapEnd);
  minimap.addEventListener('pointercancel', mapEnd);
  // the map is chrome: it wears the density the bar wears
  // four modules wide (CHROME.mapW), which is 96 of the map's own cells: the
  // world's 960 cells at ten to one, so the plan is the ground decimated
  // rather than scaled
  minimap.style.visibility = 'hidden';
  sizeMap();
  addEventListener('resize', sizeMap);
  mapBtn.addEventListener('click', e=>{ e.stopPropagation(); showMap(!mapOpen); });
  findBtn.addEventListener('click', e=>{ e.stopPropagation(); showMap(false); searchEl.focus(); });
  new MutationObserver(()=>{ mapInk = null; renderDirty = true; }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}
function showMap(open){
  if(!minimap || open === mapOpen) return;
  mapOpen = open;
  // the slide plays on a turn, never on the first paint, and only where the
  // slot is shared: a desktop's toggle leaves the field exactly where it is
  topbarN.classList.toggle('swap', slotShared(mapDensity));
  sizeMap();
  renderDirty = true; // a map just shown draws on the next frame
}
function renderSeam(){
  if(!WORLD_W || !WORLD_H) return;
  // where world 0 lands in scene units, when the frame holds it. ONE line
  // per axis: a view no longer than the world holds its edge once at most
  // (layout.js seamAt), so the seam is drawn once, where the world wraps
  seamLine(seamV, seamAt(camX, WORLD_W, viewW()), 'X');
  seamLine(seamH, seamAt(camY, WORLD_H, viewH()), 'Y');
}
function seamLine(seam, at, axis){
  seam.style.display = at === null ? 'none' : '';
  if(at !== null) seam.style.transform = `translate${axis}(${at}px)`;
}
// The light is one fixed lamp, high and to the left, and it lives entirely
// in canvas-tokens.css (--cv-cast-x/y). There is nothing to compute per
// card and nothing here to keep in step with the camera.
//
// This is where applyCast() used to be: it walked every node each settle
// and wrote a per-card --cv-cast-x/y pointing away from the hero. Those
// writes never reached a pixel. var() inside a custom property is
// substituted where the property is DECLARED, so --cv-shadow resolved the
// cast at :root and inherited already-substituted; an element-level
// --cv-cast-x could not change it. See BIBLE.md section 12 and
// test/elevation.test.js, which fails the build if anything starts
// writing those properties again.
function setOthers(count){
  // null is presence.js saying this engine cannot see company at all (no
  // WebSocket). That is not zero. Zero is a measurement, and claiming one we
  // did not take would be the tally lying in the one direction it can: the
  // canvas is as busy as ever, this tab just has no window onto it. So the
  // mark keeps its instruction and drops the count.
  const off = count == null;
  // a count that APPEARS is not a count that changed: the first one, and the
  // first after a room it was hidden for, is born on its digits, and only a
  // change to a count already showing turns
  const shown = !etchedN.querySelector('.others').hidden;
  etchedN.querySelector('.others').hidden = off;
  if(off) return;
  const digits = String(Math.min(999, Math.max(0, count))).padStart(3, '0');
  // the tally agrees with itself: one visitor is an "other", not "others"
  etchedN.querySelector('.olbl').textContent = count === 1 ? 'other here' : 'others here';
  etchedN.querySelectorAll('.k-flap').forEach((f, i) => {
    const d = digits[i];
    if(f.dataset.d === d) return;
    // the TURN (canvas-home.css cv-burn / cv-rise): the old digit goes from
    // the bottom up, a row a frame, and the new one rises from below in the
    // same steps. A change mid-turn restarts with the digit that is true now.
    f.dataset.d = d;
    const fresh = () => { f.innerHTML = `<span class="card">${d}</span>`; };
    if(REDUCED || !shown || !f.querySelector('.card')){ fresh(); return; }
    const old = f.querySelector('.card');
    f.querySelectorAll('.card.rise').forEach(el => el.remove());
    old.classList.remove('rise');
    old.classList.add('burn');
    const rise = () => {
      if(f.dataset.d !== d) return; // a newer digit took over mid-turn
      f.innerHTML = `<span class="card rise">${d}</span>`;
      f.querySelector('.card').addEventListener('animationend', () => { const c = f.querySelector('.card'); if(c) c.classList.remove('rise'); }, { once: true });
    };
    old.addEventListener('animationend', rise, { once: true });
  });
}
// Freshness as design, not secret: boot.meta carries each source's last
// live fetch. A tile serving data older than half an hour whispers it in
// the label, in the same honest-recency voice agoShort speaks. A source
// with no meta yet (cold boot) stays quiet; the transient is seconds long.
// terse honest recency: minutes under an hour, hours under a day, then days.
function agoShort(iso){
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(iso))/60000));
  if(mins < 60) return mins + 'm';
  const hrs = Math.round(mins/60);
  if(hrs < 24) return hrs + 'h';
  return Math.round(hrs/24) + 'd';
}
const SRC_OF = { weather:'weather' };
function staleWhisper(id){
  const src = SRC_OF[id];
  const at = src && BOOT?.meta?.[src];
  if(!at || (Date.now() - Date.parse(at))/60000 <= 30) return;
  const o = nodes[id]; if(!o) return;
  const lbl = o.n.querySelector('.albl') || o.n.querySelector('.lbl');
  if(lbl && !lbl.textContent.includes(' · as of ')) lbl.textContent += ` · as of ${agoShort(at)}`;
}
LIVE_TILES.forEach(t=>staleWhisper(t.id));
// placeWorld is pure and deterministic by contract (BIBLE.md section 3),
// which is exactly the property that makes a memo safe: same input, same
// output, so a repeat call cannot do anything but burn the main thread.
//
// It was being paid twice on every cold load. boot() lays out once on the
// fallback face so the stage is not blank, then again after the webfont settles,
// and the second solve recomputes an identical world every time: the hero box
// is heroFixed(), a derivation off DESIGN_VIEW, and since the furniture stopped
// being measured (layout.js FURNITURE) nothing in the input can move when a
// webfont lands at all. Memoizing collapses that to one, and covers the resize
// handler too, where a drag that does not cross a module boundary produces the
// same input over and over. The second call stays: it is cheap now, and the
// typed statement still remounts on the real face.
let placeSig = '';
let placeOut = null;
function placeWorldMemo(input) {
  // Every field placeWorld actually reads: tile identity and module dims
  // and the hero box. Tags ride the id -
  // they are static per tile. The chrome band left this signature with the
  // world reservation: it is a camera property now, so it cannot re-solve.
  const sig = JSON.stringify([
    input.tiles.map((t) => [t.id, t.type, t.mw, t.mh]),
    input.hero,
  ]);
  if (sig !== placeSig) {
    placeSig = sig;
    placeOut = placeWorld(input);
  }
  return placeOut;
}

function layout(){
  // the view the solver sees is the DESIGN view baked into placeWorld,
  // so the world is the same on every device
  const out = placeWorldMemo({
    tiles: LIVE_TILES,
    hero: { w: HERO_W, h: HERO_H },
  });
  WORLD = out.world; WORLD_W = out.world.w; WORLD_H = out.world.h;
  updateZoomBounds();
  const heroOldX = nodes.hero.wx, heroOldY = nodes.hero.wy;
  for(const t of LIVE_TILES){
    const pos = out.tiles[t.id];
    nodes[t.id].wx = pos.x; nodes[t.id].wy = pos.y;
  }
  nodes.hero.wx = out.hero.x; nodes.hero.wy = out.hero.y;
  // WARNING: composed placement must owe nobody air; a nonzero count here
  // is a layout.js bug (the unit tests assert zero across the matrix)
  if(out.violations) console.warn('[layout] resolver violations:', out.violations);
  // the hero never moves on screen: shift the camera with the re-centering
  if(placedOnce){ camX += nodes.hero.wx-heroOldX; camY += nodes.hero.wy-heroOldY; }
  placedOnce = true;
  // the etched line rides the hero: re-seat it on every settle
  positionEtched();
  renderDirty = true;
}
let placedOnce = false;
// headless layout audits (CDP verification): the settled world as data.
// Read-only, nothing on the page uses it.
window.__layout = () => ({
  world: {w: WORLD_W, h: WORLD_H},
  view: {w: VW, h: VH, z: Z, minZ, outZ, mountZ},
  plan: planEl && !planEl.hidden ? planDrawn : [],
  cam: {x: Math.round(camX), y: Math.round(camY)},
  hero: {fs: HERO_FS, lh: HERO_LH, w: HERO_W, h: HERO_H},
  tiles: Object.fromEntries(Object.entries(nodes).map(([id,o]) =>
    [id, {x: Math.round(o.wx), y: Math.round(o.wy), w: o.w, h: o.h}])),
});

// ---- toroidal render ------------------------------------------------------------
// wrapPos and wrapSpots live in layout.js. A tile the frame's edge cuts shows
// its other part at the opposite edge, as a LIVE copy (canvas/mirror.js):
// repainted every frame, re-cloned on any change, never the same part twice.
// A node's own style writes (the transform render() moves it with) are not a
// change of content, so they do not re-clone.
const mirror = createMirror({
  parent: scene,
  observe(node, cb){
    const mo = new MutationObserver(recs => {
      if(recs.some(r => !(r.target === node && r.attributeName === 'style'))) cb();
    });
    mo.observe(node, { subtree: true, childList: true, attributes: true, characterData: true });
    return mo;
  },
});

// ---- the window (issue #305) ---------------------------------------------------
// The weather tile's canvas, stepped on the wall clock so every tab shows
// the same drop in the same place. A step is drawn only when the tile is
// on screen and the page is showing, and only when the step has changed.
// It stands still (one frame a minute, for the hour) under reduced motion, ?bare and
// ?frozen, and at the watch density, where the amount of motion in view is
// what kills the wrist.
const OUTLOOK_STILL = REDUCED || BARE;
let outlookKey = null, outlookCanvas = null, outlookInks = null, outlookStillNow = OUTLOOK_STILL;
// the room's offset, whole cells (services/sky.js); a still sky ignores it
let skyAt = [0, 0];
function outlookLabel(){
  const t = WEATHER.tempF !== '' && WEATHER.tempF != null ? WEATHER.tempF + '°' : '';
  return [t, WEATHER.cond, WEATHER.place].filter(Boolean).join(', ') || 'the weather';
}
function paintOutlook(){
  const o = nodes.weather; if(!o || o.hidden) return;
  const c = o.n.querySelector('.sky'); if(!c) return;
  const still = OUTLOOK_STILL || chromeDensity(VW, VH) === 'watch';
  outlookStillNow = still;
  // the room's clock, so every tab watching is on the same step
  const now = presence.now();
  const step = still ? 0 : Math.floor(now / OUTLOOK_STEP);
  const push = still ? [0, 0] : skyAt;
  // a still sky still keeps the hour: it redraws on the minute, never faster
  const key = still ? 'still' + Math.floor(now / 60000) : step + ':' + push;
  if(c === outlookCanvas && key === outlookKey) return;
  if(c !== outlookCanvas){ outlookCanvas = c; c.oncontextrestored = ()=>{ outlookCanvas = null; paintOutlook(); }; }
  if(!outlookInks){
    const cs = getComputedStyle(document.documentElement);
    outlookInks = Object.fromEntries(Object.entries(OUTLOOK_INKS).map(([k, v])=>[k, cs.getPropertyValue(v).trim()]));
  }
  outlookKey = key;
  const g = c.getContext('2d'), img = g.createImageData(OUTLOOK_SIZE, OUTLOOK_SIZE);
  img.data.set(outlookFrame(WEATHER, now, step, outlookInks, push));
  g.putImageData(img, 0, 0);
}
if(!OUTLOOK_STILL) setInterval(()=>{ if(!document.hidden) paintOutlook(); }, OUTLOOK_STEP);

// ---- live presence: other tabs' cursors on the same torus ----------------------
// Same-origin socket, live-only, no storage. The pointer maps to a world
// fraction by inverting wrapPos (screen -> stage -> world, mod the seams);
// peers render through wrapPos above, so they wrap at the edges like tiles do.
// PRESENCE ON EVERY PAGE (issue #327): the same socket carries a reader's
// place on a page, as the block under the pointer and a fraction of its box
// (anchor.js), and the modal hosts a second cursor layer for the peers on
// the same page. locateAt is the way back: an anchor to a screen point, on
// this screen's boxes.
// and the room it opens in: the one the address names, or the public room
// (initialRoom, below)
const bootRoom = initialRoom();
// the room the address says this tab is in, as {kind, code} ('new' for a
// bare flag until the room names it), or null for the public room. Every
// navigation carries it (roomed), so walking the site is staying in the
// room, and taking it off the address is leaving (BIBLE.md section 2).
let roomFlag = bootRoom && { kind: bootRoom.kind, code: bootRoom.code };
const roomed = path => path + withRoom('', roomFlag);
const presence = initPresence({ scene, wrapPos, pageLayer: $('#modal'), locate: locateAt, room: bootRoom, others: BOOT?.others });
// the count is honest company, not analytics: other live participants only,
// self excluded. It drives the etched split-flap tally under the hero. The
// page says it first (boot.others) and the roster after, so the tally is
// born on a count and never turns from a zero nobody took.
presence.onCount(setOthers);
// Maurice's state is the room's: the boot payload says where he stands and
// the wire says when that changes. A timer revives him at the room's instant
// on every tab at once (the clock is the room's, presence.now()).
let mauriceUntil = Number(BOOT?.maurice?.until) || 0;
let mauriceT = null;
function setMaurice(until){
  mauriceUntil = until;
  const o = nodes.maurice; if(!o) return;
  const squished = mauriceUntil > presence.now();
  o.n.classList.toggle('squished', squished);
  o.n.setAttribute('aria-label', squished ? 'Maurice, a ladybug, squished for now' : 'Maurice, a ladybug: squish him');
  clearTimeout(mauriceT);
  if(squished) mauriceT = setTimeout(()=>setMaurice(mauriceUntil), Math.max(0, mauriceUntil - presence.now()) + 20);
}
presence.onSquish(setMaurice);
// ---- the slime mould's picture ------------------------------------------------
// The server paints, this decodes and puts cells on the dish: one backing
// pixel a cell, three flat tones off the kit's grey ramp (mid, mute, ink)
// read from the tokens at paint time, and food in brick, because food is
// live (#336: brick means armed or live). Nothing here is mixed, dithered
// or smoothed; the rim is a sprite over the canvas, not painted here.
// A delta repaints only the cells it moved (slime.js paintDish, issue #264),
// which is safe only on the canvas that holds the last picture: a canvas
// this tab has not fully painted, or one whose backing store the browser
// dropped, gets the whole picture again.
// UNDER REDUCED MOTION THE DISH STANDS STILL, the window's way (one frame a
// minute). The room's frames are still all decoded, so the picture held is
// the room's and every delta finds its base; the canvas shows one of them a
// minute, whole. A canvas not painted yet, and a pellet this tab drops, paint
// at once: a still dish still answers a hand.
let slimeTones = null, slimeFoodList = [], slimeCanvas = null, slimeMinute = null;
function paintSlime(prev = null, prevFood = []){
  const o = nodes.slime; if(!o || !slimeTones) return;
  const c = o.n.querySelector('.dish'); if(!c) return;
  if(c !== slimeCanvas){ prev = null; slimeMinute = null; slimeCanvas = c; c.oncontextrestored = ()=>{ slimeCanvas = null; paintSlime(); }; }
  if(REDUCED){
    const minute = Math.floor(presence.now() / 60000);
    if(minute === slimeMinute) return;
    slimeMinute = minute; prev = null;
  }
  const cs = getComputedStyle(document.documentElement);
  const ink = ['', '--cv-mid', '--cv-mute', '--cv-ink'].map(v => v && cs.getPropertyValue(v).trim());
  paintDish(c.getContext('2d'), slimeTones, slimeFoodList, ink, cs.getPropertyValue('--cv-brick').trim(), prev, prevFood);
}
// a tap's pellet, drawn here before the room confirms it: the frame that
// comes back carries the real one and overwrites this guess
function slimeFood(cx, cy){
  if(!slimeTones) return;
  const r = SLIME.pelletRadius;
  for(let dy = -r; dy <= r; dy++) for(let dx = -r; dx <= r; dx++){
    if(dx * dx + dy * dy > r * r + 1) continue;
    const x = cx + dx, y = cy + dy;
    if(x >= 0 && y >= 0 && x < DISH && y < DISH && inDish(x, y)) slimeFoodList.push(x, y);
  }
  slimeMinute = null;
  paintSlime();
}
// The tick of the picture held, so a delta is applied only to the base it
// was cut from (issue #259). A delta against another base is a delta this
// tab cannot use: it is dropped and the room is asked for a keyframe.
let slimeTick = -1;
function setSlime(g, f){ const d = decodeSlime(g, f); if(!d) return false; slimeTones = d.tones; slimeFoodList = d.food; paintSlime(); return true; }
// AN ABSENT TAB'S DISH LOSES LIFE (issue #271). A tab that said no to the
// watch is sent nothing, and that is drawn, not just gated: the tile wears
// data-asleep from the moment the no is SENT (presence.onWatch, the same
// fact the room acts on) until the keyframe the next yes brings is DECODED.
// canvas-home.css does the look: grey and dimmed at once, since nobody sees
// a dish die (the tab is hidden or the dish is off camera), and the colour
// steps back in on return. A keyframe still in flight when the no went out
// does not wake a dish nobody is feeding frames to.
let slimeAway = false;
function slimeAsleep(on){ const o = nodes.slime; if(o) o.n.toggleAttribute('data-asleep', on); }
presence.onWatch((on)=>{ slimeAway = !on; if(!on) slimeAsleep(true); });
function onSlimeFrame(m){
  if(typeof m.g === 'string'){ if(setSlime(m.g, m.f) && !slimeAway) slimeAsleep(false); if(Number.isInteger(m.t)) slimeTick = m.t; return; }
  if(!slimeTones || m.b !== slimeTick){ presence.watch(true, true); return; }
  const tn = applySlimeDelta(slimeTones, m.d);
  if(!tn){ presence.watch(true, true); return; }
  const prev = slimeTones, prevFood = slimeFoodList;
  slimeTones = tn; slimeTick = m.t;
  // the food rides a delta only when it moved; a pair off the dish is a
  // frame that is not one, the same line decode draws for a keyframe
  if(Array.isArray(m.f) && m.f.length % 2 === 0 && m.f.every(Number.isInteger)){
    const f = []; for(let k = 0; k < m.f.length; k += 2) if(inDish(m.f[k], m.f[k + 1])) f.push(m.f[k], m.f[k + 1]);
    slimeFoodList = f;
  }
  paintSlime(prev, prevFood);
}
presence.onSlime(onSlimeFrame);
if(BOOT?.slime?.g) setTimeout(()=>{ setSlime(BOOT.slime.g, BOOT.slime.f); if(Number.isInteger(BOOT.slime.t)) slimeTick = BOOT.slime.t; }, 0);
// THE DISH IS SENT ONLY TO TABS THAT CAN SEE IT (issue #259): document
// visible and the dish on camera, which render() already decides for every
// node (o.hidden). Said every frame, sent on change (presence.js watch).
function watchSlime(){ presence.watch(!document.hidden && !!nodes.slime && !nodes.slime.hidden); }
// ---- the shared sky (issue #305, round six) --------------------------------------
// The window is watched the dish's way (services/sky.js): said when the tile
// is on camera and the page showing, and never by a still sky, which draws
// no push and so is sent none. A sweep is summed and flushed at most ten
// times a second in whole cells; a spectator neither pushes nor guesses.
function watchSky(){ presence.watchSky(!document.hidden && !!nodes.weather && !nodes.weather.hidden && !outlookStillNow); }
presence.onSky((m)=>{
  if(!Number.isInteger(m.x) || !Number.isInteger(m.y)) return;
  skyAt = [Math.max(-PUSH_MAX, Math.min(PUSH_MAX, m.x)), Math.max(-PUSH_MAX, Math.min(PUSH_MAX, m.y))];
  paintOutlook();
});
let skySum = [0, 0], skySent = 0;
function skyGust(dx, dy){
  if(outlookStillNow || !presence.mayAct()) return;
  const cap = (v)=>Math.max(-PUSH_IN, Math.min(PUSH_IN, v));
  dx = cap(dx); dy = cap(dy);
  if(dx || dy) presence.push(dx, dy);
}
function skySweep(dx, dy){
  skySum[0] += dx; skySum[1] += dy;
  const t = performance.now(); if(t - skySent < 100) return;
  const x = Math.round(skySum[0]), y = Math.round(skySum[1]);
  if(!x && !y) return;
  skySent = t; skySum = [0, 0];
  skyGust(x, y);
}
// The dish reads as what it is for this tab (issue #260): a spectator's
// dish is a picture, not a button. aria-disabled rather than a stripped
// role, so a screen reader hears "unavailable" instead of the control
// silently ceasing to exist; no tab stop, because a stop that does nothing
// is a lie to the keyboard; and canvas-home.css lets the pointing hand go
// on the attribute. Fires on every welcome, so a reconnect that lands a
// participant slot gives the hand back.
presence.onSpectate((spectating)=>{
  const o = nodes.slime; if(!o) return;
  o.n.setAttribute('aria-disabled', String(spectating));
  o.n.tabIndex = spectating ? -1 : 0;
  o.n.setAttribute('aria-label', spectating ? 'Sisyphus the Slime, watching only' : 'Sisyphus the Slime: feed him');
});
// THE ARROW IS FOR OTHER PEOPLE (2026-09-16). The visitor keeps the pointer
// their own machine gave them; the sprite is only ever drawn for a peer.
// It was both for a while: app.js painted this tab's own hue onto #scene as a
// data-URI cursor so you saw yourself the way the room saw you. It went
// because a cursor is the one mark on a screen a visitor did not ask us to
// touch, and replacing it buys them nothing they can use. #scene's `grab` in
// canvas-home.css is the whole story again.
//
// A theme MutationObserver went with it: repainting the cursor whenever the
// root element's class list changed made sense while the ink could flip, and
// since 2026-09-15 it has been watching for a class nothing writes.
// THE VISITOR'S OWN HAND, back on 2026-09-16 and doing a different job from
// the one it did before. It used to be the same arrow the room drew of you,
// in your hue, which was a mirror and not much else. Now it is the two hands
// that never travel: OPEN on the ground, CLOSED while you drag it. The room
// draws you pointing and clicking; what your hand does while you haul the
// canvas around is yours, and there is no frame that could carry it anyway.
//
// Written as two CSS custom properties rather than an inline style, so the
// stylesheet keeps the rule about WHICH applies (#scene vs #scene.dragging)
// and this only supplies the pictures.
function setOwnHands(color){
  const cs = getComputedStyle(document.documentElement);
  const ink = cs.getPropertyValue('--cv-ink').trim();
  const ground = cs.getPropertyValue('--cv-ground').trim();
  const hue = color || ink;
  // all four: the two the room also draws of you, and the two it never sees
  for(const which of ['point', 'click', 'grab'])
    document.documentElement.style.setProperty('--cv-hand-' + which, cursorImage(which, hue, ink, ground));
  // the clicking hand's own hot spot, as an offset the stylesheet applies
  document.documentElement.style.setProperty('--cv-click-nudge-x', CLICK_NUDGE.x + 'px');
  document.documentElement.style.setProperty('--cv-click-nudge-y', CLICK_NUDGE.y + 'px');
}
setOwnHands(null);
presence.onSelf(setOwnHands);
presence.onFront((id, i) => { if(fanDefs[id]) setFront(id, i, false); });
// Maurice stands where the page says before the first frame, not a task
// later: his tile exists (mkTile ran above) and boot() has not painted yet,
// so a deferred call is a frame of him alive that the room had already squished
setMaurice(mauriceUntil);

// ---- the shared hover ----------------------------------------------------
// A pointer resting on something is half of what a cursor tells you, and it
// was the half the socket threw away: you could watch an arrow drift onto a
// tile and the tile would sit there dead. Now the tile lights, for everyone,
// with the same lift and the same cast your own pointer would give it
// (canvas-home.css .peerhover). The key is the tile's NAME, never its
// position, so it survives every viewport, zoom and wrap.
//
// The line this stops at is mutation. Hovering is a thing you can watch
// somebody do; spreading a collection, turning the hero's phrase and turning
// the ground over are things you DO, and doing them across four tabs at once
// is four people wrestling for one control. In the public room at large
// those stay each visitor's own. Inside a session, and from the one followed
// to the tabs following them, they are shared as VIEWS on the act bridge
// (canvas/view-sync.js), where the room decides who hears them (BIBLE.md
// section 2). The hover frame itself still carries no mutation
// (lib/presence-protocol.js).
const hkOf = el => (el?.closest?.('[data-hk]')?.dataset.hk) || null;
// Whether THIS tab's button is down, which picks which of the two hands the
// room draws for it (BIBLE.md section 2). It is self-description, not a
// mutation: it says what this pointer is doing, the way the hover key says
// what it is over, and nobody else's view changes because of it. Held here
// rather than read off the event, because a press that happens without the
// pointer moving still has to reach the room.
let ptrDown = false;
// THE POINTER'S STATE, ON THE ROOT. Which hand the visitor sees is a fact
// about what their pointer is DOING, not about what it happens to be over, so
// it is written in one place and everything inherits it (canvas-home.css
// html.pressing / html.hauling). `pressing` is the button; `hauling` is a pan
// in progress, set where the drag itself is (beginPan/endDrag).
const setDown = v => {
  ptrDown = v;
  document.documentElement.classList.toggle('pressing', v);
};
// re-post on the press itself: pump() only sends when something changed, and
// a click with a still pointer changes only this.
const repost = () => {
  if(!(WORLD_W > 0 && WORLD_H > 0)) return;
  // -1 says "where I was": the last real position, on the page or the ground
  presence.post(-1, -1, lastAt ? null : lastHk, ptrDown, lastAt);
};
let lastFx = -1, lastFy = -1, lastHk = null;
// the page block this pointer is on, null on the canvas (issue #327)
let lastAt = null;
// CAPTURE, and it has to be. Whether the pointer is down is a fact about the
// pointer, and several controls stop pointerdown from propagating so their
// own gesture is not read as a pan: the stack pager, the scrubber, the
// search field. On the bubble phase this listener never heard any of them, so
// pressing a pager showed the pointing hand and the click hand never appeared
// on the one control a visitor presses most. Capture runs before a target can
// stop anything, and passive so it can never delay one.
const PTR = { capture: true, passive: true };
addEventListener('pointerdown', () => { setDown(true); repost(); }, PTR);
addEventListener('pointerup', () => { setDown(false); repost(); }, PTR);
addEventListener('pointercancel', () => { setDown(false); repost(); }, PTR);
// a button released over another window never sends pointerup here
addEventListener('blur', () => setDown(false));
addEventListener('pointermove', e=>{
  // a page is open: the canvas is frozen and this pointer is reading, not
  // pointing. Retract the highlight rather than leaving it lit behind a sheet.
  if(modalOpen()){
    // the page's own title still answers the pointer, as it does on the card
    dustUnder(e.target?.closest?.('#sheetInner > h1.ptitle'), e.clientX, e.clientY);
    // a page is open: this pointer is on a block of it, or on nothing
    if(!curSheet){ presence.post(-1, -1, null, false); return; }
    const a = anchorUnder(e.target, e.clientX, e.clientY);
    if(a){ lastAt = atOf(curSheet, a.i); presence.post(a.fx, a.fy, null, ptrDown, lastAt); }
    return;
  }
  const wx = ((camX + e.clientX/Z)%WORLD_W + WORLD_W)%WORLD_W;
  const wy = ((camY + e.clientY/Z)%WORLD_H + WORLD_H)%WORLD_H;
  if(WORLD_W>0 && WORLD_H>0){
    lastFx = wx/WORLD_W; lastFy = wy/WORLD_H; lastHk = hkOf(e.target); lastAt = null;
    presence.post(lastFx, lastFy, lastHk, ptrDown);
  }
  dustUnder(e.target?.closest?.('[data-hk]'), e.clientX, e.clientY);
}, {passive:true});
// a peer's pointer raises the same dust here: its world point lands on the
// node its hover key names, and the glyph's box on screen says which cell
presence.onCursor((id, fx, fy, k) => {
  if(!k || !WORLD_W) return;
  const o = nodes[k]; if(!o || o.hidden) return;
  const r = o.n.getBoundingClientRect(); if(!r.width) return;
  const wx = nearestWrap(fx * WORLD_W, o.wx, WORLD_W) - o.wx, wy = nearestWrap(fy * WORLD_H, o.wy, WORLD_H) - o.wy;
  dustUnder(o.n, r.x + wx * Z, r.y + wy * Z);
});
// the pointer left the window: no more moves are coming, so this is the last
// chance to put the highlight out. -1 says "same place as before, new key",
// and the place goes with it: a reader whose hand leaves the window (or
// whose window loses focus) is still on the page they were reading. Without
// `lastAt` the post says "on the ground", and every tab following this one
// closed its page (and a session asked everyone to follow them back to the
// canvas) the moment the hand went to another window.
document.addEventListener('pointerleave', ()=>presence.post(-1, -1, null, false, lastAt));
addEventListener('blur', ()=>presence.post(-1, -1, null, false, lastAt));

// Peers' highlights, applied by key. The Set is the truth and the class is a
// projection of it, which is what makes it survivable: rebuildTile() replaces
// a tile's whole DOM on a data refresh, and repainting from the Set puts the
// highlights back on the new nodes.
const peerHover = new Set();
function paintPeerHover(key){
  const el = scene.querySelector(`[data-hk="${key.replace(/["\\]/g, '\\$&')}"]`);
  el?.classList.toggle('peerhover', peerHover.has(key));
}
presence.onHover((key, n)=>{
  if(n > 0) peerHover.add(key); else peerHover.delete(key);
  paintPeerHover(key);
});


// the scene carries the zoom: children keep world-unit translates, the layer
// scales as one. Its box is sized in world units (VW/Z x VH/Z) so the scaled
// result always fills the viewport and pointer events land everywhere.
// slideY is the open-sheet canvas slide (screen px), composed in.
// recede is the depth the world sinks while a sheet rests on it: the page
// is ground landing ON the world, so the world gives by a breath (1.5%),
// anchored at the viewport center. The canvas is inert while receded, so
// the pointer math never sees the borrowed scale. Reduced motion snaps.
let slideY = 0, appliedZ = 0;
let recede = 1, recedeT = 1;
function setRecede(v){ recedeT = v; if(REDUCED){ recede = v; setSceneTransform(); } }
function setSceneTransform(){
  scene.style.width = viewW()+'px'; scene.style.height = viewH()+'px';
  const k = Z * (recede === 1 ? 1 : recede);
  scene.style.transform = recede === 1
    ? `translateY(${slideY}px) scale(${Z})`
    : `translate(${VW*(1-recede)/2}px, ${slideY + VH*(1-recede)/2}px) scale(${Z*recede})`;
  // ---- the tap floor, published ------------------------------------------
  // Everything in the world is drawn in WORLD px and this scale is what the
  // camera does to them, so a control the tokens size at 56 lands wherever
  // the camera happens to be: at the phone's opening frame that is 22 screen
  // px, half the floor a thumb needs, on the two doors that ARE the site's
  // navigation. Sizes the tokens promise are screen promises, so the inverse
  // scale goes out as a variable and the controls grow an invisible hit pad
  // in screen space (canvas-home.css, .t-icon). Zoom in and
  // the pad shrinks back to the painted edge on its own; nothing is ever
  // bigger than it looks by more than the floor.
  scene.style.setProperty('--cv-world-k', String(1/k));
  scene.style.setProperty('--cv-dpr', String(DPR()));
}
const SLIDE_MS = 320; // mirrors --cv-dur-slide
let lastCamX=NaN, lastCamY=NaN, renderDirty=true;
function render(){
  // idle skip: no camera motion, no tween, nothing marked dirty: write nothing
  if(!renderDirty && camX===lastCamX && camY===lastCamY && !homeTween) return;
  lastCamX=camX; lastCamY=camY; renderDirty=false;
  DIAG.render++;
  if(FROZEN && painted){ logEv('frozen'); return; }
  const t0r = performance.now(); let vis = 0;
  if(Z !== appliedZ){ appliedZ = Z; setSceneTransform(); }
  if(!BARE){ renderGrid(); renderSeam(); drawMinimap(); }
  // past the mount floor nothing mounts and the plan paints the world
  const mounted = mountsAt(Z, mountZ);
  drawPlan(!mounted);
  for(const id in nodes){
    const o = nodes[id];
    const xs = mounted ? wrapSpots(o.wx, camX, WORLD_W, viewW(), o.w) : [];
    const ys = mounted ? wrapSpots(o.wy, camY, WORLD_H, viewH(), o.h) : [];
    if(!xs.length || !ys.length){ o.n.style.display='none'; o.hidden=true; mirror.sync(o.n, []); }
    else {
      // A tile crossing the frame edge while the CAMERA moves is not
      // arriving, the viewer is: it just shows. This used to need a timed
      // window (entranceUntil) to hold the per-tile entrance off during a
      // pan; with the dither retired there is no per-tile entrance left to
      // hold off, and the boot sweep defrags once from its own call site
      // rather than through a flag every wrap-in has to consult.
      if(o.hidden) o.hidden=false;
      o.n.style.display=''; o.n.style.transform=`translate(${xs[0]}px,${ys[0]}px)`; vis++;
      // the node stands at its own spot; a cut tile's other parts are copies
      const spots = [];
      for(const x of xs) for(const y of ys) spots.push([x, y]);
      mirror.sync(o.n, spots);
    }
  }
  paintOutlook();
  if(LOGGING) logEv(`render ${Math.round(performance.now() - t0r)}ms v${vis}`);
}

// ---- flight --------------------------------------------------------------------
const FRICTION=0.92, DRAG_THRESH=8;
let pending=false, dragging=false, sx0=0, sy0=0, lx=0, ly=0, pid=null, homeTween=null;
// the canvas is frozen while a modal is open: the modal is the page then
const modalOpen = () => $('#modal').classList.contains('open');
// pointer math: screen px; camera moves divide by the zoom to become world px
// a fan holds the canvas still the way a sheet does: its cards are .el too,
// so without this a press on a card started a pan of the world under it
function beginPan(e){ follow.input(); if(modalOpen() || curFan || e.target.closest?.('input,textarea,button,a,select,label')) return; pending=true; dragging=false; homeTween=null; vx=vy=0; sx0=lx=e.clientX; sy0=ly=e.clientY; pid=e.pointerId; }
scene.addEventListener('pointerdown', beginPan);
addEventListener('pointerdown', e=>{ if(e.target.closest('.el')) beginPan(e); });
addEventListener('pointermove', e=>{
  if(pinch) return; // two fingers own the camera
  if(!pending && !dragging) return;
  // THE STUCK GRAB (2026-09-12): a press whose release never arrived (the
  // window lost focus mid-click, a context menu, a tab switch) left
  // `pending` armed, and the next mouse move started a drag that only a
  // click could end, so the whole page followed the cursor until the
  // visitor clicked something they did not mean to. A mouse moving with
  // no button down is not dragging anything, whatever the last press said.
  // (and it stops dead: a release the page never saw earns no glide)
  if(e.pointerType === 'mouse' && e.buttons === 0){ pending=false; vx=vy=0; endDrag(); return; }
  const cx=e.clientX, cy=e.clientY;
  if(!dragging){ if(Math.abs(cx-sx0)+Math.abs(cy-sy0)<DRAG_THRESH) return;
    dragging=true; scene.classList.add('dragging');
    document.documentElement.classList.add('hauling'); logEv('drag'); try{scene.setPointerCapture(pid);}catch{ /* a pointer already gone cannot be captured */ } }
  const dx=cx-lx, dy=cy-ly; camX-=dx/Z; camY-=dy/Z; vx=-dx/Z; vy=-dy/Z; lx=cx; ly=cy;
});
function endDrag(){ pending=false; document.documentElement.classList.remove('hauling');
  if(dragging){ dragging=false; logEv('up'); scene.classList.remove('dragging'); if(!vx && !vy){ restCam(); renderDirty = true; } save(); } }
addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);
// and the same for a window that loses the pointer without a release: the
// gesture is over, whatever the browser forgot to say
const dropGestures = ()=>{ endDrag(); pinch = null; tp.clear(); gestZ0 = null; };
addEventListener('blur', dropGestures);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) dropGestures(); });
// ---- pinch zoom (touch): two fingers scale and pan the camera together ----
const tp = new Map();
let pinch = null;
addEventListener('pointerdown', e=>{
  if(e.pointerType==='touch') DIAG.touch++;
  logEv('down ' + e.pointerType + ' ' + Math.round(e.clientX) + ',' + Math.round(e.clientY));
  if(e.pointerType!=='touch' || modalOpen() || curFan) return;
  tp.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(tp.size===2){
    pending=false; dragging=false; scene.classList.remove('dragging');
    document.documentElement.classList.remove('hauling');
    homeTween=null; vx=vy=0;
    const [a,b] = [...tp.values()];
    // anchor: the world point under the fingers' midpoint stays under it
    pinch = { d0: Math.hypot(a.x-b.x, a.y-b.y), z0: Z,
      wx: camX + (a.x+b.x)/2/Z, wy: camY + (a.y+b.y)/2/Z };
  }
});
addEventListener('pointermove', e=>{
  if(e.pointerType!=='touch' || !tp.has(e.pointerId)) return;
  tp.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(!pinch || tp.size!==2) return;
  const [a,b] = [...tp.values()];
  Z = clampZ(pinch.z0 * Math.hypot(a.x-b.x, a.y-b.y) / Math.max(1, pinch.d0));
  camX = pinch.wx - (a.x+b.x)/2/Z; camY = pinch.wy - (a.y+b.y)/2/Z;
  renderDirty = true; save();
});
const endPinch = e=>{
  if(e.pointerType!=='touch') return;
  tp.delete(e.pointerId);
  if(tp.size<2 && pinch){
    pinch=null;
    scheduleZoomSettle();
    // the surviving finger keeps the camera: hand off pinch -> pan live,
    // instead of a dead gesture until the next touch
    if(tp.size===1){
      const [rest] = tp.values();
      pending=false; dragging=true; scene.classList.add('dragging');
      sx0=lx=rest.x; sy0=ly=rest.y; vx=vy=0;
    }
  }
};
addEventListener('pointerup', endPinch); addEventListener('pointercancel', endPinch);
// wheel pans the canvas; ctrl-wheel (the trackpad pinch gesture) zooms at the
// cursor; with a modal open it scrolls the modal natively
// (with a fan up the wheel is the grid's: it scrolls the collection, and
// the world under it stays where it was)
addEventListener('wheel', e=>{ DIAG.wheel++; logEv('wheel ' + Math.round(e.deltaY)); follow.input(); if(modalOpen() || curFan) return; e.preventDefault(); homeTween=null;
  // A watch has no trackpad, so ctrl-wheel never arrives and a plain wheel is
  // the Digital Crown or nothing. It reaches the zoom only behind ?crown
  // now (2026-09-12): on the wrist, zoom is the thing that seized.
  if(noChrome() && !CROWN_ON) return;
  if(SAFE && (e.ctrlKey || e.metaKey)) return;
  if(e.ctrlKey || e.metaKey || noChrome()){ zoomAt(Z * Math.exp(-e.deltaY * 0.01), e.clientX || VW/2, e.clientY || VH/2); }
  else { camX+=e.deltaX/Z; camY+=e.deltaY/Z; }
  scheduleZoomSettle();
  vx=vy=0; save(); }, {passive:false});

// ---- the Digital Crown (/?crown) -------------------------------------------
// The crown is not an input in its own right: it scrolls whatever is
// scrollable, and this page is overflow:hidden on both axes with
// touch-action:none besides. So it does nothing on the canvas and works
// perfectly in a sheet, which is exactly what was reported.
//
// This gives it something to turn. #stage becomes a scroller with a track
// taller than itself; every scroll it receives becomes zoom and is then
// undone, so the scroller never travels and always has room in both
// directions. touch-action:none is what keeps a finger off it, and that is
// the separation the arrangement rests on: panning belongs to the pointer
// handlers, zoom to the crown, and neither can reach the other. The scene
// goes sticky so the stage can scroll underneath without taking it along.
//
// The wheel branch above is the other half of the bet, and the two cannot
// collide: crown scrolling is not a wheel event, and the wheel handler's
// preventDefault does not suppress it.
//
// THE JITTER (2026-09-12). The first version of this made #scene itself the
// sticky element and wrote the scroller back to its middle after EVERY
// event, and on the wrist it sat in a permanent shiver. Two facts, both
// reproduced on a desktop bench once the bench was made to behave like the
// watch (scripts/verify/world-fixed.mjs, the crown check):
//
//   1. #scene's in-flow box is its inline size, VW/Z by VH/Z, so the
//      scroller's height CHANGED WITH THE ZOOM: every zoom moved the middle
//      the handler was parking at.
//   2. watchOS lays the page out at 320 css px and paints it on a 205 pt
//      screen, 1.28 device px per css px, so an integer scrollTop written
//      reads back on the nearest device pixel: 1176 comes back 1175.78. The
//      handler compared the readback to what it wrote, saw a difference,
//      zoomed by the fraction, re-parked, read back another fraction, and
//      never stopped. Each turn of that loop also re-sized the scroller (1),
//      so even the park point it aimed at kept moving under it.
//
// So now: the scene rides in a zero-height sticky PIN and stays absolute,
// out of the flow, so the scroller is the track and nothing else and its
// middle never moves. The handler measures a turn against the last position
// it SAW, not the one it wrote; anything under a whole css px is the browser
// settling a write onto a device pixel and is ignored; and it only parks the
// scroller back at the middle when a turn has carried it near an end, so a
// notch never writes back at itself. A displacement bigger than a quarter of
// the track is not a turn either (it is the scroller coming back after a
// sheet, which zeroes it), and is parked without zooming.
//
// Still not validated on the device: synthetic dispatch does not reach page
// listeners through the automation context, and real wheel input is eaten
// by the canvas's own wheel handler before #stage can scroll. What the bench
// proves is that the mechanism that shivered no longer can. If sticky does
// not hold under the adapted layout the canvas scrolls off screen and the
// page reads blank; that risk stands, named, one deploy from gone.
function initCrown(){
  if(!noChrome() || !CROWN_ON) return;
  document.documentElement.classList.add('crown');
  const stage = document.getElementById('stage');
  const pin = document.createElement('div');
  pin.id = 'crownPin';
  stage.insertBefore(pin, scene);
  pin.appendChild(scene);
  const track = document.createElement('div');
  track.id = 'crownTrack';
  track.setAttribute('aria-hidden', 'true');
  stage.appendChild(track);
  const span = () => Math.max(1, stage.scrollHeight - stage.clientHeight);
  let last = null;
  const park = () => { last = Math.round(span() / 2); stage.scrollTop = last; };
  park();
  addEventListener('resize', park);
  stage.addEventListener('scroll', ()=>{
    DIAG.scroll++; logEv('scroll');
    if(modalOpen()) return;
    const at = stage.scrollTop;
    const d = at - last;
    if(Math.abs(d) < 1) return;
    const s = span();
    if(Math.abs(d) > s / 4){ park(); return; }
    last = at;
    homeTween = null;
    zoomAt(Z * Math.exp(-d * 0.01), VW/2, VH/2);
    vx = vy = 0;
    save();
    scheduleZoomSettle();
    if(at < s / 4 || at > s * 3 / 4) park();
  }, {passive: true});
}
let gestZ0 = null;
addEventListener('gesturestart', e=>{ DIAG.gesture++; logEv('gesture'); if(modalOpen() || curFan || tp.size || SAFE || noChrome()) return; e.preventDefault(); gestZ0 = Z; homeTween=null; vx=vy=0; });
addEventListener('gesturechange', e=>{ DIAG.gesture++; if(gestZ0==null || modalOpen() || tp.size) return; e.preventDefault(); zoomAt(gestZ0 * e.scale, e.clientX, e.clientY); save(); });
addEventListener('gestureend', ()=>{ gestZ0 = null; scheduleZoomSettle(); });
const keys=new Set();
addEventListener('keydown', e=>{
  if(e.key==='Escape'){
    // one consistent way out, rung by rung: a field lets go of the keyboard,
    // a page closes to the canvas, a fan folds, a wandered camera steps
    // home. Home is the floor.
    if(e.target.closest?.('input,textarea')){ e.target.blur(); return; }
    // a session's "went to" offer is the newest thing on the screen, so it
    // is the first to go
    if(!wentEl.hidden){ hideWent(); return; }
    // following lets go before anything closes: the view is yours again
    // and you are left where they took you. Not in a follow room, where
    // following is what the tab is there for (follow.js held): the host
    // keeps the frame, so nothing below closes what they opened, and
    // leaving is the tag's x or the flag off the address
    if(!whoEl.hidden){ closeWho(); return; }
    if(follow.id != null){ if(!follow.held) follow.release(); return; }
    if(curSheet || modalOpen()){ closePage(); return; }
    if(curFan){ closeStack(); return; }
    if(searchWrap.classList.contains('open')){ closeSearch(); return; }
    const dhx = nearestWrap(homeX(), camX, WORLD_W) - camX;
    const dhy = nearestWrap(homeY(), camY, WORLD_H) - camY;
    if(Math.abs(Z - fitZ()) > 0.01 || Math.hypot(dhx, dhy) > M) goHome();
    return;
  }
  // Ctrl or Cmd with K opens the bar, a field included: the key every command
  // palette answers to (GitHub, Slack, Linear, Notion). Shift and Alt make
  // other chords (the browser's console, a system key). The browser's own
  // Ctrl+K is let go only where the bar is up to take the key, so a screen
  // with no bar (a watch, a page open over the canvas) keeps it
  if((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key==='k' || e.key==='K')){
    openSearch();
    if(document.activeElement === searchEl) e.preventDefault();
    return;
  }
  if(e.target.closest?.('input,textarea')) return;
  // a key held with Ctrl, Cmd or Alt is the browser's and the system's (zoom,
  // find, back, forward), not the page's: the page answers bare keys, and
  // Shift, which is what makes a ? and a +. AltGr is how some layouts type a
  // / or a ? (Windows reports it as Ctrl and Alt together): that is typing,
  // not a chord
  if((e.ctrlKey || e.metaKey || e.altKey) && !e.getModifierState('AltGraph')) return;
  // a key of your own is NOT a wish to stop following (2026-09-26): a
  // follower plays along on the instrument the one followed opened, and
  // only steering, the hand walking off or Escape lets go (follow.js)
  // "/" opens the omni search from anywhere: fly through the site by name
  if(e.key==='/'){ e.preventDefault(); openSearch(); return; }
  // "?" is the list of keys, in the bar the slash opens: the shortcut sheet
  // every web app answers to that key
  if(e.key==='?'){ e.preventDefault(); openSearch(); if(document.activeElement === searchEl){ searchEl.value = '/keys'; runLine('/keys'); } return; }
  if(modalOpen()){
    if(!fanNav.hidden && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')){ e.preventDefault(); cycle(e.key === 'ArrowLeft' ? -1 : 1); }
    return;
  }
  if(curFan) return; // the fan owns the keyboard while it is up
  // +/- step the zoom about the viewport center, a rung of the ladder a press
  // (layout.js stepZoom: a fixed fraction was under half a rung on a 1x
  // screen, and the settle took the camera back to where it was)
  if(['+','=','-','_'].includes(e.key)){
    zoomAt(stepZoom(Z, (e.key==='-'||e.key==='_') ? -1 : 1, DPR()), VW/2, VH/2);
    scheduleZoomSettle(); save(); return;
  }
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){ homeTween=null; keys.add(e.key); }
});
// the last arrow released rests the camera on a device pixel (the pan itself
// runs free in tick, a screen-speed glide the ladder does not fight)
addEventListener('keyup', e=>{ if(keys.delete(e.key) && !keys.size){ restCam(); renderDirty = true; } });
// ---- a zoom comes to rest ---------------------------------------------------
// When a gesture rests, the camera lands on the pixel ladder. The doors row
// used to be cleared from under the bar here too; the row emptied on
// 2026-09-16 and that flight went with it (#243).
let zoomSettleT = 0;
function settleZoom(){
  if(modalOpen() || dragging || pinch || homeTween) return;
  // a gesture that stopped between steps takes the short flight onto the
  // nearest one (the flight's landing rests the camera and schedules this
  // again); a gesture already on a step rests the camera on a device pixel
  // here and now
  const nz = restZ(Z);
  if(Math.abs(nz - Z) > 1e-9){ flightTo(camX + viewW()/2, camY + viewH()/2, nz); return; }
  restCam(); renderDirty = true;
}
function scheduleZoomSettle(){ clearTimeout(zoomSettleT); zoomSettleT = setTimeout(settleZoom, 200); }
// ---- camera flights ---------------------------------------------------------
// nearestWrap (layout.js) resolves a world coordinate to the copy nearest the
// camera. flightTo takes a plain world point, so EVERY caller owes it that
// resolution: aim a flight at a raw coordinate and it flies to the one true
// original, however many worlds away, when an identical frame was sitting
// just over the seam. These two are the one way to name a flight's target.
const aimX = wx => nearestWrap(wx, camX + viewW()/2, WORLD_W);
const aimY = wy => nearestWrap(wy, camY + viewH()/2, WORLD_H);
// Every deliberate camera move rides van Wijk & Nuij's optimal pan-zoom
// path ("Smooth and Efficient Zooming and Panning", InfoVis 2003): the
// camera pulls out in proportion to the ground it must cover, crosses at
// altitude, and dives back in at the destination, one geodesic in
// (pan, zoom) space. Short hops degenerate to a straight glide on the same
// math, so one engine serves the ladder settle and the cross-world dive
// alike. rho is the ground's zoom/pan tradeoff, sqrt(2) its recommended
// balance. Time is the path length in rho-units at one slide token per
// unit, floored at the glide token and capped at two drifts: a flight is
// never a cut and never a tour. Reduced motion jumps; the destination is
// the point and the physics is the courtesy. Flights aim at a WORLD
// CENTER plus a zoom, never a camera corner: the corner for a given center
// moves as the zoom animates, so tick() re-derives it every frame.
// The path itself (flightPath/flightAt) lives in layout.js: pure math the
// unit tests hold to the ground.
const FLIGHT_MS = 320;   // per rho-unit of path: mirrors --cv-dur-slide
const FLIGHT_MIN = 250;  // mirrors --cv-dur-glide
const FLIGHT_MAX = 1200; // two drifts: the cross-world ceiling
// `then` runs once the flight LANDS (or at once when there is nothing to
// fly); a flight cut short by a gesture or a newer flight never calls it
function flightTo(cx, cy, z, then){
  const w0 = VW / Z, w1 = VW / clampZ(z ?? Z);
  const x0 = camX + viewW()/2, y0 = camY + viewH()/2;
  const dx = cx - x0, dy = cy - y0;
  const u1 = Math.hypot(dx, dy);
  if(u1 < 1 && Math.abs(w1 - w0) < 1){ then?.(); return; }
  if(REDUCED){
    Z = clampZ(z ?? Z);
    camX = cx - viewW()/2; camY = cy - viewH()/2;
    renderDirty = true; save();
    then?.();
    return;
  }
  const f = flightPath(w0, w1, u1);
  homeTween = { ...f, x0, y0, dx, dy, u1, w0, w1, t0: null, then,
    dur: Math.min(FLIGHT_MAX, Math.max(FLIGHT_MIN, Math.abs(f.S) * FLIGHT_MS)) };
}
function goHome(){
  if(curLand){ curLand = null; document.title = SITE_NAME; if(landForPath(location.pathname)) history.replaceState({}, '', roomed('/')); }
  const z = fitZ();
  flightTo(
    aimX(homeAimX()),
    // aim at the landing zoom's offset, not the current one: the flight ends
    // at z, and the band it must clear is measured there
    aimY(homeAimY(z)),
    z
  );
}
// (the bar's home button left with the menu, BIBLE.md section 8: home is
// Esc, /home, or a tap on the map's hero outline)

function tick(){
  if(homeTween && !dragging){
    // advance the flight by real time; s walks the path at constant speed
    // and the arc itself carries the easing (that is the ground's point)
    const f = homeTween, now = performance.now();
    if(f.t0 == null) f.t0 = now;
    const p = Math.min(1, (now - f.t0) / f.dur);
    if(p >= 1){
      Z = clampZ(VW / f.w1);
      camX = f.x0 + f.dx - viewW()/2; camY = f.y0 + f.dy - viewH()/2;
      // landed: rest the origin on a device pixel, then let the settle run
      // (it snaps a landing between ladder steps)
      homeTween = null; restCam(); save(); scheduleZoomSettle();
      f.then?.();
    } else {
      const { u, w } = flightAt(f, f.w0, f.S * p);
      const frac = f.u1 >= 1 ? u / f.u1 : p;
      // the arc's crest is held at the mount floor: past it the tiles would
      // give way to the plan. A flight that starts or lands out on the plan
      // may cross it, down to the lower of its ends, and never past cover
      // (clampZ), where the torus would start repeating.
      Z = Math.max(Math.min(minZ, VW / f.w0, VW / f.w1), clampZ(VW / w));
      camX = f.x0 + f.dx * frac - viewW()/2;
      camY = f.y0 + f.dy * frac - viewH()/2;
    }
    renderDirty = true;
  } else if(keys.size){
    const K=16/Z; // a screen-speed pan whatever the zoom
    if(keys.has('ArrowLeft')) camX-=K; if(keys.has('ArrowRight')) camX+=K;
    if(keys.has('ArrowUp'))   camY-=K; if(keys.has('ArrowDown'))  camY+=K;
    save();
  } else if(!dragging){
    if(Math.abs(vx)>0.1||Math.abs(vy)>0.1){ camX+=vx; camY+=vy; vx*=FRICTION; vy*=FRICTION; save(); }
    else if(vx || vy){ vx=vy=0; restCam(); renderDirty = true; save(); }
  }
  // the world settles under (or back out from under) an open sheet
  if(recede !== recedeT){
    recede += (recedeT - recede) * 0.18;
    if(Math.abs(recedeT - recede) < 0.0008) recede = recedeT;
    setSceneTransform();
  }
  render();
  // the copies of a cut tile catch up with it (canvas/mirror.js)
  mirror.frame();
  // the band a page cursor is on screen in rides the frame: above it or
  // under the bar a page peer shows as an edge marker (presence.js)
  if(!BARE){ driveFollow(); presence.frame({camX, camY, WORLD_W, WORLD_H, VW: viewW(), VH: viewH(), Z, edge: {top: 0, bottom: VH - bandH()}}, performance.now()); watchSlime(); watchSky(); }
  requestAnimationFrame(tick);
}

// ---- THE HERO IS THE LOGO, SET LARGE (2026-09-16) --------------------------
// The statement is drawn in the DISPLAY face: the mark's own alphabet, the
// same pixels the logo is a glyph of (pixel-type.js). That is the point of
// the change rather than a side effect of it: the logo and the statement
// were two hands on the most looked-at thing on the site, and setting it in
// the mark's alphabet makes them one thing.
//
// It is CYCLED BY HAND, like a pile. There is no clock: the schedule that
// typed this on a shared wall-clock function is gone with the typing, and
// what turns the statement now is somebody turning it. That makes it shared
// for free and with no new wire vocabulary, because a pile's front already
// travels (`{type:'front', stack, i}`) and takes any stack id: the hero is a
// pile of nine phrases and 'hero' is its name. Whoever turns it turns it for
// everyone, the room keeps the index, and a restart shows the first.
//
// Two px a cell, so a glyph pixel is 8 world px and a line is 96 tall. The
// worst phrase wraps to four lines, 384 of the hero's 432.
// The type face's metrics survive the typer, for the one place the statement
// is still set in it: #prelude h1, the server-rendered heading a crawler or
// a no-JS reader gets. That is a document heading and should read like one.
let HERO_FS = 48, HERO_LH = 62;
// ONE px a cell, the face's own pitch and the mark's: the logo IS a glyph of
// this face at this size, and so are the zone titles. Setting the statement
// larger was tried and is the wrong instinct, because the point of the change
// is that the statement and the mark are one hand, and a hand that changes
// size between two words is two hands.
const HERO_SCALE = 1;
const HERO_PX = FACES.display.px * HERO_SCALE;      // world px per glyph pixel
const HERO_LINE = FACES.display.rows * HERO_PX;     // one line's height
const heroText = $('#heroText');
// the phrase the room is on, as the page was rendered; the first phrase in a
// room nobody has turned. The document's own h1 stays on the first either
// way (a crawler is no room's), and it is hidden while the canvas boots.
let heroIndex = bootFront('hero', PHRASES.length - 1, 0);
let heroLines = [];   // the mounted <svg> per line, for the scatter

// wrapped in the face's own cells, then measured in world px by the caller
const heroWrap = (phrase) => wrapText(phrase, 'display', Math.floor((HERO_W - 80) / HERO_PX));

// the scatter (canvas/dust.js) is both halves of the cycle and the hover
const scatterAll = (spread, ttl) => { for(const svg of heroLines) scatter(svg, spread, ttl); };

// mount a phrase: one svg a line, centred, each wired for the dust so a
// cursor crossing the statement disturbs it exactly as it disturbs the mark
function mountHero(phrase){
  const lines = heroWrap(phrase);
  heroText.innerHTML = '';
  heroText.style.height = (lines.length * HERO_LINE) + 'px';
  heroLines = lines.map((text, i) => {
    const t = pixelText(text, 'display', { scale: HERO_SCALE, className: 'hline' });
    const holder = document.createElement('div');
    holder.className = 'hline-row';
    holder.style.top = (i * HERO_LINE) + 'px';
    holder.innerHTML = t.svg;
    heroText.appendChild(holder);
    const svg = holder.querySelector('svg');
    wireDust(svg, gridOf(text, 'display', 0));
    return svg;
  });
  paintHeroDots();
  // the reader and the lens get the words, not the pixels: as the heading,
  // and as the name of the statement's button
  heroHead.textContent = phrase;
  heroText.setAttribute('aria-label', phrase);
}

// THE CYCLE: the old statement is blown apart and does not come back, then
// the new one arrives already scattered and settles into itself. One
// mechanism read in both directions, which is what makes the two halves feel
// like one move rather than an exit and an entrance.
let heroTurning = 0;
function showHero(i, animate){
  const next = ((i % PHRASES.length) + PHRASES.length) % PHRASES.length;
  if(next === heroIndex && heroLines.length) return;
  if(!animate || REDUCED || BARE){ heroIndex = next; mountHero(PHRASES[next]); return; }
  clearTimeout(heroTurning);
  scatterAll(7, 9);                       // destructive: it leaves
  heroTurning = setTimeout(() => {
    heroIndex = next;
    mountHero(PHRASES[next]);
    scatterAll(7, 9);                     // reconstructive: it arrives scattered
    for(const svg of heroLines) dustTick(svg);
  }, DUST_MS * 5);
}
// turning it is a shared hand, the same one that turns a pile, and a
// spectator's hand turns nothing (issue #260, as setFront)
const turnHero = (by) => {
  if(!presence.mayAct()) return;
  const next = ((heroIndex + by) % PHRASES.length + PHRASES.length) % PHRASES.length;
  showHero(next, true);
  presence.front('hero', next);
};
// ONE DOT A PHRASE, ABOVE the statement, in the seat the maker's mark used
// to hold. The hero is a pile and this is a pile's own indicator, the same
// row of squares the collections carry, for the same reason: a thing that
// turns has to say that it turns, and a statement with nothing around it is
// a statement, not a control. No arrows beside it, because the whole line is
// already the button.
//
// It is a NODE of its own rather than a row inside the hero, and it has to
// be: the cell clips, so anything above the first line would be cut off. The
// monogram had the same problem and the same answer, and this now sits
// exactly where it sat (layout.js AIR keeps every tile clear of that strip).
// INSIDE the hero's cell, as the flex sibling under the statement. It was a
// seated node of its own for about ten minutes, in the seat the maker's mark
// used to hold, and that put it 11px above the hero's BOX: the cell centres
// its contents, so the box top is some 230px above the words and the dots
// read as furniture floating on the ground rather than as the statement's own
// control. In the flow the cell does the work, "above the statement" stays
// true when a phrase wraps to a different number of lines, and nothing here
// has to know the flex arithmetic.
// THE DOTS BECAME THE SNAP SCROLLBAR (#336): a row of nine squares said
// "this turns" and nothing else, and every other collection on the site is
// walked with the kit's .k-scroll now (the piles, a card's siblings, a full
// page's ring), so the statement is too: laid on its side under the words,
// six cells a stepper in the world with the tap floor padded out on the
// screen (kit.css), the thumb at the phrase up. A stepper turns it one and
// wraps; a press on the track or a released drag goes to that phrase. It
// turns it for everyone, the way the statement always has.
const hdotsN = $('#heroDots');
hdotsN.innerHTML = scrollMarkup({ titles: PHRASES, at: heroIndex, label: 'which statement' });
const heroBar = wireScroll(hdotsN.querySelector('.k-scroll'), {
  titles: PHRASES,
  onCommit: i => {
    // a spectator's hand turns nothing (issue #260): the thumb goes back
    if(!presence.mayAct()){ heroBar.set(heroIndex); return; }
    showHero(i, true);
    presence.front('hero', i);
  },
});
function paintHeroDots(){ heroBar.set(heroIndex); }
// the bar's gestures are its own: the canvas does not pan under a drag, and
// the statement does not turn again under the click that turned it
hdotsN.addEventListener('click', e => e.stopPropagation());
hdotsN.addEventListener('pointerdown', e => e.stopPropagation());
hdotsN.addEventListener('keydown', e => e.stopPropagation());
function remountHero(){ mountHero(PHRASES[heroIndex]); }
// Turning it is a hand on a thing, so it answers a hand: a click anywhere on
// the statement goes forward, the arrow keys go either way, and it takes a
// tab stop because a control that only a mouse can reach is not a control.
// The whole line is the target rather than an arrow beside it: the statement
// IS the button, the way a pile is its own control. The statement, not the
// hero: the scrollbar under it is a control of its own and stands beside the
// button, never inside it.
heroN.addEventListener('click', e => {
  if(e.target.closest('a, button')) return;
  turnHero(1);
});
keyable(heroText, PHRASES[heroIndex], () => turnHero(1));
heroText.addEventListener('keydown', e => {
  const by = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
  if(!by) return;
  e.preventDefault();
  turnHero(by);
});
// and whoever turns it turns it for everyone: the pile's own frame, with the
// hero as the pile (lib/presence-protocol.js parseFront)
presence.onFront((id, i) => {
  if(id === 'hero'){ showHero(i, true); return; }
});

// ---- the ground ------------------------------------------------------------
// ONE GROUND (2026-09-15): eigengrau, the grey the eye reports when no light
// reaches it. There is no flip, no bulb, no stored preference and no OS
// listener, because there is nothing to choose between. The browser and PWA
// chrome are pinned to the ground in the template rather than rewritten here.
//
// What this bought, and why it was worth losing a feature for: every accent
// now has ONE value instead of a light one and a lifted dark one. The fire,
// Maurice and the guest palettes are their own colour rather than a colour
// adjusted to survive two grounds. It also deleted the ink flip, which was
// the site's only crossfade and the last thing on it that faded.

// ---- routed sheet -----------------------------------------------------------------
const mscroll = $('#mscroll'), gapEl = $('#gap');
function sizeSheet(){
  const preview = $('#modal').classList.contains('preview');
  // a preview is a card with a bottom: it stands in the frame with the fan
  // and the world fixed below it, and its prose scrolls inside it
  $('#modal').style.setProperty('--cv-band', bandH() + 'px');
  gapEl.style.height = preview ? '' : Math.round(VH*0.10)+'px';
  // a full page hides the gap, so 90% of the frame left the canvas showing
  // under a short entry (author, #300); its CSS 100dvh is the whole height
  const full = $('#modal').classList.contains('fullpage');
  $('#sheet').style.minHeight = preview || full ? '' : Math.round(VH*0.90)+'px';
}
// scrolling the open modal slides the canvas strip up off screen
function canvasSlide(){
  slideY = -Math.min(mscroll.scrollTop, Math.round(VH*0.10));
  setSceneTransform();
}
mscroll.addEventListener('scroll', canvasSlide, {passive:true});
// ---- pull-down dismiss: at the top of the sheet document, pulling further
// down drags the modal with the finger and, past a commit, stuffs it back
// off the bottom edge: the touch analogue of Escape. It exists because a
// watch (or any small touch screen) can reach none of the other closes: no
// keyboard for Escape, no visible gap or backdrop once the sheet is the
// whole screen. Touch events rather than pointer events on purpose, for the
// oldest WebKits this must serve. Upward swipes never arrive here armed:
// they scroll the document natively (touch-action: pan-y).
// A frame that owns its touches (.owns-touch, declared by the entry and
// answered in canvas-home.css) takes the sheet's gestures with it: no pull,
// no swipe, no close for a finger that started inside one.
const ownsTouch = t => !!(t && t.closest && t.closest('.owns-touch'));
let pullY0 = null, pullDy = 0, pullT0 = 0;
mscroll.addEventListener('touchstart', e => {
  if(!modalOpen() || mscroll.scrollTop > 0 || e.touches.length !== 1) return;
  if(ownsTouch(e.target)) return;   // a finger in a frame is playing, not leaving
  pullY0 = e.touches[0].clientY; pullDy = 0; pullT0 = e.timeStamp;
}, {passive: true});
mscroll.addEventListener('touchmove', e => {
  if(pullY0 === null) return;
  const dy = e.touches[0].clientY - pullY0;
  // First move decides ownership: down is a pull, up is a scroll and the
  // pull disarms for the rest of the touch.
  if(dy <= 0 && pullDy === 0){ pullY0 = null; return; }
  pullDy = Math.max(0, dy);
  e.preventDefault(); // the pull owns the gesture: no rubber-band underneath
  mscroll.style.transition = 'none';
  mscroll.style.transform = `translateY(${pullDy}px)`;
}, {passive: false});
function pullEnd(e){
  if(pullY0 === null) return;
  // Commit on distance (a fifth of the screen) or on a flick: a fast short
  // shove downward reads as intent just as clearly as a long drag.
  const flick = pullDy > 24 && pullDy / Math.max(1, e.timeStamp - pullT0) > 0.6;
  const commit = pullDy > VH * 0.2 || flick;
  mscroll.style.transition = ''; mscroll.style.transform = '';
  pullY0 = null; pullDy = 0;
  if(commit) closePage();
}
mscroll.addEventListener('touchend', pullEnd);
mscroll.addEventListener('touchcancel', pullEnd);
// ---- pushState router: the prototype's hash routes are real paths now ----
// work/feed/about are the section doors; everything else is an entry that
// lives at /work/<slug> (case studies) or /www/<slug> (articles, experiments).
// work left the sections when it became a stack (BIBLE.md section 5): its
// path is a fan, never a sheet
const SECTIONS = {feed:1, credits:1};
let curSheet = null;           // the slug painted right now, null on the canvas
const sheetCache = {};         // section sheets fetched from /api/sheet
function slugForPath(path){
  // /work is the work stack fanned out, /about and /contact are zones the
  // camera lands on (stackForPath, landForPath); feed is the last sheet
  if(path === '/feed') return 'feed';
  let m = path.match(/^\/(?:work|feed)\/([a-z0-9-]+)\/?$/);
  if(m) return m[1];
  // root-mounted web experiments: a single segment that names a routed page
  m = path.match(/^\/([a-z0-9-]+)\/?$/);
  // the boot index still carries 'work' and 'about' pages for the crawler
  // path; on the canvas those paths are a fan and a zone, never a sheet
  return m && !['work', 'about', 'case-studies'].includes(m[1]) && PAGES[m[1]] ? m[1] : null;
}
function pathForSlug(slug){
  if(slug === 'work') return '/work';
  if(slug === 'feed') return '/feed';
  if(slug === 'about') return '/about';
  const p = PAGES[slug];
  return (p && p.path) || '/feed/' + slug;
}
// ---- the fan ------------------------------------------------------------------
let curFan = null;        // a stack id while a collection holds the layer
let fanShown = [];        // [{def, node, stack}]: the cards on the layer now
let fanSlots = [];        // their screen rects at the current layout
let fanTop = 0;           // where the grid's box starts on the screen (layoutFan)
let fanReturnFocus = null;
// what a member answers to in the search: its own words, its page's, its host
function memberHay(def){
  const pg = def.slug && PAGES[def.slug];
  const bits = [def.label || '', def.kind || '', (def.tags || []).join(' '), pg ? pg.title + ' ' + (pg.meta || '') : ''];
  if(def.ext) bits.push(new URL(def.ext).hostname);
  return bits.join(' ').toLowerCase();
}
const memberName = def => (def.label || '').toLowerCase();
// The lens is ONE list (2026-09-11): a stack's members and the loose tiles
// alike. A world tile the query reaches joins the layer as a card of its
// own, built by the same builder as the tile and flying out of the tile's
// own seat on the ground; a collection door is that list with the filter
// pinned, the field is the same list with the filter loose. The stacks
// themselves stay off the layer (their members answer instead), and so does
// furniture: the hero, the doors, the mark. Cards are minted once, on the
// first query that reaches them, and live on the fan grid hidden.
const tileOf = id => LIVE_TILES.find(t => t.id === id);
// where a card on the layer came from and goes back to: its pile's front
// card, or, for a loose tile, the tile's own seat on the ground
function tileRect(id){
  const o = nodes[id];
  const r = o && !o.hidden && o.n.getBoundingClientRect();
  return r && r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : { x: VW/2 - 72, y: VH/2 - 72, w: 144, h: 144 };
}
const originRect = m => m.stack ? stackRect(m.stack) : tileRect(m.def.id);
function allMembers(){
  const out = [];
  for(const [sid, defs] of Object.entries(fanDefs)) defs.forEach((def, i) => out.push({ def, node: fanMembers[sid][i], stack: sid }));
  return out;
}
// the pile's front card on screen: where the fan grows from and shrinks to.
// A stack the camera cannot see has no rect; the fan then grows from the
// middle of the frame, which is where the eye is anyway.
function stackRect(id){
  const o = nodes[id];
  const el = o && !o.hidden && o.n.querySelector('.card.front, .pw-art');
  const r = el && el.getBoundingClientRect();
  return r && r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : { x: VW/2 - 72, y: VH/2 - 72, w: 144, h: 144 };
}
const memberSize = mn => ({ w: parseFloat(mn.style.width), h: parseFloat(mn.style.height) });
// `from` is a function of a member giving the rect it flies out of (its own
// pile), or null to seat the cards where they go with the layer's own glide
function layoutFan(from){
  const set = fanShown;
  if(!set.length) return;
  // the cards may differ in shape (a lens can gather a shelf and a square);
  // the slots take the largest, and each card centres in its slot
  const sizes = set.map(m => memberSize(m.node));
  const W = Math.max(...sizes.map(z => z.w)), H = Math.max(...sizes.map(z => z.h));
  // a phone reads a collection as a shelf it pushes sideways, not as a
  // column it scrolls past: one row, cards at the size the height allows
  const L = fanLayout(set.length, W, H, VW, VH, bandH(), chromeDensity(VW, VH) === 'phone');
  fanSlots = set.map((m, i) => {
    const sl = L.slots[i], z = sizes[i];
    return { x: sl.x + (sl.w - z.w * L.s) / 2, y: sl.y + (sl.h - z.h * L.s) / 2, w: z.w * L.s, h: z.h * L.s };
  });
  // world controls inside the fan read the fan's own scale for their tap pads
  fanN.style.setProperty('--cv-world-k', String(1/L.s));
  fanN.style.setProperty('--cv-dpr', String(DPR()));
  fanGrid.classList.toggle('scrolls', L.scrolls);
  fanN.classList.toggle('scrolls', L.scrolls);
  fanGrid.classList.toggle('lane', !!L.lane);
  fanN.classList.toggle('lane', !!L.lane);
  // A GRID THAT SCROLLS STARTS UNDER THE HEAD (BIBLE.md section 5: the head
  // stands over the cards on its own strip, never under them). The grid's
  // box begins at the head's band, or at the head's foot where the head
  // stacks taller than the band (a phone's or a watch's two lines), so a
  // card scrolled up is cut there rather than drawn across the collection's
  // name, which on the watch was the whole head as soon as /work was
  // scrolled (2026-09-27). Slots are screen rects, so the cards are placed
  // that much higher in the box.
  fanTop = L.scrolls ? Math.max(FAN.head, Math.ceil(fanN.querySelector('.fanhead').getBoundingClientRect().bottom)) : 0;
  fanGrid.style.top = fanTop ? fanTop + 'px' : '';
  // a grid that scrolls ends where its last row does, which on a phone is
  // under the bar: the grid's ::after stands one margin past the bar so the
  // last card can be scrolled clear of it (2026-09-12)
  fanGrid.style.setProperty('--cv-fan-end', Math.round(L.y0 + L.h + bandH() + FAN.margin - fanTop) + 'px');
  // and the lane's own end, which is how far the row runs: the cards are
  // transformed into place, so the scroller has no content to measure and
  // the ::after below stands at the row's right edge to give it one
  // the lane already carries a lead at BOTH ends (layout.js), and those two
  // are exactly what lets the first and last card reach the middle; adding a
  // margin on top would leave the shelf able to scroll past its own end
  fanGrid.style.setProperty(
    '--cv-fan-right',
    Math.round(L.x0 + L.w + (L.lane ? 0 : FAN.margin)) + 'px'
  );
  set.forEach((m, i) => {
    const mn = m.node;
    const sl = fanSlots[i];
    const to = `translate(${sl.x}px,${sl.y - fanTop}px) scale(${L.s})`;
    const wasHidden = mn.hidden;
    mn.hidden = false;
    const origin = from && from(m);
    if(origin && wasHidden && !REDUCED){
      // FLIP: start where the pile is, land in the slot in eight frames, each
      // card a beat after the one before (a group arrives together). The card
      // resolves through the ordered dither on the way, which is what it used
      // to do with an opacity fade: nothing on this ground fades in.
      mn.style.transition = 'none';
      mn.style.transitionDelay = '0ms';
      mn.style.transform = `translate(${origin.x}px,${origin.y - fanTop}px) scale(${origin.w / sizes[i].w})`;
      mn.style.opacity = '';
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        mn.style.transition = '';
        mn.style.transitionDelay = (i * 24) + 'ms';
        mn.style.transform = to;
      }));
    } else if(wasHidden || REDUCED){
      mn.style.transition = 'none';
      mn.style.transform = to;
      mn.style.opacity = '';
      requestAnimationFrame(()=>{ mn.style.transition = ''; mn.style.transitionDelay = '0ms'; });
    } else {
      // already on the layer (the lens narrowing): glide to the new slot
      mn.style.transitionDelay = '0ms';
      mn.style.transform = to;
      mn.style.opacity = '';
    }
  });
}
// The frame a collection occupies on screen: the union of the slots it seated.
// Measured from the layout rather than assumed to be the viewport, because a
// four-card collection does not fill the frame and rects that march to the
// edges would be describing a box that is not there.
function fanFrameRect(){
  if(!fanSlots.length) return { x: VW/2, y: VH/2, width: 0, height: 0 };
  const x0 = Math.min(...fanSlots.map(s => s.x)), y0 = Math.min(...fanSlots.map(s => s.y));
  const x1 = Math.max(...fanSlots.map(s => s.x + s.w)), y1 = Math.max(...fanSlots.map(s => s.y + s.h));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
// the layer with a set on it: a stack's members (kind = the stack id) or the
// search's finds (kind = 'lens'). Cards not in the set are hidden.
function showFanSet(kind, label, count, set, from){
  if(curFan && curFan !== kind) hideFan(false);
  curFan = kind;
  fanShown = set;
  const shown = new Set(set.map(m => m.node));
  for(const list of Object.values(fanMembers)) for(const mn of list) if(!shown.has(mn)) mn.hidden = true;
  // the head of a collection is its name and its count in the type face
  // (#336): the pixel face is for the hero and the mark alone
  fanTitle.textContent = label;
  fanN.querySelector('.fancount').textContent = count;
  fanN.hidden = false;
  // on a phone the head stacks: the count under the title, a subtitle
  fanN.classList.toggle('narrow', chromeDensity(VW, VH) !== 'desktop');
  // two frames so the scrim's transition sees the change
  requestAnimationFrame(()=>fanN.classList.add('open'));
  // THE COLLECTION OPENS ON ZOOM RECTS (BIBLE.md section 9). The cards are
  // seated straight away and held invisible while dotted outlines march out
  // of the pile to the frame they will occupy; when the outlines land, the
  // collection is there. This replaced a FLIP where every card flew from the
  // pile to its own slot and dithered in on the way: pretty, and it said the
  // same thing eight times at once. One set of outlines says which thing
  // became which, the way it has since System 1.
  // the cards FLY out of the pile to their seats (layoutFan's FLIP), and the
  // marquee frames the move rather than standing in for it
  layoutFan(from);
  const pile = from && from(set[0]);
  if(pile && !REDUCED) zoomRects(pile, fanFrameRect());
  scene.inert = true;
  document.documentElement.classList.add('fan-open');
  syncClose();
}
function showFan(id, animate, keepFocus = false){
  const t = stackTile(id); if(!t) return;
  const set = (fanDefs[id] || []).map((def, i) => ({ def, node: fanMembers[id][i], stack: id }));
  showFanSet(id, t.label, countLine(t, set.length) || String(set.length), set, animate ? () => stackRect(id) : null);
  warmPages(set);
  if(!fanReturnFocus) fanReturnFocus = document.activeElement;
  // a sheet already up (or SSRd open) owns the title
  if(!curSheet && !$('#modal').classList.contains('open')) document.title = `${t.label} · ${SITE_NAME}`;
  // the finder keeps the keyboard in the field: it opened this to show a card
  if(set[0] && !curSheet && !keepFocus) set[0].node.focus({preventScroll: true});
  shareView(fanNow());
}
function hideFan(animate){
  const kind = curFan; if(!kind) return;
  curFan = null;
  const set = fanShown;
  fanShown = [];
  fanN.classList.remove('open', 'under');
  document.documentElement.classList.remove('fan-open');
  syncClose();
  if(!curSheet) scene.inert = false;
  if(auraEl && fanN.contains(auraEl)) clearAura(); // a lit card folds away unlit
  const done = ()=>{ if(curFan) return; fanN.hidden = true; for(const { node: mn } of set){ mn.hidden = true; mn.style.opacity = ''; mn.style.transitionDelay = '0ms'; } };
  // the outlines march home WHILE the cards fold back into the pile, not
  // after: a collection closes every time anybody backs out of one, and two
  // slide tokens end to end is a door you have to wait for
  if(animate && !REDUCED && kind !== 'lens'){
    const t0 = stackTile(kind);
    if(t0) zoomRects(fanFrameRect(), stackRect(kind));
  }
  if(animate && !REDUCED){
    set.forEach((m, i) => {
      // each card folds back into its own pile, or its own seat on the ground
      const to = originRect(m);
      const { w } = memberSize(m.node);
      m.node.style.transitionDelay = ((set.length - 1 - i) * 16) + 'ms';
      m.node.style.transform = `translate(${to.x}px,${to.y - fanTop}px) scale(${to.w / w})`;
    });
    setTimeout(done, SLIDE_MS + set.length * 16 + 40);
  } else done();
  if(!curSheet) document.title = curLand ? `${(nodes[curLand] && nodes[curLand].t.label) || curLand} · ${SITE_NAME}` : SITE_NAME;
  if(fanReturnFocus && !curSheet){
    if(document.contains(fanReturnFocus) && fanReturnFocus.focus) fanReturnFocus.focus({preventScroll: true});
    fanReturnFocus = null;
  }
  shareView(fanNow());
}
// a click on a stack: the fan is a page, so it goes into history like one
function openStack(id){
  const t = stackTile(id); if(!t) return;
  if(curFan === id){ if(curSheet) closePage(); return; }
  history.pushState({fan: id, sheet: null}, '', roomed(t.route));
  showFan(id, true);
}
function closeStack(){
  if(!curFan) return;
  // a fan the one followed spread stays up until a hand of the follower's
  // own folds it, or theirs does (canvas/view-sync.js holdsFan)
  if(holdsFan(curFan)) return;
  // the search's layer closes by letting the query go
  if(history.state && history.state.direct){
    history.replaceState({fan: null, sheet: null}, '', roomed('/'));
    hideFan(true);
  } else {
    if(backPending) return;
    backPending = true;
    history.back();
  }
}
// a click on the ground folds the fan: anywhere on the layer that is not a
// card (the grid spans the frame over the scrim, so the scrim alone never
// saw the click). A card's own click is the card's.
fanN.addEventListener('click', e=>{ if(curSheet || e.target.closest('.member')) return; closeStack(); });
// the whole route in one place: what fan is up, what sheet is open
function paintRoute(path){
  const fan = stackForPath(path);
  if(fan && fan !== curFan) showFan(fan, true);
  else if(!fan && curFan) hideFan(true);
  paintSheet(slugForPath(path));
  const land = landForPath(path);
  if(land) goZone(land, false);
}
// THE FAN IS A VIEW (canvas/view-sync.js). Which collection is spread and
// which of its cards is up are the visitor's own in the public room at
// large; in a session they are everyone's, and under a follow the one
// followed spreads them for the tabs following. The state is said after
// every change (showFan, hideFan, paintSheet) and the bridge drops a repeat.
// A peer's is applied only over the ground or a card of a fan: a page this
// reader opened for themselves stays theirs. The search's own layer (the
// lens) is not a collection and is never said.
function fanNow(){
  const s = curFan && curFan !== 'lens' ? curFan : null;
  const sib = s && curSheet ? fanSiblings(curSheet) : null;
  return { what: 'fan', s, i: sib ? sib.i : -1 };
}
onView('fan', v => {
  if(curSheet && !fanSiblings(curSheet)) return;
  if(!v.s){ if(curSheet) closePage(); else if(curFan && curFan !== 'lens') closeStack(); return; }
  if(!stackTile(v.s)) return;
  if(curFan !== v.s) openStack(v.s);
  const m = v.i >= 0 ? fanShown[v.i] : null;
  if(m && m.def.slug && PAGES[m.def.slug]){ if(curSheet !== m.def.slug) openPage(m.def.slug); }
  else if(curSheet) closePage();
}, fanNow);
wireViewSync({ page: () => curSheet, sheet: () => $('#sheetInner'), following: () => follow.id, presence });
// ---- the preview: a card over the fan, cycling through its siblings -------------
// A case study opened from the work fan is a preview (BIBLE.md section 5):
// the sheet becomes a card with a bottom, and < > walk to the adjacent
// studies. The world and the fan stay fixed below it; the effect sits
// between the card and the collection, never stacked: the fan's own scrim
// steps aside while the card's backdrop does the dimming.
// THE WALK IS THE SNAP SCROLLBAR (#336): the kit's .k-scroll over the
// card's siblings, the same bar that turns a pile on the ground and walks a
// full page's ring, so a collection is walked one way everywhere. It used
// to be a hand-drawn chevron in a box on each side of the card. The bar is
// painted per card (setPreview): its slots are the collection shown, its
// thumb the card up. A stepper walks one and wraps; a press on the track
// or a released drag goes straight to that card.
const fanNav = document.createElement('div');
fanNav.id = 'fanNav';
fanNav.hidden = true;
$('#modal').appendChild(fanNav);
function fanSiblings(slug){
  if(!curFan || !slug) return null;
  const i = fanShown.findIndex(m => m.def.slug === slug);
  return i < 0 ? null : { i, defs: fanShown.map(m => m.def) };
}
function setPreview(slug){
  // a full page is a destination, never a card sitting on its collection
  const sib = isFull(slug) ? null : fanSiblings(slug);
  $('#modal').classList.toggle('preview', !!sib);
  fanN.classList.toggle('under', !!sib);
  fanNav.hidden = !sib || sib.defs.length < 2;
  // the bar stands under the card on every screen, in the strip the card
  // leaves above the field, so it covers none of the card's words
  if(!fanNav.hidden) paintFanNav(sib);
  return sib;
}
const cardTitle = d => (d.slug && PAGES[d.slug]?.title) || d.label || d.slug || '';
function paintFanNav(sib){
  const titles = sib.defs.map(cardTitle);
  fanNav.innerHTML = scrollMarkup({ titles, at: sib.i, label: 'which card' });
  wireScroll(fanNav.querySelector('.k-scroll'), { titles, onCommit: j => cycleTo(j) });
}
let cycling = false;
const cycle = (dir) => { const sib = fanSiblings(curSheet); if(sib) cycleTo(sib.i + dir); };
function cycleTo(to){
  if(cycling) return;
  const sib = fanSiblings(curSheet); if(!sib) return;
  const n = sib.defs.length, j = ((to % n) + n) % n;
  if(j === sib.i) return;
  const next = sib.defs[j];
  if(!next.slug || !fanSlots[sib.i] || !fanSlots[j]){ openPage(next.slug); return; }
  const sheet = $('#sheet');
  if(REDUCED){ openPage(next.slug); return; }
  cycling = true;
  // No lateral move (the rule, 2026-09-15): the page goes back into the
  // collection on its own outlines, and the next one comes out on its. You
  // see where you were and where you are going, which a sideways slide
  // cannot say.
  const a = fanSlots[sib.i], b = fanSlots[j];
  const sheetBox = sheet.getBoundingClientRect();
  sheet.style.visibility = 'hidden';
  zoomRects(sheetBox, a, { done: ()=>{
    openPage(next.slug);
    const r2 = sheet.getBoundingClientRect();
    zoomRects(b, r2.width ? r2 : sheetBox, { done: ()=>{
      sheet.style.visibility = '';
      cycling = false;
    }});
  }});
}
// the bar's gestures are its own: a press on it does not reach the backdrop
fanNav.addEventListener('click', e => e.stopPropagation());
fanNav.addEventListener('pointerdown', e => e.stopPropagation());
// SWIPE: sideways walks the siblings, down from the top closes the card.
//
// It walks them from inside a FULL PAGE too since 2026-09-16. The gesture was
// gated on the preview nav being up, which meant it worked on a collection's
// card and died the moment you opened one to read it: the place a reader is
// most likely to want the next thing is the one place the swipe was not
// listening. A full page steps through pageRing(), the same collection the
// nav's `next` button walks, so the button and the thumb agree.
let swipe = null;
const scrollsSideways = (t) => {
  for(let n = t; n && n.id !== 'sheet'; n = n.parentElement){
    const x = n.nodeType === 1 && getComputedStyle(n).overflowX;
    if((x === 'auto' || x === 'scroll') && n.scrollWidth > n.clientWidth) return true;
  }
  return false;
};
const stepPage = (by) => {
  const ring = pageRing(curSheet);
  const i = ring.indexOf(curSheet);
  if(i < 0 || ring.length < 2) return;
  switchTab(ring[(i + by + ring.length) % ring.length]);
};
$('#sheet').addEventListener('pointerdown', e=>{
  if(e.pointerType !== 'touch') return;
  if(fanNav.hidden && !isFull(curSheet)) return;
  if(ownsTouch(e.target)) return;
  // anything that scrolls sideways under a finger (the tab strip, an
  // instrument's panel on a phone) is being pushed along, not asked for the
  // next page: one rule, so a new scroller needs no name here
  if(scrollsSideways(e.target)) return;
  swipe = { x: e.clientX, y: e.clientY, top: $('#sheet').scrollTop };
}, {passive: true});
$('#sheet').addEventListener('pointerup', e=>{
  if(!swipe || e.pointerType !== 'touch') return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  swipe = null;
  if(Math.abs(dx) > 64 && Math.abs(dx) > 2 * Math.abs(dy)){
    // a full page walks its collection; a preview card walks the fan
    if(isFull(curSheet)) stepPage(dx < 0 ? 1 : -1);
    else cycle(dx < 0 ? 1 : -1);
  }
  else if(dy > 96 && Math.abs(dy) > 2 * Math.abs(dx) && $('#sheet').scrollTop <= 0) closePage();
}, {passive: true});

// a zone is a place: its door, its command and its path fly the camera to it
// and write the place into the address (BIBLE.md section 5)
let curLand = null;
// the zoom a zone lands at: true scale, or what fits ONE SLOT of it in the
// frame with a gutter each side (a phone holds a 432px slot at 0.75, not
// edge to edge). A zone wider than a slot (about spans two, 2026-09-12)
// lands on its first slot at that scale; the rest is a pan to the right.
// Fitting the whole zone would land a phone at a third scale on type it
// cannot read.
// THE FRAME (2026-09-15): arriving means holding the thing WHOLE. The
// camera lands at true scale when the frame has room for it and pulls back
// when it does not, bounded by one SLOT on each axis: everything seated on
// the ring is at most a slot, so for a tile this reads as "true scale, or
// what fits", and a zone that spans two slots (about) arrives on one of
// them rather than at a third scale on type nobody can read. `cap` is how
// deep the arrival may be: a door arrives at true scale, the finder keeps
// a hand that is already deeper than that unless the thing stops fitting
// there. The band is the chrome's, so the free height is the free height.
const frameZoom = (w, h, cap = 1) =>
  restZ(Math.min(
    cap,
    (VW - 2 * CHROME.inset) / Math.min(w, BENTO.unit),
    Math.max(1, VH - bandH() - 2 * CHROME.inset) / Math.min(h, BENTO.unit)
  ), 'down');
const landZoom = o => frameZoom(o.w, o.h);
// the world point the landing centres on: the zone's centre, or the centre
// of as much of it as the frame holds from its left edge
const landAim = (o, z) => {
  const seen = Math.min(o.w, VW / z - 2 * CHROME.inset);
  return { x: o.wx + seen / 2, y: o.wy + o.h / 2 + bandH() / (2 * z) };
};
function goZone(id, push = true){
  const o = nodes[id]; if(!o) return;
  if(curSheet) closePage();
  // a zone's path is the table's, not its id: the hire zone lives at /work
  const path = LAND_PATHS[id] || '/' + id;
  if(push && location.pathname !== path) history.pushState({land: id}, '', roomed(path));
  curLand = id;
  document.title = `${o.t.label || id} · ${SITE_NAME}`;
  const z = landZoom(o), aim = landAim(o, z);
  flightTo(aimX(aim.x), aimY(aim.y), z);
}
// THE PAGE BAR (#338). ONE navigation for every full page, a case study or
// an experiment, opened from the canvas or loaded direct: a strip of TABS at
// the top of the sheet, the way a browser holds its pages, pinned there
// while the page scrolls under it (position: sticky in #mscroll, the full
// page's scroll owner). One tab a page of the ring (pageRing: the same kind
// only, the open collection setting the order), each a real link, the page
// you are on the lit tab in one piece with the sheet, and the close box on
// that tab and no other. The way back to the top is not in it: it is the
// page's foot (footTop, below). The author, on the
// scrollbar that stood here first: "When going to full screen it doesn't
// make sense to keep the scroll bar up top ... switch to tabs like a web
// browser ... It's intuitive because it's familiar." It replaced three
// things that each did a third of this somewhere else: the corner nav an
// experiment wore (`‹ canvas` and `next ›` boxes pinned over the page), the
// foot dock a case study ended in (four truncated titles in a row, "a
// packed limbo UI at the bottom") and the foot's old way back to the top.
// The author's brief: "the intuition someone builds using one side of the
// site should work on the other", and the same scrollbar turns the piles on
// the ground. The markup is js/kit-scroll.js pageBarMarkup, which the server
// SSRs on a direct load (canvas-sheets.js), so the two paths are one string.
// THE RING A PAGE WALKS IS ITS OWN KIND (2026-09-16, closed 2026-09-18).
// `next` used to be the next entry in PAGES, which is every full page there
// is, so stepping on from a case study could land on an experiment: two
// things that share a template and nothing else. The first fix walked the
// open collection and still fell back to every full page when there was
// none, so an experiment opened straight off the ground swiped into a case
// study, and a case study opened the same way swiped into an experiment.
//
// The rule now has no fallback to leak through: experiments and case studies
// never link to each other, by any gesture or button. The ring is the full
// pages of the slug's own kind (the boot index ships entry-kind.js's kindOf),
// whether or not a collection is open. An open collection only sets the
// ORDER, so the button, the thumb and the lane behind them still agree. A
// kind of one is a ring of one, and a ring of one goes nowhere. So does a
// page with no kind at all (a stale boot from before the index shipped it):
// an empty ring fails closed rather than matching every other kindless page.
function pageRing(slug){
  const kind = PAGES[slug] && PAGES[slug].kind;
  const mine = s => !!kind && isFull(s) && PAGES[s].kind === kind;
  const defs = curFan && fanDefs[curFan];
  if(defs){
    const ring = defs.map(d => d.slug).filter(mine);
    if(ring.includes(slug)) return ring;
  }
  return Object.keys(PAGES).filter(mine);
}
// A COURTESY, AND ONLY ON THE LANE (2026-09-16). When a reader opens a study
// and swipes on through the collection, the shelf behind them is still parked
// where they left it, so closing the sheet drops them somewhere they have not
// been for four articles. This walks the lane to the card they are actually
// reading, so the collection is where they left off rather than where they
// started.
//
// The lane only, which is the phone: a fitted grid has every card on screen
// already and nothing to scroll, so there is nothing courteous to do.
// It runs as the page closes (paintSheet), no longer on every tab switch
// (2026-09-25): switching tabs is not a trip to the collection. There it is
// `now`, at once and under the page, so the page shrinks into the card
// where the card really is; anywhere else it is smooth, because a shelf
// that teleports in view is a shelf that lost your place.
function centreLaneOn(slug, now = false){
  if(!fanGrid.classList.contains('lane')) return;
  const i = fanShown.findIndex(m => m.def && m.def.slug === slug);
  const sl = fanSlots[i];
  if(i < 0 || !sl) return;
  const to = Math.round(sl.x + sl.w / 2 - fanGrid.clientWidth / 2);
  fanGrid.scrollTo({
    left: Math.max(0, Math.min(to, fanGrid.scrollWidth - fanGrid.clientWidth)),
    behavior: REDUCED || now ? 'auto' : 'smooth',
  });
}
// the collection a page belongs to, as its bar names it, the words the
// server's bar uses (canvas-sheets.js pageBar): the case studies are a pile
// and are named for it; a root-mounted thing has no collection and its
// strip goes unnamed rather than filed under a word for its kind
const collectionOf = slug => PAGES[slug].kind === 'case-study' ? 'Case Studies' : '';
// BACK GOES WHERE THE THING CAME FROM, which is not always the canvas: a
// study opened out of its collection goes back INTO that collection, and an
// experiment opened off the ground goes back to the ground. Anything else is
// a page telling you it came from somewhere it did not. closePage does
// exactly that; the close box's href is what a reader without scripts gets.
const closeOf = () => {
  const from = curFan && stackTile(curFan);
  return from ? { path: from.route, label: from.label } : { path: '/', label: 'canvas' };
};
// WHICH element scrolls depends on the mode: a preview card scrolls inside
// #sheet, a full page scrolls #mscroll. Measuring the wrong one reports a
// page that fits when it does not, and the control hides itself exactly
// where it was needed.
// the width under which the page bar is a phone's (canvas-home.css)
const PHONE_BAR = matchMedia('(max-width: 560px)');
const scrollOwner = () => {
  const sheet = $('#sheet');
  return sheet.scrollHeight > sheet.clientHeight + 4 ? sheet : mscroll;
};
function paintPageBar(slug){
  // the last page's foot stops measuring; a full page takes its own (footTop)
  footObs?.disconnect();
  $('#sheet').querySelector(':scope > .k-bar')?.remove();
  if(!isFull(slug)) return;
  // the ring always holds the page itself: a page outside its kind's ring
  // (a stale boot) is a strip of one, its own tab and its close
  const all = pageRing(slug);
  const ring = all.includes(slug) ? all : [slug];
  const i = ring.indexOf(slug);
  const items = ring.map(s => ({ title: PAGES[s].title, path: pathForSlug(s) }));
  const label = collectionOf(slug);
  $('#sheet').insertAdjacentHTML('afterbegin', pageBarMarkup({ label, close: closeOf(), ring: items, at: i }));
  const bar = $('#sheet').querySelector(':scope > .k-bar');
  const plain = e => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
  // the lit tab's close and the corner's are one action, the way Esc goes
  bar.querySelectorAll('.k-close, .page-x').forEach(x => x.addEventListener('click', e => {
    if(!plain(e)) return;
    e.preventDefault(); closePage();
  }));
  // a tab is a link: a plain click (or Enter) switches to its page in place
  // (switchTab), the lit one stays where it is, and a new-tab gesture is
  // the browser's
  const strip = bar.querySelector('.k-tabs');
  // On a phone the lit tab is the only one showing and it is the
  // dropdown, the way a phone browser's one tab opens its tab list
  // (canvas-home.css): the v's width, so the page and its CSS agree.
  const list = bar.querySelector('.k-ring');
  strip.querySelectorAll('.k-tab-go').forEach((a, k) => a.addEventListener('click', e => {
    if(!plain(e)) return;
    e.preventDefault();
    if(k !== i) switchTab(ring[k]);
    else if(list && PHONE_BAR.matches) list.togglePopover();
  }));
  wireTabs(strip);
  // the list hangs from the bar's rule under the v, wherever the page's
  // frame puts the bar (canvas-home.css .k-ring), with the page you are on
  // in view when it opens
  list?.addEventListener('beforetoggle', e => {
    if(e.newState !== 'open') return;
    const box = bar.querySelector('.k-ring-v').getBoundingClientRect();
    list.style.setProperty('--k-ring-top', `${Math.round(bar.getBoundingClientRect().bottom)}px`);
    list.style.setProperty('--k-ring-right', `${Math.max(0, Math.round(document.documentElement.clientWidth - box.right))}px`);
  });
  list?.addEventListener('toggle', e => {
    if(e.newState === 'open') list.querySelector('.is-on')?.scrollIntoView({block: 'nearest'});
  });
  // a row of the list the box opens is a tab by another name: the same
  // switch in place, and the list closes behind it (the repaint takes it)
  bar.querySelectorAll('.k-ring-go').forEach((a, k) => a.addEventListener('click', e => {
    if(!plain(e)) return;
    e.preventDefault();
    if(k === i) bar.querySelector('.k-ring')?.hidePopover();
    else switchTab(ring[k]);
  }));
  // a strip that scrolls brings the page you are on into view: now, and
  // again once the frame is laid out (a bar painted mid-open measures late)
  litIntoView(strip);
  requestAnimationFrame(() => litIntoView(strip));
  // the ring's pages are fetched now, the way a fan warms its cards, so a
  // switch paints from memory and the swap is the whole of the wait
  for(const s of ring) if(PAGES[s].embed && !pageFetches.has(PAGES[s].embed)) fetchPage(PAGES[s].embed).catch(()=>{});
}
// THE TAB SWITCH (author, 2026-09-25: "I don't think the transition back to
// the collection is necessary anymore; switching tabs should be its own
// quick and snappy animation. Do keep the rect for opening and closing
// pages."). A tab is a page of the ring the reader is already in, so going
// to it is not leaving: nothing closes, nothing shrinks into its card and
// grows out of the next, the collection behind the page is not scrolled,
// and the canvas never shows. The page swaps where it stands. The lit tab
// goes down at once (a radio push-button clicks) and the new page comes in
// from the top of its column in four frames on the quick token (#sheetInner
// .tab-in, canvas-home.css); reduced motion swaps it with no frames at all.
// The address still follows, by replaceState as every sheet-to-sheet hop
// does, so one close still lands where the ring was opened from; presence,
// shared highlights and the reader follow the new page because they are
// told the page changed exactly as an open tells them.
// the kit's loader, the one line a page shows while its body is fetched
const LOADER = `<p class="sheetLoading k-meta" role="status"><span class="k-load"></span>loading</p>`;
function switchTab(slug){
  if(!slug || slug === curSheet || !isFull(slug) || !isFull(curSheet)) return;
  history.replaceState({sheet: slug, direct: !!(history.state && history.state.direct)}, '', roomed(pathForSlug(slug)));
  const p = PAGES[slug];
  reader?.stop(); reader = null;
  curSheet = slug;
  announcePlace();
  // an entry always ships its docTitle (the boot index), raw: a tab title
  // is not markup
  document.title = p.docTitle;
  $('#modal').setAttribute('aria-label', p.title);
  applyReader($('#modal'), isReading(slug));
  const inner = $('#sheetInner');
  inner.innerHTML = `<h1>${esc(p.title)}</h1>${metaMarkup(p, slug)}${LOADER}`;
  pixelHead(p);
  mountEmbed(p, slug);
  // a keyboard on the strip stays on the strip, on the tab now lit
  const onBar = $('#sheet > .k-bar')?.contains(document.activeElement);
  paintPageBar(slug);
  // (on a phone the strip is put away, so the keyboard lands on the box)
  if(onBar){
    const lit = $('#sheet > .k-bar .k-tabs [aria-current]');
    lit?.focus({preventScroll: true});
    if(document.activeElement !== lit) $('#sheet > .k-bar .k-ring-v')?.focus({preventScroll: true});
  }
  mscroll.scrollTop = 0;
  if(REDUCED) return;
  inner.classList.remove('tab-in');
  void inner.offsetWidth;   // restart the frames on a switch made mid-switch
  inner.classList.add('tab-in');
}
// THE WAY BACK TO THE TOP IS THE PAGE'S FOOT (author, 2026-09-25: "The back
// to top button should show at the bottom of long things not be a confusing
// arrow up top. Intuitive please. We're not inventing any wheels here.").
// Where the web puts it: after the last of the page's content, in its flow,
// one outline button that says what it does. Only on a page long enough to
// have lost you, its scroll owner more than two screens tall, measured once
// the layout is real and again whenever the page's height changes (a
// figure that lands late). It is the page's foot, not a second nav: nothing
// beside it goes on or back.
let footObs = null;
function footTop(){
  const inner = $('#sheetInner');
  inner.querySelector(':scope > .page-foot')?.remove();
  // a box of its own, not a paragraph: the prose measure a paragraph wears
  // would sit the button off the column's centre
  const foot = document.createElement('div');
  foot.className = 'page-foot';
  foot.hidden = true;
  foot.innerHTML = `<button type="button" class="k-btn to-top">${UP_GLYPH}<span>Back to the Top</span></button>`;
  foot.querySelector('.to-top').addEventListener('click', ()=>
    scrollOwner().scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }));
  inner.appendChild(foot);
  const measure = ()=>{ const sc = scrollOwner(); foot.hidden = sc.scrollHeight <= 2 * sc.clientHeight; };
  requestAnimationFrame(measure);
  footObs?.disconnect();
  footObs = new ResizeObserver(()=>requestAnimationFrame(measure));
  footObs.observe(inner);
}

// A FULL PAGE stands on its own (BIBLE.md section 9), and it STILL comes out
// of the card you clicked. It used to be covered by an iris instead: the
// frame shut, the page changed behind the doors, and the iris opened on it.
// That was a second transition vocabulary for one site, and the argument for
// it ("a destination did not come out of a card") is a thing the visitor
// cannot see, because they watched themselves click the card. What they can
// see is which thing became which, and one move that says it everywhere is
// worth more than a second one that says it beautifully in one place. So a
// full page grows out of its seat in the collection and shrinks back into
// it, on the same rects and the same slide token as a preview card.
const isFull = slug => !!(slug && PAGES[slug] && PAGES[slug].full);
function openPage(slug){
  // the work door lands on the WORK zone, the section beside the case
  // studies (2026-09-11); the pile itself opens as /case-studies
  // /work IS the case studies now (2026-09-16): the WORK zone it used to
  // land on was dropped into the about triptych, and a door pointing at a
  // place that no longer exists left the visitor parked on empty ground.
  if(slug === 'work'){ openStack('work'); return; }
  // the about door lands the camera on the about zone
  if(slug === 'about'){ goZone(slug); return; }
  if(!slug || slug === curSheet) return;
  // a hop between two full pages of one ring (a link in the prose, a
  // follower's page) is a tab switch: in place, never the round trip
  if(isFull(curSheet) && isFull(slug) && pageRing(curSheet).includes(slug)){ switchTab(slug); return; }
  // sheet-to-sheet hops REPLACE the entry instead of stacking: however many
  // pages were walked in a row, the history is only ever [canvas, sheet], so
  // one close (x, backdrop, gap, Escape, browser back) lands on the canvas.
  if(curSheet){
    history.replaceState({sheet: slug, direct: !!(history.state && history.state.direct)}, '', roomed(pathForSlug(slug)));
  } else {
    history.pushState({sheet: slug}, '', roomed(pathForSlug(slug)));
  }
  paintSheet(slug);
}
// Close semantics: a sheet reached from the canvas goes back (so forward can
// re-open it); a direct load (SSR'd sheet, history.state.direct) rewrites to
// / so browser-back still leaves the site.
let backPending = false;   // one back() per traversal: Escape auto-repeats
function closePage(){
  if(!curSheet){ paintSheet(null); return; }
  // LEAVING is the entry run backwards, full page or card alike: the page
  // shrinks into the seat it came out of while the rects march home.
  if(history.state && history.state.direct){
    // a directly loaded card closes into its fan when it has one, else home
    const t = curFan && stackTile(curFan);
    history.replaceState({fan: curFan, sheet: null, direct: true}, '', roomed(t ? t.route : '/'));
    paintSheet(null);
  } else {
    if(backPending) return;
    backPending = true;
    history.back();
  }
}
// A jump to a place in the page that is already up (a footnote, a line number)
// is a fragment navigation, and the browser says so with a popstate: it has
// scrolled there, on the sheet's own easing, and the page is as it was.
// Painting the route again rebuilt the page under that scroll, and the glide
// ended far from its target. Only a step to another page paints.
addEventListener('popstate', ()=>{
  backPending = false;
  if(curSheet && slugForPath(location.pathname) === curSheet) return;
  paintRoute(location.pathname);
});
// legacy #/slug links from the prototype: a fresh load redirects in boot();
// a same-document fragment navigation (an old link clicked mid-session)
// redirects here, so the hash never survives either way
function legacySlug(){
  const m = location.hash.match(/^#\/([a-z0-9-]+)\/?$/);
  return m && (SECTIONS[m[1]] || PAGES[m[1]]) ? m[1] : null;
}
addEventListener('hashchange', ()=>{
  const slug = legacySlug();
  if(!slug) return;
  history.replaceState({sheet: slug}, '', roomed(pathForSlug(slug)));
  paintSheet(slug);
});
// Native experiment mount: fetch the entry, adopt its stylesheets once,
// inject its markup, then (re)run its scripts. Classic scripts are IIFEs and
// modules get a fresh URL per open, so a reopened widget binds to the fresh
// DOM instead of the corpse of the last one.
// pre-seeded with whatever the server already put in the head: an SSR'd
// entry sheet ships its stylesheet chain as real data-sheet-css links
const adoptedCss = new Set(
  [...document.querySelectorAll('link[data-sheet-css]')].map(l=>l.getAttribute('href')));
// Pages a fan can open are fetched the moment the fan is up (warmPages, from
// showFan), so the click that opens one paints from memory and the network
// is off the path it was reported slow on (2026-09-12). One promise per
// embed, shared by the warm-up and the open; a failed warm-up is dropped so
// the open fetches again itself.
const pageFetches = new Map();
function fetchPage(embed){
  if(!pageFetches.has(embed)){
    const p = fetch('/api/page/'+embed).then(res => { if(!res.ok) throw new Error('http '+res.status); return res.json(); });
    p.catch(()=>pageFetches.delete(embed));
    pageFetches.set(embed, p);
  }
  return pageFetches.get(embed);
}
function warmPages(set){
  for(const m of set){
    const pg = m.def.slug && PAGES[m.def.slug];
    if(pg && pg.embed && !pageFetches.has(pg.embed)) fetchPage(pg.embed).catch(()=>{});
  }
}
// The meta line under a page's title, and the tags under that, as one block:
// the same markup the server SSRs (canvas-sheets.js), so a click and a direct
// load read alike. The tags ride the boot payload (BOOT.arts), and they sit
// INSIDE the meta block so a page has the same blocks with or without them
// (the anchors a follower reads, below). A section or an experiment has none.
const metaMarkup = (p, slug) => `<div class="meta">${esc(p.meta)}${tagsMarkup(BOOT?.arts?.[slug]?.tags, p.kind)}</div>`;
// the page's title: a case study wears the canvas's display face, set by
// the same pixelTitle its card uses (#300). The markup literals still write
// the escaped <h1> every sheet gets; this swaps it for the pixel one, whose
// kept words pixelTitle escapes itself.
function pixelHead(p){
  const h = p.kind === 'case-study' && $('#sheetInner > h1');
  if(!h) return;
  h.outerHTML = pixelTitle(p.title, 'display', { tag: 'h1' });
  dustTitle($('#sheetInner > h1.ptitle'));
}
async function mountEmbed(p, slug){
  try{
    const page = await fetchPage(p.embed);
    // bail if the visitor closed the sheet or moved on mid-fetch
    if(curSheet !== slug) return;
    for(const href of page.css){
      if(adoptedCss.has(href)) continue;
      adoptedCss.add(href);
      const l=document.createElement('link'); l.rel='stylesheet'; l.href=href;
      document.head.appendChild(l);
    }
    const inner=$('#sheetInner');
    // the way back names its collection: case studies came through the work
    // door, articles through feed, experiments live on the canvas itself,
    // so theirs names the canvas. Every sheet gets one: a small touch screen
    // reaches none of the other closes (Escape, backdrop, gap).
    // ONE WAY BACK PER PAGE (2026-09-16). A full page carries its own in its
    // bar (paintPageBar), so the prose backlink would be a second one
    // pointing somewhere else, and two back buttons on one page is a question
    // rather than an exit. A sheet still gets the prose link, because a sheet
    // has no bar of its own.
    const backTo = page.type==='article' ? 'feed' : null;
    const back = isFull(slug)
      ? ''
      : backTo
      ? `<p class="backlink"><a href="${pathForSlug(backTo)}">← ${backTo}</a></p>`
      : `<p class="backlink"><a href="/">← canvas</a></p>`;
    // a page that is read carries the reader's settings under its meta
    // line, the same string the server SSRs (js/page-reader.js)
    inner.innerHTML=`<h1>${esc(p.title)}</h1>${metaMarkup(p, slug)}${isReading(slug) ? readerMarkup() : ''}<div class="exp-native"><article class="prose">${page.html}</article></div>${back}`;
    pixelHead(p);
    wirePageReader(slug);
    // the body has landed, so the page finally has its real height: the way
    // back to the top is measured now rather than against the loader
    if(isFull(slug)) footTop();
    const bust=Date.now();
    for(const src of page.js){
      const s=document.createElement('script'); s.src=`${src}?v=${bust}`;
      // dynamically inserted scripts are async by default; keep declaration
      // order (an entry listing several gets them in the order it declared)
      s.async=false;
      inner.appendChild(s);
    }
    for(const src of page.modules){
      const s=document.createElement('script'); s.type='module'; s.src=`${src}?v=${bust}`; inner.appendChild(s);
    }
  }catch{
    // the error state can act: retry re-runs the mount, no reload needed
    $('#sheetInner').innerHTML=`<h1>${esc(p.title)}</h1>${metaMarkup(p, slug)}<p class="sheetLoading k-meta">could not load. <button type="button" class="k-btn retry">retry</button></p>`;
    pixelHead(p);
    $('#sheetInner').querySelector('.retry').addEventListener('click', ()=>mountEmbed(p, slug));
  }
}

// THE READER'S SETTINGS (js/page-reader.js): Dark Mode, Plain Type and
// Listen, on a page that is read. One reader at a time: a page that closes
// or switches stops the voice, so nothing reads a page no longer there.
const isReading = slug => !!(slug && PAGES[slug] && PAGES[slug].kind === 'case-study');
let reader = null;
function wirePageReader(slug){
  reader?.stop(); reader = null;
  const group = $('#sheetInner > .reader');
  const prose = $('#sheetInner .prose');
  if(!group || !prose || curSheet !== slug) return;
  reader = wireReader(group, { shell: $('#modal'), title: PAGES[slug].title, prose, scroller: scrollOwner, reduced: REDUCED });
}
// A full page covers the collection and the map: they are painted under it
// but nobody can reach them, so they leave the keyboard's and the screen
// reader's way too (axe, 2026-09-25: the fan's head and the map were read
// as content outside any landmark, under a page that hid them).
function coverUnder(full){
  fanN.inert = full;
  minimap.inert = full;
}
// Focus discipline: the modal IS the page, so keyboard and screen-reader
// users land in it on open and return to where they were on close. The
// canvas underneath goes inert (it is frozen and scrimmed anyway), which
// keeps Tab and assistive tech inside the visible UI: topbar plus sheet.
// The remembered element survives sheet-to-sheet hops (the backlink), so
// close always returns to the tile that started the journey.
let sheetReturnFocus = null;
function openChrome(label, fromRect){
  sizeSheet();
  // Was it already up? A direct load arrives with the sheet SSR'd open and
  // adopts it; nothing arrived, so nothing slides.
  const wasOpen = $('#modal').classList.contains('open');
  $('#modal').classList.add('open');
  $('#modal').setAttribute('aria-label', label);
  growFrom(fromRect);
  syncClose();
  mscroll.scrollTop = 0; canvasSlide();
  vx = vy = 0; homeTween = null;   // the canvas holds still under the page
  setRecede(0.985);                // and gives by a breath under its weight
  // Capture the return target BEFORE inerting the canvas: making an
  // ancestor inert may evict focus to body, and body is a useless place
  // to return a keyboard user to.
  if(!sheetReturnFocus) sheetReturnFocus = document.activeElement;
  scene.inert = true;
  // A state the STYLESHEET can see. #scene is an earlier sibling of #modal,
  // so no selector can reach back to it from the open sheet; the watch
  // density uses this to stop the canvas painting at all while a sheet is up.
  document.documentElement.classList.add('sheet-open');
  // last, so the slide asks the stylesheet in the state it will run in
  if(!wasOpen) slideUp();
  $('#sheet').focus({preventScroll:true});
}
// The bottom sheet's SLIDE, made to actually happen (2026-09-15). #modal is
// display:none until .open, so adding the class moved #mscroll from
// translateY(100%) to 0 inside one style recalculation: the transition had no
// rendered frame to leave from and the page simply APPEARED at rest. The
// stylesheet was right the whole time, which is why nothing caught it; a
// transition that never runs looks exactly like a transition that is fast.
// Now the scroller is put back at the foot with the transition off, laid out
// once (the reflow IS the fix), and let go, so the class's eight frames have
// a start. The preview card does not slide (it grows out of its own card, and
// #modal.preview pins #mscroll), and reduced motion does not move at all.
// Whether this surface slides at all is the STYLESHEET's call, not a density
// check copied into JS: the preview card pins #mscroll because it grows out
// of its own card instead, and at desk widths the sheet IS the page and holds
// still. Both say so by zeroing the transition, so asking for it is the test.
const slides = () => getComputedStyle(mscroll).transitionDuration !== '0s';
function slideUp(){
  if(REDUCED || !slides()) return;
  mscroll.style.transition = 'none';
  mscroll.style.transform = 'translateY(100%)';
  void mscroll.offsetHeight;   // the reflow IS the fix: it gives the move a first frame
  mscroll.style.transition = '';
  mscroll.style.transform = '';
}
// ...and back down the way it came. Removing .open puts the modal straight
// back to display:none, so the class's own return to translateY(100%) never
// rendered either: the page VANISHED where it should have gone back down.
// The scroller carries the move and the state comes off at the end of it.
function slideDown(done){
  if(REDUCED || !slides()){ done(); return; }
  mscroll.style.transform = 'translateY(100%)';
  setTimeout(()=>{ mscroll.style.transform = ''; done(); }, SLIDE_MS);
}
// The sheet's FLIP out of a card and back into it. Only the preview card
// (a page opened from its fan) does this; a bottom sheet keeps its slide.
// The card's rect is the seat: the sheet starts there, scaled to it, and
// glides to its own place on the slide token; closing runs it backwards.
const sheetEl = $('#sheet');
// AN ITEM OPENS AND CLOSES ON ZOOM RECTS, like the collection it came out of
// (BIBLE.md section 9). The outlines march from the card to the page and the
// page is simply THERE when they land; closing runs them backwards.
//
// This replaced a scale: the sheet used to start at the card's rect and grow
// to its own in eight frames. That was correct and nearly invisible, because
// a ground-coloured card scaling up on the ground has almost nothing to see. The
// outlines have two inks and read on any backdrop, which is the whole reason
// the era drew them.
function growFrom(rect){
  sheetEl.style.transition = 'none';
  sheetEl.style.transform = '';
  sheetEl.style.transformOrigin = '0 0';
  if(!rect || REDUCED || !$('#modal').classList.contains('preview') && !$('#modal').classList.contains('fullpage')) return;
  const to = sheetEl.getBoundingClientRect();
  if(!to.width || !to.height) return;
  // THE PAGE ITSELF TRAVELS, and the outline rides with it on the same path,
  // the same length and the same eight frames. Outline alone was the bug: a
  // marquee scooting over a hidden target is a freeze and a teleport with a
  // decoration on it, because nothing that matters is moving. The page moving
  // alone was the earlier bug: a ground-coloured card scaling on the ground, invisible. Together
  // the content carries the motion and the two inks carry the legibility.
  sheetEl.style.transform = `translate(${rect.x - to.x}px, ${rect.y - to.y}px) scale(${rect.width / to.width}, ${rect.height / to.height})`;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    sheetEl.style.transition = 'transform var(--cv-dur-slide) var(--cv-ease-frames)';
    sheetEl.style.transform = '';
  }));
  zoomRects(rect, to);
}
function shrinkTo(rect, done){
  if(!rect || REDUCED){ done(); return; }
  const from = sheetEl.getBoundingClientRect();
  if(!from.width || !from.height){ done(); return; }
  // and back the same way: the page travels home and the outline goes with it
  sheetEl.style.transformOrigin = '0 0';
  sheetEl.style.transition = 'transform var(--cv-dur-slide) var(--cv-ease-frames)';
  sheetEl.style.transform = `translate(${rect.x - from.x}px, ${rect.y - from.y}px) scale(${rect.width / from.width}, ${rect.height / from.height})`;
  zoomRects(from, rect);
  setTimeout(()=>{ sheetEl.style.transition = 'none'; sheetEl.style.transform = ''; done(); }, SLIDE_MS);
}

// Section doors paint their baked body instantly, then swap in the live
// sheet from /api/sheet (cached per session); a failed fetch keeps the bake.
async function paintSectionSheet(slug){
  try{
    if(!sheetCache[slug]){
      const res = await fetch('/api/sheet/'+slug);
      if(!res.ok) throw new Error('http '+res.status);
      sheetCache[slug] = await res.json();
    }
    const s = sheetCache[slug];
    if(curSheet !== slug) return;
    document.title = s.docTitle || document.title;
    $('#sheetInner').innerHTML = `<h1>${esc(s.title)}</h1>${metaMarkup(s, slug)}${s.body}`;
    $('#modal').setAttribute('aria-label', s.title);
  }catch{ /* the baked body stays current */ }
}
// A direct load arrives with the sheet SSR'd into the document: adopt it
// (chrome, focus, camera hold) without repainting, so nothing flashes and
// the server-rendered live content stays.
// A full page adopted from a direct load is the page a click opens: no
// search bar over it, its page bar at the top, and ONE way back.
function adoptSsrSheet(slug){
  curSheet = slug;
  announcePlace();
  setPreview(slug);
  const full = isFull(slug);
  $('#modal').classList.toggle('fullpage', full);
  document.documentElement.classList.toggle('fullpage-open', full);
  coverUnder(full);
  applyReader($('#modal'), isReading(slug));
  openChrome($('#modal').getAttribute('aria-label') || slug);
  // the server drew the bar over the list's order; the swipe walks the
  // canvas's ring, so the bar is repainted from that ring to agree with it
  // (the same markup either way: js/kit-scroll.js pageBarMarkup), and the
  // repaint is what wires it
  if(full) paintPageBar(slug);
  if(full) footTop();
  wirePageReader(slug);
  // and its SSR'd title answers the pointer like the one the canvas paints
  dustTitle($('#sheetInner > h1.ptitle'));
}
function paintSheet(slug){
  // the card the closing preview came out of, read before the layer forgets
  const m0 = $('#modal').classList;
  const wasPreview = (!slug && curSheet && (m0.contains('preview') || m0.contains('fullpage'))) ? fanShown.find(m => m.def.slug === curSheet) : null;
  curSheet = slug || null;
  announcePlace();
  shareView(fanNow());
  const p = slug && PAGES[slug];
  const fanT = curFan && stackTile(curFan);
  document.title = p ? (p.docTitle || `${p.title} · ${SITE_NAME}`) : fanT ? `${fanT.label} · ${SITE_NAME}` : curLand ? `${(nodes[curLand] && nodes[curLand].t.label) || curLand} · ${SITE_NAME}` : SITE_NAME;
  if(p){
    setPreview(slug);
    // sections paint their boot-baked body instantly (then /api/sheet
    // refreshes it live); entries open on the pixel loader and fill from
    // /api/page. The arriving body dithers in like every material change.
    $('#sheetInner').innerHTML=`<h1>${esc(p.title)}</h1>${metaMarkup(p, slug)}${p.embed
      ? LOADER
      : (p.body||'')}`;
    pixelHead(p);
    if(p.embed) mountEmbed(p, slug);
    if(SECTIONS[slug]) paintSectionSheet(slug);
    // a page opened from its card grows out of that card (picked up before
    // put down, BIBLE.md section 9): the seat it left is the fan's slot. A
    // full page does the same: it fills the frame instead of standing as a
    // card, but it is still the thing that card became.
    const full = isFull(slug);
    $('#modal').classList.toggle('fullpage', full);
    document.documentElement.classList.toggle('fullpage-open', full);
    coverUnder(full);
    reader?.stop(); reader = null;
    applyReader($('#modal'), isReading(slug));
    // the layer: a section (the feed) is a collection, anything else in
    // PAGES is an item, and the bar is not drawn over an item (#300)
    document.documentElement.classList.toggle('item-open', !SECTIONS[slug]);
    const card = fanShown.find(m => m.def.slug === slug);
    openChrome(p.title, card ? card.node.getBoundingClientRect() : null);
    paintPageBar(slug);
    // the body dithers in AFTER the chrome opens, never before: #modal is
    // display:none until then, and an animation on a box nobody is painting
    // runs out its length in the dark and clears itself. That is how a
    // section sheet came to arrive with no motion at all at desk widths,
    // where the sheet IS the page and has no slide of its own to ride.
  } else {
    reader?.stop(); reader = null;
    // A COURTESY, AT THE DOOR: a reader who walked the ring by its tabs is
    // put down at the card of the page they were reading, so the lane is
    // walked to that card now, under the page and at once, and the shrink
    // below measures the seat where it really is
    if(wasPreview) centreLaneOn(wasPreview.def.slug, true);
    // put down where it was picked up: a preview card shrinks back into its
    // seat on the fan before the layer lets go of it
    const seat = wasPreview && wasPreview.node.isConnected ? wasPreview.node.getBoundingClientRect() : null;
    // the full-page skin comes off with the rest of it, and only once the
    // page has finished travelling home: dropped early, the sheet would snap
    // back to card width halfway through the shrink
    const settle = ()=>{
      // a page opened again while this one travelled home (a follower taken
      // off a page and straight back onto it) keeps its skin: the close is
      // over, and this is not the page it was closing
      if(curSheet) return;
      $('#modal').classList.remove('open', 'preview', 'fullpage');
      applyReader($('#modal'), false);
      coverUnder(false);
      document.documentElement.classList.remove('fullpage-open', 'item-open');
      fanN.classList.remove('under');
    };
    if(seat) shrinkTo(seat, settle); else slideDown(settle);
    fanNav.hidden = true;
    syncClose();
    slideY = 0;
    setRecede(1);
    setSceneTransform();
    // the canvas wakes only when nothing is over it
    scene.inert = !!curFan;
    document.documentElement.classList.remove('sheet-open');
    if(curFan && fanMembers[curFan]?.[0]) fanMembers[curFan][0].focus({preventScroll: true});
    if(sheetReturnFocus){
      if(document.contains(sheetReturnFocus) && sheetReturnFocus.focus) sheetReturnFocus.focus({preventScroll:true});
      sheetReturnFocus = null;
    }
  }
}
$('#backdrop').addEventListener('click', closePage);
gapEl.addEventListener('click', closePage);
// and the scroller's own ground beside the sheet: a click that lands on
// nothing the sheet drew is a click outside the page, so it closes it
mscroll.addEventListener('click', e=>{ if(e.target === mscroll) closePage(); });
// links painted into the sheet (section lists, backlinks, prose) stay in
// the canvas: same-site paths route through openPage instead of a reload
$('#sheetInner').addEventListener('click', e=>{
  // open-in-new-tab gestures keep their meaning: real hrefs, real browser
  if(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a');
  if(!a) return;
  const href = a.getAttribute('href') || '';
  if(!href.startsWith('/')) return;
  const slug = slugForPath(href);
  if(slug){ e.preventDefault(); openPage(slug); }
});

// ---- menu ---------------------------------------------------------------------------
const closeBtn=$('#close');
// the universal button tells assistive tech the truth about both its state
// (aria-expanded tracks the menu) and its function (menu vs close)
// the close shows only while there is something to close: a sheet or a fan
function syncClose(){ closeBtn.hidden = !(modalOpen() || curFan); syncMapBtn(); }
closeBtn.addEventListener('click', e=>{ e.stopPropagation(); if(modalOpen() || curSheet) closePage(); else if(curFan) closeStack(); });

// ---- presence on every page, and following (issue #327) ------------------------
// A page is a column of blocks, and a block is the same block at every
// width, so a reader's place on it travels as the block's index and a
// fraction of its box (anchor.js). The blocks are the sheet's CONTENT: its
// headings, the meta line, every paragraph, figure, list, code block and
// frame the entry rendered, outermost only (a paragraph inside a figure is
// the figure's), in document order, which is the order on every screen.
// Wrappers (a section, a column) are not blocks: they are as tall as the
// page and would put every reader on one box.
const BLOCK = 'h1,h2,h3,h4,h5,h6,p,figure,pre,ul,ol,blockquote,table,video,canvas,iframe,.meta';
const sheetBlocks = () => [...$('#sheetInner').querySelectorAll(BLOCK)].filter(el => el.parentElement.closest(BLOCK) === null || !$('#sheetInner').contains(el.parentElement.closest(BLOCK)));
// the anchor under a pointer: the block it is in, straight off the event
// target, or the nearest one by the column when it is in a gutter
function anchorUnder(target, x, y){
  const blocks = sheetBlocks();
  let hit = target?.closest?.(BLOCK);
  while(hit && !blocks.includes(hit)) hit = hit.parentElement?.closest?.(BLOCK);
  const i = hit ? blocks.indexOf(hit) : -1;
  if(i >= 0){ const a = anchorOf([hit.getBoundingClientRect()], x, y); return a && { i, fx: a.fx, fy: a.fy }; }
  return anchorOf(blocks.map(b => b.getBoundingClientRect()), x, y);
}
// an anchor to a screen point on THIS screen's boxes, or null when the
// anchor is not on the open page (presence.js draws nothing for it)
function locateAt(at, fx, fy){
  const a = parseAt(at);
  if(!a || a.slug !== curSheet) return null;
  const b = sheetBlocks()[a.i]; if(!b) return null;
  const r = b.getBoundingClientRect();
  return r.width && r.height ? pointOf(r, fx, fy) : null;
}
// where this tab is, said on every sheet change so the room's who's-here
// list and a follower learn it without waiting for the pointer to move: a
// page opened lands at the top of its first block (which is where a reader
// starts), the canvas at the last point the pointer had there, or under the
// camera if it never had one.
function announcePlace(){
  if(curSheet){
    // a page needs no world: a direct load adopts its sheet before the
    // ground is sized, and the reader is on the page all the same
    lastAt = atOf(curSheet, 0);
    presence.post(0, 0, null, ptrDown, lastAt);
  } else {
    if(!(WORLD_W > 0 && WORLD_H > 0)) return;
    lastAt = null;
    const fx = lastFx >= 0 ? lastFx : (((camX + viewW()/2) % WORLD_W) + WORLD_W) % WORLD_W / WORLD_W;
    const fy = lastFy >= 0 ? lastFy : (((camY + viewH()/2) % WORLD_H) + WORLD_H) % WORLD_H / WORLD_H;
    presence.post(fx, fy, lastHk, ptrDown, null);
  }
  paintSels();
}

// SHARED HIGHLIGHTING. Words selected on a page are shown to everyone
// reading it, in the selector's hue: anchored on the text of the same blocks
// the pointer anchors on (anchor.js selOf, a block and a character count,
// which no reflow moves), painted with the Custom Highlight API so the page
// is never touched (highlight.js). A reader's own selection is the browser's
// own; only other readers' words are highlights. Nothing here scrolls: a
// follower sees a presenter's selection because following already keeps the
// presenter's hand, which is on those words, in view (driveFollow).
const highlights = createHighlights();
let peerSels = [];
function paintSels(){
  const blocks = curSheet ? sheetBlocks() : [];
  for(const { id, sel, color } of peerSels) highlights.paint(id, color, curSheet ? rangeOnPage(blocks, curSheet, sel) : null);
  for(const id of highlights.ids()) if(!peerSels.some(s => s.id === id)) highlights.clear(id);
}
presence.onSels(list => { peerSels = list; paintSels(); });
// the page's body lands after the sheet opens (a fetch, a mount, a retry),
// and a selection that arrived first is drawn once there are words to draw it
// on. Children of the sheet only: a live readout deep inside an experiment
// changing its digits is not a new page.
let selPaintQueued = false;
new MutationObserver(() => {
  if(selPaintQueued || !peerSels.length) return;
  selPaintQueued = true;
  requestAnimationFrame(() => { selPaintQueued = false; paintSels(); });
}).observe($('#sheetInner'), { childList: true });
// this reader's own selection goes out a beat after it stops changing, and
// presence.js sends it only if it differs from what the room holds
let selTimer = 0;
document.addEventListener('selectionchange', () => {
  clearTimeout(selTimer);
  selTimer = setTimeout(() => presence.select(ownSelection($('#sheetInner'), curSheet ? sheetBlocks() : [], curSheet)), 100);
});

// FOLLOWING. Take somebody's cursor (click it, or pick it from the list)
// and your view goes where theirs goes: the camera keeps their hand under
// the middle of the frame, a page they open opens here, their block is
// scrolled into the middle third, and the canvas comes back when they leave
// the page. The view is the follower's own (follow.js): nothing moves
// anybody else's. Who follows whom IS sent, so the room can draw the line
// (conga.js). Their zoom is not known and not copied; yours holds.
const followTag = document.createElement('div');
followTag.id = 'following';
followTag.hidden = true;
// On the kit (#336): a panel of two sections, the one who is followed and the
// x that lets go, set in the kit's face (the pixel face is for hero titles).
followTag.className = 'k-panel k-ground';
followTag.innerHTML = `<span class="k-sec"><span class="swatch" aria-hidden="true"></span><span class="k-lbl">following</span></span><button type="button" class="letgo k-btn k-ico" aria-label="stop following"><span aria-hidden="true">×</span></button>`;
document.body.appendChild(followTag);
// THE FRAME (author, 2026-09-26: "I like the figma frame for following,
// that sort of intuitive association"). While you follow somebody, your
// whole screen is framed in their colour, the way Figma frames the view of
// the person you are watching: a view that is not your own says so at its
// edges, wherever you look, not only in a corner. The tag wears the same
// colour, so the frame and its label read as one thing. It takes no
// pointer, so nothing under it stops answering.
const followFrame = document.createElement('div');
followFrame.id = 'followFrame';
followFrame.hidden = true;
followFrame.setAttribute('aria-hidden', 'true');
document.body.appendChild(followFrame);
// the head of the line a peer is in: up the chain of whom each follows,
// null if it comes back round to this tab (follow.js, one queue per line)
function lineHead(who){
  const by = new Map(presence.roster().map(q => [q.id, q]));
  const me = presence.selfId();
  const seen = new Set();
  let cur = who;
  while(by.get(cur)?.f && by.has(by.get(cur).f)){
    if(seen.has(cur)) return cur; // a loop that does not reach this tab: take where it closes
    seen.add(cur);
    cur = by.get(cur).f;
    if(cur === me) return null;
  }
  return cur === me ? null : cur;
}
const follow = createFollow(id => {
  // the room is told whom this tab follows, so it can draw the line
  presence.follow(id);
  if(sessState === 'joined') paintSession();
  followTag.hidden = id == null;
  followFrame.hidden = id == null;
  if(id != null){
    const q = presence.roster().find(p => p.id === id);
    followTag.querySelector('.swatch').style.background = q ? q.color : '';
    document.documentElement.style.setProperty('--follow-hue', q ? q.color : 'var(--cv-ink)');
  } else document.documentElement.style.removeProperty('--follow-hue');
  document.documentElement.classList.toggle('following', id != null);
}, lineHead);
// the x lets go; in a follow room, where following the host is the whole
// of being there, letting go is leaving the room (leaveRoom, below)
followTag.querySelector('.letgo').addEventListener('click', e => { e.stopPropagation(); if(follow.held) leaveRoom(); else follow.release(); });
followTag.addEventListener('pointerdown', e => e.stopPropagation());
// WHERE THE HAND WAS (2026-09-26): a click-follow ends when the follower's
// own hand walks off (follow.js FOLLOW_SLACK), measured from where it was
// when the follow began, so every pick says where the hand is now
let ownPtr = null;
addEventListener('pointermove', e => { ownPtr = { x: e.clientX, y: e.clientY }; follow.pointer(e.clientX, e.clientY); }, { capture: true, passive: true });
function pickPeer(id){
  const took = follow.pick(id);
  if(took && ownPtr) follow.pointer(ownPtr.x, ownPtr.y);
  return took;
}
// a click on a cursor is the pick; the peer leaving is the end of it
presence.onPick(id => { closeWho(); pickPeer(id); });
presence.onPeers(list => {
  // somebody follows this tab: what it plays is theirs to hear, so the page
  // scripts tell it (the bridge below) the way they do in a session
  const me = presence.selfId();
  if(me != null && list.some(p => p.f === me)) document.documentElement.dataset.followed = '';
  else delete document.documentElement.dataset.followed;
  if(follow.id != null && !list.some(p => p.id === follow.id)) follow.left(follow.id);
  // the one followed picked somebody: this tab moves up to that line's head
  else follow.reattach();
  if(!whoEl.hidden) paintWho(list);
});
// a finger on the page is the reader's own scroll
mscroll.addEventListener('touchmove', () => follow.input(), {passive: true});
let followOpening = 0;
function driveFollow(){
  const id = follow.id; if(id == null) return;
  const q = presence.peerAt(id); if(!q) return; // no position yet: wait
  const a = parseAt(q.at);
  if(a){
    if(!PAGES[a.slug]) return; // a page this tab cannot open: stay put
    if(curSheet !== a.slug){
      // once per page, not once per frame: the open takes a beat to land
      if(followOpening !== a.slug){ followOpening = a.slug; openPage(a.slug); }
      return;
    }
    followOpening = 0;
    const pt = locateAt(q.at, q.fx, q.fy); if(!pt) return;
    // their block into the middle third of the free frame, stepped
    const free = VH - bandH();
    if(pt.y < free/3 || pt.y > free*2/3) mscroll.scrollTop += Math.round((pt.y - free/2) * 0.2);
  } else {
    followOpening = 0;
    if(curSheet || modalOpen()){ closePage(); return; }
    // a fan the one followed spread is held open (view-sync.js holdsFan),
    // and their hand is on it: the camera stays where the fan is
    if(curFan){ closeStack(); if(curFan) return; }
    // their hand under the middle of the free frame, the nearest copy across
    // the seam, eased the way the camera eases home
    const tx = q.fx * WORLD_W - viewW()/2, ty = q.fy * WORLD_H - (viewH() - bandH()/Z)/2;
    const dx = nearestWrap(tx, camX, WORLD_W) - camX, dy = nearestWrap(ty, camY, WORLD_H) - camY;
    if(Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    homeTween = null; vx = vy = 0;
    camX += dx * 0.15; camY += dy * 0.15;
    renderDirty = true; save();
  }
}

// WHO'S HERE: the room as a list, one row a peer in their own hue and where
// they are (the ground, or the page they are reading). A row is a pick.
// Reached from the tally on the ground and from /who, so a reader on a page
// has a way to it too.
const whoEl = document.createElement('div');
whoEl.id = 'who';
whoEl.className = 'k-panel k-ground';
whoEl.hidden = true;
whoEl.setAttribute('role', 'dialog');
whoEl.setAttribute('aria-label', "who's here");
document.body.appendChild(whoEl);
whoEl.addEventListener('pointerdown', e => e.stopPropagation());
const whereOf = at => {
  const a = parseAt(at);
  if(!a) return 'on the ground';
  const p = PAGES[a.slug];
  return a.slug === curSheet ? 'here' : `reading ${p ? p.title : a.slug}`;
};
function paintWho(list){
  const rows = list.map(q => `<button type="button" class="peer k-btn${follow.id === q.id ? ' is-on' : ''}" data-id="${q.id}"><span class="swatch" style="background:${q.color}" aria-hidden="true"></span><span class="k-lbl">${esc(whereOf(q.at))}${q.host ? ' (host)' : ''}</span></button>`);
  whoEl.innerHTML = `<div class="head k-meta k-rb">${list.length ? `${list.length} here` : 'nobody else here'}</div>` + rows.join('');
}
function openWho(){ paintWho(presence.roster()); whoEl.hidden = false; }
function closeWho(){ whoEl.hidden = true; }
whoEl.addEventListener('click', e => {
  const b = e.target.closest('.peer'); if(!b) return;
  pickPeer(Number(b.dataset.id));
  closeWho();
});
etchedN.querySelector('.others').addEventListener('click', e => { e.stopPropagation(); if(whoEl.hidden) openWho(); else closeWho(); });

// ---- rooms of the owner's own: follow and session (2026-09-25) --------------
// THREE MODES, each a superset of the one before (BIBLE.md section 2):
//   the public room   everybody, always: the hands, the light things shared
//                     (the bug, the piles, the dish), and anybody may
//                     click-follow anybody (FOLLOWING, above), a one to many
//                     sync that ends when the follower walks off
//   `?follow`         a room of the owner's own where every guest follows
//                     him on arrival and stays following: what he opens
//                     opens for them, what he plays plays for them, and what
//                     they play goes nowhere (presence-room.js act)
//   `?session`        many to many, for jams, demos and games: everyone can
//                     do everything, every act goes to all, and a peer who
//                     goes somewhere offers the rest the way (the went tag)
// Only the owner opens one (a bare flag is a new room, `=<word>` a room
// with that name); anybody with the code joins it, behind a PIN when it has
// one (presence.js goRoom, routes/presence.js). The page scripts speak
// through the window events below and know nothing of sockets.
//
// THE FLAG IS THE ROOM. The room a tab is in lives in its address and
// nowhere else: it stays there while the tab is in the room, rides every
// navigation (roomed, near the top), and becomes `?<kind>=<code>` once the
// room has answered, in the room's own kind. Deleting it is leaving, on a
// load or on a step through the history. A PIN is read once and taken off
// the address, so the bar never shows it to somebody looking over a
// shoulder. A refusal takes the flag off too and leaves the tab public.
function initialRoom(){
  const room = roomFromUrl(location.search);
  const addr = withRoom(location.search, room);
  if(addr !== location.search){
    try{ history.replaceState(history.state, '', location.pathname + addr + location.hash); }catch{ /* a throttled history keeps the old address */ }
  }
  return room;
}
// the address made to say `room` (null: the public room), in place
function writeRoom(room){
  roomFlag = room && { kind: room.kind, code: room.code };
  const addr = withRoom(location.search, roomFlag);
  if(addr === location.search) return;
  try{ history.replaceState(history.state, '', location.pathname + addr + location.hash); }catch{ /* a throttled history keeps the old address */ }
}
// leaving: the flag comes off, the follow and its hold go, the tab is public
function leaveRoom(){
  writeRoom(null);
  follow.hold(false);
  follow.release();
  hideWent();
  presence.goRoom(null);
  showSession('public');
}

// THE PANEL: the room's own tag, where the following tag lives (top left),
// the following tag stepping down under it while both are up. The owner's
// shows the code, the PIN and a way to hand the link over, and ends it; a
// guest's says which room it is in and leaves it. A kit panel, like the
// following tag, since it is the same kind of thing: a fact about the view
// and the x that ends it.
const sessEl = document.createElement('div');
sessEl.id = 'session';
sessEl.className = 'k-panel k-ground';
sessEl.hidden = true;
sessEl.setAttribute('role', 'status');
document.body.appendChild(sessEl);
sessEl.addEventListener('pointerdown', e => e.stopPropagation());
let sessState = 'public';
let flashT = 0;
function paintSession(){
  const s = presence.sessionNow();
  const kind = s ? s.kind : (roomFlag ? roomFlag.kind : 'session');
  if(s) document.documentElement.dataset.session = s.kind;
  else delete document.documentElement.dataset.session;
  if(sessState === 'joined' && s){
    const host = s.host;
    const pin = host && s.pin ? `<span class="k-sec"><span class="k-meta">pin</span><span class="k-lbl code">${esc(s.pin)}</span></span>` : '';
    const own = host
      ? `<button type="button" class="copy k-btn">copy link</button><button type="button" class="end k-btn">end</button>`
      : `<button type="button" class="leave k-btn k-ico" aria-label="leave the ${kind}"><span aria-hidden="true">×</span></button>`;
    sessEl.innerHTML = `<span class="k-sec"><span class="k-lbl">${kind}</span><span class="k-lbl code">${esc(s.code)}</span></span>${pin}${own}`;
  } else if(sessState === 'pin'){
    sessEl.innerHTML = `<form class="k-sec pinform"><label class="k-lbl" for="sessPin">pin</label><span class="k-field k-sm"><input id="sessPin" inputmode="numeric" autocomplete="off" maxlength="12" pattern="[0-9]*" aria-label="session pin"><span class="k-caret"></span></span><button type="submit" class="k-btn">join</button></form><button type="button" class="leave k-btn k-ico" aria-label="never mind"><span aria-hidden="true">×</span></button>`;
    setTimeout(() => $('#sessPin')?.focus(), 0);
  } else if(sessState === 'locked'){
    sessEl.innerHTML = `<span class="k-sec"><span class="k-lbl">too many tries, later</span></span><button type="button" class="shut k-btn k-ico" aria-label="close"><span aria-hidden="true">×</span></button>`;
  } else if(sessState === 'ended' || sessState === 'refused'){
    sessEl.innerHTML = `<span class="k-sec"><span class="k-lbl">${sessState === 'ended' ? `${kind} over` : 'only the owner opens one'}</span></span>`;
  }
  document.documentElement.classList.toggle('in-session', !sessEl.hidden);
}
function showSession(state){
  sessState = state;
  clearTimeout(flashT);
  sessEl.hidden = state === 'public';
  // the room's last word stays up long enough to read, then the tag goes
  if(state === 'ended' || state === 'refused') flashT = setTimeout(() => { sessEl.hidden = true; paintSession(); }, 4000);
  paintSession();
}
// the one this room is about: its host (the owner's tab), or null
const hostId = () => (presence.roster().find(p => p.host) || {}).id ?? null;
// A FOLLOW ROOM'S GUEST follows the host on arrival and stays following
// (follow.js held): their own input does not let go, and a host who drops
// out (a reload, a closed lid) is picked again the moment they are back
function followHost(){
  const s = presence.sessionNow();
  if(!s || s.kind !== 'follow' || s.host || follow.id != null) return;
  const h = hostId();
  if(h != null) pickPeer(h);
}
presence.onSession((state, s) => {
  // the room's own word for itself goes on the address: a guest's
  // `?session=x` that is really a follow room reads `?follow=x`
  if(state === 'joined' && s){ writeRoom({ kind: s.kind, code: s.code }); follow.hold(s.kind === 'follow' && !s.host); }
  // every refusal but a PIN (which waits for one) is the end of the flag;
  // a PIN refused too often leaves the tab in no room, so it goes public
  if(state === 'ended' || state === 'refused' || state === 'locked'){
    writeRoom(null);
    follow.hold(false);
    if(follow.id != null) follow.release();
    hideWent();
    if(state === 'locked') presence.goRoom(null);
  }
  placeSeen.clear();
  showSession(state);
  if(state === 'joined') followHost();
});
sessEl.addEventListener('submit', e => {
  e.preventDefault();
  const v = ($('#sessPin')?.value || '').trim();
  if(!/^[0-9]{4,12}$/.test(v)) return;
  if(roomFlag && roomFlag.code !== 'new') presence.goRoom({ ...roomFlag, pin: v });
});
sessEl.addEventListener('click', async e => {
  e.stopPropagation();
  const s = presence.sessionNow();
  if(e.target.closest('.leave')){ leaveRoom(); return; }
  // the locked word's x: the tab is already public, only the tag goes
  if(e.target.closest('.shut')){ showSession('public'); return; }
  const copy = e.target.closest('.copy');
  if(copy && s){
    const link = `${location.origin}${location.pathname}${withRoom('', { kind: s.kind, code: s.code })}`;
    try{ await navigator.clipboard.writeText(link); copy.textContent = 'copied'; }
    catch{ copy.textContent = link; }
    setTimeout(() => { if(copy.isConnected) copy.textContent = 'copy link'; }, 2000);
    return;
  }
  // destructive, so it arms on the first tap and acts on the second
  const end = e.target.closest('.end');
  if(end && s){
    if(!end.classList.contains('armed')){ end.classList.add('armed'); end.textContent = 'end it?'; setTimeout(() => { if(end.isConnected){ end.classList.remove('armed'); end.textContent = 'end'; } }, 3000); return; }
    try{ await fetch(`/api/admin/rooms/${encodeURIComponent(s.code)}`, { method: 'DELETE' }); }catch{ /* the room stays; the tag says so */ }
  }
});
// THE HISTORY IS THE ADDRESS TOO. A step back or forward onto an entry with
// no flag is leaving, the same as deleting it. A step never JOINS a room:
// an entry that still carries a flag the tab has since left (or a bare one
// written before the room had a name) is made to say what is true now,
// since closing a page after leaving is a step back onto the entry the
// page was opened from, and that is not a wish to go back in.
addEventListener('popstate', () => {
  if(roomFlag && !roomFromUrl(location.search)){ leaveRoom(); return; }
  writeRoom(roomFlag);
});

// WENT (a session only). A peer who goes somewhere (opens a page, comes back
// to the ground) offers the others the way: a tag with their hue, where they
// went, [go] and an x. Nothing moves on its own: [go] opens it here and
// follows nobody, the x or Escape puts it away, and it goes by itself after
// WENT_MS. One at a time, the newest. Not to a tab already there, nor to one
// following that peer (it is on its way already), nor in a follow room,
// where everybody goes where the host goes anyway.
const WENT_MS = 12000;
const wentEl = document.createElement('div');
wentEl.id = 'went';
wentEl.className = 'k-panel k-ground';
wentEl.hidden = true;
wentEl.setAttribute('role', 'status');
document.body.appendChild(wentEl);
wentEl.addEventListener('pointerdown', e => e.stopPropagation());
let wentTo = null;
let wentT = 0;
function hideWent(){ clearTimeout(wentT); wentTo = null; wentEl.hidden = true; }
function showWent(color, slug){
  wentTo = { slug };
  const where = slug ? (PAGES[slug]?.title || slug) : 'the canvas';
  wentEl.innerHTML = `<span class="k-sec"><span class="swatch" aria-hidden="true"></span><span class="k-lbl">went to ${esc(where)}</span></span><button type="button" class="go k-btn">go</button><button type="button" class="shoo k-btn k-ico" aria-label="stay here"><span aria-hidden="true">×</span></button>`;
  wentEl.querySelector('.swatch').style.background = color || '';
  wentEl.hidden = false;
  clearTimeout(wentT);
  wentT = setTimeout(hideWent, WENT_MS);
}
wentEl.addEventListener('click', e => {
  e.stopPropagation();
  if(e.target.closest('.shoo')){ hideWent(); return; }
  if(!e.target.closest('.go') || !wentTo) return;
  const { slug } = wentTo;
  hideWent();
  if(slug){ openPage(slug); return; }
  if(curSheet || modalOpen()) closePage();
  if(curFan) closeStack();
});
// where each peer was at the last roster, so a change of place is seen
// once: '' is the ground, a slug a page. A peer seen for the first time has
// arrived, not gone anywhere.
const placeSeen = new Map();
presence.onPeers(list => {
  const s = presence.sessionNow();
  const offer = s && s.kind === 'session';
  for(const q of list){
    const place = parseAt(q.at)?.slug || '';
    const was = placeSeen.get(q.id);
    placeSeen.set(q.id, place);
    if(!offer || was === undefined || was === place) continue;
    if(place === (curSheet || '') || follow.id === q.id) continue;
    if(place && !PAGES[place]) continue; // a page this tab cannot open
    showWent(q.color, place);
  }
  for(const id of [...placeSeen.keys()]) if(!list.some(q => q.id === id)) placeSeen.delete(id);
  followHost();
  if(!sessEl.hidden && sessState === 'joined') paintSession();
});

// THE PAGE BRIDGE. A page script says what it did with `canvas:act` and hears
// the session's (or the one it follows) with `canvas:peer-act`, and never
// touches the socket: outside a session, with nobody following, its acts go
// nowhere and cost nothing (presence.js act). A page script asks the root
// before it builds one: `data-session` or `data-followed`.
addEventListener('canvas:act', e => {
  const d = e.detail;
  if(d && typeof d.ch === 'string' && d.d && typeof d.d === 'object') presence.act(d.ch, d.d);
});
presence.onAct((ch, d, id, color) => {
  dispatchEvent(new CustomEvent('canvas:peer-act', { detail: { ch, d, id, color } }));
});

// ---- omni search: everything on the canvas and every page --------------------
const searchEl = $('#search'), searchWrap = $('#searchWrap'), topbarEl = $('#topbar');
// the bar's caret, and the room pin's, at the insertion point (js/kit-caret.js)
wireCarets();
// The lens has no bar to live on at the watch density (layout.js
// chromeDensity: under 352px wide or 240px tall there is no chrome at all),
// and no keyboard to type into it either. Opening it there would focus a
// display:none field, which does nothing but scroll-anchor the page, so the
// one place the site still asks "which screen is this" refuses instead.
const noChrome = () => chromeDensity(VW, VH) === 'watch';
function openSearch(){
  if(slotShared(mapDensity)) showMap(false); // a phone's slot turns back to the field
  if(noChrome()) return;
  searchEl.focus();
}
function closeSearch(){
  topbarEl.classList.remove('searching'); searchWrap.classList.remove('open');
  addressSearch();
}
// THE FINDER IN THE ADDRESS (BIBLE.md section 8, canvas/finder-url.js): the
// bar's state is `?search=` in the URL, so a find can be sent and opens for
// the one it was sent to. The bar is open while the field has the focus or
// holds a query: `?search=` open and empty, `?search=<query>` holding one,
// no param shut. It REPLACES the entry, never pushes one: a query typed out
// letter by letter is one place in the history, not twenty. Written a beat
// after the last change rather than on every key (a browser counts these
// calls, and typing is many). A command line (the slash roster, the
// unlisted doors) is not a find and never reaches the address.
let searchT = 0;
function addressSearch(){
  clearTimeout(searchT);
  searchT = setTimeout(() => {
    const v = searchEl.value;
    const open = document.activeElement === searchEl || v !== '';
    const q = !open ? null : v.startsWith('/') ? '' : v;
    const next = withSearch(location.search, q);
    if(next === location.search) return;
    try{ history.replaceState(history.state, '', location.pathname + next + location.hash); }catch{ /* a throttled history keeps the old address */ }
  }, 250);
}
// a URL that carries the bar opens it: the query goes into the field and the
// find runs, flying where it would have flown. Not over a page loaded on its
// own path, because a find closes the page, and the page is what was sent.
function searchFromAddress(pageUp){
  const q = searchFromUrl(location.search);
  if(q == null || noChrome()) return;
  searchEl.value = q;
  openSearch();
  if(q && !q.startsWith('/') && !pageUp) runFind(q);
}
// the history moving under the bar (back, forward) lands on an entry that
// may not know it: the bar is what is true, so the address follows it
addEventListener('popstate', addressSearch);
function flyTo(id, then){ flyToBox(nodes[id], then); }
// the same landing, given a BOX rather than a tile id: the dock is furniture
// with no node of its own, and /contact has to be able to aim at it
function flyToBox(o, then){
  if(!o) return;
  // Arriving FRAMES the thing (2026-09-15). It used to land at true scale
  // flat, which delivered the about zone (two slots wide) hanging off both
  // edges of the screen with its halo somewhere past them: the finder had
  // found something you could not see. Now the camera holds a slot of it,
  // pulling back when true scale will not fit and keeping a deeper hand
  // where it still does. The aim carries the chrome band's half so the
  // thing is centred in the FREE frame, not under the bar.
  const z = frameZoom(o.w, o.h, Math.max(Z, 1));
  const aim = landAim(o, z);
  flightTo(aimX(aim.x), aimY(aim.y), z, then);
}
// Keyboard focus discipline: tiles wrap toroidally, so a tile Tab lands on
// may currently be off-screen entirely, and an off-camera tile is
// display:none. Without this, Tab walks the keyboard into things nobody can
// see. So the camera follows focus, but ONLY when it has to (2026-09-16):
// a tile already in the frame is flown to by nobody, because there is
// nothing to go and look at. It used to fly on every focus, which meant the
// world lurched under a keyboard user reading down a row of tiles they could
// already see, and lurched again on the way back.
// "In the frame" is the FOCUSED THING, whole, above the bar's band. It was
// any corner of its tile, so a pile cut by the frame's foot took the focus
// (and its scrollbar's three stops after it) under the bar or off the screen
// and the camera never moved (2026-09-27: eight stops on /, four on /about).
const inFrame = el => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= VW && r.bottom <= VH - bandH();
};
// the focused thing's box in world px: its tile's seat, plus where it sits in
// the tile at the scale the tile is drawn
function boxIn(el, o){
  const r = el.getBoundingClientRect(), t = o.n.getBoundingClientRect(), k = t.width / o.w;
  if(!k) return o;
  return { wx: o.wx + (r.left - t.left) / k, wy: o.wy + (r.top - t.top) / k, w: r.width / k, h: r.height / k };
}
addEventListener('focusin', e=>{
  if(modalOpen() || !e.target.matches?.(':focus-visible')) return;
  const tileEl = e.target.closest('.el');
  if(!tileEl || inFrame(e.target)) return;
  for(const id in nodes) if(nodes[id].n === tileEl){
    // a landing frames a tile of a slot or less whole (frameZoom), so that is
    // flown to; anything larger (the about zone, the statement) is flown to
    // where the focus is in it
    const o = nodes[id];
    flyToBox(o.w <= BENTO.unit && o.h <= BENTO.unit ? o : boxIn(e.target, o));
    break;
  }
});
// ---- A PRESS ACTS. THAT IS ALL IT DOES (2026-09-16) -------------------------
// Two camera moves used to hang off the mouse and both are gone.
//
// The APPROACH: below a derived zoom (8/13, where the smallest type sinks
// under the grid) the canvas was held to be a survey rather than a surface,
// so a click on a tile flew the camera to it instead of opening it, on the
// theory that you cannot mean "open" a thing you cannot read. Map semantics:
// survey, dive, act. The theory was sound and the experience was not, for a
// reason arithmetic could have caught: the home camera sits at 0.5 on a
// laptop and the gate was 0.615, so at the framing every visitor arrives in,
// EVERY click on EVERY tile was an approach. The considered-press rule had
// made the whole world un-openable by default, and the site read as one that
// would not let you in.
//
// The DOUBLE-PRESS zoom on bare ground (the mouse's answer to a pinch) went
// with it. On a canvas you pan by dragging, a double click is something you
// do by accident while grabbing, and being thrown a zoom step for it is a
// move you did not ask for and then have to undo.
//
// Nothing is lost that the visitor cannot still do deliberately: the wheel
// zooms, the finder flies, a zone's path lands the camera on it, and the map
// takes a press. Every one of those is something asked for. A press on a
// tile now means the one thing a press means.
// ---- the search is a LENS, not a menu: typing filters the CANVAS itself.
// Non-matching tiles vanish (and dither back when released) and the camera
// glides to hold the group that remains: no dropdown, no result text, the
// world simply shrinks to what you asked for. Matching rides the same
// haystacks the old list used (labels, live data, hosts), substring first,
// fuzzy subsequence as the net, so "wthr" still finds the weather.
function buildIndex(){
  const ix = [];
  for(const t of LIVE_TILES){
    let label = t.label || '', extra = '';
    const pg = t.slug && PAGES[t.slug];
    if(pg) extra = pg.title + ' ' + (pg.meta || '');
    if(t.type==='zone'){
      const z = ZONES[t.id];
      label = t.label;
      extra = (z ? z.html.replace(/<[^>]+>/g, ' ') : '');
    }
    else if(t.type==='stack'){
      label = t.label;
      extra = t.count + ' ' + membersOf(t).map(m => m.label || '').join(' ');
    }
    else if(t.type==='article' && t.ext){ extra='article external '+t.ext; }
    else if(t.type==='icon'){ const sc=SOCIALS[t.s]; extra='social profile '+t.s+' '+(sc.url||''); }
    else if(t.type==='weather'){ extra='weather '+WEATHER.place+' '+WEATHER.cond; }
    else if(t.type==='bug'){ extra='ladybug bug beetle'; }
    else if(t.type==='slime'){ extra='slime simulation mould physarum petri dish alive feed'; }
    // the finder says a thing's name the way the ground does (#339): the
    // label as set, one line; matching stays in lower case
    label = label.replace(/\n/g, ' ');
    // tags ride the haystack: the compass areas are searchable words, so
    // "music" gathers the whole west (dual citizens included) and its mark
    ix.push({ id: t.id, name: label, label: label.toLowerCase(),
      hay: (label+' '+t.type+' '+(t.tags||[]).join(' ')+' '+extra).toLowerCase() });
  }
  // the hero answers to its author
  ix.push({ id: 'hero', label: 'hero', hay: `hero statement ${SITE_NAME}`.toLowerCase() });
  return ix;
}
let INDEX = null;
// fuzzy, anchored: the query's characters appear in order, starting where
// some WORD starts. The bare subsequence this replaces was a net with no
// knots: "slime" landed on "sCraping tHreE yearS ... recordS" once labels
// grew long enough, and a binary lens cannot bury noise the way the old
// ranked list could. "wthr" still finds the weather.
function fuzzy(hay, q){
  for(let w = 0; w < hay.length; w++){
    if(w > 0 && hay[w-1] !== ' ') continue;
    if(hay[w] !== q[0]) continue;
    let i = 1;
    for(let k = w + 1; k < hay.length && i < q.length; k++) if(hay[k] === q[i]) i++;
    if(i === q.length) return true;
  }
  return false;
}
// ---- THE FINDER (BIBLE.md section 8, 2026-09-11) ------------------------------
// Typing finds WHERE things are and takes you there: the top result under
// the camera at true scale, lit by an aura, and the arrows walk the rest.
// A result on the ground (a tile, a pile, a section) is flown to and lit; a
// result inside a collection opens the collection and lights the card, with
// the camera on its pile behind. Enter is the thing's own click. Nothing on
// the ground is hidden, nothing is re-menued, and the camera never comes
// back on its own: you are dropped where the thing is, and that is the
// point. Escape lets the query go and leaves you there.
const FIND_SKIP = new Set(['hero', 'etched', 'stamp']);
let found = [], foundAt = -1, fanByFinder = false, findSeq = 0;
const foundEl = $('#found');
function findAll(q){
  q = q.trim().toLowerCase();
  if(!q) return [];
  INDEX = INDEX || buildIndex();
  // the rank: the name itself, then a name that starts so, then a word
  // anywhere in what the thing says, then a fuzzy name. Ties by name.
  const score = (label, hay) => label === q ? 0 : label.startsWith(q) ? 1 : hay.includes(q) ? 2 : (q.length > 1 && fuzzy(label, q)) ? 3 : -1;
  const out = [];
  for(const e of INDEX){
    const t = tileOf(e.id); if(!t || FIND_SKIP.has(t.type) || !nodes[e.id]) continue;
    const s = score(e.label, e.hay);
    if(s >= 0) out.push({ s, kind: 'tile', id: e.id, name: e.name || e.label || e.id });
  }
  for(const m of allMembers()){
    const s = score(memberName(m.def), memberHay(m.def));
    if(s >= 0) out.push({ s, kind: 'member', stack: m.stack, def: m.def, node: m.node, name: memberName(m.def) });
  }
  return out.sort((a, b) => a.s - b.s || a.name.localeCompare(b.name));
}
// the line is also the cycler (2026-09-12): a phone has no arrow keys, so
// two steppers flank the count when there is more than one find. They
// take the pointer without taking the keyboard's focus from the field.
// The kit's dock (#336): the steppers are its icon buttons wearing its
// chevrons (js/kit-scroll.js), the line between them is the type face.
function sayFound(){
  if(!foundEl) return;
  const r = found[foundAt];
  foundEl.hidden = !r;
  if(!r) return;
  const many = found.length > 1;
  foundEl.innerHTML = (many ? `<button type="button" class="k-btn k-ico fstep prev" aria-label="previous result">${LEFT_GLYPH}</button>` : '')
    + `<span class="fsay k-meta">${esc(`${foundAt + 1} of ${found.length}  ${r.name}`)}</span>`
    + (many ? `<button type="button" class="k-btn k-ico fstep next" aria-label="next result">${RIGHT_GLYPH}</button>` : '');
}
if(foundEl){
  foundEl.addEventListener('pointerdown', e=>{ if(e.target.closest('.fstep')) e.preventDefault(); });
  foundEl.addEventListener('click', e=>{
    const b = e.target.closest('.fstep');
    if(!b || !found.length) return;
    focusFound(foundAt + (b.classList.contains('prev') ? -1 : 1));
  });
}
function focusFound(i){
  if(!found.length){ clearAura(); sayFound(); return; }
  foundAt = ((i % found.length) + found.length) % found.length;
  const r = found[foundAt];
  const seq = ++findSeq; // a newer focus cancels whatever this one was waiting on
  if(modalOpen()) closePage();
  if(r.kind === 'tile'){
    if(curFan){ hideFan(true); fanByFinder = false; }
    flyTo(r.id);
    aura(nodes[r.id].n);
  } else {
    // the collection opens once the camera is ON its pile, not before: the
    // flight is the finding, and the layer is what you find there. A hand
    // that tabs on before it lands cancels the open (findSeq moved on).
    const open = () => {
      if(seq !== findSeq) return;
      if(curFan !== r.stack){ if(curFan) hideFan(false); showFan(r.stack, true, true); fanByFinder = true; }
      aura(r.node);
    };
    if(curFan === r.stack) open();
    else { clearAura(); if(curFan){ hideFan(true); fanByFinder = false; } aura(nodes[r.stack].n); flyTo(r.stack, open); }
  }
  sayFound();
}
function runFind(q){
  found = findAll(q);
  if(!found.length){
    foundAt = -1; clearAura(); sayFound();
    if(fanByFinder && curFan){ hideFan(true); fanByFinder = false; }
    return;
  }
  focusFound(0);
}
// Enter is the thing's own click: a page opens, a link leaves, a pile fans,
// a section is already under you
function goFound(){
  const r = found[foundAt]; if(!r) return;
  clearAura();
  if(r.kind === 'tile') nodes[r.id].n.click(); else r.node.click();
}
// THE SELECTION MARK (BIBLE.md section 9, #336): what the finder lit. The
// kit's .k-sel, set inside the thing's own box so it goes wherever the
// node goes and scales with the camera like every other line on the ground:
// a one-cell ink outline a cell off the box, a solid handle on each corner.
// It used to be a frame painted in ochre "gold" on a canvas, lit from the
// north-west: an old accent standing in for a selection, and a glow. A pick
// is ink, the way every other chosen thing on the site is ink, and it is
// on or off in one step. The name stays `aura` in the code: the finder and
// the fan call it by that name.
// (the box is the node's own, never measured off the page)
let auraEl = null;
function clearAura(){ if(auraEl){ auraEl.remove(); auraEl = null; } }
function aura(node){
  clearAura();
  if(!node) return;
  const m = document.createElement('span');
  m.className = 'k-sel aura';
  m.setAttribute('aria-hidden', 'true');
  node.appendChild(m); auraEl = m;
}
// ---- quick commands: "/" pops the roster back up (the one place the bar
// still talks), and typing past the slash filters it down, the names that
// start so first. Everything else stays the lens.
//
// THE BAR IS A COMMAND LINE (2026-09-26). The author: "slash based", "do
// add params and flags". What a command is, the grammar a line is read
// with and who is shown what all live in canvas/commands.js, pure and
// tested; this is only what each one DOES. A runner gets the parsed line
// ({ args, flags }) and answers one of three ways: nothing, when it has
// gone somewhere (the bar clears and lets go, the way a picked command
// always has); `{ say }`, one line in the roster's seat (an error, a
// hook's answer), with the field kept so the line can be fixed; or
// `{ rows }`, a list in the roster (/help, /rooms) whose rows are picked
// like any other. A promise of either is waited for.
const cmdsEl = $('#cmds');
// THE OWNER'S BAR. The page cannot see the session (its cookie is
// HttpOnly), so the server sets a readable hint beside it that carries no
// authority (routes/auth.js). Only a page holding the hint asks
// /api/whoami, once, and only the answer turns the owner's commands on and
// draws the field's box in brick (canvas-home.css #searchField.is-owner):
// the bar keeps its size and its place, and a guest never makes the
// request at all. A hint the server does not back up is wiped here, so a
// stale one costs one request and then none.
let cmdSets = commandsFor(false);
function setOwner(on){
  cmdSets = commandsFor(on);
  $('#searchField').classList.toggle('is-owner', on);
}
const clearHint = () => { for(const c of hintClears()) document.cookie = c; };
if(hasOwnerHint(document.cookie)){
  fetch('/api/whoami', { credentials: 'same-origin', cache: 'no-store' })
    .then(r => r.json().catch(()=>null).then(j => ownerFrom(r.status, j)))
    .then(on => { if(on) setOwner(true); else if(on === false) clearHint(); },
          ()=>{ /* no answer: a guest's bar until the next load asks again */ });
}
// ONE GROUND, so the three theme commands went with the bulb (2026-09-15).
// The four navigational ones went with them for a different reason: /work,
// /case studies, /feed and /about all named a thing the LENS already finds by
// typing its name, so they were a second way to do the same thing that had to
// be kept in step by hand. What is left is what search cannot do: move the
// camera, and open a mail client.
const RUN = {
  home: ()=>{ closePage(); goHome(); },
  // BUG: this aimed at the hero's RAW coordinate while every other flight
  // aimed at its nearest copy, so /map from a camera that had wandered past
  // a seam flew back across the entire world to the one true original --
  // a tour, at cover zoom, to reach a frame that was already next door.
  map: ()=>{ closePage();
      flightTo(aimX(nodes.hero.wx + nodes.hero.w/2),
               aimY(nodes.hero.wy + nodes.hero.h/2), minZ); },
  // /contact LANDS ON THE GLYPHS (2026-09-16). It used to open a mail client
  // outright, which answers a question the visitor did not ask: there are
  // eight ways to reach him on the ground (github, the key, the address, the
  // rest) and the command picked one of them and launched an application for
  // it. The dock is where they all are, so the command goes there and the
  // visitor picks. The envelope is still one press away and still a mailto.
  contact: ()=>{ closePage(); flyToBox(dockBoxOf()); },
  // /poof (2026-09-16): the world bursts into its own cells and defrags back.
  // It changes nothing and it is not hiding a load, which is exactly why it
  // is allowed to exist: it is the one command that is only for fun, and the
  // register says a thing like that is rare and pixelated (BIBLE.md section
  // 9). Both halves are the shared moves, so it costs no new mechanism.
  poof: ()=>poofWorld(),
  who: ()=>openWho(),
  // /help is every command THIS viewer can type, with its usage; picking a
  // row puts the command in the field to be finished, never runs it
  help: ()=>({ rows: cmdSets.listed.map(c => ({ label: c.usage, hint: c.about, act: ()=>fillCmd(`/${c.name} `) })) }),
  // /keys is every key the page answers (KEYS in canvas/commands.js); a row
  // is read, and picking one only puts the list away
  keys: ()=>({ rows: KEYS.map(k => ({ label: k.keys, hint: k.does, act: closeCmds })) }),
  // /open is the finder for a page by its name, and it opens the page
  // rather than flying to its card: the lens already does the flying
  open: p => {
    const q = p.args.join(' ');
    const slug = matchPage(q, pageList());
    if(!slug) return { say: `no page called ${q}` };
    openPage(slug);
  },
  // /random: any page but the one already open
  random: ()=>{
    const slug = randomPage(pageList().filter(p => PAGES[p.slug]), curSheet, Math.random());
    if(!slug) return { say: 'there is no other page' };
    openPage(slug);
  },
  // /listen presses the page's own Listen, or its Stop while it reads
  // (js/page-reader.js): the reader is the page's, the command is only
  // another hand on it. The Enter that ran the command is the gesture a
  // browser wants before it will speak.
  // A page that is read is a full page, and a full page covers the bar
  // (measured: #topbar is display:none under one), so the bar is mostly
  // typed on the canvas. `/listen <page>` is the way it earns its place
  // there: the page opens, and its Listen is pressed once the page has
  // wired its reader.
  listen: p => {
    const q = p.args.join(' ');
    if(q){
      const slug = matchPage(q, pageList());
      if(!slug) return { say: `no page called ${q}` };
      if(slug !== curSheet) openPage(slug);
      pressListen(0);
      return;
    }
    if(!curSheet) return { say: 'open a page first, or /listen <page>' };
    const listen = $('#sheetInner [data-reader="listen"]');
    const stop = $('#sheetInner [data-reader="stop"]');
    if(!listen) return { say: 'this page is not one to listen to' };
    if(listen.closest('[hidden]')) return { say: 'this browser cannot read aloud' };
    (stop && !stop.hidden ? stop : listen).click();
  },
  // /share copies a link to what this tab is looking at: the page, the room
  // it is in and the find it holds, never the pin. The clipboard can refuse
  // (no permission, an old browser), and then the link itself is the answer
  // so it can be copied by hand.
  share: ()=>{
    const url = shareUrl(location.origin, location.pathname, location.search);
    const shown = { say: url };
    if(!navigator.clipboard?.writeText) return shown;
    return navigator.clipboard.writeText(url).then(()=>({ say: 'link copied' }), ()=>shown);
  },
  // /join and /leave only write the address and load it: which KIND of room
  // a code is (a session or a follow) is the rooms layer's to
  // read and correct, so the bar never guesses at it
  join: p => {
    const code = p.args[0].toLowerCase();
    if(!ROOM_CODE.test(code)) return { say: 'a room code is letters, digits and dashes, up to 32' };
    if(p.flags.pin != null && !ROOM_PIN.test(p.flags.pin)) return { say: 'a room pin is 4 digits' };
    goTo(here(roomSearch(location.search, 'session', { id: code, pin: p.flags.pin })));
  },
  leave: ()=>{ goTo(here(leaveSearch(location.search))); },
  // THE DOOR, UNLISTED (BIBLE.md section 6): never shown, never completed,
  // never in /help, and it works for anybody who types it, which is the
  // point: the owner on a machine that is not signed in. It comes back to
  // this very address, bar cleared. On a machine that IS signed in /login
  // re-issues the session and the hint and comes straight back, which is
  // also how a session older than the hint earns one.
  login: ()=>{ goTo('/login?next=' + encodeURIComponent(location.pathname + withSearch(location.search, null))); },
  admin: p => {
    if(!p.args.length){ goTo('/admin'); return; }
    const t = deskTool(p.args[0]);
    if(!t) return { say: `no desk tool called ${p.args[0]}` };
    goTo(t.href);
  },
  follow: p => ownRoom('follow', p),
  session: p => ownRoom('session', p),
  rooms: async ()=>{
    const r = await fetch('/api/admin/rooms', { credentials: 'same-origin' });
    if(!r.ok) return refused(r.status);
    const { rooms = [] } = await r.json();
    if(!rooms.length) return { say: 'no live rooms' };
    return { rows: rooms.map(x => ({
      label: `${x.kind} ${x.code}`,
      hint: `${x.people} here${x.pin ? ` · pin ${x.pin}` : ''}`,
      act: ()=>{ clearCmd(); goTo(here(roomSearch(location.search, 'session', { id: x.code, pin: x.pin }))); },
    })) };
  },
  logout: async ()=>{
    const r = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if(!r.ok) return refused(r.status);
    setOwner(false); clearHint();
    location.reload();
  },
};
// the owner's two room commands: `--end` ends the room this tab is in (the
// code off the address, or the one named), anything else writes the
// address the rooms layer opens it from, `pin=<digits>` for --pin and
// `pin=off` for --open
function ownRoom(kind, p){
  const f = p.flags;
  const id = (p.args[0] || '').toLowerCase();
  if(id && !ROOM_CODE.test(id)) return { say: 'a room code is letters, digits and dashes, up to 32' };
  if(f.end){
    const q = new URLSearchParams(location.search);
    const code = id || q.get(kind) || q.get('session') || q.get('follow');
    if(!code) return { say: `which room? /${kind} <id> --end` };
    return fetch(`/api/admin/rooms/${encodeURIComponent(code)}`, { method: 'DELETE', credentials: 'same-origin' }).then(r => {
      if(r.status === 404) return { say: `no live room called ${code}` };
      if(!r.ok) return refused(r.status);
      clearCmd(); goTo(here(leaveSearch(location.search)));
    });
  }
  if(f.pin != null && f.open) return { say: '--pin or --open, not both' };
  if(f.pin != null && !ROOM_PIN.test(f.pin)) return { say: 'a room pin is 4 digits' };
  goTo(here(roomSearch(location.search, kind, { id, pin: f.open ? 'off' : f.pin })));
}
// an owner call the server turned away: the session has gone (expired, or
// signed out in another tab), so the bar stops offering what it cannot do
function refused(status){
  if(status === 401 || status === 403){ setOwner(false); clearHint(); return { say: `${status} the door is shut, /login first` }; }
  return { say: `${status} that did not work` };
}
// /listen <page>: the page's Listen, pressed once its reader is wired (the
// sheet may still be fetching), and only when it is not already reading.
// A page with no reader, or a browser with no voice, simply stays open.
function pressListen(tries){
  const listen = $('#sheetInner [data-reader="listen"]');
  const stop = $('#sheetInner [data-reader="stop"]');
  if(listen && !listen.closest('[hidden]')){ if(!stop || stop.hidden) listen.click(); return; }
  if(tries < 40) setTimeout(()=>pressListen(tries + 1), 125);
}
const here = search => location.pathname + search + location.hash;
const goTo = url => { location.assign(url); };
// the pages /open can name: every page the boot payload carries, and the
// two doors openPage lands on a zone or a pile rather than a sheet
function pageList(){
  const list = Object.entries(PAGES).map(([slug, p]) => ({ slug, title: p.title || slug }));
  for(const slug of ['work', 'about']) if(!PAGES[slug]) list.push({ slug, title: slug });
  return list;
}
// the dock's box in world units: the union of the icon tiles, which is what
// the dock IS (layout.js seats them; nothing gives the slab a node)
function dockBoxOf(){
  const ics = LIVE_TILES.filter(t => t.type === 'icon').map(t => nodes[t.id]).filter(Boolean);
  if(!ics.length) return null;
  const x0 = Math.min(...ics.map(o => o.wx)), y0 = Math.min(...ics.map(o => o.wy));
  const x1 = Math.max(...ics.map(o => o.wx + o.w)), y1 = Math.max(...ics.map(o => o.wy + o.h));
  return { wx: x0, wy: y0, w: x1 - x0, h: y1 - y0 };
}
// THE WORLD POOFS AND COMES BACK, and it TAKES ITS TIME (2026-09-16). Every
// tile in the frame bursts into its own cells (the Finder's gesture for "this
// is gone"), the debris falls the whole height of the screen, the ground sits
// genuinely empty for a while, and then each tile is rebuilt by the
// defragmenter and handed back.
//
// The first cut ran the whole thing in about a second and a half, which is
// the right length for a row being deleted and the wrong one for this. A
// poof that is over before you have finished reading the command is a
// glitch; the point of this one is the ten seconds, and the emptiest part is
// the part that is working. So the three phases are long enough to watch: the
// fall, the empty ground, the rebuild.
//
// Every length here is BEATS of a token, never a number of milliseconds:
// five drifts of falling, five of nothing, six of coming back out of a point.
// The move module solves its own physics from whatever length it is handed
// (see poof there), so asking for a longer fall gives a slower fall rather
// than the same fall with dead air after it.
//
// Nothing is destroyed: the tiles are only hidden, and they are put back by
// the same code whether the moves ran or not, so a reduced-motion visitor and
// a visitor whose tab is throttled both end up with a world rather than an
// empty page. That is the whole reason the restore is a single function
// called from one place instead of a callback per tile.
// drift beats for the collapse. Its own last quarter is the singularity held
// still, so the moment of stillness lives INSIDE this rather than as a gap
// after it: a gap would be an empty screen, and the whole argument of the
// pair is that what the bang throws out is what the collapse swallowed.
const POOF_PULL = 10;
// drift beats for the bang. It is long on purpose and it is the longest thing
// on this site by a wide margin: an eruption you can watch tear away, a cloud
// that hangs, and then a gathering slow enough that you can see one tile's
// worth of dust find its seat before the next one does. Cutting it to fit
// beside the other two phases is what made the first version read as a zoom.
const POOF_BANG = 22;
let poofing = false;
function poofWorld(){
  if(poofing || modalOpen()) return;
  // THE WHOLE WORLD, NOT THE VISIBLE SLICE (2026-09-16).
  //
  // The first cut collected only what was in frame, which is the obvious
  // reading and is wrong on a torus. Pan during the collapse and the ground was
  // not empty: tiles that had been off camera when the command ran came
  // sailing in intact. The whole claim of this canvas is that the world
  // continues in every
  // direction, so a visitor who pans and finds one region gone and the next
  // untouched has been told the world is a stage set.
  //
  // So every tile is hidden, on camera or not. Off-camera tiles cannot be
  // DRAWN falling in (they are display:none and their rects read zero) but
  // they can certainly be hidden, and hiding them is what makes the empty
  // ground true in every direction.
  const live = [];
  for(const id in nodes) if(nodes[id] && nodes[id].n) live.push(nodes[id]);
  if(!live.length) return;
  poofing = true;
  const els = live.flatMap(o => [o.n, ...mirror.copiesOf(o.n)]);
  // hidden on the ELEMENT: render() flips a tile's `display` as it crosses the
  // frame edge, so an inline visibility rides along for free and a tile
  // panned to mid-ordeal arrives already gone.
  const boxes = els.map(el => el.getBoundingClientRect());
  for(const el of els) el.style.visibility = 'hidden';
  // THE WORLD FALLS INTO THE POINT, and the point is what the bang comes back
  // out of. It used to burst into cells that fell out of the bottom of the
  // frame, which is the Finder's gesture for "this is gone" (poof, still the
  // move every DESTRUCTION on this origin plays) and it was the wrong one
  // here, because nothing is being destroyed: the same material comes back.
  // Falling down said the world went away; falling IN says where it went.
  implode(()=>boxes, {
    beats: POOF_PULL,
    originAt: ()=>worldToScreen(WORLD_W/2, WORLD_H/2),
    done: ()=>reassemble(live, ()=>{ poofing = false; }),
  });
}
// THE BIG BANG (2026-09-16). The world does not come back built, and it does
// not come back by growing: it comes back OUT OF THE DUST IT WAS BLOWN INTO.
//
// Nothing is assembled at the start. Every cell of every tile's box is thrown
// out of one point as dust, the cloud coasts, and structure happens
// AFTERWARDS, out of that dust, as the particles slow and cross to the cells
// they belong to. Not one tile is shown until the last grain has landed: the
// dust does the entire job and the real world is swapped in underneath it in
// a single frame at the end, when the two are already the same picture.
//
// Revealing each tile as its own dust landed was the version before this and
// it was wrong for the reason the whole move exists: finished tiles standing
// at full detail beside clouds that have not resolved says the world was
// there the whole time and the dust was a screensaver over it.
//
// THE POINT IS ON THE GROUND, NOT ON THE SCREEN. It is the centre of the
// world, so it is a place you could pan to, and panning during the eruption
// carries the whole event with the ground the way it would if it were really
// happening there. That is also why the boxes and the origin are handed over
// as functions rather than as values: the move re-reads them every frame, and
// a particle remembers its home as a fraction of its box, so a camera moved
// or zoomed mid-bang re-aims every grain for free.
//
// Nothing here transforms anything, which is the other reason this shape is
// right. The version that animated a transform on every tile every frame was
// in a silent fight with `.cell`'s own transition: a per-frame write into a
// transitioned property never plays, because each frame retargets an
// interpolation that has travelled about six percent, so the computed
// transform never leaves identity while the inline style reads perfectly
// correct. This paints cells and then reveals elements.
// a world point in screen px, nearest copy to the frame (the ground is a
// torus, so every world coordinate names infinitely many places)
function worldToScreen(wx, wy){
  const near = (v, cam, world, view)=>{
    let p = ((v - cam) % world + world) % world;
    if(p - view/2 > world/2) p -= world;
    return p;
  };
  return {
    x: near(wx, camX, WORLD_W, viewW()) * Z,
    y: near(wy, camY, WORLD_H, viewH()) * Z + slideY,
  };
}
function reassemble(live, then){
  const els = live.flatMap(o => [o.n, ...mirror.copiesOf(o.n)]);
  const show = ()=>{ for(const el of els) if(el) el.style.visibility = ''; };
  if(REDUCED){ show(); then?.(); return; }
  bigBang(()=>els.map(el => el.getBoundingClientRect()), {
    beats: POOF_BANG,
    // the middle of the ground, not the middle of the window
    originAt: ()=>worldToScreen(WORLD_W/2, WORLD_H/2),
    done: ()=>{ show(); then?.(); },
  });
}
// THE ROSTER is whatever the line calls for, as rows: the names that match
// while a name is being typed, the one command's usage once it is whole, or
// a runner's list (/help, /rooms). `cmdMode` says which, because picking a
// row means a different thing in each: a name runs (or is put in the field
// to be finished when it wants words), a usage runs the line as typed, a
// listed row does its own thing. One line of words in the same seat is an
// error or an answer, in the kit's voice.
let cmdRows = [], cmdSel = 0, cmdMode = null;
function closeCmds(){
  cmdsEl.classList.remove('open'); cmdsEl.innerHTML=''; cmdRows = []; cmdMode = null;
  searchEl.setAttribute('aria-expanded', 'false');
  searchEl.removeAttribute('aria-activedescendant');
}
function markCmd(){
  cmdsEl.querySelectorAll('button.r').forEach((b,i)=>{
    b.classList.toggle('is-on', i===cmdSel);
    b.setAttribute('aria-selected', String(i===cmdSel));
    // a list taller than the ground above the bar scrolls in its box
    if(i===cmdSel) b.scrollIntoView({ block: 'nearest' });
  });
  searchEl.setAttribute('aria-activedescendant', 'cmd-'+cmdSel);
}
function showRows(rows, mode, line){
  cmdRows = rows; cmdMode = rows.length ? mode : null; cmdSel = 0;
  cmdsEl.innerHTML = rows.map((r,i)=>`<button type="button" class="k-btn r${i===0?' is-on':''}" data-i="${i}" role="option" id="cmd-${i}" aria-selected="${i===0}"><span>${esc(r.label)}</span><span class="k-meta">${esc(r.hint)}</span></button>`).join('')
    + (line ? `<div class="k-meta">${esc(line)}</div>` : '');
  cmdsEl.classList.add('open');
  searchEl.setAttribute('aria-expanded', 'true');
  if(rows.length) searchEl.setAttribute('aria-activedescendant', 'cmd-0');
  else searchEl.removeAttribute('aria-activedescendant');
  cmdsEl.querySelectorAll('button.r').forEach(b=>b.addEventListener('click', ()=>pickRow(+b.dataset.i)));
}
const sayCmd = line => showRows([], null, line);
// the field is cleared and let go: what every command that goes somewhere
// leaves behind (a picked command always did this)
function clearCmd(){ searchEl.value=''; closeCmds(); searchEl.blur(); }
// a command put in the field to be finished, the caret after it
function fillCmd(v){
  searchEl.value = v; searchEl.focus();
  searchEl.setSelectionRange(v.length, v.length);
  lineChanged();
}
// a name row: a command that wants words is put in the field for them,
// anything else runs as it is
const wantsWords = c => (c.args?.[0] || 0) > 0;
function pickRow(i){
  const r = cmdRows[i]; if(!r) return;
  if(cmdMode === 'names') return wantsWords(r.cmd) ? fillCmd(`/${r.cmd.name} `) : runLine(`/${r.cmd.name}`);
  if(cmdMode === 'usage') return runLine(searchEl.value.trim());
  r.act();
}
// THE HISTORY: the lines run since the page loaded, newest last, walked with
// the arrows from an empty field the way a shell walks its own. Memory only,
// never storage: a reload starts a clean line, as a new terminal does.
const cmdHist = [];
let histAt = -1; // steps back from the newest; -1 is the line being typed
const histLine = () => cmdHist[cmdHist.length - 1 - histAt];
const walkingHist = () => cmdHist.length > 0 && (searchEl.value === '' || (histAt > -1 && searchEl.value === histLine()));
function stepHist(back){
  histAt = Math.max(-1, Math.min(cmdHist.length - 1, histAt + (back ? 1 : -1)));
  const v = histAt < 0 ? '' : histLine();
  searchEl.value = v; searchEl.setSelectionRange(v.length, v.length);
  lineChanged();
}
// a line read and run: the error it earns, or its runner's answer
function runLine(line){
  if(cmdHist[cmdHist.length - 1] !== line) cmdHist.push(line);
  if(cmdHist.length > 50) cmdHist.shift();
  histAt = -1;
  const p = parseCommand(line, cmdSets.runnable);
  if(!p) return;
  if(p.error){ sayCmd(p.error); return; }
  let out;
  try{ out = RUN[p.name](p); }
  catch{ out = { say: 'that did not work' }; }
  settleCmd(out);
}
function settleCmd(out){
  if(out && typeof out.then === 'function'){
    out.then(settleCmd, ()=>settleCmd({ say: 'the network did not answer' }));
    return;
  }
  if(!out){ clearCmd(); return; }
  // an answer that comes back to a field already let go is dropped rather
  // than left hanging over the ground
  if(document.activeElement !== searchEl) return;
  if(out.rows) showRows(out.rows, 'list', out.say);
  else sayCmd(out.say);
}
// the roster for the line as it stands: the lens owns everything else
function lineChanged(){
  const v = searchEl.value;
  if(v.startsWith('/')){
    runFind('');
    const c = complete(v, cmdSets.listed);
    if(c.hits.length) showRows(c.hits.map(cmd => ({ label: c.mode === 'usage' ? cmd.usage : `/${cmd.name}`, hint: cmd.about, cmd })), c.mode);
    else sayCmd('no such command');
  }
  else { closeCmds(); runFind(v); }
  addressSearch();
}
searchEl.addEventListener('input', ()=>{ histAt = -1; lineChanged(); });
searchEl.addEventListener('focus', addressSearch);
searchEl.addEventListener('keydown', e=>{
  // the history, from an empty field (or one showing a line from it)
  if((e.key==='ArrowUp' || e.key==='ArrowDown') && walkingHist()){
    e.preventDefault();
    stepHist(e.key==='ArrowUp');
    return;
  }
  // Tab completes: the row the arrows are on goes into the field, the way
  // a shell finishes a word. Shift+Tab and the arrows walk the roster.
  if(cmdRows.length && e.key==='Tab' && !e.shiftKey){
    e.preventDefault();
    const r = cmdRows[cmdSel];
    if(cmdMode === 'names') fillCmd(`/${r.cmd.name}${wantsWords(r.cmd) || r.cmd.flags ? ' ' : ''}`);
    else if(cmdMode === 'list') pickRow(cmdSel);
    return;
  }
  if(cmdRows.length && (e.key==='Tab' || e.key==='ArrowDown' || e.key==='ArrowUp')){
    e.preventDefault();
    // the roster grows UPWARD from the bar: ArrowUp walks deeper into it
    const dir = (e.key==='ArrowDown' || e.key==='Tab') ? -1 : 1;
    cmdSel = (cmdSel + dir + cmdRows.length) % cmdRows.length;
    markCmd();
    return;
  }
  // the finder's cycle: down and Tab walk the results, up walks back
  if(found.length && (e.key==='Tab' || e.key==='ArrowDown' || e.key==='ArrowUp')){
    e.preventDefault();
    focusFound(foundAt + ((e.key==='ArrowUp' || (e.key==='Tab' && e.shiftKey)) ? -1 : 1));
    return;
  }
  // Enter runs the line as typed, or goes into the found thing. A line that
  // names a whole command runs with its words and flags; a name still being
  // typed ("/po") runs the row the arrows are on, as the roster always did;
  // a listed row (/help, /rooms) is picked. The unlisted commands (/login,
  // and the doors to a guest) are never suggested, completed or
  // acknowledged in the roster: typed in full they simply go.
  if(e.key==='Enter'){
    const line = searchEl.value.trim();
    if(line.startsWith('/')){
      e.preventDefault();
      if(cmdMode === 'list'){ pickRow(cmdSel); return; }
      const p = parseCommand(line, cmdSets.runnable);
      if(p.error === 'no such command' && cmdMode === 'names'){ pickRow(cmdSel); return; }
      runLine(line);
      return;
    }
    if(found.length){ goFound(); searchEl.blur(); }
    else searchEl.blur();
  }
  // Escape lets the query go and leaves you where it dropped you
  if(e.key==='Escape'){ searchEl.value=''; runFind(''); closeCmds(); closeSearch(); searchEl.blur(); e.stopPropagation(); }
});
// the 180ms is the roster's click window: a row's click lands after the blur
// that opened it. A summoned field hands the bar back in the same beat, but
// only once it is empty, so a lens left running keeps its own field. A row
// that hands the field back its focus (a command put in it to be finished)
// has kept the bar, so the roster stays.
searchEl.addEventListener('blur', ()=>{ setTimeout(()=>{ if(document.activeElement === searchEl) return; closeCmds(); if(!searchEl.value) closeSearch(); }, 180); });
searchEl.addEventListener('pointerdown', e=>e.stopPropagation());


// ---- boot ----------------------------------------------------------------------------
function sizeHero(){
  nodes.hero.w = HERO_W;
  heroN.style.width = HERO_W+'px';
  // the hero's type is one ladder step (BIBLE.md section 3), picked by
  // heroType from the hero's fixed width
  ({ fs: HERO_FS, lh: HERO_LH } = heroType(HERO_W));
  document.documentElement.style.setProperty('--cv-hero-fs', HERO_FS+'px');
  document.documentElement.style.setProperty('--cv-hero-lh', HERO_LH+'px');
  nodes.hero.h = HERO_H;
  heroN.style.height = HERO_H+'px';
}
// first paint arrives with a little life: the hero lays itself down first,
// then every tile visible on load dithers in, satellites sweeping the ring
// clockwise from north, then moons by distance, so the world materializes
// outward from the hero.
// The hero used to be excluded here, because the SSR prelude was painted
// underneath and covering the gap. The prelude is no longer painted (it
// resized when sizeHero landed), so the hero has to arrive under its own
// power, and dithering in is how everything else arrives.
// Must run AFTER a render() has established real display:none/'' state, or
// every node (nothing positioned off-canvas yet) would read as "visible".
// NOTHING ARRIVES AT BOOT (2026-09-15). This used to walk every node,
// ordered by bearing from the hero for the icons and by distance for
// everything else, and play an entrance on each one: first an ordered
// dither, then a brick bar that became the maker's mark followed by a
// per-tile defrag sweep. Both came out the same afternoon they went in.
//
// Two reasons, and the second is the one that matters. A staggered entrance
// across twenty tiles reads as a random performance rather than as a place
// being built: there is no story in the order, so it is just motion. And the
// sweep is drawn in SCREEN space while the world it decorates pans and zooms
// underneath, so dragging the canvas mid-boot tears the two apart, which is
// a flaw no amount of tuning fixes.
//
// The world is simply there when you arrive. That is what a place does, and
// it is the one arrival that never needs explaining.
function initialReveal(){}
async function boot(){
  // THE STATEMENT NEEDS NO FONT (2026-09-16). It used to be the reason boot
  // waited: the webfont had to land before the hero could be measured, so a caret
  // stood in as the loading state and the first line typed itself in behind
  // the wait. The statement is drawn in the mark's own pixels now, which are
  // path data in a module that has already parsed by the time this runs, so
  // it is simply there. The font wait below survives for everything else
  // that reads in the webfont; the hero no longer has a stake in it.
  sizeHero();
  // whatever the room is showing, or the first phrase in an empty room. The
  // statement is not typed and not on a clock any more, so there is nothing
  // to warm up and no font to wait for: it is drawn in the mark's own pixels.
  mountHero(PHRASES[heroIndex]);
  layout();
  // the restored camera must still mean something: same world, and a
  // viewport within a third of the one it was saved on (a live resize
  // mid-session keeps the camera; this guards the RETURN, not the drag)
  if(SAFE){ hadCam = false; hadZ = false; }
  if(hadCam || hadZ){
    const f = savedFrame;
    const viewKept = f && Math.abs(f.vw - VW) / f.vw < 1/3 && Math.abs(f.vh - VH) / f.vh < 1/3;
    const worldKept = !f?.ww || (f.ww === WORLD_W && f.wh === WORLD_H);
    if(!viewKept || !worldKept){ hadCam = false; hadZ = false; }
  }
  Z = hadZ ? restZ(Z) : fitZ();
  if(!hadCam){ camX = homeX(); camY = homeY(); }
  render();
  // The prelude is the FALLBACK, so it goes only once the canvas has really
  // painted. Removing it before layout()/render() meant any throw in between
  // left a page with no statement, no index, and every tile stacked unplaced
  // at the scene's top-left: a tile takes its world place from a transform
  // that render() applies, so an unbooted scene piles the whole world into
  // one corner at 1:1. That is the pile reported from a watch.
  // and this is the ONE place canvas-pending comes off: the server stamps it
  // on <html> so it is true before any script exists, and it stays true until
  // a rendered world is on the screen. Doing nothing leaves the document up,
  // which is the point: every way of failing, including the ones nobody has
  // named yet, ends somewhere a visitor can read.
  painted = true; logEv('painted');
  document.documentElement.classList.remove('canvas-pending');
  document.getElementById('prelude')?.remove();
  initialReveal();
  // The face still carries everything that is READ (the zones, the sheets,
  // the rows), so the wait stays; what left it is the hero, which is drawn in
  // the mark's own pixels and needs no font to exist. The family comes off
  // the token (--cv-font, canvas-tokens.css), never typed here: a swap is one
  // line there and this keeps waiting for the right file.
  const FACE = getComputedStyle(document.documentElement).getPropertyValue('--cv-font').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  if(!document.fonts?.check?.(`30px ${FACE}`)){
    // a font that never settles must not strand the boot: race a ceiling,
    // past which we keep the fallback face and fonts.ready refits later
    await Promise.race([
      Promise.all([
        document.fonts.load(`30px ${FACE}`),
        document.fonts.load(`16px ${FACE}`),
      ]).catch(()=>{}),
      new Promise(r=>setTimeout(r, 1500)),
    ]);
    sizeHero();
    remountHero();
    layout();
    render();
  }
  // legacy #/slug deep links from the prototype become real paths
  const legacy = legacySlug();
  if(legacy) history.replaceState(null, '', roomed(pathForSlug(legacy)));
  const slug = slugForPath(location.pathname);
  const fan = stackForPath(location.pathname) || (typeof BOOT?.fan === 'string' ? BOOT.fan : null);
  if(fan) showFan(fan, false);
  const land = landForPath(location.pathname) || (typeof BOOT?.land === 'string' ? BOOT.land : null);
  if(land && nodes[land] && !hadCam){
    // a direct load of a zone's path opens ON the zone, at true scale
    const o = nodes[land];
    Z = landZoom(o);
    const aim = landAim(o, Z);
    camX = aim.x - viewW()/2; camY = aim.y - viewH()/2;
    restCam(); renderDirty = true;
    curLand = land;
  } else if(land) goZone(land, false);
  if(slug && $('#modal').classList.contains('open')) adoptSsrSheet(slug);
  else paintSheet(slug);
  // stamp the entry point: a direct load closes to its fan or to /, a
  // canvas-opened sheet or fan closes via history.back()
  // the hash stays: a page's own deep link (the instruments' tabs) is read
  // off it by the page's script
  history.replaceState({fan, sheet: slug || null, direct: !!(slug || fan)}, '', location.pathname + location.search + location.hash);
  searchFromAddress(!!(slug || fan));
  initCrown();
  initDiag();
  requestAnimationFrame(tick);
}
// the numbers on the screen (2026-09-12): what the wrist can photograph.
// The line is also written to storage every tick, so a run the browser
// killed leaves its last numbers for the next boot to show as "prev".
function initDiag(){
  // only ever asked for: safe mode arms itself quietly, the root url stays clean
  if(!FLAGS.has('diag')) return;
  const d = document.createElement('div');
  d.id = 'diag';
  d.className = 'k-meta';
  d.setAttribute('aria-hidden', 'true');
  document.getElementById('stage').appendChild(d);
  let prev = '';
  try{ prev = localStorage.getItem('canvas-diag-last') || ''; }catch{ /* none */ }
  addEventListener('error', e => { DIAG.last = 'threw: ' + String(e.message).slice(0, 60); });
  const line = () => {
    const vv = window.visualViewport;
    return [
      `${SAFE ? 'SAFE ' : ''}${FROZEN ? 'FROZEN ' : BARE ? 'BARE ' : ''}${innerWidth}x${innerHeight} @${window.devicePixelRatio} screen ${window.screen.width}x${window.screen.height}`,
      `vv ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} s${vv.scale.toFixed(2)}` : 'none'} crown ${CROWN_ON ? 'on' : 'off'}`,
      `z ${Z.toFixed(3)} floor ${outZ.toFixed(3)} mount ${mountZ.toFixed(3)} cam ${Math.round(camX)},${Math.round(camY)}`,
      `wheel ${DIAG.wheel} scroll ${DIAG.scroll} gesture ${DIAG.gesture} resize ${DIAG.resize} touch ${DIAG.touch}`,
      `zooms ${DIAG.zoom} renders ${DIAG.render} kills ${DIAG.kills} up ${Math.round(performance.now() / 1000)}s`,
      DIAG.last ? `last ${DIAG.last}` : '',
    ].filter(Boolean).join('\n');
  };
  const paint = () => {
    const now = line();
    const tail = prevLog.slice(-9).join('\n');
    d.textContent = (tail ? `prev log\n${tail}\n\n` : '') + now + (prev ? `\n\nprev run\n${prev}` : '');
    try{ localStorage.setItem('canvas-diag-last', now); }catch{ /* none */ }
  };
  paint();
  setInterval(paint, 500);
}
// full refit: viewport, hero (whose size is mode- and width-dependent),
// the typed statement, then the world. Resize and the grid toggle share it.
function refit(){
  logEv('refit');
  computeWorld(); sizeHero();
  if(curFan) layoutFan(null);
  remountHero();
  layout();
  // the scene box is sized in world units from the DEVICE viewport, so a
  // resize must re-write it even when the zoom itself did not move
  setSceneTransform();
  if(modalOpen()) sizeSheet(); render();
}
addEventListener('resize', ()=>{ DIAG.resize++; logEv('resize ' + innerWidth + 'x' + innerHeight); refit(); });
// If the webfont lost the race in boot(), the hero was measured on the
// fallback face. Refit once the real face lands so the door row and the
// statement settle on their true widths. A no-op when boot already had it.
document.fonts?.ready.then(refit).catch(()=>{});
// A half-built canvas is worse than no canvas (see the prelude note in boot):
// every tile is absolutely positioned and unplaced until render() runs, so a
// throw anywhere before it stacks the whole world into the scene's corner.
// canvas-pending is what actually keeps the document up now, and it needs no
// help to do it: it is on <html> from the server and comes off only after a
// paint, so a throw that never reaches this handler still leaves the page
// readable. What this adds is speed, not safety. A caught failure is a
// verdict, and a verdict does not need to sit out the 600ms the stand-in
// waits before it shows itself.
// A stumble AFTER the first paint is not worth the page.
let painted = false;
boot().catch(err => {
  console.error('[canvas] boot failed before first paint:', err);
  if(painted) return;
  document.documentElement.classList.add('canvas-failed');
});

// ---- the canvas stays fresh -----------------------------------------------
// The server refreshes its upstreams every 5 minutes and NUDGES every open
// tab when something moved (presence.js, {type:'stale'}); the poll below is
// the floor for a tab the room refused. Either way the repaint is the same
// path, and only tiles whose data actually changed are rebuilt. A refreshed
// tile settles in: an update is a material change and wears the grammar like
// everything else.
function rebuildTile(id){
  const o = nodes[id]; if(!o) return;
  const t = LIVE_TILES.find(x=>x.id===id); if(!t) return;
  mirror.drop(o.n);
  o.n.remove(); delete nodes[id];
  mkTile(t);
  staleWhisper(id);
  const nn = nodes[id];
  nn.wx = o.wx; nn.wy = o.wy; nn.hidden = o.hidden;
  // the tile is new DOM, so any highlight a peer had on it (or on one of its
  // rows: the last-heard list is rebuilt song by song) is on the node that
  // just left. Repaint from the Set, which outlives the nodes.
  for(const k of peerHover) if(k === id || k.startsWith(id + '#')) paintPeerHover(k);
  renderDirty = true; render();
}
let refreshBusy = false;
async function refreshCanvas(){
  if(refreshBusy) return; refreshBusy = true;
  try{
    const res = await fetch('/api/canvas');
    if(!res.ok) return;
    const fresh = await res.json();
    // Which keys moved: the diff the server's push asks too (canvas/wire.js),
    // against what this tab holds. A key that moved is taken only when the
    // payload has one worth drawing.
    const moved = new Set(changedKeys({ weather: WEATHER }, fresh));
    const changed = new Set();
    if(BOOT && fresh.meta) BOOT.meta = fresh.meta;
    if(moved.has('weather') && fresh.weather){ WEATHER = fresh.weather; changed.add('weather'); }
    for(const id of changed) rebuildTile(id);
    if(changed.size) INDEX = null; // the omni search re-indexes lazily
  }catch{ /* offline or transient: the canvas keeps what it has */ }
  finally{ refreshBusy = false; }
}
// The push. One subscription for the life of the page: the server sends the
// changed keys, every open tab gets the same message from the same poll, and
// the repaint runs through refreshCanvas like the timer's would. Jittered
// because a room of tabs answering in the same millisecond is a stampede we
// can spread for free, and the second nudge inside that window replaces the
// first rather than queueing a second fetch.
let nudgeT = null;
presence.onData(()=>{ clearTimeout(nudgeT); nudgeT = setTimeout(refreshCanvas, 150 + Math.random()*1350); });
// The floor. A tab the room refused (1013, full) or one on a network that
// eats websockets never hears a nudge, so the poll stays exactly as it was.
setInterval(refreshCanvas, 5*60*1000);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) refreshCanvas(); });
// debug handle
window.__lab = {
  get cam(){ return {x:camX,y:camY}; },
  get world(){ return {w:WORLD_W, h:WORLD_H}; },
  get zoom(){ return {z:Z, min:outZ, mount:mountZ, max:MAXZ, fit:fitZ()}; },
  // the cost probe (scripts/verify/zoom-out-cost.mjs) mounts at a floor of
  // its choosing, to measure what mounting the whole world costs
  mountAt(z){ mountZ = z; renderDirty = true; render(); },
  // renders synchronously: headless audits read visibility right after a
  // jump, and a throttled rAF between the two made them lie
  setCam(x,y){ camX=x; camY=y; vx=vy=0; homeTween=null; render(); },
  setZoom(z){ zoomAt(z, VW/2, VH/2); homeTween=null; render(); },
  home(){ Z=fitZ(); camX=homeX(); camY=homeY(); vx=vy=0; render(); },
  goHome, openPage, openStack, closeStack, nodes,
  get fan(){ return { id: curFan, slots: fanSlots, sheet: curSheet }; },
  centerOn(id){ const o=nodes[id]; camX=o.wx+o.w/2-viewW()/2; camY=o.wy+o.h/2-viewH()/2; vx=vy=0; },
  reset(){ noPersist = true; localStorage.removeItem(LSKEY); },
  dustUnder, setOthers, // headless audits raise the dust and turn the tally by hand
  // the room as this tab sees it, for the two-tab page check
  // (scripts/verify/page-presence.mjs): who, where, and where drawn
  peers(){ return presence.roster().map(q => {
    const el = document.querySelector(`.cursor[data-peer="${q.id}"]`);
    const shown = el && el.isConnected && el.style.display !== 'none';
    const r = shown ? el.getBoundingClientRect() : null;
    return { id: q.id, at: q.at, host: q.host, f: q.f, layer: shown ? el.parentNode.id : null, x: r ? r.x : null, y: r ? r.y : null, edge: el ? el.className.replace('cursor', '').trim() : '' };
  }); },
  // the session as this tab is in it, and this tab's own drawn hand (in a
  // line), for the session check (scripts/verify/session-live.mjs)
  session(){ return presence.sessionNow(); },
  me(){
    const el = document.querySelector('.cursor.self');
    const shown = el && el.isConnected && el.style.display !== 'none';
    const r = shown ? el.getBoundingClientRect() : null;
    return { id: presence.selfId(), following: follow.id, layer: shown ? el.parentNode.id : null, x: r ? r.x : null, y: r ? r.y : null };
  },
  follow, openWho, closeWho, announcePlace,
  blocks(){ return sheetBlocks().map(b => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, tag: b.tagName }; }); },
};
