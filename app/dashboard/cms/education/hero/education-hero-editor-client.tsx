'use client'

import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ChangeEvent } from 'react'
import { ArrowLeft, Upload } from 'lucide-react'
import { CmsSaveAction } from '@/components/cms-save-action'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { uploadCmsAssetDirectWithFallback } from '@/lib/cms-direct-upload-client'
import { useCmsSingletonSave } from '@/hooks/use-cms-singleton-save'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

export type EducationHeroForm = { is_enabled: boolean; heading: string; paragraph: string; button_label: string; button_link: string; desktop_image_path: string; desktop_image_alt: string; mobile_image_path: string; mobile_image_alt: string }

export function EducationHeroEditorClient({ initialData, initialRevision }: { initialData: EducationHeroForm; initialRevision: string }) {
  const router = useRouter()
  const [form, setForm] = useState(initialData)
  const [savedForm, setSavedForm] = useState(initialData)
  const [status, setStatus] = useState('Education hero loaded')
  const [isSaving, setIsSaving] = useState(false)
  const [uploading, setUploading] = useState<'desktop' | 'mobile' | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { toast } = useToast()
  const { prepareSave, acceptSave } = useCmsSingletonSave(initialRevision)
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm)
  const unsaved = useUnsavedChanges(dirty)

  const upload = async (kind: 'desktop' | 'mobile', file?: File) => {
    if (!file) return



    setUploading(kind)
    try {
      const path = await uploadCmsAssetDirectWithFallback({ file, accessToken: undefined, signEndpoint: '/api/cms/uploads/education/sign', fallbackEndpoint: '/api/cms/uploads/education', maxInputBytes: 5 * 1024 * 1024, rasterWidth: 2200, webpQuality: 84 })
      setForm((current) => ({ ...current, [kind === 'desktop' ? 'desktop_image_path' : 'mobile_image_path']: path }))
      setStatus(`${kind === 'desktop' ? 'Desktop' : 'Mobile'} image uploaded`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to upload image.') } finally { setUploading(null) }
  }

  const save = async () => {
    setIsSaving(true)
    try {



      const response = await cmsFetch('/api/cms/education/hero', { method: 'POST', headers: { 'content-type': 'application/json',  }, body: JSON.stringify(prepareSave(form)) })
      const payload = await response.json().catch(() => null) as { error?: string; revision?: string; item?: EducationHeroForm } | null
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save education hero.')
      if (!payload?.revision || !payload.item) throw new Error('Save response was interrupted. Retry to confirm the same save.')
      setForm(payload.item); setSavedForm(payload.item); acceptSave(payload.revision)
      setConfirmOpen(false); setStatus('Education hero saved')
      toast({ title: 'Saved', description: 'Education page hero updated successfully.' })
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to save education hero.') }
    finally { setIsSaving(false) }
  }

  const input = 'w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm'
  return <div className="min-h-screen bg-background p-8">
    <div className="mb-8 flex items-center justify-between gap-4"><Link href="/dashboard/cms/education" onClick={(event) => { event.preventDefault(); unsaved.confirmNavigation(() => router.push('/dashboard/cms/education')) }} className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={16} />Back to Education</Link><CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} disabled={!dirty || Boolean(uploading)} position="inline" /></div>
    <div className="mb-8"><h1 className="font-jakarta text-3xl font-semibold">Education Page Hero</h1><p className="mt-2 text-xs text-muted-foreground">{status}</p></div>
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <section className="space-y-5 rounded-lg border border-border bg-white p-6 shadow-xs">
        <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={form.is_enabled} onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })} className="h-4 w-4" />Show hero on education page</label>
        <div><label className="mb-2 block text-sm font-semibold">Heading</label><input value={form.heading} onChange={(e) => setForm({ ...form, heading: e.target.value })} className={input} /></div>
        <div><label className="mb-2 block text-sm font-semibold">Paragraph</label><textarea rows={5} value={form.paragraph} onChange={(e) => setForm({ ...form, paragraph: e.target.value })} className={input} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-semibold">Button label</label><input value={form.button_label} onChange={(e) => setForm({ ...form, button_label: e.target.value })} className={input} /></div><div><label className="mb-2 block text-sm font-semibold">Button link</label><input value={form.button_link} onChange={(e) => setForm({ ...form, button_link: e.target.value })} className={input} /></div></div>
      </section>
      <section className="space-y-6 rounded-lg border border-border bg-white p-6 shadow-xs">
        {(['desktop','mobile'] as const).map((kind) => <div key={kind} className="space-y-3"><label className="block text-sm font-semibold capitalize">{kind} image</label><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"><Upload size={14} />{uploading === kind ? 'Uploading...' : `Upload ${kind} image`}<input type="file" accept="image/*" className="hidden" disabled={Boolean(uploading)} onChange={(e: ChangeEvent<HTMLInputElement>) => void upload(kind, e.target.files?.[0])} /></label><p className="break-all text-xs text-muted-foreground">{form[`${kind}_image_path`]}</p><label className="block text-sm font-semibold">{kind === 'desktop' ? 'Desktop' : 'Mobile'} image alt text</label><input value={form[`${kind}_image_alt`]} onChange={(e) => setForm({ ...form, [`${kind}_image_alt`]: e.target.value })} className={input} /></div>)}
      </section>
    </div>
    <ConfirmDialog isOpen={confirmOpen} title="Save Education Hero?" description="This updates the hero shown on the public education page." confirmText="Save" cancelText="Cancel" type="confirm" isLoading={isSaving} onConfirm={save} onCancel={() => setConfirmOpen(false)} />
    <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved Education Hero changes?" description="Your Education Hero changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)} />
  </div>
}
