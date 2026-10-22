import 'server-only'
import { readAuthConfig } from './auth/config'
import { createKeycloak } from './auth/keycloak'
import { createSessionStore } from './auth/session-store'
import { createSessions } from './auth/session'
import { lookupAdminIdentity } from './db/admin-repositories/identity'
import { ProductSessionError } from './product-session-error'

let sessions: ReturnType<typeof createSessions> | undefined
/** Scoped composition of the real B1 session and B2 identity adapters; no alternate actor path. */
export async function authorizeProductRequest(request: Request, mutation = false) {
  try {
    if (!sessions) {
      const config = readAuthConfig()
      sessions = createSessions({ config, oidc: createKeycloak(config), store: createSessionStore(), lookup: lookupAdminIdentity })
    }
  } catch { throw new ProductSessionError(503) }
  for (let attempt = 0; ; attempt++) {
    try { return await sessions.authorize(request, mutation) }
    catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (['Session missing', 'Session expired', 'Expired session', 'Session revoked'].includes(message)) throw new ProductSessionError(401)
      if (['Invalid origin', 'Invalid CSRF', 'Invalid method', 'Admin identity denied'].includes(message)) throw new ProductSessionError(403)
      // The identity provider refused the refresh: the session is already removed, so the person must sign in again (not a service outage).
      if (message === 'Refresh failed') throw new ProductSessionError(401)
      // Another request is refreshing the same session, or a parallel update collided: wait and look again before giving up.
      if (['Refresh in progress', 'Concurrent session update', 'Refresh unavailable'].includes(message) && attempt < 2) {
        await new Promise<void>((resolve) => setTimeout(resolve, 600 * (attempt + 1)))
        continue
      }
      // Server log only (never sent to the browser): which session step failed, to tell Keycloak, Redis and identity problems apart.
      console.error('[admin-session]', JSON.stringify({ mutation, reason: message || 'unknown' }))
      throw new ProductSessionError(503)
    }
  }
}
