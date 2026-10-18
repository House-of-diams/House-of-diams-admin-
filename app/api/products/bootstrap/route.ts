import { runProductRdsRoute } from '@/lib/product-rds-handlers'
import { loadLegacyCatalogBootstrap as legacyBootstrap } from '@/lib/catalog-bootstrap-legacy'

export async function GET(request: Request) {
  const rds = await runProductRdsRoute('bootstrap', request)
  return rds ?? legacyBootstrap(request)
}

export const runtime = 'nodejs'
