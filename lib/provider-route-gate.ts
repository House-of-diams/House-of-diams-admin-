import 'server-only'
import { readAdminAuthProvider } from './auth/integration'
import { getAdminServerSession } from './admin-server'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * HOD-033: data/media provider routes answer only signed-in admins.
 * /api/auth/provider stays public: login needs it.
 */
export async function providerRouteGate(): Promise<Response | null> {
  try { readAdminAuthProvider() } catch { return Response.json({ error: 'Admin integration unavailable' }, { status: 503, headers: NO_STORE }) }
  try {
    if (await getAdminServerSession()) return null
    return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: NO_STORE })
  } catch { return Response.json({ error: 'Admin authentication unavailable' }, { status: 503, headers: NO_STORE }) }
}
