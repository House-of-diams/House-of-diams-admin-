'use client'

import { tryUploadAwsImage } from '@/lib/image-transport'
import { SectionVideoUpload } from '@/components/section-video-upload'
import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, Upload } from 'lucide-react'
import { CmsSaveAction } from '@/components/cms-save-action'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { useCmsSingletonSave } from '@/hooks/use-cms-singleton-save'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

export type CollectionPageEditorInitialData = {
  page_enabled: boolean
  show_in_footer: boolean
  show_home_showcase: boolean
  showcase_heading: string
  showcase_subtitle: string
  showcase_cta_label: string
  showcase_cta_href: string
  showcase_image_path: string
  showcase_mobile_image_path: string
}

type ApiPayload = { item?: CollectionPageEditorInitialData; path?: string; error?: string; revision?: string }

export function CollectionPageEditorClient({ initialData, initialRevision }: { initialData: CollectionPageEditorInitialData; initialRevision: string }) {
  const { toast } = useToast()
  const router = useRouter()
  const [form, setForm] = useState(initialData)
  const [savedForm, setSavedForm] = useState(initialData)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [uploadingField, setUploadingField] = useState<'showcase_image_path' | 'showcase_mobile_image_path' | null>(null)
  const [conflict, setConflict] = useState(false)
  const [status, setStatus] = useState('Collection page settings loaded')
  const { prepareSave, acceptSave } = useCmsSingletonSave(initialRevision)
  const saveInFlight = useRef(false)
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm])
  const unsaved = useUnsavedChanges(dirty)

  const uploadAsset = async (file: File, field: 'showcase_image_path' | 'showcase_mobile_image_path') => {
    if (uploadingField || isSaving || conflict) return


    try {
      const awsPath = await tryUploadAwsImage(file, '/api/cms/uploads/collection-page', {},{start:()=>setUploadingField(field),finish:()=>setUploadingField(null)})
      if (awsPath) { setForm(prev => ({...prev,[field]:awsPath})); setStatus('Showcase image uploaded successfully'); return }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Upload failed.'); return }




    if (file.size > 30 * 1024 * 1024) {
      setStatus('File too large. Max size is 30MB.')
      return
    }

    setUploadingField(field)
    const { supabase } = await import('@/lib/supabase')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Your session expired. Sign in again before uploading.')

      let uploadedPath = ''
      const preparedFile = await prepareCollectionImage(file)
      try {
        const signResponse = await fetch('/api/cms/uploads/collection-page/sign', {
          method: 'POST',
          headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ contentType: preparedFile.type, declaredSize: preparedFile.size }),
        })
        const signed = (await signResponse.json().catch(() => null)) as { bucket?: string; path?: string; token?: string; error?: string } | null
        if (!signResponse.ok || !signed?.bucket || !signed.path || !signed.token) throw new Error(signed?.error ?? 'Unable to prepare upload.')
        const { error } = await supabase.storage.from(signed.bucket).uploadToSignedUrl(signed.path, signed.token, preparedFile, { contentType: preparedFile.type })
        if (error) throw new Error('The direct upload was interrupted.')
        uploadedPath = signed.path
      } catch {
        const fallbackBody = new FormData()
        fallbackBody.append('file', file)
        const fallbackResponse = await fetch('/api/cms/uploads/collection-page', { method: 'POST', headers: { authorization: `Bearer ${accessToken}` }, body: fallbackBody })
        const fallbackPayload = (await fallbackResponse.json().catch(() => null)) as ApiPayload | null
        if (!fallbackResponse.ok || !fallbackPayload?.path) throw new Error(fallbackPayload?.error ?? 'Upload failed.')
        uploadedPath = fallbackPayload.path
      }

      setForm((prev) => ({ ...prev, [field]: uploadedPath }))
      setStatus(field === 'showcase_mobile_image_path' ? 'Mobile showcase image uploaded. Save changes to publish it.' : 'Showcase image uploaded. Save changes to publish it.')
      toast({ title: 'Uploaded', description: 'Collection showcase image is ready to save.' })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed. Your other changes are still in the form.')
    } finally {
      setUploadingField(null)
    }
  }

  const confirmSave = async () => {
    if (saveInFlight.current || !dirty || conflict) return
    saveInFlight.current = true
    setIsSaving(true)
    try {



      const response = await cmsFetch('/api/cms/home/collection-page', {
        method: 'POST',
        headers: {  'content-type': 'application/json' },
        body: JSON.stringify(prepareSave(form)),
      })
      const payload = (await response.json().catch(() => null)) as ApiPayload | null
      if (!response.ok) {
        if (response.status === 409) setConflict(true)
        throw new Error(payload?.error ?? 'Unable to save collection page settings.')
      }
      if (!payload?.item || typeof payload.revision !== 'string') throw new Error('Save response was interrupted. Retry to confirm the same save.')
      setForm(payload.item)
      setSavedForm(payload.item)
      acceptSave(payload.revision)
      setConfirmOpen(false)
      setStatus('Collection page settings saved')
      toast({ title: 'Saved', description: 'Collection page settings updated successfully.' })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Connection interrupted. Your changes are still in the form.')
    } finally {
      saveInFlight.current = false
      setIsSaving(false)
    }
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
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Collection Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Control where the Collection page appears on the website and edit the homepage Collection banner.</p>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      </div>

      <div className="max-w-4xl space-y-6 rounded-lg border border-border bg-white p-8 shadow-xs">
        <label className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Show Collection Page on Website</p>
            <p className="text-xs text-muted-foreground">Turn this on to make the public /collection page available. Turn it off to hide the page.</p>
          </div>
          <input type="checkbox" checked={form.page_enabled} onChange={(e) => setForm((prev) => ({ ...prev, page_enabled: e.target.checked }))} className="h-5 w-5 rounded border-border" />
        </label>

        <label className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Show Collection Link in Footer</p>
            <p className="text-xs text-muted-foreground">Turn this on to add Collection in the website footer navigation.</p>
          </div>
          <input type="checkbox" checked={form.show_in_footer} onChange={(e) => setForm((prev) => ({ ...prev, show_in_footer: e.target.checked }))} className="h-5 w-5 rounded border-border" />
        </label>

        <label className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Show Collection Banner on Home Page</p>
            <p className="text-xs text-muted-foreground">Turn this on to show the wide Collection banner after Best Sellers on the home page.</p>
          </div>
          <input type="checkbox" checked={form.show_home_showcase} onChange={(e) => setForm((prev) => ({ ...prev, show_home_showcase: e.target.checked }))} className="h-5 w-5 rounded border-border" />
        </label>

        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Home Page Banner Heading</label>
          <input value={form.showcase_heading} onChange={(e) => setForm((prev) => ({ ...prev, showcase_heading: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Home Page Banner Subtitle</label>
          <textarea value={form.showcase_subtitle} onChange={(e) => setForm((prev) => ({ ...prev, showcase_subtitle: e.target.value }))} rows={4} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Button Text</label>
            <input value={form.showcase_cta_label} onChange={(e) => setForm((prev) => ({ ...prev, showcase_cta_label: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Button Link</label>
            <input value={form.showcase_cta_href} onChange={(e) => setForm((prev) => ({ ...prev, showcase_cta_href: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Home Page Banner Desktop Image</label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
              <Upload size={14} />
              Upload Image
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml" disabled={Boolean(uploadingField) || isSaving || conflict} className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0]
                if (file) void uploadAsset(file, 'showcase_image_path')
              }} />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">{form.showcase_image_path || 'No desktop image uploaded yet'}</p>
            <SectionVideoUpload className="mt-3 block" label="Upload video instead" disabled={Boolean(uploadingField)} onStatus={setStatus} onUploaded={(url) => setForm((prev) => ({ ...prev, showcase_image_path: url }))} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Home Page Banner Mobile Image</label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
              <Upload size={14} />
              Upload Mobile Image
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml" disabled={Boolean(uploadingField) || isSaving || conflict} className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0]
                if (file) void uploadAsset(file, 'showcase_mobile_image_path')
              }} />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">{form.showcase_mobile_image_path || 'No mobile image uploaded yet'}</p>
            <SectionVideoUpload className="mt-3 block" label="Upload video instead" disabled={Boolean(uploadingField)} onStatus={setStatus} onUploaded={(url) => setForm((prev) => ({ ...prev, showcase_mobile_image_path: url }))} />
          </div>
        </div>
      </div>

      {conflict ? <p className="mt-4 text-sm text-amber-800">This content changed after you opened it. Keep a copy of your draft, then reload before saving.</p> : null}
      <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} disabled={!dirty || Boolean(uploadingField) || conflict} />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Save collection page settings?"
        description="This will update the public Collection page, footer visibility, and home showcase."
        confirmText="Save"
        cancelText="Cancel"
        type="confirm"
        isLoading={isSaving}
        onConfirm={confirmSave}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved Collection changes?" description="Your Collection settings and uploaded image paths have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)} />
    </div>
  )
}

async function prepareCollectionImage(file: File) {
  if (file.type === 'image/svg+xml') return file
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
    throw new Error('Invalid image type.')
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const width = Math.min(bitmap.width, 1600)
    const height = Math.max(1, Math.round(bitmap.height * (width / bitmap.width)))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
    if (!blob) throw new Error('Unable to optimize image.')
    return new File([blob], `${crypto.randomUUID()}.webp`, { type: 'image/webp' })
  } finally {
    bitmap.close()
  }
}
