import { cmsPageReader } from '@/lib/cms-page-data'
import { readCmsReference } from '@/lib/cms-reference-data'

import { BlogListClient, type BlogListItem } from './blog-list-client'

async function getBlogRows(): Promise<BlogListItem[]> {
  const adminClient = await cmsPageReader()
  const { data, error } = await readCmsReference(adminClient, 'blog')

  if (error) throw new Error('Unable to load blog posts.')

  return (data ?? []) as BlogListItem[]
}

export default async function BlogCMSPage() {
  const items = await getBlogRows()
  return <BlogListClient initialItems={items} />
}
