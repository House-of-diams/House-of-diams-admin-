import 'server-only'
import { readAdminAuthProvider } from './auth/integration'
import { getAdminServerSession } from './admin-server'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * HOD-033: data/media provider routes answer only signed-in admins once Keycloak is
 * selected. Legacy Supabase mode keeps its token in the browser, so it stays open
 * there until that mode is removed. /api/auth/provider stays public: login needs it.
 */
export async function providerRouteGate(): Promise<Response | null> {
  let provider
  try { provider = readAdminAuthProvider() } catch { return Response.json({ error: 'Admin integration unavailable' }, { status: 503, headers: NO_STORE }) }
  if (provider !== 'keycloak') return null
  try {
    if (await getAdminServerSession()) return null
    return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: NO_STORE })
  } catch { return Response.json({ error: 'Admin authentication unavailable' }, { status: 503, headers: NO_STORE }) }
}
