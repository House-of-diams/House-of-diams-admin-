import 'server-only'
import { readAuthConfig } from './config'
import { createKeycloak } from './keycloak'
import { createSessionStore } from './session-store'
import { createAuthHandlers } from './handlers'
import { lookupAdminIdentity } from '../db/admin-repositories/identity'
import { NO_STORE } from './request-security'

let handlers: ReturnType<typeof createAuthHandlers> | undefined
export async function runAuthRoute(action: keyof ReturnType<typeof createAuthHandlers>, request: Request): Promise<Response> {
  try {
    if (!handlers) {
      const config = readAuthConfig()
      handlers = createAuthHandlers({ config, oidc: createKeycloak(config), store: createSessionStore(), lookup: lookupAdminIdentity })
    }
    return await handlers[action](request)
  } catch { return Response.json({ error: 'Authentication unavailable' }, { status: 503, headers: NO_STORE }) }
}
