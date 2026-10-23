import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'

export const runtime = 'nodejs'
export async function GET(request: Request) {
  return runCatalogRdsRoute(request)
}
