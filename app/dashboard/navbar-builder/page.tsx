import { unstable_noStore as noStore } from 'next/cache'
import { NavbarBuilderOverview } from '@/components/navbar-builder-editor'
import { loadNavbarPageData } from '@/lib/catalog-page-data'

export const dynamic = 'force-dynamic'

export default async function NavbarBuilderPage() {
  noStore()
  const initialData = await loadNavbarPageData()
  return <NavbarBuilderOverview initialData={initialData} />
}
