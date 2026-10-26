// The one machine-readable identity: who owns the site, where else they are
// on the web, and the JSON-LD shapes crawlers read. Every surface that tells
// a machine who owns this site (home, /about, entry pages, /llms.txt, the
// rel="me" head links) builds from this module, so the picture cannot fork.
// The values are site.config.js's, read through src/config.js.

import config from '../config.js'

const SITE_URL = config.site.url

export const PERSON = Object.freeze({
  name: config.site.author.name,
  jobTitle: config.site.author.jobTitle,
  description: config.site.tagline,
  email: `mailto:${config.site.author.email}`,
  url: `${SITE_URL}/`,
})

// Every profile the site publishes as the owner's, one row per host.
// Person.sameAs is Object.values of this; llms.txt and the rel="me" links
// pick by key.
export const PROFILES = config.site.social

// The full Person node, @id-addressable so Article authors on other pages
// resolve to the same entity.
export function personNode() {
  return {
    '@type': 'Person',
    '@id': `${SITE_URL}/#person`,
    name: PERSON.name,
    description: PERSON.description,
    url: PERSON.url,
    email: PERSON.email,
    jobTitle: PERSON.jobTitle,
    sameAs: Object.values(PROFILES),
  }
}

export function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: config.site.name,
    inLanguage: 'en',
    publisher: { '@id': `${SITE_URL}/#person` },
  }
}

// /about as a ProfilePage: the page whose main entity is the person. The
// Person rides along in full so the page validates self-contained.
export function profilePageNode(canonical) {
  return {
    '@type': 'ProfilePage',
    url: canonical,
    mainEntity: personNode(),
  }
}

// A published entry as schema.org Article. Its author field carries name and url
// inline (validators want a self-contained node) plus the @id, so a reader
// that stitches pages resolves it to the home Person.
export function articleNode(entry, canonical, image) {
  return {
    '@type': 'Article',
    headline: entry.title,
    description: entry.summary || undefined,
    url: canonical,
    mainEntityOfPage: canonical,
    image,
    inLanguage: 'en',
    datePublished: entry.date || undefined,
    dateModified: entry.updated || entry.date || undefined,
    author: {
      '@type': 'Person',
      '@id': `${SITE_URL}/#person`,
      name: PERSON.name,
      url: PERSON.url,
    },
  }
}

// One or many nodes to the serialized ld+json payload. `<` is escaped so the
// blob can never close its own <script> tag, whatever a title contains.
export function jsonld(...nodes) {
  const doc =
    nodes.length === 1
      ? { '@context': 'https://schema.org', ...nodes[0] }
      : { '@context': 'https://schema.org', '@graph': nodes }
  return JSON.stringify(doc).replace(/</g, '\\u003c')
}
