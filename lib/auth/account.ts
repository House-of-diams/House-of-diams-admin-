import 'server-only'
import { deploymentProfile } from '../deployment-profile'
import { NO_STORE } from './request-security'
import type { authorizeProductRequest } from '../product-session-runtime'
import { ProductSessionError } from '../product-session-error'

/** Account console owns password collection/reauthentication. No privileged admin API. */
export function accountConsoleUrl(env: Record<string, string | undefined>): string | null {
  if (env.ADMIN_KEYCLOAK_ACCOUNT_VERIFIED !== 'true') return null
  const issuer = env.ADMIN_OIDC_ISSUER
  if (issuer !== deploymentProfile(env.NEXT_PUBLIC_HOD_DEPLOYMENT).oidcIssuer) throw new Error('Account configuration unavailable')
  // Explicit operator-reviewed URL; do not derive an unverified capability from discovery.
  const value = env.ADMIN_KEYCLOAK_ACCOUNT_URL
  if (value !== `${issuer}/account/`) throw new Error('Account configuration unavailable')
  return value
}

export function createAccountHandler(deps: {
  provider: () => 'keycloak'
  authorize: typeof authorizeProductRequest
  env: () => Record<string, string | undefined>
}) {
  return async (request: Request) => {
    try {
      if (deps.provider() !== 'keycloak') return Response.json({ error: 'Keycloak account management is not selected.' }, { status: 409, headers: NO_STORE })
      if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: NO_STORE })
      await deps.authorize(request, true)
      const url = accountConsoleUrl(deps.env())
      if (!url) return Response.json({ error: 'Keycloak account management awaits verified account-console policy.' }, { status: 503, headers: NO_STORE })
      return Response.json({ action: 'account-console', url }, { headers: NO_STORE })
    } catch (error) {
      const status = error instanceof ProductSessionError ? error.status : 503
      return Response.json({ error: 'Account management unavailable.' }, { status, headers: NO_STORE })
    }
  }
}
