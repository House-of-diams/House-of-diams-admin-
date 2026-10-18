import 'server-only'
import { readCatalogDataProvider } from './catalog-provider'
import { authorizeProductPage } from './product-server-request'
import { adminQuery, adminTransaction } from './db/pool'
import { createCatalogRepository } from './db/admin-repositories/catalog'
import { createSupabaseAdminClient } from './admin-supabase'
import { loadNavbarBuilderData, loadRdsNavbarBuilderData } from './navbar-data'
import type { CatalogReader } from './catalog-command'
import type { CatalogNavbarItem } from './product-catalog'

export async function catalogPageReader() {
  if (readCatalogDataProvider(process.env) === 'supabase') return createSupabaseAdminClient()
  await authorizeProductPage()
  // Each read uses B2 principal/TLS/transaction validation; no escaped pooled client.
  return createCatalogRepository({ query: async (sql, values) => ({ rows: await adminQuery(sql, values) }) })
}
export async function loadCatalogNavbarItems(reader: CatalogReader): Promise<CatalogNavbarItem[]> {
  if ('execute' in reader) return reader.navbarItems()
  const client = reader as ReturnType<typeof createSupabaseAdminClient>
  const result = await client.from('navbar_items').select('id, label, slug, item_type, linked_category_id, direct_link_url, status').order('display_order', { ascending: true })
  return result.error ? [] : result.data ?? []
}
export async function loadNavbarPageData() {
  if (readCatalogDataProvider(process.env) === 'supabase') return loadNavbarBuilderData(createSupabaseAdminClient())
  await authorizeProductPage()
  return adminTransaction(loadRdsNavbarBuilderData)
}
