import { catalogPageReader } from '@/lib/catalog-page-data'
import { loadCatalogMasterList, type CatalogMasterRow } from '@/lib/catalog-master-save'
import { StylesClient, type CatalogStyleItem } from './styles-client'

async function getStyles(): Promise<CatalogStyleItem[]> {
  const adminClient = await catalogPageReader()
  const data = await loadCatalogMasterList(adminClient, 'style')
  const rows = data as Array<CatalogMasterRow & { name: string; icon_svg_path?: string | null; display_order: number; status: string }>
  return rows.map((item) => ({
    id: item.id,
    _revision: item._revision,
    name: item.name,
    iconSvgPath: item.icon_svg_path ?? '',
    displayOrder: item.display_order,
    status: item.status === 'hidden' ? 'Hidden' : 'Active',
  }))
}

export default async function StylesPage() {
  const initialItems = await getStyles()
  return <StylesClient initialItems={initialItems} />
}
