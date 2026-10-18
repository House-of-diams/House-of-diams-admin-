import { readAdminAuthProvider } from './auth/integration'

export type ProductDataProvider = 'supabase' | 'rds'

/** Server chooses this once per request; never use a NEXT_PUBLIC activation flag. */
export function readProductDataProvider(env: Record<string, string | undefined>): ProductDataProvider {
  readAdminAuthProvider(env)
  const value = env.ADMIN_PRODUCT_DATA_PROVIDER
  if (value === undefined || value === '' || value === 'supabase') return 'supabase'
  if (value === 'rds') return 'rds'
  throw new Error('Product provider configuration unavailable')
}
