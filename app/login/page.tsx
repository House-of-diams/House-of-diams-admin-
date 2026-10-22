import LegacyLogin from './legacy-login'
import { readAdminAuthProvider } from '@/lib/auth/integration'
import { KeycloakLogin } from './keycloak-login'
import { autoLoginAllowed } from '@/lib/auto-login'

export const dynamic = 'force-dynamic'
export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ logout?: string | string[]; error?: string | string[] }> }) {
  let provider: 'supabase' | 'keycloak'
  try { provider = readAdminAuthProvider() }
  catch { return <main className="p-8" role="alert">Admin authentication is unavailable. Contact your administrator.</main> }
  if (provider === 'supabase') return <LegacyLogin />
  const params = await searchParams
  return <KeycloakLogin upstreamPending={params?.logout === 'upstream-pending'} signedOut={params?.logout === 'complete'} autoStart={autoLoginAllowed(params)} />
}
