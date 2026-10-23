import 'server-only'
import { readCatalogDataProvider } from './catalog-provider'
import { authorizeProductPage } from './product-server-request'
import { adminQuery, adminTransaction } from './db/pool'
import { createCatalogRepository } from './db/admin-repositories/catalog'
import { loadRdsNavbarBuilderData } from './navbar-data'
import type { CatalogReader } from './catalog-command'
import type { CatalogNavbarItem } from './product-catalog'

export async function catalogPageReader() {
  readCatalogDataProvider(process.env)
  await authorizeProductPage()
  // Each read uses B2 principal/TLS/transaction validation; no escaped pooled client.
  return createCatalogRepository({ query: async (sql, values) => ({ rows: await adminQuery(sql, values) }) })
}
export async function loadCatalogNavbarItems(reader: CatalogReader): Promise<CatalogNavbarItem[]> {
  return reader.navbarItems()
}
export async function loadNavbarPageData() {
  readCatalogDataProvider(process.env)
  await authorizeProductPage()
  return adminTransaction(loadRdsNavbarBuilderData)
}
