import { readAdminAuthProvider } from '@/lib/auth/integration'
import { NO_STORE } from '@/lib/auth/request-security'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  try { return Response.json({ provider: readAdminAuthProvider() }, { headers: NO_STORE }) }
  catch { return Response.json({ error: 'Admin integration unavailable' }, { status: 503, headers: NO_STORE }) }
}
