// What an entry IS, and where it lives. One pair of functions, read by every
// surface that has to route a piece of content.
//
// The fork used to be written out longhand at fifteen sites (home, canvas,
// feed, work, sitemap, llms, the sheet builders, three test suites), each a
// two-way ternary over `type === 'case-study'` and `webOnly`. Two kinds fit
// in a ternary. A third turns every one of those lines into a chain, and a
// chain copied fifteen times is fifteen chances to copy it wrong: the day
// one site learned a new kind and another did not, an entry would render on
// the canvas and 404 at its own URL, with every guard green.
//
// So the taxonomy lives here (BIBLE.md section 5, items):
//
//   case-study   `type: case-study`   /work/<slug>, indexed by the work door
//   photos       `type: photos`       /<slug>, a carousel of its own pictures
//   experiment   `web_only: true`     /<slug>, the thing itself in a browser
//   article      everything else      /feed/<slug>, the writing collection
//
// Frontmatter stays the same shape it has always been; this only names the
// fork. `external_url` is orthogonal: an external entry still has a kind
// (it is usually an article), and its /feed/<slug> stays a 302 handle. Kind
// answers "what is it and where would it live"; externalUrl answers "does
// it live here at all".

// seam: test/page-ring.test.js
export const CASE_STUDY = 'case-study'
const PHOTOS = 'photos'
// seam: test/lib/entry-kind.test.js, test/page-ring.test.js
// The constant keeps the kind's name; its VALUE is served (the canvas boot
// index's `kind`, /api/page's `type`), so it is the frontmatter switch that
// declares it and never the word a reader would be filed under
// (test/served-labels.test.js).
export const EXPERIMENT = 'web-only'
const ARTICLE = 'article'

/**
 * @param {{type?: string, webOnly?: boolean}} entry
 * @returns {'case-study'|'photos'|'web-only'|'article'}
 */
export function kindOf(entry) {
  if (entry?.type === CASE_STUDY) return CASE_STUDY
  if (entry?.type === PHOTOS) return PHOTOS
  if (entry?.webOnly) return EXPERIMENT
  return ARTICLE
}

// The canonical local path. Root-mounted kinds take a bare /<slug> because
// they are not collection members: they live on the canvas as themselves.
const PATHS = {
  [CASE_STUDY]: (slug) => `/work/${slug}`,
  [PHOTOS]: (slug) => `/${slug}`,
  [EXPERIMENT]: (slug) => `/${slug}`,
  [ARTICLE]: (slug) => `/feed/${slug}`,
}

/**
 * @param {{slug: string, type?: string, webOnly?: boolean}} entry
 * @returns {string} the path this entry's page is served at
 */
export function pathFor(entry) {
  return PATHS[kindOf(entry)](entry.slug)
}

// The kind label a sheet's meta line prints. Chrome copy, not prose: it
// names the shelf, never the piece. Capitalized as a label is (author,
// 2026-09-25: "Case Study", not "case study"), here where it is produced,
// so the SSR'd page, the canvas's boot index and /api/page print one word.
//
// A root-mounted thing (an EXPERIMENT in code) has no shelf to name, so it
// has no label at all and its meta line is its date (author, 2026-09-25:
// "Since experiments aren't in a stacked collection that shows an
// intermediate group view they don't need to be labeled experiments
// anywhere, they can just be the thing they are ... This way I have more
// freedom to add things that don't feel like experiments."). The kind keeps
// its name in code, where it routes; it is never said to a reader
// (test/served-labels.test.js).
const LABELS = {
  [CASE_STUDY]: 'Case Study',
  [PHOTOS]: 'Photos',
  [EXPERIMENT]: '',
  [ARTICLE]: 'Feed',
}

// seam: test/lib/entry-kind.test.js
export function kindLabel(entry) {
  return LABELS[kindOf(entry)]
}

// The meta line under a page's title: the kind's label and the date, either
// of which may be absent. One function, because three builders wrote the
// same ternary and a kind with no label would print a stray separator.
export function metaLine(entry) {
  return [kindLabel(entry), entry.date].filter(Boolean).join(' · ')
}

// The way back out of a page names its collection. Root-mounted kinds have
// no collection, so theirs names the canvas itself: a small touch screen
// reaches none of the other closes (Escape, backdrop, gap).
const BACK = {
  [CASE_STUDY]: { path: '/work', label: 'Case Studies' },
  [ARTICLE]: { path: '/feed', label: 'feed' },
  [PHOTOS]: { path: '/', label: 'canvas' },
  [EXPERIMENT]: { path: '/', label: 'canvas' },
}

export function backTo(entry) {
  return BACK[kindOf(entry)]
}

// The writing collection: the /feed index, /feed/<slug>, /feed.xml and the
// feed sheet all carry exactly this slice. Case studies have the work door,
// experiments and photo sets live on the canvas as themselves.
export function isWriting(entry) {
  return kindOf(entry) === ARTICLE
}

// Mounted at the root as a single segment, no collection prefix.
export function isRootMounted(entry) {
  const kind = kindOf(entry)
  return kind === EXPERIMENT || kind === PHOTOS
}

export function isCaseStudy(entry) {
  return kindOf(entry) === CASE_STUDY
}

// A case study and an experiment are destinations, not cards (2026-09-15):
// they take the frame. ONE predicate, read by the canvas payload and by the
// direct load, because two copies drifted: the server SSR'd a direct-loaded
// experiment as a sheet over the canvas while the canvas opened the same
// entry as a full page, so the one URL was two pages (#300).
export function isFullPage(entry) {
  return isCaseStudy(entry) || !!entry.webOnly
}

export function isExperiment(entry) {
  return kindOf(entry) === EXPERIMENT
}

export function isPhotoSet(entry) {
  return kindOf(entry) === PHOTOS
}
