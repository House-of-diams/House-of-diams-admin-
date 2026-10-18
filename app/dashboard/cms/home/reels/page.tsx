import { cmsPageReader } from '@/lib/cms-page-data'
import { readCms } from '@/lib/cms-command'
﻿import { createSupabaseAdminClient } from '@/lib/admin-supabase'
import { ReelsEditorClient, type ReelsInitialData } from './reels-editor-client'

const SECTION_KEY = 'home_instagram_reels'

type ReelItemRow = { id?: string; instagram_url: string; title: string; display_order: number; is_enabled: boolean }

async function loadReelItems(client: ReturnType<typeof createSupabaseAdminClient>) {
  const result = await client
    .from('home_instagram_reels')
    .select('id, instagram_url, title, display_order, is_enabled')
    .eq('section_key', SECTION_KEY)
    .order('display_order')
    .limit(30)

  if (!result.error) return result
  if (!result.error.message?.includes('cover_image_url')) return result

  return client
    .from('home_instagram_reels')
    .select('id, instagram_url, title, display_order, is_enabled')
    .eq('section_key', SECTION_KEY)
    .order('display_order')
    .limit(30)
}

async function getInitialData(): Promise<ReelsInitialData> {
  const reader = await cmsPageReader()
  const snapshot = await readCms(reader, 'cms_reels_snapshot_v1', {})
  const client = 'execute' in reader ? null : reader as ReturnType<typeof createSupabaseAdminClient>
  if (!snapshot.error) {
    const data = snapshot.data as {section: Omit<ReelsInitialData,'items'|'revision'>;items:ReelsInitialData['items'];revision:string}
    return {
      heading: data.section?.heading ?? 'Follow Us on Instagram',
      subtitle: data.section?.subtitle ?? '',
      is_enabled: data.section?.is_enabled ?? true,
      marquee_duration_seconds: data.section?.marquee_duration_seconds ?? 40,
      pause_on_hover: data.section?.pause_on_hover ?? true,
      items: data.items,
      revision: data.revision,
    }
  }
  // During deployment, keep existing content readable but disable unsafe saves.
  if (!['PGRST202', '42883'].includes(snapshot.error.code ?? '')) throw new Error('Unable to load reels. Please reload this page.')
  if (!client) throw new Error('Unable to load reels.')
  const [section, items] = await Promise.all([
    client.from('home_instagram_reels_section').select('heading, subtitle, is_enabled, marquee_duration_seconds, pause_on_hover').eq('section_key', SECTION_KEY).maybeSingle(),
    loadReelItems(client),
  ])

  if (section.error || items.error) throw new Error(section.error?.message ?? items.error?.message)

  return {
    revision: null,
    heading: section.data?.heading ?? 'Follow Us on Instagram',
    subtitle: section.data?.subtitle ?? 'Discover the latest from House of Diams',
    is_enabled: section.data?.is_enabled ?? true,
    marquee_duration_seconds: section.data?.marquee_duration_seconds ?? 40,
    pause_on_hover: section.data?.pause_on_hover ?? true,
    items: ((items.data ?? []) as ReelItemRow[]).map((item) => ({ ...item })),
  }
}

export default async function ReelsEditorPage() {
  return <ReelsEditorClient initialData={await getInitialData()} />
}
