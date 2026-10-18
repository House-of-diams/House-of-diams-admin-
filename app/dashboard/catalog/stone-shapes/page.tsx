import { catalogPageReader } from '@/lib/catalog-page-data'
import { loadCatalogMasterList, type CatalogMasterRow } from '@/lib/catalog-master-save'
import { StoneShapesClient, type StoneShape } from './stone-shapes-client'

async function getStoneShapes(): Promise<StoneShape[]> {
  const adminClient = await catalogPageReader()
  const data = await loadCatalogMasterList(adminClient, 'stone_shape')
  const rows = data as Array<CatalogMasterRow & { name: string; slug: string; svg_asset_url: string; display_order: number; status: string }>
  return rows.map((item) => ({
    id: item.id,
    _revision: item._revision,
    name: item.name,
    slug: item.slug,
    svgName: item.svg_asset_url,
    displayOrder: item.display_order,
    status: item.status === 'hidden' ? 'Hidden' : 'Active',
  }))
}

export default async function StoneShapesPage() {
  const initialShapes = await getStoneShapes()
  return <StoneShapesClient initialShapes={initialShapes} />
}
