import { readCmsId } from '@/lib/cms-id-safety'
import { cmsPageReader } from '@/lib/cms-page-data'
import { HeroEditorClient, type HeroEditorInitialData } from './hero-editor-client'
import { loadHomeGroup1Snapshot } from '@/lib/cms-home-group1-save'

async function getHeroInitialData(): Promise<HeroEditorInitialData> {
  const adminClient = await cmsPageReader()

  const snapshot = await loadHomeGroup1Snapshot(adminClient, 'hero')
  const section = snapshot.section!
  const items = snapshot.items

  return {
    section: {
      eyebrow: String(section.eyebrow ?? ''),
      headline: String(section.headline ?? ''),
      subtitle: String(section.subtitle ?? ''),
      slider_enabled: Boolean(section.slider_enabled),
      seo_title: String(section.seo_title ?? ''),
      seo_description: String(section.seo_description ?? ''),
    },
    items: items.map((item) => ({
      id: readCmsId(item.id),
      sort_order: Number(item.sort_order),
      image_path: String(item.image_path ?? ''),
      mobile_image_path: String(item.mobile_image_path ?? ''),
      headline: String(item.headline ?? ''),
      subtitle: String(item.subtitle ?? ''),
      button_text: String(item.button_text ?? ''),
      button_link: String(item.button_link ?? ''),
    })),
    revision: snapshot.revision,
  }
}

export default async function HeroEditorPage() {
  const initialData = await getHeroInitialData()
  return <HeroEditorClient initialData={initialData} />
}
