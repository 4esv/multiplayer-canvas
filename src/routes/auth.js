// /login and the passkey API. One passkey, one user; see services/auth.js
// for the claim lifecycle. The page is reachable by direct URL only: no nav
// link, no sitemap entry, no OG card, robots noindex.
//
// WebAuthn does the heavy lifting: ceremonies are origin-bound and
// challenge-bound, so the API here only adds the setup-code gate (while
// unclaimed), one-time challenges, and the session cookie.

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'

import { renderPage } from '../lib/render.js'
import { fail } from '../lib/api-errors.js'
import { audit } from '../services/audit.js'
import {
  OWNER_HINT,
  SESSION_COOKIE,
  requestOrigin,
  requestRpId,
  guard,
  requireAuth,
  safeNext,
  sameOrigin,
  sessionFromRequest,
} from '../middleware/auth.js'
import {
  SESSION_TTL_MS,
  consumeChallenge,
  createSession,
  destroyOtherSessions,
  destroySession,
  destroySessionById,
  ensureSetupCode,
  getCredential,
  isClaimed,
  rememberChallenge,
  saveCredential,
  sessionId,
  updateCredentialCounter,
  verifySetupCode,
} from '../services/auth.js'

import config from '../config.js'
const SITE_URL = config.site.url
const SITE_NAME = config.site.name

const RP_NAME = SITE_NAME
// Stable user handle: Apple Passwords keys passkeys on rpId + userHandle, so
// re-claiming after a reset updates the saved passkey instead of stacking a
// second entry for the same owner.
const USER_ID = Buffer.from(`${new URL(SITE_URL).host}:owner`)

// Global counters, not per-IP. One user lives here; an attacker tripping the
// limit locks the door for a window, which beats letting them spend our
// crypto and memory. request.ip is the client now (server.js trustProxy),
// so a keyed limiter is possible if one is ever needed.
function makeThrottle(limit, windowMs) {
  const state = { count: 0, resetAt: 0 }
  return function allowed() {
    const now = Date.now()
    if (now > state.resetAt) {
      state.count = 0
      state.resetAt = now + windowMs
    }
    state.count += 1
    return state.count <= limit
  }
}

// The setup code is high-entropy, but there's no reason to let anyone grind
// at it: registration is a once-in-years event.
const codeAttemptAllowed = makeThrottle(10, 60 * 60 * 1000)
// Login ceremonies (options + verify) do server-side crypto and mint
// challenges for any unauthenticated caller. One person retrying on their
// own devices stays far under this.
const loginAttemptAllowed = makeThrottle(20, 60 * 1000)

// The session cookie is host-only.
//
// THE OWNER HINT rides every set and every clear of the session. The session
// cookie is HttpOnly, so the canvas cannot tell that its owner is signed in;
// the hint is the one bit it can read, NOT HttpOnly and carrying no
// authority: it names no session, opens nothing, and a guest who forges it
// buys one /api/whoami that answers 401 and a page that wipes it again. It
// only tells the bar that the question is worth asking (canvas/commands.js).
// Same lifetime and the same scope as the session, so the two are born,
// re-issued and cleared together. Every place that signs someone in comes
// through here: the claim, a login, the /login re-issue and the dev session.
function setSessionCookie(reply, request, token) {
  const secure = requestOrigin(request).startsWith('https://') ? '; Secure' : ''
  const tail = `Max-Age=${SESSION_TTL_MS / 1000}${secure}`
  reply.header('set-cookie', [
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; ${tail}`,
    `${OWNER_HINT}=1; Path=/; SameSite=Lax; ${tail}`,
  ])
}

function clearSessionCookie(reply, request) {
  const secure = requestOrigin(request).startsWith('https://') ? '; Secure' : ''
  reply.header('set-cookie', [
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    `${OWNER_HINT}=; Path=/; SameSite=Lax; Max-Age=0${secure}`,
  ])
}

// The challenge the browser actually signed, pulled from clientDataJSON.
// consumeChallenge() is the real check (it must be one we minted, unexpired,
// never seen twice); verify*Response then binds the rest of the ceremony to it.
function challengeFromResponse(body) {
  try {
    const clientData = JSON.parse(
      Buffer.from(body.response.clientDataJSON, 'base64url').toString('utf-8')
    )
    return typeof clientData.challenge === 'string' ? clientData.challenge : null
  } catch {
    return null
  }
}

export async function registerAuthRoutes(fastify) {
  // Who is calling: the canvas asks once, when the owner hint is set, before
  // it turns the owner's commands on (canvas/commands.js ownerFrom).
  fastify.get('/api/whoami', { preHandler: requireAuth }, async (request) => ({
    actor: request.actor,
  }))

  fastify.get('/login', async (request, reply) => {
    reply.header('cache-control', 'private, no-store')
    reply.header('x-robots-tag', 'noindex, nofollow')
    const next = safeNext(request.query?.next)
    const token = await sessionFromRequest(request)
    if (token) {
      // Re-issue the presented token before bouncing, so the owner hint
      // is set again beside it if it was cleared on its own.
      setSessionCookie(reply, request, token)
      return reply.redirect(next)
    }
    const claimed = await isClaimed()
    if (!claimed) await ensureSetupCode()
    return renderPage(fastify, request, reply, 'login/index.njk', {
      claimed,
      next,
      meta: {
        title: `key · ${SITE_NAME}`,
        description: 'Private door.',
        canonical: `${SITE_URL}/login`,
        robots: 'noindex, nofollow',
      },
    })
  })

  fastify.post('/api/auth/register/options', async (request, reply) => {
    if (!sameOrigin(request)) return fail(reply, 403, 'origin')
    if (await isClaimed()) return fail(reply, 403, 'claimed')
    if (!codeAttemptAllowed()) return fail(reply, 429, 'rate', 'slow down')
    if (!(await verifySetupCode(request.body?.code))) {
      // The ceremony's outcome is recorded on /verify; a wrong setup code
      // is recorded here because this is where a guess meets the door.
      await audit(request, 'auth.register', { outcome: 'bad-code' })
      return fail(reply, 403, 'setup', 'bad setup code')
    }
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: requestRpId(request),
      userName: 'owner',
      userID: USER_ID,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    })
    rememberChallenge(options.challenge)
    return options
  })

  fastify.post('/api/auth/register/verify', async (request, reply) => {
    if (!sameOrigin(request)) return fail(reply, 403, 'origin')
    if (await isClaimed()) return fail(reply, 403, 'claimed')
    if (!codeAttemptAllowed()) return fail(reply, 429, 'rate', 'slow down')
    if (!(await verifySetupCode(request.body?.code))) {
      await audit(request, 'auth.register', { outcome: 'bad-code' })
      return fail(reply, 403, 'setup', 'bad setup code')
    }
    const response = request.body?.response
    const challenge = response ? challengeFromResponse(response) : null
    if (!challenge || !consumeChallenge(challenge)) {
      await audit(request, 'auth.register', { outcome: 'stale' })
      return fail(reply, 400, 'challenge', 'stale challenge')
    }
    let verification
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: requestOrigin(request),
        expectedRPID: requestRpId(request),
        requireUserVerification: true,
      })
    } catch (err) {
      request.log?.warn({ err }, 'passkey registration failed')
      await audit(request, 'auth.register', { outcome: 'bad' })
      return fail(reply, 400, 'verification', 'verification failed')
    }
    if (!verification.verified || !verification.registrationInfo) {
      await audit(request, 'auth.register', { outcome: 'bad' })
      return fail(reply, 400, 'verification', 'verification failed')
    }
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
    await saveCredential({
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports || [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      createdAt: new Date().toISOString(),
    })
    const token = await createSession(request.headers['user-agent'])
    setSessionCookie(reply, request, token)
    await audit(request, 'auth.register', {
      actor: { kind: 'session', id: await sessionId(token) },
      credential: credential.id,
      deviceType: credentialDeviceType,
    })
    return { ok: true }
  })

  fastify.post('/api/auth/login/options', async (request, reply) => {
    // audit-ok: mints a challenge for any caller; the ceremony's outcome is
    // recorded on /verify, and a flood here is the throttle's business.
    if (!sameOrigin(request)) return fail(reply, 403, 'origin')
    if (!loginAttemptAllowed()) return fail(reply, 429, 'rate', 'slow down')
    const credential = await getCredential()
    if (!credential) return fail(reply, 409, 'unclaimed')
    const options = await generateAuthenticationOptions({
      rpID: requestRpId(request),
      allowCredentials: [{ id: credential.id, transports: credential.transports }],
      userVerification: 'required',
    })
    rememberChallenge(options.challenge)
    return options
  })

  fastify.post('/api/auth/login/verify', async (request, reply) => {
    if (!sameOrigin(request)) return fail(reply, 403, 'origin')
    if (!loginAttemptAllowed()) return fail(reply, 429, 'rate', 'slow down')
    const credential = await getCredential()
    if (!credential) return fail(reply, 409, 'unclaimed')
    const response = request.body?.response
    const challenge = response ? challengeFromResponse(response) : null
    if (!challenge || !consumeChallenge(challenge)) {
      await audit(request, 'auth.login', { outcome: 'stale' })
      return fail(reply, 400, 'challenge', 'stale challenge')
    }
    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: requestOrigin(request),
        expectedRPID: requestRpId(request),
        credential: {
          id: credential.id,
          publicKey: Buffer.from(credential.publicKey, 'base64url'),
          counter: credential.counter,
          transports: credential.transports,
        },
        requireUserVerification: true,
      })
    } catch (err) {
      request.log?.warn({ err }, 'passkey login failed')
      await audit(request, 'auth.login', { outcome: 'bad' })
      return fail(reply, 400, 'verification', 'verification failed')
    }
    if (!verification.verified) {
      await audit(request, 'auth.login', { outcome: 'bad' })
      return fail(reply, 400, 'verification', 'verification failed')
    }
    await updateCredentialCounter(verification.authenticationInfo.newCounter)
    const token = await createSession(request.headers['user-agent'])
    setSessionCookie(reply, request, token)
    await audit(request, 'auth.login', { actor: { kind: 'session', id: await sessionId(token) } })
    return { ok: true }
  })

  fastify.post('/api/auth/logout', async (request, reply) => {
    if (!sameOrigin(request)) return fail(reply, 403, 'origin')
    const token = await sessionFromRequest(request)
    // Recorded before the session goes, so the line still names it.
    await audit(request, 'auth.logout', { outcome: token ? 'ok' : 'missing' })
    if (token) await destroySession(token)
    clearSessionCookie(reply, request)
    return { ok: true }
  })

  // Revoke one session from the dashboard's list (a lost phone, a shared
  // machine). Behind the session gate itself, and same-origin: a page fetch,
  // never a cross-site form.
  fastify.delete(
    '/api/auth/sessions/:id',
    { preHandler: guard('sessions') },
    async (request, reply) => {
      const gone = await destroySessionById(request.params.id)
      await audit(request, 'auth.session.revoke', {
        target: request.params.id,
        outcome: gone ? 'ok' : 'missing',
      })
      if (!gone) return fail(reply, 404, 'notfound', 'no such session')
      return { ok: true }
    }
  )

  // Every session but this one.
  fastify.delete('/api/auth/sessions', { preHandler: guard('sessions') }, async (request) => {
    const gone = await destroyOtherSessions(await sessionFromRequest(request))
    await audit(request, 'auth.session.revoke-others', { gone })
    return { ok: true, gone }
  })

  // Dev-only: mint a session without a ceremony so local tooling (and the
  // Chrome extension driving visual checks) can reach the private pages.
  // Double-gated: development env AND a loopback peer. Never registered in
  // production builds of the config.
  if (fastify.config.env === 'development') {
    fastify.get('/api/auth/dev-session', async (request, reply) => {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip)) {
        return fail(reply, 403, 'loopback', 'loopback only')
      }
      const token = await createSession('dev-session')
      setSessionCookie(reply, request, token)
      await audit(request, 'auth.dev-session', {
        actor: { kind: 'session', id: await sessionId(token) },
      })
      return reply.redirect('/admin')
    })
  }
}
