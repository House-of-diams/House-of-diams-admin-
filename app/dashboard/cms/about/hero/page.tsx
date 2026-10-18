import { cmsPageReader } from '@/lib/cms-page-data'
import { loadCmsSingletonSnapshot } from '@/lib/cms-singleton-save'
import { AboutHeroEditorClient, type AboutHeroInitialData } from './about-hero-editor-client'

const fallback: AboutHeroInitialData = {
  section_key: 'about_hero', is_enabled: true, media_type: 'image', desktop_media_path: '', mobile_media_path: '',
  video_poster_path: '', media_alt: '', show_text_overlay: true, heading: '', paragraph: '', show_button: false,
  button_label: '', button_link: '', overlay_position: 'left', overlay_scrim_enabled: true,
}

export default async function AboutHeroEditorPage() {
  const snapshot = await loadCmsSingletonSnapshot<AboutHeroInitialData>(await cmsPageReader(), 'about_hero')
  const data = snapshot.item

  return <AboutHeroEditorClient initialData={{
    ...fallback, ...(data ?? {}),
    desktop_media_path: data?.desktop_media_path ?? '', mobile_media_path: data?.mobile_media_path ?? '',
    video_poster_path: data?.video_poster_path ?? '', media_alt: data?.media_alt ?? '', heading: data?.heading ?? '',
    paragraph: data?.paragraph ?? '', button_label: data?.button_label ?? '', button_link: data?.button_link ?? '',
    media_type: data?.media_type === 'video' ? 'video' : 'image',
    overlay_position: (data?.overlay_position ?? 'left') as AboutHeroInitialData['overlay_position'],
  }} initialRevision={snapshot.revision} />
}
