'use client'
import { tryUploadAwsImage } from '@/lib/image-transport'
import { readCmsId } from '@/lib/cms-id-safety'


import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, CheckCircle2, Upload } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { prepareHeroImage } from '@/lib/prepare-hero-image'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { ConfirmDialog } from '@/components/confirm-dialog'

export type HeroSlide = {
  id: number | string
  hero_id: number | string
  sort_order: number
  image_path: string
  mobile_image_path: string
  headline: string
  subtitle: string
  button_text: string
  button_link: string
}

const listHref = '/dashboard/cms/home/hero'
const inputClassName = 'w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/20'

type HeroSection = { slider_enabled: boolean; seo_title: string; seo_description: string }
type SavePayload = { items?: HeroSlide[]; revision?: string; error?: string }

export function HeroSlideEditorClient({ initialSlide, initialItems, initialSection, initialRevision }: {
  initialSlide: HeroSlide
  initialItems: HeroSlide[]
  initialSection: HeroSection
  initialRevision: string
}) {
  const { toast } = useToast()
  const router = useRouter()
  const [slide, setSlide] = useState<HeroSlide>(initialSlide)
  const [status, setStatus] = useState(`Editing slide ${initialSlide.sort_order}`)
  const [isSaving, setIsSaving] = useState(false)
  const [uploadingField, setUploadingField] = useState<'image_path' | 'mobile_image_path' | null>(null)
  const [revision, setRevision] = useState(initialRevision)
  const [savedSlide, setSavedSlide] = useState(initialSlide)
  const [savedItems, setSavedItems] = useState(initialItems)
  const pendingSave = useRef<{ fingerprint: string; id: string } | null>(null)
  const hasChanges = JSON.stringify(slide) !== JSON.stringify(savedSlide)
  const unsaved = useUnsavedChanges(hasChanges)

  const updateField = (field: keyof Pick<HeroSlide, 'headline' | 'subtitle' | 'image_path' | 'mobile_image_path' | 'button_text' | 'button_link'>, value: string) => {
    setSlide((current) => ({ ...current, [field]: value }))
  }

  const uploadImage = async (file: File, field: 'image_path' | 'mobile_image_path') => {
    if (file.size > 15 * 1024 * 1024) { setStatus('File too large. Maximum size is 15MB.'); toast({ title: 'Upload failed', description: 'File too large. Maximum size is 15MB.', variant: 'destructive' }); return }

    try {
      const awsPath = await tryUploadAwsImage(file, '/api/cms/uploads/hero', {},{start:()=>setUploadingField(field),finish:()=>setUploadingField(null)})
      if (awsPath) { updateField(field, awsPath); setStatus('Hero image uploaded successfully'); toast({ title: 'Image uploaded', description: 'Now click Save Changes to publish it.' }); return }
    } catch (error) { const message = error instanceof Error ? error.message : 'Upload failed.'; setStatus(message); toast({ title: 'Upload failed', description: message, variant: 'destructive' }); return }


    const { supabase } = await import('@/lib/supabase')
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) { setStatus('You are not signed in.'); return }
    setUploadingField(field)
    setStatus(field === 'image_path' ? 'Uploading desktop image...' : 'Uploading mobile image...')

    let uploadedPath = ''
    try {
      const preparedFile = await prepareHeroImage(file)
      const signResponse = await fetch('/api/cms/uploads/hero/sign', {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: preparedFile.type, declaredSize: preparedFile.size }),
      })
      const signed = await signResponse.json().catch(() => null) as { bucket?: string; path?: string; token?: string; error?: string } | null
      if (!signResponse.ok || !signed?.bucket || !signed.path || !signed.token) throw new Error(signed?.error ?? 'Unable to prepare upload.')
      const { error } = await supabase.storage.from(signed.bucket).uploadToSignedUrl(signed.path, signed.token, preparedFile, { contentType: preparedFile.type })
      if (error) throw error
      uploadedPath = signed.path
    } catch {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch('/api/cms/uploads/hero', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: formData })
      const payload = await response.json().catch(() => null) as { path?: string; error?: string } | null
      if (!response.ok || !payload?.path) { setStatus(payload?.error ?? 'Unable to upload hero image.'); setUploadingField(null); return }
      uploadedPath = payload.path
    }
    updateField(field, uploadedPath)
    setUploadingField(null)
    setStatus('Image uploaded. Save changes to publish it.')
  }

  const save = async () => {


    setIsSaving(true)
    setStatus('Saving slide...')
    // The save schema is strict: send only its fields (not hero_id and similar).
    const items = savedItems.map((item) => item.id === slide.id ? slide : item)
      .map(({ id, sort_order, image_path, mobile_image_path, headline, subtitle, button_text, button_link }) => ({ id, sort_order, image_path, mobile_image_path, headline, subtitle, button_text, button_link }))
    const saveBody = {
      slider_enabled: initialSection.slider_enabled,
      seo_title: initialSection.seo_title,
      seo_description: initialSection.seo_description,
      items,
      expected_revision: revision,
      deleted_ids: [],
    }
    const fingerprint = JSON.stringify(saveBody)
    if (pendingSave.current?.fingerprint !== fingerprint) {
      pendingSave.current = { fingerprint, id: crypto.randomUUID() }
    }
    try {
      const response = await cmsFetch('/api/cms/home/hero', {
        method: 'POST',
        headers: {  'content-type': 'application/json' },
        body: JSON.stringify({ ...saveBody, request_id: pendingSave.current.id }),
      })
      const payload = await response.json().catch(() => null) as SavePayload | null
      if (!response.ok || !Array.isArray(payload?.items) || typeof payload.revision !== 'string') {
        setStatus(payload?.error ?? 'Unable to save hero slide.')
        return
      }
      const nextItems = payload.items.map((item) => ({
        ...item,
        id: readCmsId(item.id),
        hero_id: readCmsId(item.hero_id),
        sort_order: Number(item.sort_order),
      }))
      const nextSlide = nextItems.find((item) => item.id === slide.id)
      if (!nextSlide) { setStatus('The saved slide could not be reloaded. Return to the Hero editor.'); return }
      setSlide(nextSlide)
      setSavedSlide(nextSlide)
      setSavedItems(nextItems)
      setRevision(payload.revision)
      pendingSave.current = null
      setStatus('Hero slide saved successfully')
      toast({ title: 'Slide saved', description: 'This hero slide was updated successfully.' })
    } catch {
      setStatus('Unable to reach the server. Your changes are still here; try saving again.')
    } finally {
      setIsSaving(false)
    }
  }

  const navigateBack = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    unsaved.confirmNavigation(() => router.push(listHref))
  }

  return (
    <main className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-4xl">
        <Link href={listHref} onClick={navigateBack} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
          <ArrowLeft size={16} /> Back to Hero Slides
        </Link>
        <header className="mb-8 mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Homepage · Hero</p>
          <h1 className="mt-2 font-jakarta text-3xl font-semibold text-foreground">Edit Hero Slide</h1>
          <p className="mt-2 text-sm text-muted-foreground">Update the content and responsive imagery for this slide only.</p>
        </header>

        <section className="space-y-6 rounded-lg border border-border bg-white p-5 shadow-xs sm:p-8">
            <div className="flex items-center justify-between border-b border-border pb-5">
              <div><p className="text-sm font-semibold text-foreground">Slide {slide.sort_order}</p><p className="text-xs text-muted-foreground">Database ID {slide.id}</p></div>
              <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 size={14} /> {status}</p>
            </div>
            <Field label="Heading"><input value={slide.headline} onChange={(e) => updateField('headline', e.target.value)} className={inputClassName} /></Field>
            <Field label="Paragraph"><textarea rows={5} value={slide.subtitle} onChange={(e) => updateField('subtitle', e.target.value)} className={inputClassName} /></Field>
            <ImageField label="Desktop image" value={slide.image_path} busy={uploadingField === 'image_path'} onChange={(file) => void uploadImage(file, 'image_path')} />
            <ImageField label="Mobile image" value={slide.mobile_image_path} busy={uploadingField === 'mobile_image_path'} hint="Optional. The desktop image is used when this is empty." onChange={(file) => void uploadImage(file, 'mobile_image_path')} />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Button text"><input value={slide.button_text} onChange={(e) => updateField('button_text', e.target.value)} className={inputClassName} /></Field>
              <Field label="Button link"><input value={slide.button_link} placeholder="/collections/engagement-rings" onChange={(e) => updateField('button_link', e.target.value)} className={inputClassName} /></Field>
            </div>
            <div className="flex flex-wrap gap-3 border-t border-border pt-6">
              <button type="button" onClick={() => void save()} disabled={isSaving || Boolean(uploadingField)} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? 'Saving...' : 'Save Changes'}</button>
              <Link href={listHref} onClick={navigateBack} className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary">Cancel</Link>
            </div>
        </section>
      </div>
      <ConfirmDialog
        isOpen={unsaved.showWarning}
        title="Discard unsaved slide changes?"
        description="Your changes to this Hero slide have not been saved."
        confirmText="Discard changes"
        cancelText="Keep editing"
        type="warning"
        onConfirm={unsaved.handleDiscard}
        onCancel={() => unsaved.setShowWarning(false)}
      />
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-2 block text-sm font-semibold text-foreground">{label}</label>{children}</div>
}

function ImageField({ label, value, busy, hint, onChange }: { label: string; value: string; busy: boolean; hint?: string; onChange: (file: File) => void }) {
  return <Field label={label}><div className="flex flex-wrap items-center gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary"><Upload size={15} />{busy ? 'Uploading...' : 'Upload image'}<input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) onChange(file) }} /></label><span className="max-w-full break-all text-xs text-muted-foreground">{value || 'No image uploaded yet'}</span></div>{hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}</Field>
}
