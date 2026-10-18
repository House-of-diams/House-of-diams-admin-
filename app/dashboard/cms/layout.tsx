import { authorizeCmsPage } from '@/lib/cms-page-data'
export default async function CMSLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await authorizeCmsPage()
  return children
}
