import { providerRouteGate } from '@/lib/provider-route-gate'
import { readCmsDataProvider } from '@/lib/cms-provider'
export const runtime = 'nodejs'
export async function GET() {
  const denied = await providerRouteGate()
  if (denied) return denied
  try { return Response.json({ provider: readCmsDataProvider(process.env) }, { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return Response.json({ error: 'Content service unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
