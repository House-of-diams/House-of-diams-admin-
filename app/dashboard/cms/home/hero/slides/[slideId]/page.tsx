import { readCmsId, cmsIdSchema } from '@/lib/cms-id-safety'
import { notFound } from 'next/navigation'
import { cmsPageReader } from '@/lib/cms-page-data'
import { HeroSlideEditorClient, type HeroSlide } from './hero-slide-editor-client'
import { loadHomeGroup1Snapshot } from '@/lib/cms-home-group1-save'

export default async function HeroSlideEditorPage({ params }: { params: Promise<{ slideId: string }> }) {
  const { slideId } = await params
  const parsedId = cmsIdSchema.safeParse(slideId)
  if (!parsedId.success) notFound()
  const id = readCmsId(parsedId.data)

  const snapshot = await loadHomeGroup1Snapshot(await cmsPageReader(), 'hero')
  const initialSlide = snapshot.items.find((item) => readCmsId(item.id) === id)
  if (!initialSlide) notFound()

  return <HeroSlideEditorClient
    initialSlide={{
      id: readCmsId(initialSlide.id),
      hero_id: readCmsId(initialSlide.hero_id),
      sort_order: Number(initialSlide.sort_order),
      image_path: String(initialSlide.image_path ?? ''),
      mobile_image_path: String(initialSlide.mobile_image_path ?? ''),
      headline: String(initialSlide.headline ?? ''),
      subtitle: String(initialSlide.subtitle ?? ''),
      button_text: String(initialSlide.button_text ?? ''),
      button_link: String(initialSlide.button_link ?? ''),
    } satisfies HeroSlide}
    initialItems={snapshot.items.map((item) => ({
      id: readCmsId(item.id),
      hero_id: readCmsId(item.hero_id),
      sort_order: Number(item.sort_order),
      image_path: String(item.image_path ?? ''),
      mobile_image_path: String(item.mobile_image_path ?? ''),
      headline: String(item.headline ?? ''),
      subtitle: String(item.subtitle ?? ''),
      button_text: String(item.button_text ?? ''),
      button_link: String(item.button_link ?? ''),
    }))}
    initialSection={{
      slider_enabled: Boolean(snapshot.section?.slider_enabled),
      seo_title: String(snapshot.section?.seo_title ?? ''),
      seo_description: String(snapshot.section?.seo_description ?? ''),
    }}
    initialRevision={snapshot.revision}
  />
}
