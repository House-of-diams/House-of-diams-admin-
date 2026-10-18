import { readCmsId } from '@/lib/cms-id-safety'
import { cmsPageReader } from '@/lib/cms-page-data'
import { loadCmsContentListSnapshot } from '@/lib/cms-content-list-save'
import { ValuesEditorClient, type ValuesInitialData } from './values-editor-client'

async function getValuesInitialData(): Promise<ValuesInitialData> {
  const adminClient = await cmsPageReader()
  const snapshot = await loadCmsContentListSnapshot(adminClient, 'about_values')

  return {
    revision: snapshot.revision,
    items: snapshot.items.map((item) => ({ id: readCmsId(item.id), sort_order: Number(item.sort_order), icon_path: String(item.icon_path ?? ''), image_path: String(item.image_path ?? ''), image_alt: String(item.image_alt ?? ''), title: String(item.title ?? ''), description: String(item.description ?? '') })),
  }
}

export default async function ValuesEditorPage() {
  const initialData = await getValuesInitialData()
  return <ValuesEditorClient initialData={initialData} />
}

