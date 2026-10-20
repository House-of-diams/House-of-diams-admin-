import { operationsPage } from '@/lib/operations-page-data'
import { createSettingsRepository, settingsRevision } from '@/lib/db/admin-repositories/settings'
import { createSupabaseAdminClient } from '@/lib/admin-supabase'
import type { CatalogGstSlab } from '@/lib/product-catalog'
import { SettingsClient, type SettingsPageData } from './settings-client'
import { readAdminAuthProvider } from '@/lib/auth/integration'

export const dynamic = 'force-dynamic'

async function legacygetSettingsPageData(): Promise<SettingsPageData> {
  const adminClient = createSupabaseAdminClient()

  const [settingsResult, gstResult] = await Promise.all([
    adminClient
      .from('site_settings')
      .select('*')
      .eq('settings_key', 'global_site_settings')
      .limit(1)
      .maybeSingle(),
    adminClient
      .from('catalog_gst_slabs')
      .select('*')
      .order('display_order', { ascending: true }),
  ])

  if (settingsResult.error) {
    throw new Error(settingsResult.error.message)
  }

  if (gstResult.error) {
    throw new Error(gstResult.error.message)
  }

  return {
    settings: {
      whatsapp_number: settingsResult.data?.whatsapp_number ?? '',
      default_gst_slab_id: settingsResult.data?.default_gst_slab_id ?? '',
      maintenance_mode_enabled: Boolean(settingsResult.data?.maintenance_mode_enabled),
      maintenance_mode_message: settingsResult.data?.maintenance_mode_message ?? '',
      estimated_delivery_text: settingsResult.data?.estimated_delivery_text ?? 'Approximately 3 to 4 weeks',
    },
    gstSlabs: (gstResult.data ?? []) as CatalogGstSlab[],
  }
}

export default async function SettingsPage() {
  const initialData = await getSettingsPageData()
  return <SettingsClient initialData={initialData} authProvider={readAdminAuthProvider()} />
}

async function getSettingsPageData():Promise<SettingsPageData> {return operationsPage(async db=>{const repo=createSettingsRepository(db);const settings=await repo.read();return {settings,revision:settingsRevision(settings),gstSlabs:await repo.gst()}},()=>legacygetSettingsPageData())}
