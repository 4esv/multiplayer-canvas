// The desk shell: one behavior, log out, which the rail carries on every
// owner page and the sessions card carries on a phone. Everything else on
// the desk is a link or belongs to the page's own script.
;(() => {
  document.querySelectorAll('[data-logout]').forEach((b) => {
    b.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
      location.assign('/login')
    })
  })
})()
