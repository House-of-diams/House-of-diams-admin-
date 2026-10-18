import 'server-only'
import { createHmac } from 'node:crypto'
import type { AuthDependencies, Flow, Session } from './session'
import { createSessions } from './session'
import { assertMutation, assertSameOrigin, cookieValue, equalSecret, FLOW_COOKIE, NO_STORE, safeReturnPath, secureCookie, SESSION_COOKIE } from './request-security'

/** Web-standard handlers allow complete protocol tests without a listener. */
export function createAuthHandlers(deps: AuthDependencies) {
  const { config, store, oidc } = deps
  const sessions = createSessions(deps)
  const now = () => Math.floor((deps.now ?? Date.now)() / 1000)
  const response = (value: unknown, status = 200) => Response.json(value, { status, headers: NO_STORE })
  const redirect = (location: string) => new Response(null, { status: 303, headers: { ...NO_STORE, Location: location } })
  const logoutProof = (session: Session) => createHmac('sha256', session.csrf).update('hod-admin:local-logout:v1').digest('base64url')
  const assertLogout = (request: Request, session: Session) => {
    if (request.headers.has('x-admin-logout-csrf')) {
      assertSameOrigin(request, config.origin)
      if (request.method !== 'POST' || !equalSecret(request.headers.get('x-admin-logout-csrf') ?? '', logoutProof(session))) throw new Error('Invalid logout proof')
    } else assertMutation(request, config.origin, session.csrf)
  }
  return {
    async login(request: Request) {
      try {
        if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405)
        assertSameOrigin(request, config.origin)
        const path = safeReturnPath(new URL(request.url).searchParams.get('returnTo'))
        const { cookie, flow } = await sessions.begin(path)
        const result = redirect(oidc.authorizationUrl(flow.state, flow.nonce, flow.verifier))
        result.headers.append('Set-Cookie', secureCookie(FLOW_COOKIE, cookie, 300))
        return result
      } catch { return response({ error: 'Authentication unavailable' }, 503) }
    },
    async callback(request: Request) {
      const clear = (result: Response) => { result.headers.append('Set-Cookie', secureCookie(FLOW_COOKIE, '', 0)); return result }
      try {
        const url = new URL(request.url)
        if (request.method !== 'GET' || url.origin !== config.origin) throw new Error('Invalid callback')
        const cookie = cookieValue(request, FLOW_COOKIE)
        if (!cookie) throw new Error('Flow missing')
        const key = sessions.flowKey(cookie)
        const stored = await store.get<Flow>(key)
        const state = url.searchParams.getAll('state'), code = url.searchParams.getAll('code')
        if (!stored || stored.data.expiresAt <= now() || state.length !== 1 || !equalSecret(state[0], stored.data.state)) throw new Error('Invalid state')
        const flow = await store.consume<Flow>(key, stored.version)
        if (!flow || url.searchParams.has('error') || code.length !== 1 || !code[0] || code[0].length > 4096
          || (url.searchParams.has('iss') && (url.searchParams.getAll('iss').length !== 1 || url.searchParams.get('iss') !== config.issuer))) throw new Error('Invalid code')
        const tokens = await oidc.exchange(code[0], flow.verifier)
        const { cookie: sessionCookie } = await sessions.establish(tokens, flow.nonce)
        // Delete any previous browser session only after the new login has succeeded.
        const previous = cookieValue(request, SESSION_COOKIE)
        if (previous) await store.delete(sessions.sessionKey(previous))
        const result = redirect(`${config.origin}${safeReturnPath(flow.returnPath)}`)
        result.headers.append('Set-Cookie', secureCookie(SESSION_COOKIE, sessionCookie, config.sessionMaxSeconds))
        return clear(result)
      } catch { return clear(response({ error: 'Login failed' }, 401)) }
    },
    async session(request: Request) {
      try {
        if (request.method !== 'GET' || new URL(request.url).origin !== config.origin) return response({ error: 'Unauthorized' }, 401)
        const { actor, csrf } = await sessions.authorize(request)
        return response({ authenticated: true, actor: { profileId: actor.profileId }, csrfToken: csrf })
      } catch { return response({ error: 'Unauthorized' }, 401) }
    },
    /** Deletion-only proof: no mapping/refresh, identity, bearer token or business CSRF. */
    async logoutChallenge(request: Request) {
      try {
        assertSameOrigin(request, config.origin)
        if (request.method !== 'POST' || request.headers.get('x-admin-logout-intent') !== 'local-signout') throw new Error('Invalid intent')
        const cookie = cookieValue(request, SESSION_COOKIE)
        if (!cookie) throw new Error('Session missing')
        const stored = await store.get<Session>(sessions.sessionKey(cookie))
        if (!stored) throw new Error('Session missing')
        return response({ logoutCsrfToken: logoutProof(stored.data) })
      } catch { return response({ error: 'Logout recovery unavailable' }, 403) }
    },
    async logout(request: Request) {
      try {
        const cookie = cookieValue(request, SESSION_COOKIE)
        if (!cookie) throw new Error('Session missing')
        const key = sessions.sessionKey(cookie)
        const stored = await store.get<Session>(key)
        if (!stored) throw new Error('Session missing')
        assertLogout(request, stored.data)
        // Atomic deletion first: upstream failure never retains local authorization.
        let current: { version: string; data: Session } | null = stored
        let removed: Session | null = null
        for (let attempt = 0; attempt < 8 && current; attempt++) {
          // Same opaque key + same CSRF only. Re-read after an idle/refresh CAS;
          // consume is still atomic and can never resurrect a removed session.
          assertLogout(request, current.data)
          removed = await store.consume<Session>(key, current.version)
          if (removed) break
          current = await store.get<Session>(key)
        }
        if (!removed) throw new Error('Concurrent logout')
        let upstreamLogout = true
        try { await oidc.logout(removed.tokens.refreshToken) } catch { upstreamLogout = false }
        const result = response({ authenticated: false, upstreamLogout }, upstreamLogout ? 200 : 502)
        result.headers.append('Set-Cookie', secureCookie(SESSION_COOKIE, '', 0))
        result.headers.append('Set-Cookie', secureCookie(FLOW_COOKIE, '', 0))
        return result
      } catch { return response({ error: 'Logout denied' }, 403) }
    },
  }
}
