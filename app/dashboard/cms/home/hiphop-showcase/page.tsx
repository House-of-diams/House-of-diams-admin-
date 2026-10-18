import { HipHopShowcaseEditorClient, type HipHopShowcaseInitialData } from './hiphop-showcase-editor-client'
import { cmsPageReader } from '@/lib/cms-page-data'
import { loadCmsSingletonSnapshot } from '@/lib/cms-singleton-save'

async function getHipHopShowcaseInitialData() {
  const snapshot = await loadCmsSingletonSnapshot<HipHopShowcaseInitialData>(await cmsPageReader(), 'hiphop_showcase')
  const data = snapshot.item
  return { initialData: {
    is_enabled: data?.is_enabled ?? true,
    eyebrow: data?.eyebrow ?? 'Hip Hop Collection · House of Diams',
    heading_line_1: data?.heading_line_1 ?? 'Ice That',
    heading_line_2: data?.heading_line_2 ?? 'Speaks',
    heading_emphasis: data?.heading_emphasis ?? 'Louder.',
    cta_label: data?.cta_label ?? 'Shop Iced Pieces',
    cta_link: data?.cta_link ?? '/hiphop',
    image_path: data?.image_path ?? '',
    image_alt: data?.image_alt ?? 'House of Diams Hip Hop Collection',
  }, revision: snapshot.revision }
}

export default async function HipHopShowcaseEditorPage() {
  const { initialData, revision } = await getHipHopShowcaseInitialData()
  return <HipHopShowcaseEditorClient initialData={initialData} initialRevision={revision} />
}
