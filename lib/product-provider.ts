import { readAdminAuthProvider } from './auth/integration'

export type ProductDataProvider = 'rds'

/** Server chooses this once per request; never use a NEXT_PUBLIC activation flag. */
export function readProductDataProvider(env: Record<string, string | undefined>): ProductDataProvider {
  readAdminAuthProvider(env)
  if (env.ADMIN_PRODUCT_DATA_PROVIDER !== 'rds') throw new Error('Product provider configuration unavailable')
  return 'rds'
}
