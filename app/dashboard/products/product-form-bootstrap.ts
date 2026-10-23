import { cache } from 'react'
import type { BootstrapPayload } from '@/components/product-form'
import { readProductDataProvider } from '@/lib/product-provider'
import { authorizeProductPage } from '@/lib/product-server-request'
import { adminTransaction } from '@/lib/db/pool'
import { loadRdsProductBootstrap } from '@/lib/db/admin-repositories/product-bootstrap'

export const getProductFormBasicsBootstrap = cache(async (): Promise<BootstrapPayload> => {
  readProductDataProvider(process.env)
  await authorizeProductPage()
  return adminTransaction(db => loadRdsProductBootstrap(db, 'basics'))
})
