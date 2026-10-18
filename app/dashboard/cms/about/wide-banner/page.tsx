import { cmsPageReader } from '@/lib/cms-page-data'
import { loadCmsSingletonSnapshot } from '@/lib/cms-singleton-save'
import { AboutWideBannerEditorClient, type AboutWideBannerInitialData } from './about-wide-banner-editor-client'

const fallback: AboutWideBannerInitialData = {
  section_key: 'about_wide_banner', is_enabled: true, desktop_image_path: '', mobile_image_path: '', image_alt: '',
  heading: '', paragraph: '', show_button: false, button_label: '', button_link: '', content_position: 'left', sort_order: 1,
}

export default async function AboutWideBannerEditorPage() {
  const snapshot = await loadCmsSingletonSnapshot<AboutWideBannerInitialData>(await cmsPageReader(), 'about_wide_banner')
  const data = snapshot.item
  return <AboutWideBannerEditorClient initialData={{
    ...fallback, ...(data ?? {}), desktop_image_path: data?.desktop_image_path ?? '', mobile_image_path: data?.mobile_image_path ?? '',
    image_alt: data?.image_alt ?? '', heading: data?.heading ?? '', paragraph: data?.paragraph ?? '', button_label: data?.button_label ?? '',
    button_link: data?.button_link ?? '', content_position: 'bottom-center',
  }} initialRevision={snapshot.revision} />
}


