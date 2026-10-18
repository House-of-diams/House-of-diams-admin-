import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'
import { assertAdmin } from '@/lib/cms-auth'
import { saveCatalogRing } from '@/lib/catalog-ring-save'

export async function PATCH(request: Request) {
  const rds = await runCatalogRdsRoute(request, undefined); if (rds) return rds
 const access = await assertAdmin(request); if ('error' in access) return access.error; return saveCatalogRing(access, await request.json().catch(() => null)) }
export async function DELETE(request: Request) {
  const rds = await runCatalogRdsRoute(request, undefined); if (rds) return rds
 const access = await assertAdmin(request); if ('error' in access) return access.error; return saveCatalogRing(access, await request.json().catch(() => null)) }

export const runtime = 'nodejs'
