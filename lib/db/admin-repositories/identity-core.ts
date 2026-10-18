import type { AdminIdentityRecord } from '../../auth/admin-identity-core.ts'
import type { DbExecutor } from '../query.ts'
export const identityLookupSql = 'SELECT issuer, subject, profile_id, enabled, revoked_at, profile_role FROM public.admin_identity_lookup_v1($1::text, $2::text)'
export function createAdminIdentityLookup(db: DbExecutor) {
  return async (issuer: string, subject: string): Promise<readonly AdminIdentityRecord[]> => {
    if (!issuer || !subject) return []
    const { rows } = await db.query(identityLookupSql, [issuer, subject])
    return rows.map(row => ({ issuer: row.issuer, subject: row.subject, profileId: row.profile_id,
      enabled: row.enabled, revokedAt: row.revoked_at instanceof Date ? row.revoked_at.toISOString() : row.revoked_at,
      profileRole: row.profile_role }))
  }
}
