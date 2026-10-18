import { getAdminServerSession } from '@/lib/admin-server'
import { adminTransaction } from '@/lib/db/pool'
import { readProductDataProvider } from '@/lib/product-provider'
import { readCatalogDataProvider } from '@/lib/catalog-provider'
import { readCmsDataProvider } from '@/lib/cms-provider'
import { readOperationsProvider } from '@/lib/operations-provider'
import { createAdminDataSourceStatus } from '@/lib/admin-data-source-status'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const GET = createAdminDataSourceStatus({
  authorized: async () => Boolean(await getAdminServerSession()),
  provider: group => ({ products: readProductDataProvider, catalog: readCatalogDataProvider,
    cms: readCmsDataProvider, operations: readOperationsProvider })[group](process.env),
  read: sql => adminTransaction(async db => { await db.query(sql) }, { snapshot: true }),
})
