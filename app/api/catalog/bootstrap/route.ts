import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'
import { loadLegacyCatalogBootstrap } from '@/lib/catalog-bootstrap-legacy'

export const runtime = 'nodejs'
export async function GET(request: Request) {
  const rds = await runCatalogRdsRoute(request)
  return rds ?? loadLegacyCatalogBootstrap(request)
}
