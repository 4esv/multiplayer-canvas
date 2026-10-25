// Who this site is. Every identity value the server, the templates, the
// feed, the OG cards and the JSON-LD print comes from here, so a fork edits
// this one file. Secrets and ports live in .env (see .env.example).
export default {
  // The site's name: the <title> suffix, the RSS channel, the manifest.
  name: 'Your Name',
  // The canonical origin, no trailing slash. SITE_URL in the env overrides
  // it, so a staging box can run the same tree.
  url: 'https://example.com',
  // One sentence, for meta descriptions, llms.txt and the feed.
  description: 'A personal site on a shared canvas. Anyone with it open sees everyone else.',
  // The person the site belongs to: JSON-LD Person, article bylines,
  // humans.txt and the contact line.
  author: {
    name: 'Your Name',
    jobTitle: 'Programmer',
    email: 'you@example.com',
  },
  // Profiles the site links as rel="me" and lists in Person.sameAs.
  // Add or remove rows freely; the key is a short label.
  social: {
    github: 'https://github.com/your-handle',
  },
  // The sky tile's weather (Open-Meteo, no key). `place` is the label the
  // tile prints under the window.
  weather: {
    lat: 51.5072,
    lon: -0.1276,
    place: 'london',
  },
}
