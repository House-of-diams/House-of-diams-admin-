import { cmsPageReader } from '@/lib/cms-page-data'
import { loadCmsRelationalSnapshot } from '@/lib/cms-relational-save'
import { SummaryInfoEditor } from './summary-info-editor'

export const dynamic = 'force-dynamic'

export default async function SummaryInfoPage() {
  const client = await cmsPageReader()
  const snapshot = await loadCmsRelationalSnapshot(client, 'summary')
  const data = snapshot.parent
  const pointers = snapshot.items as Array<{ id: string; sort_order: number; icon_url: string | null; pointer_text: string; video_url: string | null; video_link_text: string | null }>

  return <SummaryInfoEditor initialData={{
    heading: typeof data?.heading === 'string' ? data.heading : 'Additional Summary Details',
    enabled: typeof data?.is_enabled === 'boolean' ? data.is_enabled : true,
    hasSection: Boolean(data),
    pointers,
  }} initialRevision={snapshot.revision} />
}
