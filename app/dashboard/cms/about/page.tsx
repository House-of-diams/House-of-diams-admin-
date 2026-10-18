import { CMSTabs } from '@/components/cms-tabs'
import { CMSSectionTable } from '@/components/cms-section-table'

const ABOUT_SECTIONS = [
  { id: 'hero', label: 'Hero', description: 'Top image or video banner, overlay content, and button' },
  { id: 'wide-banner', label: 'Wide Banner', description: 'Secondary edge-to-edge image banner with text and button' },
  { id: 'founders', label: 'Founders', description: 'Founder profiles and bios' },
  { id: 'timeline', label: 'Timeline', description: 'Company history and milestones' },
  { id: 'values', label: 'Values', description: 'Core values cards and copy' },
] as const

export default function AboutPageEditor() {
  return (
    <div>
      <CMSTabs />
      <div className="p-8">
        <div className="mb-10">
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">About Page</h1>
          <p className="mt-1 text-sm text-muted-foreground">Edit the about page sections</p>
        </div>
        <CMSSectionTable basePath="/dashboard/cms/about" sections={ABOUT_SECTIONS} />
      </div>
    </div>
  )
}

