import { cmsPageReader } from '@/lib/cms-page-data'
import { readCmsReference } from '@/lib/cms-reference-data'

import { EducationListClient, type EducationListItem } from './education-list-client'

async function getEducationRows(): Promise<EducationListItem[]> {
  const adminClient = await cmsPageReader()
  const { data, error } = await readCmsReference(adminClient, 'education')
  if (error) throw new Error('Unable to load education posts.')
  return (data ?? []) as EducationListItem[]
}

export default async function EducationCMSPage() {
  return <EducationListClient initialItems={await getEducationRows()} />
}
