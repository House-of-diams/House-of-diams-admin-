import { cmsPageReader } from '@/lib/cms-page-data'
import { loadCmsSingletonSnapshot } from '@/lib/cms-singleton-save'
import { BlogHeroEditorClient, type BlogHeroForm } from './blog-hero-editor-client'

const fallback: BlogHeroForm = { is_enabled: true, heading: '', paragraph: '', button_label: '', button_link: '', desktop_image_path: '', desktop_image_alt: '', mobile_image_path: '', mobile_image_alt: '' }

export default async function BlogHeroPage() {
  const snapshot = await loadCmsSingletonSnapshot<BlogHeroForm>(await cmsPageReader(), 'blog_hero')
  const data = snapshot.item
  const initialData: BlogHeroForm = {
    is_enabled: data?.is_enabled ?? fallback.is_enabled,
    heading: data?.heading ?? '',
    paragraph: data?.paragraph ?? '',
    button_label: data?.button_label ?? '',
    button_link: data?.button_link ?? '',
    desktop_image_path: data?.desktop_image_path ?? '',
    desktop_image_alt: data?.desktop_image_alt ?? '',
    mobile_image_path: data?.mobile_image_path ?? '',
    mobile_image_alt: data?.mobile_image_alt ?? '',
  }

  return <BlogHeroEditorClient initialData={initialData} initialRevision={snapshot.revision} />
}

