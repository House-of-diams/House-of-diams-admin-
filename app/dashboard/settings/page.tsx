import { operationsPage } from '@/lib/operations-page-data'
import { createSettingsRepository, settingsRevision } from '@/lib/db/admin-repositories/settings'
import { SettingsClient, type SettingsPageData } from './settings-client'
import { readAdminAuthProvider } from '@/lib/auth/integration'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const initialData = await getSettingsPageData()
  return <SettingsClient initialData={initialData} authProvider={readAdminAuthProvider()} />
}

async function getSettingsPageData():Promise<SettingsPageData> {return operationsPage(async db=>{const repo=createSettingsRepository(db);const settings=await repo.read();return {settings,revision:settingsRevision(settings),gstSlabs:await repo.gst()}})}
