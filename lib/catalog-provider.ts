import 'server-only'
import { readAdminAuthProvider } from './auth/integration'

export function readCatalogDataProvider(env: Record<string, string | undefined>): 'rds' {
  readAdminAuthProvider(env)
  if (env.ADMIN_CATALOG_DATA_PROVIDER !== 'rds') throw new Error('Invalid catalog provider')
  return 'rds'
}
