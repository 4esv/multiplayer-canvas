// The statement's phrases, and nothing else.
//
// The hero is a pile of sentences and the room turns it (BIBLE.md section
// 4): canvas/app.js turnHero sends the pile's front, `hero`, and every tab
// shows the phrase the room says. No clock turns it, so nothing here counts
// time; test/room-state.test.js holds this file to the list.

// [0] is the phrase the DOCUMENT opens on: it is SSR'd into #prelude as the
// home document's h1, for a crawler and a reader without script, and
// test/crawlability.test.js pins the template's h1 to this entry. The canvas
// opens on the ROOM's phrase, which the page names (boot.fronts.hero): a room
// nobody has turned shows this one, a turned room shows its own from the first
// frame, and the welcome only turns the tab if the room moved since the page
// was rendered.
export const PHRASES = [
  'Everyone here sees your cursor.',
  'This is a shared canvas. It wraps around.',
  'Drag to wander, pinch or scroll to zoom.',
  'Tap a pile to spread it out.',
  'Feed the slime. Everyone sees it eat.',
  'Turn this sentence and it turns for everyone.',
]
