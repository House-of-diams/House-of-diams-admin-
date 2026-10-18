import { catalogPageReader } from '@/lib/catalog-page-data'
import { MetalsClient, type MetalItem } from './metals-client'
import { loadCatalogMetalList } from '@/lib/catalog-metal-save'

async function getMetals(): Promise<MetalItem[]> {
  const adminClient = await catalogPageReader()
  return await loadCatalogMetalList(adminClient) as MetalItem[]
}

export default async function MetalsPage() {
  const initialItems = await getMetals()
  return <MetalsClient initialItems={initialItems} />
}
