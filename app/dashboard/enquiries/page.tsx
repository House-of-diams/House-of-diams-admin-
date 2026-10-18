import { EnquiriesClient } from './enquiries-client'
import { getEnquiriesPageData } from '@/lib/enquiries'

export default async function EnquiriesPage() {
  const initialData = await getEnquiriesPageData()
  return <EnquiriesClient initialData={initialData} />
}

