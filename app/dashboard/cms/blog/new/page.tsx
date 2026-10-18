import { BlogEditorPage, type BlogCatalogCategory } from '@/components/blog-editor-page'
import { cmsPageReader } from '@/lib/cms-page-data'
import { readCmsReference } from '@/lib/cms-reference-data'


async function getCategories(): Promise<BlogCatalogCategory[]> {
  const { data, error } = await readCmsReference((await cmsPageReader()), 'activeCategories')
  if (error) throw new Error('Unable to load blog categories.')
  return data ?? []
}

export default async function NewBlogPage() {
  return <BlogEditorPage mode="create" categories={await getCategories()} />
}
