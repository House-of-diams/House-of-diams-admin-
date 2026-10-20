import { providerRouteGate } from '@/lib/provider-route-gate'
import { readCatalogDataProvider } from '@/lib/catalog-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  const denied = await providerRouteGate()
  if (denied) return denied
  try { return Response.json({ provider: readCatalogDataProvider(process.env) }, { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return Response.json({ error: 'Catalog service unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
