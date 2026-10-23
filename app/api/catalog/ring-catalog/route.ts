import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'

export async function GET(request: Request) {
  return runCatalogRdsRoute(request, undefined)
}

export async function PUT(request: Request) {
  return runCatalogRdsRoute(request, undefined)
}

export const runtime = 'nodejs'
