import { catalogPageReader } from '@/lib/catalog-page-data'
import { loadCatalogMasterList } from '@/lib/catalog-master-save'
import type { CatalogGstSlab } from '@/lib/product-catalog'
import { GstClient } from './gst-client'

async function getGstSlabs(): Promise<CatalogGstSlab[]> {
  const adminClient = await catalogPageReader()
  return await loadCatalogMasterList(adminClient, 'gst_slab') as CatalogGstSlab[]
}

export default async function GstPage() {
  const initialItems = await getGstSlabs()
  return <GstClient initialItems={initialItems} />
}
