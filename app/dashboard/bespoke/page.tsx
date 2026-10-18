import { readCmsId } from '@/lib/cms-id-safety'
import { loadRdsBespokePageData } from '@/lib/cms-page-data'
import { createSupabaseAdminClient } from '@/lib/admin-supabase'
import {
  BespokeClient,
  type BespokePageData,
} from './bespoke-client'
import { loadBespokeHeroSnapshot } from '@/lib/bespoke-hero-save'
import { loadBespokeFormSnapshot } from '@/lib/bespoke-form-save'
import { loadCmsContentListSnapshot } from '@/lib/cms-content-list-save'

async function getBespokePageData(): Promise<BespokePageData> {
  const rds = await loadRdsBespokePageData()
  if (rds) return rds
  const adminClient = createSupabaseAdminClient()

  const [submissionsResult, heroSnapshot, categoriesResult, itemsResult, processItemsResult, formSnapshot] = await Promise.all([
    adminClient.from('bespoke_submissions').select('*').order('created_at', { ascending: false }),
    loadBespokeHeroSnapshot(adminClient),
    adminClient.from('bespoke_portfolio_categories').select('*').order('display_order', { ascending: true }),
    adminClient.from('bespoke_portfolio_items').select('*').order('display_order', { ascending: true }),
    loadCmsContentListSnapshot(adminClient, 'bespoke_process'),
    loadBespokeFormSnapshot(adminClient),
  ])

  return {
    hero: { ...(heroSnapshot.item ?? { heading_line_1: '', slider_enabled: false, status: 'active' as const }), items: heroSnapshot.items },
    heroRevision: heroSnapshot.revision,
    categories: categoriesResult.error ? [] : (categoriesResult.data ?? []),
    items: itemsResult.error ? [] : (itemsResult.data ?? []),
    processItems: processItemsResult.items.map((item) => ({
      id: readCmsId(item.id), sort_order: Number(item.sort_order), eyebrow: String(item.eyebrow ?? ''),
      title: String(item.title ?? ''), description: String(item.description ?? ''),
    })),
    processRevision: processItemsResult.revision,
    formConfig: formSnapshot,
    submissions: submissionsResult.error ? [] : (submissionsResult.data ?? []),
  }
}

export default async function BespokeAdminPage() {
  const initialData = await getBespokePageData()
  return <BespokeClient initialData={initialData} />
}
