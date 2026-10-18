'use client'

import { CMSTabs } from '@/components/cms-tabs'
import { CMSSectionTable } from '@/components/cms-section-table'

const CONTACT_SECTIONS = [
  { id: 'hero', label: 'Contact Hero', description: 'Heading and intro copy' },
  { id: 'info', label: 'Contact Info', description: 'Info cards and links' },
  { id: 'submissions', label: 'Submissions', description: 'Incoming contact requests' },
]

export default function ContactPageEditor() {
  return (
    <div>
      <CMSTabs />
      <div className="p-8">
        <div className="mb-10">
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Contact Page</h1>
          <p className="mt-1 text-sm text-muted-foreground">Edit the contact page sections</p>
        </div>
        <CMSSectionTable basePath="/dashboard/cms/contact" sections={CONTACT_SECTIONS} />
      </div>
    </div>
  )
}
