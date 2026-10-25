// The passkey door. The page IS the prompt: on load we fire the WebAuthn
// modal immediately; browsers that demand a user gesture (Safari, sometimes)
// get the fallback button instead. While unclaimed, the same page carries
// the one-time claim form (setup code -> create passkey).
//
// The ceremony JSON <-> ArrayBuffer plumbing is hand-rolled (~40 lines)
// rather than vendored: script-src is 'self' and the crypto all happens
// server-side in @simplewebauthn/server.
;(() => {
  const door = document.querySelector('.cv-door')
  if (!door) return
  const claimed = door.dataset.claimed === '1'
  const next = door.dataset.next || '/admin'
  const status = document.getElementById('status')

  function say(msg, isError) {
    if (!status) return
    status.textContent = msg
    status.classList.toggle('is-error', Boolean(isError))
  }

  function toBuf(b64u) {
    const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes.buffer
  }

  function toB64u(buf) {
    let bin = ''
    for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b)
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  async function post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || data.error || `http ${res.status}`)
    return data
  }

  async function login() {
    const options = await post('/api/auth/login/options')
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: toBuf(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout,
        userVerification: options.userVerification,
        allowCredentials: (options.allowCredentials || []).map((c) => ({
          type: 'public-key',
          id: toBuf(c.id),
          transports: c.transports,
        })),
      },
    })
    await post('/api/auth/login/verify', {
      response: {
        id: cred.id,
        rawId: toB64u(cred.rawId),
        type: cred.type,
        clientExtensionResults: cred.getClientExtensionResults(),
        response: {
          authenticatorData: toB64u(cred.response.authenticatorData),
          clientDataJSON: toB64u(cred.response.clientDataJSON),
          signature: toB64u(cred.response.signature),
          userHandle: cred.response.userHandle ? toB64u(cred.response.userHandle) : undefined,
        },
      },
    })
    say('in.')
    location.replace(next)
  }

  async function register(code) {
    const options = await post('/api/auth/register/options', { code })
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: toBuf(options.challenge),
        rp: options.rp,
        user: {
          id: toBuf(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName || options.user.name,
        },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        attestation: options.attestation,
        authenticatorSelection: options.authenticatorSelection,
        excludeCredentials: (options.excludeCredentials || []).map((c) => ({
          type: 'public-key',
          id: toBuf(c.id),
          transports: c.transports,
        })),
      },
    })
    await post('/api/auth/register/verify', {
      code,
      response: {
        id: cred.id,
        rawId: toB64u(cred.rawId),
        type: cred.type,
        clientExtensionResults: cred.getClientExtensionResults(),
        response: {
          attestationObject: toB64u(cred.response.attestationObject),
          clientDataJSON: toB64u(cred.response.clientDataJSON),
          transports: cred.response.getTransports ? cred.response.getTransports() : [],
        },
      },
    })
    say('claimed. the passkey is in your passwords.')
    location.replace(next)
  }

  if (!window.PublicKeyCredential) {
    say('this browser has no passkey support.', true)
    return
  }

  if (claimed) {
    const button = document.getElementById('passkey')
    button.addEventListener('click', async () => {
      // One ceremony at a time: a second click mid-modal would race the
      // challenge store, so the button drops out until this one settles.
      button.disabled = true
      say('waiting for your passkey.')
      try {
        await login()
      } catch (err) {
        say(`no luck: ${err.message || err.name}`, true)
      } finally {
        button.disabled = false
      }
    })
    login().catch((err) => {
      button.hidden = false
      if (err.name === 'NotAllowedError') {
        // Dismissed, timed out, or the browser wanted a user gesture.
        say('passkey, whenever you are ready.')
      } else {
        say(`no luck: ${err.message || err.name}`, true)
      }
    })
  } else {
    const form = document.getElementById('claim')
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const code = document.getElementById('code').value.trim()
      if (!code) return
      say('creating your passkey.')
      try {
        await register(code)
      } catch (err) {
        say(`no luck: ${err.message || err.name}`, true)
      }
    })
  }
})()
