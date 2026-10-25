// The fallback page says why it is the fallback page.
//
// canvas-pending guarantees a readable page when the canvas does not paint,
// which is worth having and is not the same as knowing what happened. Three
// deploys were spent guessing at a failure that will not reproduce off the
// device reporting it, and each guess cost a merge and a look at a wrist.
//
// So the page reports. This is a classic script in <head>, running BEFORE the
// module, because the failure it exists for is a throw at app.js module scope,
// which happens before app.js could install anything itself. It writes into
// the server-rendered prelude, which is already on the screen in exactly the
// case it has something to say, and it says nothing at all otherwise.
//
// No endpoint, no beacon, nothing leaves the device: the whole point is that
// the person holding the watch can read it. It stays after this bug, because
// a canvas that silently does not paint is a state that should be loud.
;(function () {
  var first = null
  var record = function (what, err) {
    if (first) return // the FIRST failure is the cause; the rest are its wake
    var msg = err && err.message ? err.message : String(err)
    var where = ''
    if (err && err.stack) {
      // one frame is enough to name the file, and a watch cannot read more
      var line = String(err.stack).split('\n')[1] || ''
      where = line
        .trim()
        .replace(/^at\s+/, '')
        .replace(/https?:\/\/[^/]+/, '')
    }
    first = { what: what, msg: msg, where: where }
  }
  addEventListener('error', function (e) {
    // a failed <img>/<link> also fires this, on the element rather than window
    if (e.target && e.target !== window) return
    record('threw', e.error || e.message)
  })
  addEventListener('unhandledrejection', function (e) {
    record('rejected', e.reason)
  })

  // Long enough that a slow device is not accused of failing: boot paints
  // before its webfont race, and that race is capped at 1500ms.
  setTimeout(function () {
    if (!document.documentElement.classList.contains('canvas-pending')) return
    var prelude = document.getElementById('prelude')
    if (!prelude) return
    var p = document.createElement('p')
    p.className = 'why k-meta'
    p.textContent = first
      ? 'the canvas ' +
        first.what +
        ': ' +
        first.msg +
        (first.where ? ' (' + first.where + ')' : '')
      : // Nothing threw and it still did not paint, which is its own answer:
        // boot is stuck on something it is waiting for rather than broken.
        'the canvas never finished, and nothing threw'
    prelude.insertBefore(p, prelude.firstChild)
  }, 4000)
})()
