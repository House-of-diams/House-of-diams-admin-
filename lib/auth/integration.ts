import 'server-only'

export type AdminAuthProvider = 'supabase' | 'keycloak'

/** Global UI/gate selection does not activate any data or media provider. */
export function readAdminAuthProvider(env: Record<string, string | undefined> = process.env): AdminAuthProvider {
  const value = env.ADMIN_AUTH_PROVIDER
  if (value === undefined || value === '' || value === 'supabase') return 'supabase'
  if (value !== 'keycloak') throw new Error('Admin integration unavailable')
  for (const name of ['ADMIN_PRODUCT_DATA_PROVIDER', 'ADMIN_CATALOG_DATA_PROVIDER', 'ADMIN_CMS_DATA_PROVIDER', 'ADMIN_OPERATIONS_DATA_PROVIDER']) {
    if (env[name] !== 'rds') throw new Error('Admin integration requires migrated data providers')
  }
  for (const name of ['ADMIN_IMAGE_PROVIDER', 'ADMIN_VIDEO_PROVIDER']) {
    if (env[name] !== 'aws') throw new Error('Admin integration requires migrated media providers')
  }
  return 'keycloak'
}

export function assertLegacyAdminAuth() {
  if (readAdminAuthProvider() !== 'supabase') throw new Error('Legacy admin authentication disabled')
}
