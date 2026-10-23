import { cmsPageReader } from '@/lib/cms-page-data'
import { readCms } from '@/lib/cms-command'
import { ReelsEditorClient, type ReelsInitialData } from './reels-editor-client'

async function getInitialData(): Promise<ReelsInitialData> {
  const reader = await cmsPageReader()
  const snapshot = await readCms(reader, 'cms_reels_snapshot_v1', {})
  if (!snapshot.error) {
    const data = snapshot.data as {section: Omit<ReelsInitialData,'items'|'revision'>;items:ReelsInitialData['items'];revision:string}
    return {
      heading: data.section?.heading ?? 'Follow Us on Instagram',
      subtitle: data.section?.subtitle ?? '',
      is_enabled: data.section?.is_enabled ?? true,
      marquee_duration_seconds: data.section?.marquee_duration_seconds ?? 40,
      pause_on_hover: data.section?.pause_on_hover ?? true,
      items: data.items,
      revision: data.revision,
    }
  }
  // The reels snapshot function is part of the schema; if it is missing, saving would be unsafe, so fail loudly.
  throw new Error('Unable to load reels. Please reload this page.')
}

export default async function ReelsEditorPage() {
  return <ReelsEditorClient initialData={await getInitialData()} />
}
