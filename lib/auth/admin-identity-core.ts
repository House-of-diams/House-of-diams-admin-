/** Server authorization policy; accepts only claims from a validated OIDC session.
 * This does not verify JWTs. Never pass decoded tokens or request JSON here.
 */
export type VerifiedAdminSession = {
  issuer: string
  subject: string
  audiences: readonly string[]
  clientId: string
  clientRoles: readonly string[]
  expiresAt: number // Unix seconds; bounded by both token and server session expiry.
}

export type AdminIdentityPolicy = {
  issuer: string
  clientId: string
  requiredClientRole: string
}

export type AdminIdentityRecord = {
  issuer: string
  subject: string
  profileId: string
  enabled: boolean // Mapping state: profiles currently has no enabled column.
  revokedAt: string | null
  profileRole: string
}

export type AdminActor = Readonly<{ profileId: string; issuer: string; subject: string }>

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function hasValidAdminSession(
  session: VerifiedAdminSession | null,
  policy: AdminIdentityPolicy,
  nowSeconds: number,
): session is VerifiedAdminSession {
  return Boolean(session && policy.issuer && policy.clientId && policy.requiredClientRole
    && Number.isFinite(nowSeconds) && Number.isFinite(session.expiresAt)
    && session.expiresAt > nowSeconds && session.subject.length > 0
    && session.issuer === policy.issuer && session.clientId === policy.clientId
    && session.audiences.includes(policy.clientId)
    && session.clientRoles.includes(policy.requiredClientRole))
}

export function authorizeMappedAdmin(
  session: VerifiedAdminSession | null,
  identities: readonly AdminIdentityRecord[],
  policy: AdminIdentityPolicy,
  nowSeconds: number,
): AdminActor | null {
  if (!hasValidAdminSession(session, policy, nowSeconds) || identities.length !== 1) return null
  const mapping = identities[0]
  if (mapping.issuer !== session.issuer || mapping.subject !== session.subject
    || mapping.enabled !== true || mapping.revokedAt !== null
    || mapping.profileRole !== 'admin' || !uuid.test(mapping.profileId)) return null
  return Object.freeze({ profileId: mapping.profileId, issuer: mapping.issuer, subject: mapping.subject })
}
