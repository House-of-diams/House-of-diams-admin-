import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'
import { assertAdmin } from '@/lib/cms-auth'
import { saveCatalogHierarchy } from '@/lib/catalog-hierarchy-save'

export async function POST(request: Request) {
  const rds = await runCatalogRdsRoute(request, undefined); if (rds) return rds
 const access = await assertAdmin(request); if ('error' in access) return access.error; return saveCatalogHierarchy(access, 'subcategory', null, await request.json().catch(() => null)) }

export const runtime = 'nodejs'
