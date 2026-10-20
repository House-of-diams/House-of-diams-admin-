import 'server-only'
import type { AdminActor, AdminIdentityPolicy, AdminIdentityRecord, VerifiedAdminSession } from './admin-identity-core'
import { authorizeMappedAdmin } from './admin-identity-core'
import type { AuthConfig } from './config'
import type { KeycloakAdapter, TokenSet } from './keycloak'
import { digest, randomSecret } from './keycloak'
import { assertMutation, cookieValue, SESSION_COOKIE } from './request-security'

export type Flow = { state: string; nonce: string; verifier: string; returnPath: string; expiresAt: number }
export type Session = {
  claims: VerifiedAdminSession; tokens: TokenSet; csrf: string
  createdAt: number; lastSeen: number; checkedAt: number; expiresAt: number; refreshing: boolean
  /** When the current refresh claim was taken; a claim older than REFRESH_STALE_SECONDS is abandoned. */
  refreshStartedAt?: number
}
export type Stored<T> = { version: string; data: T }
/** All mutations MUST be atomic across instances. CAS must never recreate a deleted key.
 * Implementations encrypt token/verifier data and bound TTL. No live memory adapter is allowed.
 */
export interface SessionStore {
  create<T>(key: string, data: T, ttlSeconds: number): Promise<boolean>
  get<T>(key: string): Promise<Stored<T> | null>
  consume<T>(key: string, version: string): Promise<T | null>
  replace<T>(key: string, version: string, data: T, ttlSeconds: number): Promise<boolean>
  delete(key: string): Promise<void>
}
export type IdentityLookup = (issuer: string, subject: string) => Promise<readonly AdminIdentityRecord[]>
export type AuthDependencies = { config: AuthConfig; store: SessionStore; oidc: KeycloakAdapter; lookup: IdentityLookup; now?: () => number; sleep?: (ms: number) => Promise<void> }

// HOD-022: a request that meets another request's token refresh waits for it
// (up to REFRESH_WAIT_ROUNDS x REFRESH_WAIT_MS) instead of failing; a refresh claim
// left by a crashed request is taken over after REFRESH_STALE_SECONDS.
const REFRESH_WAIT_MS = 150
const REFRESH_WAIT_ROUNDS = 20
const REFRESH_STALE_SECONDS = 30
const RETRY = Symbol('retry')

export function createSessions(deps: AuthDependencies) {
  const { config, store, oidc, lookup } = deps
  const now = () => Math.floor((deps.now ?? Date.now)() / 1000)
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const policy: AdminIdentityPolicy = config
  const sessionKey = (cookie: string) => `session:${digest(cookie)}`
  const flowKey = (cookie: string) => `flow:${digest(cookie)}`
  const ttl = (s: Session) => Math.max(0, Math.min(s.expiresAt - now(), config.sessionIdleSeconds))
  async function mapped(claims: VerifiedAdminSession): Promise<AdminActor> {
    const actor = authorizeMappedAdmin(claims, await lookup(claims.issuer, claims.subject), policy, now())
    if (!actor) throw new Error('Admin identity denied')
    return actor
  }
  async function attempt(request: Request, mutation: boolean, key: string): Promise<{ actor: AdminActor; csrf: string } | typeof RETRY> {
    const stored = await store.get<Session>(key)
    if (!stored) throw new Error('Session missing')
    let session = stored.data
    if (mutation) assertMutation(request, config.origin, session.csrf)
    const abandoned = session.refreshing && (session.refreshStartedAt === undefined || session.refreshStartedAt + REFRESH_STALE_SECONDS <= now())
    if (session.refreshing && !abandoned) return RETRY
    if (session.expiresAt <= now() || session.lastSeen + config.sessionIdleSeconds <= now()) {
      await store.consume(key, stored.version)
      throw new Error('Session expired')
    }
    // Refresh is claimed through distributed CAS before using a rotating token, no retries.
    if (abandoned || session.claims.expiresAt <= now() + 15 || session.checkedAt + config.revalidateSeconds <= now()) {
      const claimed = { ...session, refreshing: true, refreshStartedAt: now() }
      // Losing the claim means another request is refreshing: wait for its result.
      if (!await store.replace(key, stored.version, claimed, ttl(session))) return RETRY
      const current = await store.get<Session>(key)
      if (!current || !current.data.refreshing) throw new Error('Session revoked')
      try {
        const tokens = await oidc.refresh(session.tokens.refreshToken)
        // Refresh responses must supply a freshly signed ID token and rotated refresh token.
        if (tokens.refreshToken === session.tokens.refreshToken) throw new Error('Refresh rotation missing')
        const claims = await oidc.validate(tokens, undefined, session.claims.subject)
        await mapped(claims)
        session = { ...session, tokens, claims, checkedAt: now(), lastSeen: now(), refreshing: false, refreshStartedAt: undefined }
        if (ttl(session) <= 0 || !await store.replace(key, current.version, session, ttl(session))) throw new Error('Session revoked')
      } catch {
        await store.consume(key, current.version)
        throw new Error('Refresh failed')
      }
    }
    const boundedClaims = { ...session.claims, expiresAt: Math.min(session.claims.expiresAt, session.expiresAt) }
    const actor = await mapped(boundedClaims)
    // HOD-066 fast path: with no refresh in this request, a CAS on the version first
    // read proves nothing changed meanwhile (no logout, refresh or CSRF change), so the
    // re-read below is skipped. Any change fails the CAS and falls through to it.
    if (session === stored.data && session.claims.expiresAt > now() && session.lastSeen + config.sessionIdleSeconds > now() && ttl(session) > 0
      && await store.replace(key, stored.version, { ...session, lastSeen: now() }, ttl(session))) return { actor, csrf: session.csrf }
    // Sliding idle TTL and final CAS also detect logout during lookup; never restore a deleted session.
    for (let attempt = 0; attempt < 8; attempt++) {
      const latest = await store.get<Session>(key)
      if (!latest || latest.data.csrf !== session.csrf) throw new Error('Session revoked')
      // Another request refreshed (or is refreshing) meanwhile: start over on its record.
      if (latest.data.refreshing || latest.data.tokens.accessToken !== session.tokens.accessToken) return RETRY
      if (session.claims.expiresAt <= now() || latest.data.lastSeen + config.sessionIdleSeconds <= now() || ttl(session) <= 0) throw new Error('Session expired')
      // Retry metadata CAS only. No OIDC refresh or business mutation is replayed.
      // Every attempt rechecks identity so a competing metadata update cannot mask revocation.
      const currentActor = attempt === 0 ? actor : await mapped(boundedClaims)
      if (await store.replace(key, latest.version, { ...latest.data, lastSeen: now() }, ttl(session))) return { actor: currentActor, csrf: session.csrf }
    }
    throw new Error('Concurrent session update')
  }
  return {
    flowKey, sessionKey, mapped,
    async begin(returnPath: string) {
      const cookie = randomSecret()
      const flow: Flow = { state: randomSecret(), nonce: randomSecret(), verifier: randomSecret(), returnPath, expiresAt: now() + 300 }
      if (!await store.create(flowKey(cookie), flow, 300)) throw new Error('Flow storage failed')
      return { cookie, flow }
    },
    async establish(tokens: TokenSet, nonce: string) {
      const claims = await oidc.validate(tokens, nonce)
      await mapped(claims)
      const seconds = now()
      if (claims.expiresAt <= seconds) throw new Error('Expired session')
      const session: Session = { claims, tokens, csrf: randomSecret(), createdAt: seconds, lastSeen: seconds,
        checkedAt: seconds, expiresAt: seconds + config.sessionMaxSeconds, refreshing: false }
      const cookie = randomSecret()
      if (!await store.create(sessionKey(cookie), session, ttl(session))) throw new Error('Session storage failed')
      return { cookie, session }
    },
    async authorize(request: Request, mutation = false) {
      const cookie = cookieValue(request, SESSION_COOKIE)
      if (!cookie) throw new Error('Session missing')
      const key = sessionKey(cookie)
      for (let round = 0; ; round++) {
        const result = await attempt(request, mutation, key)
        if (result !== RETRY) return result
        if (round >= REFRESH_WAIT_ROUNDS) throw new Error('Refresh in progress')
        await sleep(REFRESH_WAIT_MS)
      }
    },
  }
}
