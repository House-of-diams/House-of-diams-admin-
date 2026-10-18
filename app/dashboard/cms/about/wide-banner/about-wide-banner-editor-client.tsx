'use client'

import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChangeEvent, useState } from 'react'
import { ArrowLeft, Upload } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Switch } from '@/components/ui/switch'
import { CmsSaveAction } from '@/components/cms-save-action'
import { uploadCmsAssetDirectWithFallback } from '@/lib/cms-direct-upload-client'
import { useCmsSingletonSave } from '@/hooks/use-cms-singleton-save'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

export type BannerPosition = 'left' | 'center' | 'right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
export type AboutWideBannerInitialData = {
  section_key: string; is_enabled: boolean; desktop_image_path: string; mobile_image_path: string; image_alt: string;
  heading: string; paragraph: string; show_button: boolean; button_label: string; button_link: string;
  content_position: BannerPosition; sort_order: number;
}

const inputClass = 'w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10'
function SwitchRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center justify-between gap-6 rounded-lg border border-border px-4 py-3"><span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span></span><Switch checked={checked} onCheckedChange={onChange} aria-label={label} /></div>
}

export function AboutWideBannerEditorClient({ initialData, initialRevision }: { initialData: AboutWideBannerInitialData; initialRevision: string }) {
  const [form, setForm] = useState(initialData)
  const [savedForm, setSavedForm] = useState(initialData)
  const [status, setStatus] = useState('About wide banner loaded')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { prepareSave, acceptSave } = useCmsSingletonSave(initialRevision)
  const router = useRouter()
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm)
  const unsaved = useUnsavedChanges(dirty)
  const patch = <K extends keyof AboutWideBannerInitialData>(key: K, value: AboutWideBannerInitialData[K]) => setForm((current) => ({ ...current, [key]: value }))

  const upload = async (event: ChangeEvent<HTMLInputElement>, target: 'desktop_image_path' | 'mobile_image_path') => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return



    setUploading(target); setStatus('Uploading image...')
    try {
      const path = await uploadCmsAssetDirectWithFallback({
        file, accessToken: undefined, signEndpoint: '/api/cms/uploads/about-wide-banner/sign', fallbackEndpoint: '/api/cms/uploads/about-wide-banner',
        maxInputBytes: 8 * 1024 * 1024, rasterWidth: 2400, webpQuality: 86, rasterOnly: true,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'], signFields: { declaredSize: file.size },
      })
      patch(target, path); setStatus('Upload complete. Save changes to publish it.')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Upload failed.') }
    finally { setUploading(null) }
  }

  const save = async () => {
    setSaving(true)
    try {




      const response = await cmsFetch('/api/cms/about/wide-banner', {
        method: 'POST',
        headers: { 'content-type': 'application/json',  },
        body: JSON.stringify(prepareSave(form)),
      })

      const payload = await response.json().catch(() => null) as { error?: string; revision?: string } | null
      if (!response.ok) {
        setStatus(payload?.error ?? 'Unable to save wide banner.')
        return
      }
      if (!payload?.revision || !(payload as { item?: AboutWideBannerInitialData }).item) {
        setStatus('Save response was interrupted. Retry to confirm the same save.')
        return
      }
      const saved = (payload as { item: AboutWideBannerInitialData }).item
      setForm(saved)
      setSavedForm(saved)
      acceptSave(payload.revision)

      setConfirmOpen(false)
      setStatus('About wide banner saved')
    } catch (error) {
      setStatus(error instanceof Error && error.message !== 'Failed to fetch'
        ? error.message
        : 'Unable to reach the admin server. Please wait a moment and save again.')
    } finally {
      setSaving(false)
    }
  }
  const uploadBox = (label: string, target: 'desktop_image_path' | 'mobile_image_path') => <div><label className="mb-2 block text-sm font-semibold">{label}</label><label className="flex min-h-28 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-secondary/30 p-5 text-center transition hover:border-primary hover:bg-secondary/50"><span className="text-sm text-muted-foreground"><Upload className="mx-auto mb-2 size-5" />{uploading === target ? 'Uploading...' : form[target] ? 'Replace image' : 'Choose image'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={Boolean(uploading)} onChange={(event) => upload(event, target)} /></label>{form[target] ? <div className="mt-2 flex gap-2"><input value={form[target]} readOnly className={`${inputClass} min-w-0 text-xs`} /><button type="button" className="rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-secondary" onClick={() => patch(target, '')}>Clear</button></div> : null}</div>

  return <div className="min-h-screen bg-background p-8">
    <div className="mb-8 flex items-center justify-between gap-4"><Link href="/dashboard/cms/about" onClick={(event) => { event.preventDefault(); unsaved.confirmNavigation(() => router.push('/dashboard/cms/about')) }} className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80"><ArrowLeft size={16} />Back to About</Link><CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={saving} disabled={!dirty} position="inline" /></div>
    <div className="mb-10"><h1 className="font-jakarta text-3xl font-semibold">About Wide Banner</h1><p className="mt-1 text-sm text-muted-foreground">Manage the secondary edge-to-edge image banner.</p><p className="mt-2 text-xs text-muted-foreground" aria-live="polite">{status}</p></div>
    <div className="grid max-w-6xl gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <section className="rounded-lg border border-border bg-white p-8 shadow-xs"><h2 className="font-jakarta text-lg font-semibold">Images</h2><div className="mt-5 grid gap-5 md:grid-cols-2">{uploadBox('Desktop image', 'desktop_image_path')}{uploadBox('Mobile image (optional)', 'mobile_image_path')}</div><div className="mt-5"><label className="mb-2 block text-sm font-semibold">Image alt text</label><input value={form.image_alt} onChange={(event) => patch('image_alt', event.target.value)} className={inputClass} /></div></section>
        <section className="rounded-lg border border-border bg-white p-8 shadow-xs"><h2 className="font-jakarta text-lg font-semibold">Content</h2>
          <div className="mt-5 space-y-5">
            <div><label className="mb-2 block text-sm font-semibold">Heading</label><input value={form.heading} onChange={(event) => patch('heading', event.target.value)} className={inputClass} /></div>
            <div><label className="mb-2 block text-sm font-semibold">Paragraph</label><textarea value={form.paragraph} onChange={(event) => patch('paragraph', event.target.value)} rows={5} className={inputClass} /></div>
            {form.show_button ? <div className="grid gap-5 md:grid-cols-2"><div><label className="mb-2 block text-sm font-semibold">Button label</label><input value={form.button_label} onChange={(event) => patch('button_label', event.target.value)} className={inputClass} /></div><div><label className="mb-2 block text-sm font-semibold">Button link</label><input value={form.button_link} onChange={(event) => patch('button_link', event.target.value)} className={inputClass} placeholder="/shop" /></div></div> : null}
          </div>
        </section>
      </div>
      <aside className="h-fit rounded-lg border border-border bg-white p-6 shadow-xs"><h2 className="font-jakarta text-lg font-semibold">Display</h2><div className="mt-4 space-y-3"><SwitchRow label="Enable banner" description="Show this section on the About page." checked={form.is_enabled} onChange={(value) => patch('is_enabled', value)} /><SwitchRow label="Show button" description="Display the CTA when its label and link are present." checked={form.show_button} onChange={(value) => patch('show_button', value)} /></div></aside>
    </div>
    <ConfirmDialog isOpen={confirmOpen} title="Save About Wide Banner?" description="This will update the secondary About banner on the live site." confirmText="Save" cancelText="Cancel" type="confirm" isLoading={saving} onConfirm={save} onCancel={() => setConfirmOpen(false)} />
    <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved About Wide Banner changes?" description="Your changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)} />
  </div>
}



