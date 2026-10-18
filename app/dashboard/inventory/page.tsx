import { createSupabaseAdminClient } from '@/lib/admin-supabase'
import { loadInventoryItems } from '@/lib/inventory-data'
import { InventoryClient, type InventoryItem } from './inventory-client'
import { readProductDataProvider } from '@/lib/product-provider'
import { authorizeProductPage } from '@/lib/product-server-request'
import { adminTransaction } from '@/lib/db/pool'
import { createInventoryRepository } from '@/lib/db/admin-repositories/inventory'

async function getInventoryItems(): Promise<InventoryItem[]> {
  if (readProductDataProvider(process.env) === 'rds') {
    await authorizeProductPage()
    return adminTransaction(db => createInventoryRepository(db).list())
  }
  return loadInventoryItems(createSupabaseAdminClient()) as Promise<InventoryItem[]>
}

export default async function InventoryPage() {
  const initialItems = await getInventoryItems()
  return <InventoryClient initialItems={initialItems} />
}
