import { CMSTabs } from '@/components/cms-tabs'
import { CMSSectionTable } from '@/components/cms-section-table'

export default function SummaryPage() {
  return <div><CMSTabs /><div className="p-8"><h1 className="font-jakarta text-3xl font-semibold">Summary</h1><p className="mb-8 mt-1 text-sm text-muted-foreground">Manage shared summary content for storefront pages.</p><CMSSectionTable basePath="/dashboard/cms/summary" sections={[{ id: 'info', label: 'Summary Info', description: 'Edit the heading, icons, pointers, and optional video links shown wherever this component is placed.' }]} /></div></div>
}
