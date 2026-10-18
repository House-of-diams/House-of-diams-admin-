import { cmsPageReader } from '@/lib/cms-page-data'
import { loadCmsSingletonSnapshot } from '@/lib/cms-singleton-save'
import { CMSTabs } from '@/components/cms-tabs'
import { BespokeShowcaseEditorClient, type BespokeShowcaseEditorInitialData } from './bespoke-showcase-editor-client'

async function getBespokeShowcaseInitialData() {
  const snapshot = await loadCmsSingletonSnapshot<BespokeShowcaseEditorInitialData>(await cmsPageReader(), 'bespoke_showcase')
  const data = snapshot.item
  return { initialData: {
    is_enabled: data?.is_enabled ?? true,
    eyebrow: data?.eyebrow ?? 'Bespoke Atelier',
    heading: data?.heading ?? 'Create Something One of One',
    subtitle: data?.subtitle ?? 'Begin a bespoke commission with House of Diams, from first sketch to final setting.',
    cta_label: data?.cta_label ?? 'Start Bespoke Enquiry',
    image_path: data?.image_path ?? '',
    mobile_image_path: data?.mobile_image_path ?? '',
    image_alt: data?.image_alt ?? 'House of Diams bespoke jewellery showcase',
    sort_order: data?.sort_order ?? 0,
  }, revision: snapshot.revision }
}

export default async function BespokeCmsPage() {
  const { initialData, revision } = await getBespokeShowcaseInitialData()

  return (
    <div>
      <CMSTabs />
      <BespokeShowcaseEditorClient initialData={initialData} initialRevision={revision} />
    </div>
  )
}
