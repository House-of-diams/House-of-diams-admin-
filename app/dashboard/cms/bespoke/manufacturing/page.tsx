import { readCmsId } from '@/lib/cms-id-safety'
import { cmsPageReader } from '@/lib/cms-page-data'
import { loadCmsContentListSnapshot } from '@/lib/cms-content-list-save'
import {
  BespokeManufacturingEditorClient,
  type BespokeManufacturingInitialData,
} from './bespoke-manufacturing-editor-client'

async function getBespokeManufacturingInitialData(): Promise<BespokeManufacturingInitialData> {
  const adminClient = await cmsPageReader()
  const snapshot = await loadCmsContentListSnapshot(adminClient, 'bespoke_manufacturing')

  return {
    revision: snapshot.revision,
    items: snapshot.items.map((item) => ({ id: readCmsId(item.id), sort_order: Number(item.sort_order), step: String(item.step ?? ''), eyebrow: String(item.eyebrow ?? ''), title: String(item.title ?? ''), description: String(item.description ?? ''), image_path: String(item.image_path ?? ''), media_type: item.media_type === 'video' ? 'video' : 'image', media_path: String(item.media_path ?? '') })),
  }
}

export default async function BespokeManufacturingPage() {
  const initialData = await getBespokeManufacturingInitialData()
  return <BespokeManufacturingEditorClient initialData={initialData} />
}
