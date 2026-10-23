import 'server-only'
import { readAdminAuthProvider } from './auth/integration'
export function readCmsDataProvider(env: Record<string, string | undefined>): 'rds' {
  readAdminAuthProvider(env)
  if (env.ADMIN_CMS_DATA_PROVIDER !== 'rds') throw new Error('Invalid CMS provider')
  return 'rds'
}
