import { cmsPageReader } from '@/lib/cms-page-data'
import { loadCmsRelationalSnapshot } from '@/lib/cms-relational-save'
import {
  SupportAnnouncementBarEditorClient,
  type SupportAnnouncementBarInitialData,
} from './support-announcement-bar-editor-client'

async function getSupportAnnouncementBarInitialData() {
  const adminClient = await cmsPageReader()
  const snapshot = await loadCmsRelationalSnapshot(adminClient, 'announcement')
  if (!snapshot.parent) return { initialData: {
      section: { section_key: 'global_support_announcement_bar', is_active: true, autoplay: true, speed_ms: 3000 },
      items: [],
    }, revision: snapshot.revision }
  return { initialData: { section: snapshot.parent, items: snapshot.items } as SupportAnnouncementBarInitialData, revision: snapshot.revision }
}

export default async function SupportAnnouncementBarPage() {
  const { initialData, revision } = await getSupportAnnouncementBarInitialData()
  return <SupportAnnouncementBarEditorClient initialData={initialData} initialRevision={revision} />
}
