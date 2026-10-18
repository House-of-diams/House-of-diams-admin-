import { loadRdsBespokeSubmission } from '@/lib/cms-page-data'
import { notFound } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/admin-supabase'
import { BespokeSubmissionDetailClient } from '../detail-client'

async function getSubmission(id: string) {
  const rds = await loadRdsBespokeSubmission(id)
  if (rds) return rds.item
  const adminClient = createSupabaseAdminClient()
  const { data, error } = await adminClient
    .from('bespoke_submissions')
    .select('id, full_name, email, phone, country, piece_type, stone_preference, approx_carat, preferred_metal, message, status, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) return null
  return data
}

export default async function BespokeSubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getSubmission(id)

  if (!item) notFound()

  return <BespokeSubmissionDetailClient item={item} />
}
