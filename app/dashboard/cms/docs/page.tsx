'use client'

import { useEffect } from 'react'
import { CMSTabs } from '@/components/cms-tabs'
import { CMSSectionTable } from '@/components/cms-section-table'
import { loadDocsPage } from '@/lib/docs-admin-cache'

const DOCS_SECTIONS = [
  { id: 'shipping', label: 'Shipping', description: 'Shipping timelines and delivery details' },
  { id: 'returns', label: 'Returns', description: 'Returns, exchanges, and claims' },
  { id: 'terms', label: 'Terms & Conditions', description: 'Terms of use and purchase conditions' },
  { id: 'privacy-policy', label: 'Privacy Policy', description: 'How customer data is collected and used' },
]

export default function DocsPageEditor() {
  useEffect(() => {
    DOCS_SECTIONS.forEach((section) => {
      void loadDocsPage(section.id).catch(() => undefined)
    })
  }, [])

  return (
    <div>
      <CMSTabs />
      <div className="p-8">
        <div className="mb-10">
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Docs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Edit policy and support pages used in the footer</p>
        </div>
        <CMSSectionTable basePath="/dashboard/cms/docs" sections={DOCS_SECTIONS} />
      </div>
    </div>
  )
}
