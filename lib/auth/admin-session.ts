import 'server-only'
import { readAdminAuthProvider } from './integration'
import type { authorizeProductPage } from '../product-server-request'

export type AdminServerSession = { userId: string; email: string | null; role: string }

/** No fabricated Supabase user: only the mapped internal profile UUID crosses this boundary. */
export async function resolveAdminServerSession(deps: {
  provider: typeof readAdminAuthProvider
  authorize: typeof authorizeProductPage
  legacy: () => Promise<AdminServerSession | null>
}): Promise<AdminServerSession | null> {
  if (deps.provider() === 'supabase') return deps.legacy()
  const { actor } = await deps.authorize()
  return { userId: actor.profileId, email: null, role: 'admin' }
}
