import { readCatalogDataProvider } from '@/lib/catalog-provider'
import { authorizeProductPage } from '@/lib/product-server-request'

export default async function CatalogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (readCatalogDataProvider(process.env) === 'rds') await authorizeProductPage()
  return <>{children}</>
}
