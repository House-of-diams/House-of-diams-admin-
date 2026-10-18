import LegacyLogin from './legacy-login'
import { readAdminAuthProvider } from '@/lib/auth/integration'
import { KeycloakLogin } from './keycloak-login'

export const dynamic = 'force-dynamic'
export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ logout?: string | string[] }> }) {
  let provider: 'supabase' | 'keycloak'
  try { provider = readAdminAuthProvider() }
  catch { return <main className="p-8" role="alert">Admin authentication is unavailable. Contact your administrator.</main> }
  return provider === 'supabase' ? <LegacyLogin /> : <KeycloakLogin upstreamPending={(await searchParams)?.logout === 'upstream-pending'} />
}
