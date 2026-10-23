import type {
  CatalogCategory,
  CatalogOption,
  CatalogSubcategory,
} from '@/lib/product-catalog'
import type { ProductRow } from './products-client'
import { readProductDataProvider } from '@/lib/product-provider'
import { authorizeProductPage } from '@/lib/product-server-request'
import { adminTransaction } from '@/lib/db/pool'
import { loadRdsProductList } from '@/lib/db/admin-repositories/product-list'

export type ProductLane = 'standard' | 'hiphop' | 'collection'

export const PRODUCT_PAGE_SIZE = 20

export type ProductListPage = {
  items: ProductRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export async function getProductRows(lane: ProductLane | undefined, page = 1, search = ''): Promise<ProductListPage> {
  readProductDataProvider(process.env)
  await authorizeProductPage()
  return adminTransaction(db => loadRdsProductList(db, lane, page, search), { snapshot: true })
}
