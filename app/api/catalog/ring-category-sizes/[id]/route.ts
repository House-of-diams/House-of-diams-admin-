import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'

export async function PATCH(request: Request) {
  return runCatalogRdsRoute(request, undefined)
}

export async function DELETE(request: Request) {
  return runCatalogRdsRoute(request, undefined)
}

export const runtime = 'nodejs'
