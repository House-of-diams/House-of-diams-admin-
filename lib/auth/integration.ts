import 'server-only'

export type AdminAuthProvider = 'keycloak'

/** Global UI/gate selection does not activate any data or media provider. */
export function readAdminAuthProvider(env: Record<string, string | undefined> = process.env): AdminAuthProvider {
  // HOD-018: the admin signs in through Keycloak only; there is no legacy login and no default.
  if (env.ADMIN_AUTH_PROVIDER !== 'keycloak') throw new Error('Admin integration unavailable')
  for (const name of ['ADMIN_PRODUCT_DATA_PROVIDER', 'ADMIN_CATALOG_DATA_PROVIDER', 'ADMIN_CMS_DATA_PROVIDER', 'ADMIN_OPERATIONS_DATA_PROVIDER']) {
    if (env[name] !== 'rds') throw new Error('Admin integration requires migrated data providers')
  }
  for (const name of ['ADMIN_IMAGE_PROVIDER', 'ADMIN_VIDEO_PROVIDER']) {
    if (env[name] !== 'aws') throw new Error('Admin integration requires migrated media providers')
  }
  return 'keycloak'
}
