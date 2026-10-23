import 'server-only'
import { readAdminAuthProvider } from './auth/integration'
export function readOperationsProvider(env: Record<string, string | undefined>): 'rds' {
  readAdminAuthProvider(env)
  if (env.ADMIN_OPERATIONS_DATA_PROVIDER !== 'rds') throw new Error('Invalid operations provider')
  return 'rds'
}
