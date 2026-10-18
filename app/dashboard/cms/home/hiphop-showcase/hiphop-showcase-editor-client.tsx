'use client'

import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useState, type ChangeEvent } from 'react'
import { ArrowLeft, Upload } from 'lucide-react'
import { CmsSaveAction } from '@/components/cms-save-action'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { uploadCmsAssetDirectWithFallback } from '@/lib/cms-direct-upload-client'
import { useCmsSingletonSave } from '@/hooks/use-cms-singleton-save'

export type HipHopShowcaseInitialData = {
  is_enabled: boolean
  eyebrow: string
  heading_line_1: string
  heading_line_2: string
  heading_emphasis: string
  cta_label: string
  cta_link: string
  image_path: string
  image_alt: string
}

type ApiPayload = {
  item?: HipHopShowcaseInitialData
  path?: string
  error?: string
  revision?: string
}

export function HipHopShowcaseEditorClient({ initialData, initialRevision }: { initialData: HipHopShowcaseInitialData; initialRevision: string }) {
  const { toast } = useToast()
  const [form, setForm] = useState(initialData)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState('Hip Hop home showcase loaded')
  const { prepareSave, acceptSave } = useCmsSingletonSave(initialRevision)

  const uploadAsset = async (file: File) => {




    let path = ''
    try {
      path = await uploadCmsAssetDirectWithFallback({
        file, accessToken: undefined,
        signEndpoint: '/api/cms/uploads/hiphop-showcase/sign',
        fallbackEndpoint: '/api/cms/uploads/hiphop-showcase',
        maxInputBytes: 5 * 1024 * 1024, rasterWidth: 2200, webpQuality: 84,
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed')
      return
    }

    setForm((prev) => ({ ...prev, image_path: path }))
    setStatus('Hip Hop showcase image uploaded')
    toast({ title: 'Uploaded', description: 'Hip Hop showcase image uploaded successfully.' })
  }

  const confirmSave = async () => {
    setIsSaving(true)





    const response = await cmsFetch('/api/cms/home/hiphop-showcase', {
      method: 'POST',
      headers: {

        'content-type': 'application/json',
      },
      body: JSON.stringify(prepareSave(form)),
    })

    const payload = (await response.json().catch(() => null)) as ApiPayload | null
    setIsSaving(false)

    if (!response.ok) {
      setStatus(payload?.error ?? 'Unable to save Hip Hop showcase.')
      return
    }
    if (!payload?.revision) {
      setStatus('The showcase was saved, but its new revision was not returned. Reload this page.')
      return
    }
    acceptSave(payload.revision)

    setConfirmOpen(false)
    setStatus('Hip Hop home showcase saved')
    toast({ title: 'Saved', description: 'Hip Hop home showcase updated successfully.' })
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center gap-4">
        <Link href="/dashboard/cms/home" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
          <ArrowLeft size={16} />
          Back to Home
        </Link>
      </div>

      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Hip Hop Home Showcase</h1>
        <p className="mt-1 text-sm text-muted-foreground">Control the Hip Hop showcase block that appears on the homepage.</p>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      </div>

      <div className="max-w-4xl space-y-6 rounded-lg border border-border bg-white p-8 shadow-xs">
        <label className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Show Hip Hop Banner on Home Page</p>
            <p className="text-xs text-muted-foreground">Turn this on to show the wide Hip Hop banner on the home page. Turn it off to hide it.</p>
          </div>
          <input
            type="checkbox"
            checked={form.is_enabled}
            onChange={(e) => setForm((prev) => ({ ...prev, is_enabled: e.target.checked }))}
            className="h-5 w-5 rounded border-border"
          />
        </label>

        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Eyebrow</label>
          <input
            value={form.eyebrow}
            onChange={(e) => setForm((prev) => ({ ...prev, eyebrow: e.target.value }))}
            className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
          />
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Heading Line 1</label>
            <input
              value={form.heading_line_1}
              onChange={(e) => setForm((prev) => ({ ...prev, heading_line_1: e.target.value }))}
              className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Heading Line 2</label>
            <input
              value={form.heading_line_2}
              onChange={(e) => setForm((prev) => ({ ...prev, heading_line_2: e.target.value }))}
              className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Heading Emphasis</label>
            <input
              value={form.heading_emphasis}
              onChange={(e) => setForm((prev) => ({ ...prev, heading_emphasis: e.target.value }))}
              className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
            />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">CTA Label</label>
            <input
              value={form.cta_label}
              onChange={(e) => setForm((prev) => ({ ...prev, cta_label: e.target.value }))}
              className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">CTA Link</label>
            <input
              value={form.cta_link}
              onChange={(e) => setForm((prev) => ({ ...prev, cta_link: e.target.value }))}
              className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Image Alt Text</label>
          <input
            value={form.image_alt}
            onChange={(e) => setForm((prev) => ({ ...prev, image_alt: e.target.value }))}
            className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Showcase Image</label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
            <Upload size={14} />
            Upload Image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0]
                if (file) void uploadAsset(file)
              }}
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">{form.image_path || 'No showcase image uploaded yet'}</p>
        </div>
      </div>

      <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Save Hip Hop home showcase?"
        description="This will update the Hip Hop showcase block on the homepage."
        confirmText="Save"
        cancelText="Cancel"
        type="confirm"
        isLoading={isSaving}
        onConfirm={confirmSave}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
