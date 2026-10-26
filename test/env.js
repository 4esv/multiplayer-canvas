// test/env.js
// Imported FIRST, for its side effect, by a suite that must not reach the
// network. config.js reads NODE_ENV once at import and freezes it, and
// routes/api.js gates its boot refresh on it: outside 'test' every build()
// fires the real loader at open-meteo. `npm test`
// sets the variable, a bare `node --test` does not, and a guard that is only
// green under one of the two spellings is a flake. ESM evaluates
// imports in order, so this line lands before src/ is read.
process.env.NODE_ENV = 'test'
