'use client'

import { CMSTabs } from '@/components/cms-tabs'
import { CMSSectionTable } from '@/components/cms-section-table'

const SUPPORT_SECTIONS = [
  { id: 'faq', label: 'FAQ', description: 'Create and manage support questions and answers' },
  { id: 'announcement-bar', label: 'Announcement Bar', description: 'Manage the top scrolling announcement bar content' },
]

export default function SupportPageEditor() {
  return (
    <div>
      <CMSTabs />

      <div className="p-8">
        <div className="mb-10">
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Support</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage support content used across the storefront</p>
        </div>

        <CMSSectionTable basePath="/dashboard/cms/support" sections={SUPPORT_SECTIONS} />
      </div>
    </div>
  )
}
