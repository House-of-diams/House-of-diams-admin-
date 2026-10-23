import { loadRdsBespokeSubmission } from '@/lib/cms-page-data'
import { notFound } from 'next/navigation'
import { BespokeSubmissionDetailClient } from '../detail-client'

async function getSubmission(id: string) {
  return (await loadRdsBespokeSubmission(id)).item
}

export default async function BespokeSubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getSubmission(id)

  if (!item) notFound()

  return <BespokeSubmissionDetailClient item={item} />
}
