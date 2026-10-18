import 'server-only'
import { readAdminAuthProvider } from './auth/integration'
export function readOperationsProvider(env: Record<string, string | undefined>): 'supabase' | 'rds' {
  readAdminAuthProvider(env)
  const value = env.ADMIN_OPERATIONS_DATA_PROVIDER
  if (!value || value === 'supabase') return 'supabase'
  if (value === 'rds') return 'rds'
  throw new Error('Invalid operations provider')
}
