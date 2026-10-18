import { readProductDataProvider } from '@/lib/product-provider'

export const dynamic = 'force-dynamic'
export function GET() {
  try {
    return Response.json({ provider: readProductDataProvider(process.env) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Product service unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

export const runtime = 'nodejs'
