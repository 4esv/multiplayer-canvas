// The site's plain documents: pages that are only words, written once as a
// text template (templates/text/<slug>.njk) and served three ways from it.
// Curl and old browsers get the text, the canvas gets it as a sheet
// (buildDocSheet), and /api/sheet/<slug> hands the same sheet to the client.
// A new document is one line here, its text file, and its route line in
// routes/docs.js. The sheet builder and the about zone's buttons read this
// list.
export const DOCS = {
  credits: { description: 'The people whose type, code and data this site is built on.' },
}

export const isDoc = (slug) => Object.hasOwn(DOCS, slug)
