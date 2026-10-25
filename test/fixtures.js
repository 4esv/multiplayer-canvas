// test/fixtures.js
// The content slugs the suites assert against, named in one place so a content
// rename updates every test at once instead of leaking a stale slug into a
// still-green build. Each is the representative of its kind in content/feed/:
//
//   caseStudy   type: case-study     surfaces at /work/<slug>
//   article     (no type)            surfaces at /feed/<slug>
//   external    external_url         an aggregated link; /feed/<slug> 302s off-site
//   experiment  web_only             root-mounted at /<slug>
//
// The off-site URL is pinned too, because the redirect target and the
// external tile link are asserted verbatim.
export const FIXTURES = {
  caseStudy: 'example-case-study',
  article: 'hello-world',
  external: 'websockets-on-mdn',
  externalUrl: 'https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API',
  experiment: 'web-instruments',
}
