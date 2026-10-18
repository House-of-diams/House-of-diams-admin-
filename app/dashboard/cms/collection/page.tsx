import { cmsPageReader } from '@/lib/cms-page-data'
import { loadCmsSingletonSnapshot } from '@/lib/cms-singleton-save'
import { CMSTabs } from '@/components/cms-tabs'
import { CollectionPageEditorClient, type CollectionPageEditorInitialData } from '../home/collection-page/collection-page-editor-client'

async function getCollectionInitialData() {
  const snapshot = await loadCmsSingletonSnapshot<CollectionPageEditorInitialData>(await cmsPageReader(), 'collection_page')
  const data = snapshot.item
  return { initialData: {
    page_enabled: Boolean(data?.page_enabled),
    show_in_footer: Boolean(data?.show_in_footer),
    show_home_showcase: Boolean(data?.show_home_showcase),
    showcase_heading: data?.showcase_heading ?? '',
    showcase_subtitle: data?.showcase_subtitle ?? '',
    showcase_cta_label: data?.showcase_cta_label ?? '',
    showcase_cta_href: data?.showcase_cta_href ?? '/collection',
    showcase_image_path: data?.showcase_image_path ?? '',
    showcase_mobile_image_path: data?.showcase_mobile_image_path ?? '',
  }, revision: snapshot.revision }
}

export default async function CollectionCmsPage() {
  const { initialData, revision } = await getCollectionInitialData()

  return (
    <div>
      <CMSTabs />
      <CollectionPageEditorClient initialData={initialData} initialRevision={revision} />
    </div>
  )
}
