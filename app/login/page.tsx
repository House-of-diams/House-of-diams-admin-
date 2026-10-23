import { readAdminAuthProvider } from '@/lib/auth/integration'
import { KeycloakLogin } from './keycloak-login'
import { autoLoginAllowed } from '@/lib/auto-login'

export const dynamic = 'force-dynamic'
export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ logout?: string | string[]; error?: string | string[] }> }) {
  try { readAdminAuthProvider() }
  catch { return <main className="p-8" role="alert">Admin authentication is unavailable. Contact your administrator.</main> }
  const params = await searchParams
  return <KeycloakLogin upstreamPending={params?.logout === 'upstream-pending'} signedOut={params?.logout === 'complete'} autoStart={autoLoginAllowed(params)} />
}
