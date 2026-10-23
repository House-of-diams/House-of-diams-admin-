import { loadRdsBespokePageData } from '@/lib/cms-page-data'
import {
  BespokeClient,
  type BespokePageData,
} from './bespoke-client'

async function getBespokePageData(): Promise<BespokePageData> {
  return loadRdsBespokePageData()
}

export default async function BespokeAdminPage() {
  const initialData = await getBespokePageData()
  return <BespokeClient initialData={initialData} />
}
