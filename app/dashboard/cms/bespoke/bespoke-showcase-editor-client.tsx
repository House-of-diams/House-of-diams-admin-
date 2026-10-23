'use client'

import { uploadAwsImage } from '@/lib/image-transport'
import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ChangeEvent } from 'react'
import { ArrowLeft, Upload } from 'lucide-react'
import { CmsSaveAction } from '@/components/cms-save-action'
import { SectionVideoUpload } from '@/components/section-video-upload'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { useCmsSingletonSave } from '@/hooks/use-cms-singleton-save'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

export type BespokeShowcaseEditorInitialData = {
  is_enabled: boolean
  eyebrow: string
  heading: string
  subtitle: string
  cta_label: string
  image_path: string
  mobile_image_path: string
  image_alt: string
  sort_order: number
}

type ApiPayload = { item?: BespokeShowcaseEditorInitialData; path?: string; error?: string; revision?: string }

export function BespokeShowcaseEditorClient({ initialData, initialRevision }: { initialData: BespokeShowcaseEditorInitialData; initialRevision: string }) {
  const { toast } = useToast()
  const router = useRouter()
  const [form, setForm] = useState(initialData)
  const [savedForm, setSavedForm] = useState(initialData)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState('Bespoke home showcase loaded')
  const [uploadingField, setUploadingField] = useState<'image_path' | 'mobile_image_path' | null>(null)
  const { prepareSave, acceptSave } = useCmsSingletonSave(initialRevision)
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm)
  const unsaved = useUnsavedChanges(dirty)

  const uploadAsset = async (file: File, field: 'image_path' | 'mobile_image_path') => {

    try {
      const awsPath = await uploadAwsImage(file, '/api/cms/uploads/bespoke-showcase', {},{start:()=>setUploadingField(field),finish:()=>setUploadingField(null)})
      if (awsPath) { setForm(prev => ({...prev,[field]:awsPath})); setStatus('Image uploaded successfully'); return }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Upload failed.'); return }


  }

  const confirmSave = async () => {
    setIsSaving(true)
    try {



      const response = await cmsFetch('/api/cms/home/bespoke-showcase', {
        method: 'POST', headers: {  'content-type': 'application/json' },
        body: JSON.stringify(prepareSave(form)),
      })
      const payload = (await response.json().catch(() => null)) as ApiPayload | null
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save bespoke showcase settings.')
      if (!payload?.revision || !payload.item) throw new Error('Save response was interrupted. Retry to confirm the same save.')
      setForm(payload.item)
      setSavedForm(payload.item)
      acceptSave(payload.revision)
      setConfirmOpen(false)
      setStatus('Bespoke home showcase saved')
      toast({ title: 'Saved', description: 'Bespoke home showcase updated successfully.' })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save bespoke showcase settings.')
    } finally { setIsSaving(false) }
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center gap-4">
        <Link href="/dashboard/cms" onClick={(event) => { event.preventDefault(); unsaved.confirmNavigation(() => router.push('/dashboard/cms')) }} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
          <ArrowLeft size={16} />
          Back to CMS
        </Link>
      </div>

      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Bespoke Home Showcase</h1>
        <p className="mt-1 text-sm text-muted-foreground">Control the mirrored Bespoke block on the home page. The button opens the bespoke enquiry popup.</p>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      </div>

      <div className="max-w-4xl space-y-6 rounded-lg border border-border bg-white p-8 shadow-xs">
        <label className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Show Bespoke Block on Home Page</p>
            <p className="text-xs text-muted-foreground">Turn this on to show the Bespoke showcase after the Collection showcase.</p>
          </div>
          <input type="checkbox" checked={form.is_enabled} onChange={(e) => setForm((prev) => ({ ...prev, is_enabled: e.target.checked }))} className="h-5 w-5 rounded border-border" />
        </label>

        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Eyebrow Text</label>
          <input value={form.eyebrow} onChange={(e) => setForm((prev) => ({ ...prev, eyebrow: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Heading</label>
          <input value={form.heading} onChange={(e) => setForm((prev) => ({ ...prev, heading: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Subtitle</label>
          <textarea value={form.subtitle} onChange={(e) => setForm((prev) => ({ ...prev, subtitle: e.target.value }))} rows={4} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Button Text</label>
            <input value={form.cta_label} onChange={(e) => setForm((prev) => ({ ...prev, cta_label: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Sort Order</label>
            <input type="number" value={form.sort_order} onChange={(e) => setForm((prev) => ({ ...prev, sort_order: Number(e.target.value) || 0 }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Image Alt Text</label>
          <input value={form.image_alt} onChange={(e) => setForm((prev) => ({ ...prev, image_alt: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Desktop Image</label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
              <Upload size={14} />
              Upload Image
              <input type="file" accept="image/*" className="hidden" disabled={Boolean(uploadingField)} onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0]
                if (file) void uploadAsset(file, 'image_path')
              }} />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">{form.image_path || 'No desktop image uploaded yet'}</p>
            <SectionVideoUpload className="mt-3 block" label="Upload video instead" disabled={Boolean(uploadingField)} onStatus={setStatus} onUploaded={(url) => setForm((prev) => ({ ...prev, image_path: url }))} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Mobile Image</label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
              <Upload size={14} />
              Upload Mobile Image
              <input type="file" accept="image/*" className="hidden" disabled={Boolean(uploadingField)} onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0]
                if (file) void uploadAsset(file, 'mobile_image_path')
              }} />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">{form.mobile_image_path || 'No mobile image uploaded yet'}</p>
            <SectionVideoUpload className="mt-3 block" label="Upload video instead" disabled={Boolean(uploadingField)} onStatus={setStatus} onUploaded={(url) => setForm((prev) => ({ ...prev, mobile_image_path: url }))} />
          </div>
        </div>
      </div>

      <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} disabled={!dirty || Boolean(uploadingField)} />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Save bespoke showcase settings?"
        description="This will update the Bespoke block on the public home page."
        confirmText="Save"
        cancelText="Cancel"
        type="confirm"
        isLoading={isSaving}
        onConfirm={confirmSave}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved Bespoke Showcase changes?" description="Your showcase changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)} />
    </div>
  )
}

