'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Save, ArrowLeft } from 'lucide-react'

export default function AnnouncementEditor() {
  const [formData, setFormData] = useState({
    message: '',
    linkText: '',
    linkUrl: '',
    enabled: true,
  })
  const [hasChanges, setHasChanges] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    setHasChanges(true)
  }

  const handleSave = () => {
    console.log('Saving announcement:', formData)
    setHasChanges(false)
    alert('Changes saved successfully!')
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-8">
        <div className="mb-8 flex items-center gap-4">
          <Link
            href="/dashboard/cms/global"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Global
          </Link>
        </div>

        <div className="mb-10">
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Announcement Bar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Edit site-wide announcement message</p>
        </div>

        <div className="max-w-2xl bg-white border border-border rounded-lg p-8 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-border">
            <div>
              <p className="text-sm font-semibold text-foreground">Enable Announcement</p>
              <p className="text-xs text-muted-foreground">Show or hide the bar on all pages</p>
            </div>
            <input
              type="checkbox"
              name="enabled"
              checked={formData.enabled}
              onChange={handleChange}
              className="h-5 w-5 rounded border-border text-primary focus:ring-primary"
            />
          </div>

          <div className={!formData.enabled ? 'opacity-50 pointer-events-none' : ''}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Message</label>
                <input
                  type="text"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  placeholder="e.g., Free worldwide shipping on all orders"
                  className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Link Text</label>
                  <input
                    type="text"
                    name="linkText"
                    value={formData.linkText}
                    onChange={handleChange}
                    placeholder="Shop Now"
                    className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Link URL</label>
                  <input
                    type="text"
                    name="linkUrl"
                    value={formData.linkUrl}
                    onChange={handleChange}
                    placeholder="/shop"
                    className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {hasChanges && (
          <div className="mt-10 flex gap-3 fixed bottom-8 right-8">
            <button
              onClick={() => setHasChanges(false)}
              className="px-4 py-2.5 rounded-lg border border-border text-foreground text-sm font-semibold hover:bg-secondary transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Save size={16} />
              Save Changes
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
