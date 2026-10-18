import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'
import { assertAdmin } from '@/lib/cms-auth'
import { deleteCatalogMaster, saveCatalogMaster } from '@/lib/catalog-master-save'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rds = await runCatalogRdsRoute(request, (await params).id); if (rds) return rds
 const access = await assertAdmin(request); if ('error' in access) return access.error; return saveCatalogMaster(access, 'certificate', (await params).id, await request.json().catch(() => null)) }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rds = await runCatalogRdsRoute(request, (await params).id); if (rds) return rds
 const access = await assertAdmin(request); if ('error' in access) return access.error; return deleteCatalogMaster(access, 'certificate', (await params).id, await request.json().catch(() => null)) }

export const runtime = 'nodejs'
