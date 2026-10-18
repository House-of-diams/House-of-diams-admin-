import { cmsPageReader } from '@/lib/cms-page-data'
import { readCmsReference } from '@/lib/cms-reference-data'
import { readCms } from '@/lib/cms-command'
import { loadCmsRelationalSnapshot } from '@/lib/cms-relational-save'
import { SupportFaqEditorClient, type SupportFaqInitialData } from './support-faq-editor-client'

async function getSupportFaqInitialData() {
  const adminClient = await cmsPageReader()
  const [snapshot, { data: catalogCategories, error: catalogError }, { data: categories, error: categoriesError }] = await Promise.all([
    loadCmsRelationalSnapshot(adminClient, 'faq'),
    readCmsReference(adminClient, 'activeCategories'),
    readCms(adminClient, 'cms_support_faq_categories_v1', {}),
  ])
  if (catalogError) throw new Error('Unable to load catalog categories.')
  if (categoriesError) throw new Error('Unable to load FAQ categories.')
  if (!snapshot.parent) return { initialData: {
      section: { section_key: 'global_support_faq', title: 'Frequently Asked Questions', subtitle: '' },
      items: [],
      categories: (categories ?? []) as SupportFaqInitialData['categories'],
      catalogCategories: catalogCategories ?? [],
    }, revision: snapshot.revision }
  return { initialData: { section: snapshot.parent, items: snapshot.items, categories: (categories ?? []) as SupportFaqInitialData['categories'], catalogCategories: catalogCategories ?? [] } as SupportFaqInitialData, revision: snapshot.revision }
}

export default async function SupportFaqPage() {
  const { initialData, revision } = await getSupportFaqInitialData()
  return <SupportFaqEditorClient initialData={initialData} initialRevision={revision} />
}
