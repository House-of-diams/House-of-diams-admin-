import { catalogPageReader } from '@/lib/catalog-page-data'
import { loadCatalogMasterList } from '@/lib/catalog-master-save'
import { CertificatesClient, type CertificateItem } from './certificates-client'

async function getCertificates(): Promise<CertificateItem[]> {
  const adminClient = await catalogPageReader()
  return await loadCatalogMasterList(adminClient, 'certificate') as CertificateItem[]
}

export default async function CertificatesPage() {
  const initialItems = await getCertificates()
  return <CertificatesClient initialItems={initialItems} />
}
