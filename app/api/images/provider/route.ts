import { providerRouteGate } from '@/lib/provider-route-gate'
import { readImageProvider } from '@/lib/image-provider'
export const dynamic = 'force-dynamic'
export async function GET() {
  const denied = await providerRouteGate()
  if (denied) return denied
  try { return Response.json({ provider: readImageProvider() }, { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return Response.json({ error: 'Image service unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
