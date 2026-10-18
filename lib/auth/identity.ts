import 'server-only'
import { authorizeMappedAdmin, hasValidAdminSession } from './admin-identity-core'
import type { AdminActor, AdminIdentityPolicy, AdminIdentityRecord, VerifiedAdminSession } from './admin-identity-core'

export type IdentityLookup = (issuer: string, subject: string) => Promise<readonly AdminIdentityRecord[]>

/** RDS adapter calls the scoped identity projection with issuer/subject parameters.
 * No email enrollment, customer fallback, or request-supplied actor is permitted.
 * Database errors propagate: callers must return a generic failure, never authorize.
 */
export async function resolveAdminActor(
  session: VerifiedAdminSession | null,
  policy: AdminIdentityPolicy,
  lookup: IdentityLookup,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AdminActor | null> {
  if (!hasValidAdminSession(session, policy, nowSeconds)) return null
  const identities = await lookup(session.issuer, session.subject)
  // Recheck expiry after database access, including delayed queries.
  return authorizeMappedAdmin(session, identities, policy, Math.max(nowSeconds, Math.floor(Date.now() / 1000)))
}
