import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'
import { assertAdmin } from '@/lib/cms-auth'
import { getCatalogRing, saveCatalogRing } from '@/lib/catalog-ring-save'

export async function GET(request: Request) {
  const rds = await runCatalogRdsRoute(request, undefined); if (rds) return rds
 const access = await assertAdmin(request); if ('error' in access) return access.error; return getCatalogRing(access) }
export async function PUT(request: Request) {
  const rds = await runCatalogRdsRoute(request, undefined); if (rds) return rds
 const access = await assertAdmin(request); if ('error' in access) return access.error; return saveCatalogRing(access, await request.json().catch(() => null)) }

export const runtime = 'nodejs'
