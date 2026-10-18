import { cmsIdSchema } from '@/lib/cms-id-safety'
import { BlogEditorPage, type BlogCatalogCategory } from '@/components/blog-editor-page'
import { cmsPageReader } from '@/lib/cms-page-data'
import { readCmsReference } from '@/lib/cms-reference-data'


async function getCategories(): Promise<BlogCatalogCategory[]> {
  const { data, error } = await readCmsReference((await cmsPageReader()), 'activeCategories')
  if (error) throw new Error('Unable to load blog categories.')
  return data ?? []
}

export default async function EditBlogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const postId = cmsIdSchema.safeParse(id)
  if (!postId.success) throw new Error('Invalid blog id.')

  return <BlogEditorPage mode="edit" id={id} categories={await getCategories()} />
}
