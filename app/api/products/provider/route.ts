import { providerRouteGate } from '@/lib/provider-route-gate'
import { readProductDataProvider } from '@/lib/product-provider'

export const dynamic = 'force-dynamic'
export async function GET() {
  const denied = await providerRouteGate()
  if (denied) return denied
  try {
    return Response.json({ provider: readProductDataProvider(process.env) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Product service unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

export const runtime = 'nodejs'
