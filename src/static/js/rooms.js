// /admin/sessions: every list is server-rendered (the QR is the server's,
// lib/qr.js); this script drives the buttons through /api/admin/rooms and
// reloads, so the page and the registry never disagree. No confirm()
// dialogs: ending a session arms on the first tap and acts on the second
// (primitives/kit/kit-arm.js, the one arm), which is an import, so it is bundled
// (scripts/build-assets.mjs).
import { armed } from 'multiplayer-canvas/kit/arm'
;(() => {
  const root = document.getElementById('rooms')
  if (!root) return

  function say(el, msg, isError) {
    if (!el) return
    el.hidden = false
    el.textContent = msg
    el.classList.toggle('is-error', Boolean(isError))
  }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || data.error || `http ${res.status}`)
    return data
  }

  // ---- start --------------------------------------------------------------------

  const form = document.getElementById('start')
  const startStatus = document.getElementById('start-status')
  const kinds = [...form.querySelectorAll('[data-kind]')]
  let kind = kinds.find((b) => b.getAttribute('aria-checked') === 'true')?.dataset.kind
  for (const b of kinds) {
    b.addEventListener('click', () => {
      kind = b.dataset.kind
      for (const o of kinds) o.setAttribute('aria-checked', String(o === b))
    })
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await api('POST', '/api/admin/rooms', { kind, pin: document.getElementById('pin').checked })
      location.reload()
    } catch (err) {
      say(startStatus, err.message, true)
    }
  })

  // ---- live ---------------------------------------------------------------------

  document.querySelectorAll('#live .dk-row').forEach((row) => {
    const code = row.dataset.code
    const copy = row.querySelector('[data-act="copy"]')
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(copy.dataset.url)
        const was = copy.textContent
        copy.textContent = 'copied'
        setTimeout(() => (copy.textContent = was), 1500)
      } catch {
        // no clipboard (plain http, or denied): the link is on the page
        say(startStatus, copy.dataset.url)
      }
    })
    armed(
      row.querySelector('[data-act="end"]'),
      async () => {
        row.style.visibility = 'hidden'
        await api('DELETE', `/api/admin/rooms/${encodeURIComponent(code)}`)
        location.reload()
      },
      (err) => say(startStatus, `no luck: ${err.message}`, true)
    )
  })

  // ---- default ------------------------------------------------------------------

  const pinDefault = document.getElementById('pin-default')
  const defaultStatus = document.getElementById('default-status')
  pinDefault.addEventListener('change', async () => {
    try {
      const { pin } = await api('PUT', '/api/admin/rooms/settings', { pin: pinDefault.checked })
      pinDefault.checked = pin
      // the start form's box follows the default it was drawn from
      document.getElementById('pin').checked = pin
      say(defaultStatus, pin ? 'new sessions get a pin.' : 'new sessions open without a pin.')
    } catch (err) {
      pinDefault.checked = !pinDefault.checked
      say(defaultStatus, `no luck: ${err.message}`, true)
    }
  })
})()
