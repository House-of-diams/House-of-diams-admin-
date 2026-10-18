import 'server-only'
import { readAdminAuthProvider } from './auth/integration'

export function readCatalogDataProvider(env: Record<string, string | undefined>): 'supabase' | 'rds' {
  readAdminAuthProvider(env)
  const value = env.ADMIN_CATALOG_DATA_PROVIDER
  if (value === undefined || value === '' || value === 'supabase') return 'supabase'
  if (value === 'rds') return 'rds'
  throw new Error('Invalid catalog provider')
}
