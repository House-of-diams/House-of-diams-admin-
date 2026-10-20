import { EnquiriesClient } from './enquiries-client'
import { getEnquiriesPageData, normalizeEnquiryTab } from '@/lib/enquiries'
import { pageParam } from '@/lib/page-param'


export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; page?: string | string[] }> }) {
  const params = await searchParams
  const tab = normalizeEnquiryTab(Array.isArray(params.tab) ? params.tab[0] : params.tab)
  const initialData = await getEnquiriesPageData(tab, pageParam(params.page))
  return <EnquiriesClient initialData={initialData} />
}
