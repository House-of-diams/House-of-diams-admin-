import { readCmsId } from '@/lib/cms-id-safety'
import { cmsPageReader } from '@/lib/cms-page-data'
import { loadCmsContentListSnapshot } from '@/lib/cms-content-list-save'
import { FoundersEditorClient, type FoundersInitialData } from './founders-editor-client'

async function getFoundersInitialData(): Promise<FoundersInitialData> {
  const adminClient = await cmsPageReader()
  const snapshot = await loadCmsContentListSnapshot(adminClient, 'about_founders')

  return {
    revision: snapshot.revision,
    items: snapshot.items.map((item) => ({ id: readCmsId(item.id), sort_order: Number(item.sort_order), name: String(item.name ?? ''), designation: String(item.designation ?? ''), bio: String(item.bio ?? ''), image_path: String(item.image_path ?? '') })),
  }
}

export default async function FoundersEditorPage() {
  const initialData = await getFoundersInitialData()
  return <FoundersEditorClient initialData={initialData} />
}
