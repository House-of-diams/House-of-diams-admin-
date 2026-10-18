import { readCmsId } from '@/lib/cms-id-safety'
import { cmsPageReader } from '@/lib/cms-page-data'
import { loadCmsContentListSnapshot } from '@/lib/cms-content-list-save'
import { ContactInfoEditorClient, type ContactInfoInitialData } from './contact-info-editor-client'

async function getContactInfoInitialData(): Promise<ContactInfoInitialData> {
  const adminClient = await cmsPageReader()
  const snapshot = await loadCmsContentListSnapshot(adminClient, 'contact_info')

  return {
    revision: snapshot.revision,
    items: snapshot.items.map((item) => ({ id: readCmsId(item.id), sort_order: Number(item.sort_order), label: String(item.label ?? ''), value: String(item.value ?? ''), note: String(item.note ?? ''), href: String(item.href ?? ''), icon_path: String(item.icon_path ?? '') })),
  }
}

export default async function ContactInfoPage() {
  const initialData = await getContactInfoInitialData()
  return <ContactInfoEditorClient initialData={initialData} />
}
