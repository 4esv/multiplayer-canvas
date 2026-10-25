// The words a JSON error can say. Every error body on the site is
// { error: <one of these>, message?: <a sentence for a person> }: the word
// is the contract a program branches on, the message is free to change.
//
// A word is added here before a route may say it; test/api-errors.test.js
// walks the routes for every word they send and fails on one not listed.

// seam: test/api-errors.test.js
export const ERRORS = Object.freeze({
  // the doors
  origin: 'a browser write from another site.',
  unauthorized: 'no session on a route that needs one.',
  rate: 'too many requests or too many wrong secrets. Wait; retry-after says how long when it is known.',
  // the request itself
  notfound: 'nothing by that code, id, name or path.',
  invalid: 'the request reached the route but a field is wrong. The message says which.',
  toolarge: 'over a limit.',
  full: 'no room for another one of these right now.',
  server: 'the server failed. The message carries the request id the log has.',
  // the passkey door, which only a browser walks through
  claimed: 'the door already has its passkey.',
  unclaimed: 'the door has no passkey yet.',
  setup: 'the setup code is wrong.',
  challenge: 'the passkey challenge is stale. Start again.',
  verification: 'the passkey did not verify.',
  loopback: 'only from this machine.',
})

/** Send one error in the shape above. */
export function fail(reply, status, error, message) {
  return reply.code(status).send(message ? { error, message } : { error })
}
