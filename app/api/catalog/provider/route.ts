import { readCatalogDataProvider } from '@/lib/catalog-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function GET() {
  try { return Response.json({ provider: readCatalogDataProvider(process.env) }, { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return Response.json({ error: 'Catalog service unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
