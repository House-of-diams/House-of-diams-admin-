import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'
import { assertAdmin } from '@/lib/cms-auth'
import { listCatalogMasters, saveCatalogMaster } from '@/lib/catalog-master-save'

export async function GET(request: Request) {
  const rds = await runCatalogRdsRoute(request, undefined); if (rds) return rds
 const access = await assertAdmin(request); if ('error' in access) return access.error; return listCatalogMasters(access, 'gst_slab') }
export async function POST(request: Request) {
  const rds = await runCatalogRdsRoute(request, undefined); if (rds) return rds
 const access = await assertAdmin(request); if ('error' in access) return access.error; return saveCatalogMaster(access, 'gst_slab', null, await request.json().catch(() => null)) }

export const runtime = 'nodejs'
