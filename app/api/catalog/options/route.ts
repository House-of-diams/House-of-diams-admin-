import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'

export async function POST(request: Request) {
  return runCatalogRdsRoute(request, undefined)
}

export const runtime = 'nodejs'
