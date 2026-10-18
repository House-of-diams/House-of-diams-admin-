import { cmsPageReader } from '@/lib/cms-page-data'
import { loadCmsSingletonSnapshot } from '@/lib/cms-singleton-save'
import { ContactHeroEditorClient, type ContactHeroInitialData } from './contact-hero-editor-client'

async function getContactHeroInitialData() {
  const snapshot = await loadCmsSingletonSnapshot<ContactHeroInitialData['item']>(await cmsPageReader(), 'contact_hero')
  return { initialData: {
    item: snapshot.item ?? {
        section_key: 'contact_hero',
        eyebrow: '',
        heading: '',
        subtitle: '',
      },
  }, revision: snapshot.revision }
}

export default async function ContactHeroPage() {
  const { initialData, revision } = await getContactHeroInitialData()
  return <ContactHeroEditorClient initialData={initialData} initialRevision={revision} />
}
