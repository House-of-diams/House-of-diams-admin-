'use client'
import { tryUploadAwsImage } from '@/lib/image-transport'
import { resolveCatalogImageUrl } from '@/components/catalog-image-preview'
import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Edit2, Eye, ImageIcon, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { TablePagination } from '@/components/table-pagination'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { slugify } from '@/lib/product-catalog'
import { createCmsPendingSave } from '@/lib/cms-pending-save'
import { bespokeHeroSaveBody } from '@/lib/bespoke-hero-client'
import { bespokeFormSaveBody } from '@/lib/bespoke-form-client'
import type { BespokeFormRow, BespokeFormSnapshot } from '@/lib/bespoke-form-save'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { useCmsAtomicListSave } from '@/hooks/use-cms-atomic-list-save'

export type BespokeTab = 'hero' | 'portfolio-categories' | 'portfolio-items' | 'process' | 'form' | 'submissions'

async function prepareBespokeHeroImage(file: File) {
  if (file.type === 'image/svg+xml') return file
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Invalid image type.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const width = Math.min(bitmap.width, 2200)
    const height = Math.max(1, Math.round(bitmap.height * (width / bitmap.width)))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84))
    if (!blob) throw new Error('Unable to optimize image.')
    return new File([blob], `${crypto.randomUUID()}.webp`, { type: 'image/webp' })
  } finally {
    bitmap.close()
  }
}

export type BespokeHero = {
  id?: string
  badge_text?: string | null
  eyebrow?: string | null
  heading_line_1: string
  heading_line_2?: string | null
  subtitle?: string | null
  primary_cta_label?: string | null
  primary_cta_action?: string | null
  secondary_cta_label?: string | null
  secondary_cta_action?: string | null
  slider_enabled?: boolean
  status?: 'active' | 'hidden'
  items?: Array<{
    id?: string
    clientId?: string
    sort_order: number
    image_path: string
    mobile_image_path?: string
    button_text: string
    button_link: string
  }>
}

export type PortfolioCategory = {
  id: string
  updated_at: string
  name: string
  slug: string
  image_path?: string | null
  display_order: number
  status: 'active' | 'hidden'
}

export type PortfolioItem = {
  id: string
  updated_at: string
  title: string
  tag: string
  category_id: string
  media_type: 'image' | 'video'
  media_path?: string | null
  thumbnail_path?: string | null
  gem_style?: string | null
  gem_color?: string | null
  dark_theme: boolean
  short_description?: string | null
  display_order: number
  status: 'active' | 'hidden'
}

export type BespokeProcessItem = {
  id?: number | string
  clientId?: string
  sort_order: number
  eyebrow: string
  title: string
  description: string
}

export type SimpleRow = BespokeFormRow
export type FormConfig = BespokeFormSnapshot
type FormListKey = 'guarantees' | 'pieceTypes' | 'stoneOptions' | 'caratOptions' | 'metalOptions'

export type BespokeSubmission = {
  id: string
  full_name: string
  email: string
  phone?: string | null
  country: string
  piece_type: string
  stone_preference?: string | null
  approx_carat?: string | null
  preferred_metal?: string | null
  message: string
  status: string
  created_at: string
}

export type BespokePageData = {
  hero: BespokeHero
  heroRevision: string
  categories: PortfolioCategory[]
  items: PortfolioItem[]
  processItems: BespokeProcessItem[]
  processRevision: string
  formConfig: FormConfig
  submissions: BespokeSubmission[]
}

const PAGE_SIZE = 20

async function getAccessToken() {
  const { supabase } = await import('@/lib/supabase')
    const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function authedFetch(url: string, options: RequestInit = {}) {
  if (/^\/api\/(?:cms|bespoke)\//.test(url) && !url.startsWith('/api/bespoke/media') && !url.startsWith('/api/cms/uploads/')) return cmsFetch(url, options)
  const accessToken = await getAccessToken()
  const headers = new Headers(options.headers)
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`)
  if (!(options.body instanceof FormData)) headers.set('content-type', 'application/json')
  return fetch(url, { ...options, headers })
}

function emptyPortfolioCategory(nextOrder: number): PortfolioCategory {
  return {
    id: '',
    updated_at: '',
    name: '',
    slug: '',
    image_path: null,
    display_order: nextOrder,
    status: 'active',
  }
}

function emptyPortfolioItem(categoryId: string, nextOrder: number): PortfolioItem {
  return {
    id: '',
    updated_at: '',
    title: '',
    tag: '',
    category_id: categoryId,
    media_type: 'image',
    media_path: '',
    thumbnail_path: '',
    gem_style: 'round',
    gem_color: '#20304A',
    dark_theme: false,
    short_description: '',
    display_order: nextOrder,
    status: 'active',
  }
}

function emptyProcessItem(nextOrder: number): BespokeProcessItem {
  return {
    clientId: `draft-${Date.now()}`,
    sort_order: nextOrder,
    eyebrow: '',
    title: '',
    description: '',
  }
}

function emptySimpleRow(nextOrder: number): SimpleRow {
  return { label: '', display_order: nextOrder, status: 'active' }
}

export function BespokeClient({ initialData }: { initialData: BespokePageData }) {
  const [activeTab, setActiveTab] = useState<BespokeTab>('hero')
  const [loading, setLoading] = useState(false)
  const [hero, setHero] = useState<BespokeHero>(initialData.hero)
  const [heroRevision, setHeroRevision] = useState(initialData.heroRevision)
  const [originalHeroItems, setOriginalHeroItems] = useState(initialData.hero.items ?? [])
  const [categories, setCategories] = useState<PortfolioCategory[]>(initialData.categories)
  const [items, setItems] = useState<PortfolioItem[]>(initialData.items)
  const [processItems, setProcessItems] = useState<BespokeProcessItem[]>(
    initialData.processItems.map((item) => ({ ...item, clientId: item.clientId ?? `id-${item.id}` }))
  )
  const [processRevision, setProcessRevision] = useState(initialData.processRevision)
  const [formConfig, setFormConfig] = useState<FormConfig>(initialData.formConfig)
  const [originalFormConfig, setOriginalFormConfig] = useState<FormConfig>(initialData.formConfig)
  const [submissions, setSubmissions] = useState<BespokeSubmission[]>(initialData.submissions)

  const loadData = async () => {
    setLoading(true)
    try {
      const [submissionsRes, heroRes, categoryRes, itemRes, processRes, formRes] = await Promise.all([
        authedFetch('/api/bespoke/submissions'),
        authedFetch('/api/bespoke/hero'),
        authedFetch('/api/bespoke/portfolio-categories'),
        authedFetch('/api/bespoke/portfolio-items'),
        authedFetch('/api/cms/bespoke/process'),
        authedFetch('/api/bespoke/form-config'),
      ])

      const [submissionsPayload, heroPayload, categoryPayload, itemPayload, processPayload, formPayload] = await Promise.all([
        submissionsRes.json().catch(() => null),
        heroRes.json().catch(() => null),
        categoryRes.json().catch(() => null),
        itemRes.json().catch(() => null),
        processRes.json().catch(() => null),
        formRes.json().catch(() => null),
      ])

      const failed = [submissionsRes,heroRes,categoryRes,itemRes,processRes,formRes].findIndex(response => !response.ok)
      if (failed !== -1) {
        const payload = [submissionsPayload,heroPayload,categoryPayload,itemPayload,processPayload,formPayload][failed]
        throw new Error(payload?.error ?? 'Unable to reload Bespoke content. Existing data was kept.')
      }
      if (submissionsRes.ok) setSubmissions(submissionsPayload?.items ?? [])
      if (heroRes.ok && heroPayload?.item) {
        const nextItems = heroPayload.items ?? []
        setHero({ ...heroPayload.item, items: nextItems })
        setOriginalHeroItems(nextItems)
        setHeroRevision(heroPayload.revision)
      }
      if (categoryRes.ok) setCategories(categoryPayload?.items ?? [])
      if (itemRes.ok) setItems(itemPayload?.items ?? [])
      if (processRes.ok) {
        setProcessItems((processPayload?.items ?? []).map((item: BespokeProcessItem) => ({ ...item, clientId: item.clientId ?? `id-${item.id}` })))
        if (typeof processPayload?.revision === 'string') setProcessRevision(processPayload.revision)
      }
      if (formRes.ok && formPayload) {
        const nextFormConfig: FormConfig = {
          settings: formPayload.settings ?? { intro_heading: '', intro_subtitle: '', footer_note: '', status: 'active' },
          guarantees: formPayload.guarantees ?? [],
          pieceTypes: formPayload.pieceTypes ?? [],
          stoneOptions: formPayload.stoneOptions ?? [],
          caratOptions: formPayload.caratOptions ?? [],
          metalOptions: formPayload.metalOptions ?? [],
          revision: formPayload.revision,
        }
        setFormConfig(nextFormConfig)
        setOriginalFormConfig(nextFormConfig)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Bespoke</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage the Bespoke collection rail, portfolio filters/items, and enquiry form settings.</p>
      </div>

      <div className="mb-8 flex gap-2 border-b border-border overflow-x-auto">
        {[
          { id: 'hero' as const, label: 'Fallback Rail' },
          { id: 'portfolio-categories' as const, label: 'Portfolio Categories' },
          { id: 'portfolio-items' as const, label: 'Portfolio Items' },
          { id: 'process' as const, label: 'Process Steps' },
          { id: 'form' as const, label: 'Form Settings' },
          { id: 'submissions' as const, label: 'Submissions' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors duration-150 ${
              activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? <div className="rounded-lg border border-border bg-white px-6 py-12 text-sm text-muted-foreground">Updating bespoke data...</div> : null}

      {!loading && activeTab === 'hero' ? <HeroPanel hero={hero} setHero={setHero} revision={heroRevision} originalItems={originalHeroItems} onReload={loadData} /> : null}
      {!loading && activeTab === 'portfolio-categories' ? <PortfolioCategoriesPanel categories={categories} onReload={loadData} /> : null}
      {!loading && activeTab === 'portfolio-items' ? <PortfolioItemsPanel categories={categories} items={items} onReload={loadData} /> : null}
      {!loading && activeTab === 'process' ? <ProcessStepsPanel items={processItems} setItems={setProcessItems} revision={processRevision} setRevision={setProcessRevision} /> : null}
      {!loading && activeTab === 'form' ? <FormPanel formConfig={formConfig} originalFormConfig={originalFormConfig} setFormConfig={setFormConfig} onReload={loadData} /> : null}
      {!loading && activeTab === 'submissions' ? <SubmissionSummaryPanel submissions={submissions} /> : null}
    </div>
  )
}

function SubmissionSummaryPanel({ submissions }: { submissions: BespokeSubmission[] }) {
  return (
    <section className="rounded-lg border border-border bg-white p-6 shadow-xs space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-jakarta text-lg font-semibold text-foreground">Submitted Enquiries</h2>
          <p className="mt-1 text-sm text-muted-foreground">All bespoke form submissions captured from the storefront.</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Open any submission directly, or use the submissions page for filtering.</p>
      <DataTable
        headers={['Name', 'Email', 'Piece', 'Country', 'Date', 'View']}
        rows={submissions.slice(0, 5).map((item) => ({
          id: item.id,
          cells: [
            <div key="name">
              <div className="font-medium text-foreground">{item.full_name}</div>
              <div className="text-xs text-muted-foreground">{item.phone || 'No phone'}</div>
            </div>,
            item.email,
            item.piece_type,
            item.country,
            <div key="date">
              <div>{new Date(item.created_at).toLocaleDateString()}</div>
              <div className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleTimeString()}</div>
            </div>,
            <Link
              key="view"
              href={`/dashboard/bespoke/submissions/${item.id}`}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
            >
              <Eye size={14} />
              View
            </Link>,
          ],
        }))}
      />
      {submissions.length > 5 ? <p className="text-xs text-muted-foreground">Showing the latest 5 submissions here.</p> : null}
      {submissions.length === 0 ? <p className="text-sm text-muted-foreground">No bespoke enquiries received yet.</p> : null}
    </section>
  )
}

function HeroPanel({ hero, setHero, revision, originalItems, onReload }: { hero: BespokeHero; setHero: (value: BespokeHero) => void; revision: string; originalItems: NonNullable<BespokeHero['items']>; onReload: () => Promise<void> }) {
  const pendingSave = useRef(createCmsPendingSave())
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [desktopUploadState, setDesktopUploadState] = useState<'idle' | 'uploading'>('idle')
  const [mobileUploadState, setMobileUploadState] = useState<'idle' | 'uploading'>('idle')
  const [editorItem, setEditorItem] = useState<NonNullable<BespokeHero['items']>[number]>({
    clientId: 'draft',
    sort_order: 1,
    image_path: '',
    mobile_image_path: '',
    button_text: '',
    button_link: '',
  })
  const nextSortOrder = Math.max(...(hero.items ?? []).map((item) => item.sort_order), 0) + 1
  const sortedSlides = [...(hero.items ?? [])].sort((a, b) => a.sort_order - b.sort_order)

  const resequenceSlides = (items: NonNullable<BespokeHero['items']>) => items.map((item, index) => ({ ...item, sort_order: index + 1 }))

  const moveSlide = (index: number, direction: -1 | 1) => {
    const nextSlides = [...sortedSlides]
    const targetIndex = index + direction

    if (targetIndex < 0 || targetIndex >= nextSlides.length) {
      return
    }

    ;[nextSlides[index], nextSlides[targetIndex]] = [nextSlides[targetIndex], nextSlides[index]]
    setHero({ ...hero, items: resequenceSlides(nextSlides) })
    toast({ title: 'Slide order updated', description: 'Draft updated locally. Save hero to publish.' })
  }

  const removeSlide = (index: number) => {
    setHero({ ...hero, items: resequenceSlides(sortedSlides.filter((_, slideIndex) => slideIndex !== index)) })
    toast({ title: 'Slide removed', description: 'Draft updated locally. Save hero to publish.' })
  }

  const uploadImage = async (file: File, target: 'desktop' | 'mobile') => {
    if (file.size > 5 * 1024 * 1024) throw new Error('File too large. Max size is 5MB.')


      const awsPath = await tryUploadAwsImage(file, '/api/cms/uploads/bespoke-hero', {})
      if (awsPath) { return awsPath }



    if (target === 'desktop') setDesktopUploadState('uploading')
    if (target === 'mobile') setMobileUploadState('uploading')
    const { supabase } = await import('@/lib/supabase')
    try {
      try {
        const preparedFile = await prepareBespokeHeroImage(file)
        const signResponse = await authedFetch('/api/cms/uploads/bespoke-hero/sign', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: preparedFile.type, declaredSize: preparedFile.size }),
        })
        const signed = await signResponse.json().catch(() => null) as { bucket?: string; path?: string; token?: string; error?: string } | null
        if (!signResponse.ok || !signed?.bucket || !signed.path || !signed.token) throw new Error(signed?.error ?? 'Unable to prepare upload.')
        const { error } = await supabase.storage.from(signed.bucket)
          .uploadToSignedUrl(signed.path, signed.token, preparedFile, { contentType: preparedFile.type })
        if (error) throw error
        return signed.path
      } catch {
        const body = new FormData()
        body.append('file', file)
        const response = await authedFetch('/api/cms/uploads/bespoke-hero', { method: 'POST', body })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.path) throw new Error(payload?.error ?? 'Unable to upload image.')
        return payload.path as string
      }
    } finally {
      if (target === 'desktop') setDesktopUploadState('idle')
      if (target === 'mobile') setMobileUploadState('idle')
    }
  }

  const openNewSlide = () => {
    setEditorItem({
      clientId: `draft-${Date.now()}`,
      sort_order: nextSortOrder,
      image_path: '',
      mobile_image_path: '',
      button_text: '',
      button_link: '',
    })
    setDesktopUploadState('idle')
    setMobileUploadState('idle')
    setEditorOpen(true)
  }

  const openEditSlide = (item: NonNullable<BespokeHero['items']>[number]) => {
    setEditorItem({ ...item })
    setDesktopUploadState('idle')
    setMobileUploadState('idle')
    setEditorOpen(true)
  }

  const saveEditor = () => {
    if (!editorItem.image_path || !editorItem.button_text || !editorItem.button_link) {
      toast({ title: 'Missing slide details', description: 'Desktop image, button text, and button link are required.', variant: 'destructive' })
      return
    }

    const existingIndex = (hero.items ?? []).findIndex((item) => (item.id && editorItem.id ? item.id === editorItem.id : item.clientId === editorItem.clientId))
    const nextItems = [...(hero.items ?? [])]

    if (existingIndex >= 0) {
      nextItems[existingIndex] = editorItem
    } else {
      nextItems.push(editorItem)
    }

    setHero({ ...hero, items: resequenceSlides([...nextItems].sort((a, b) => a.sort_order - b.sort_order)) })
    setEditorOpen(false)
    toast({ title: 'Slide added', description: 'Hero slide saved successfully.' })
  }

  const save = async () => {
    setSaving(true)
    try {
      const item = { ...hero, items: undefined }
      const slides = resequenceSlides(sortedSlides)
      const response = await authedFetch('/api/bespoke/hero', { method: 'PUT', body: pendingSave.current.prepare(bespokeHeroSaveBody(item, slides, originalItems, revision)) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save hero.')
      if (!payload?.revision || !Array.isArray(payload.items)) throw new Error('Save response was interrupted. Retry to confirm the same save.')
      pendingSave.current.clear()
      setConfirmOpen(false)
      await onReload()
      toast({ title: 'Hero saved', description: 'Bespoke hero content was updated.' })
    } catch (error) {
      toast({ title: 'Save failed', description: error instanceof Error ? error.message : 'Unable to save hero.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-6 shadow-xs space-y-5">
      <section className="max-w-5xl">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-foreground">Fallback Collection Rail</h3>
              <p className="text-sm text-muted-foreground">These cards appear only until Bespoke portfolio categories have rail images. Manage the live category cards in Portfolio Categories.</p>
            </div>
            <button type="button" onClick={openNewSlide} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">
              <Plus size={16} />
              Add Slide
            </button>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-white shadow-xs">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Order</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Desktop Image</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Mobile Image</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Button Text</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Link</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedSlides.map((item, index) => (
                  <tr key={item.id ?? item.clientId} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-4 text-sm">{item.sort_order}</td>
                    <td className="px-5 py-4 text-sm">{item.image_path}</td>
                    <td className="px-5 py-4 text-sm">{item.mobile_image_path || '-'}</td>
                    <td className="px-5 py-4 text-sm">{item.button_text}</td>
                    <td className="px-5 py-4 text-sm">{item.button_link}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => moveSlide(index, -1)}
                          disabled={index === 0}
                          aria-label="Move slide up"
                          className="inline-flex items-center rounded-md border border-border px-2 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSlide(index, 1)}
                          disabled={index === sortedSlides.length - 1}
                          aria-label="Move slide down"
                          className="inline-flex items-center rounded-md border border-border px-2 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditSlide(item)}
                          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                        >
                          <Edit2 size={14} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSlide(index)}
                          className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedSlides.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">No slides added yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
      </section>

      <div className="flex justify-end"><button type="button" disabled={saving} onClick={() => setConfirmOpen(true)} className={primaryButtonClassName}>{saving ? 'Saving...' : 'Save Fallback Rail'}</button></div>
      <ConfirmDialog isOpen={confirmOpen} title="Save fallback rail changes?" description="This will update the fallback Bespoke collection rail." confirmText="Save" isLoading={saving} onConfirm={() => void save()} onCancel={() => setConfirmOpen(false)} />
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Hero Slide</DialogTitle>
            <DialogDescription>Upload a desktop image and define the CTA details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Order"><input type="number" value={editorItem.sort_order} onChange={(e) => setEditorItem((prev) => ({ ...prev, sort_order: Number(e.target.value) }))} className={inputClassName} /></Field>
            <Field label="Desktop Image">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary/20 px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary/30">
                <Upload size={16} />
                <span>{desktopUploadState === 'uploading' ? 'Uploading...' : 'Upload Desktop Image'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={desktopUploadState === 'uploading'}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    const input = e.currentTarget
                    if (!file) return
                    try {
                      const path = await uploadImage(file, 'desktop')
                      setEditorItem((prev) => ({ ...prev, image_path: path }))
                      toast({ title: 'Uploaded', description: 'Desktop hero image uploaded successfully.' })
                    } catch (error) {
                      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Unable to upload image.', variant: 'destructive' })
                    } finally {
                      input.value = ''
                    }
                  }}
                />
              </label>
              {editorItem.image_path ? <p className="mt-2 text-xs text-muted-foreground">{editorItem.image_path}</p> : null}
            </Field>
            <Field label="Mobile Image">
              <input value={editorItem.mobile_image_path ?? ''} onChange={(e) => setEditorItem((prev) => ({ ...prev, mobile_image_path: e.target.value }))} className={inputClassName} />
              <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary/20 px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary/30">
                <Upload size={16} />
                <span>{mobileUploadState === 'uploading' ? 'Uploading...' : 'Upload Mobile Image'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={mobileUploadState === 'uploading'}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    const input = e.currentTarget
                    if (!file) return
                    try {
                      const path = await uploadImage(file, 'mobile')
                      setEditorItem((prev) => ({ ...prev, mobile_image_path: path }))
                      toast({ title: 'Uploaded', description: 'Mobile hero image uploaded successfully.' })
                    } catch (error) {
                      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Unable to upload image.', variant: 'destructive' })
                    } finally {
                      input.value = ''
                    }
                  }}
                />
              </label>
              {editorItem.mobile_image_path ? <p className="mt-2 text-xs text-muted-foreground">{editorItem.mobile_image_path}</p> : null}
            </Field>
            <Field label="Button Text"><input value={editorItem.button_text} onChange={(e) => setEditorItem((prev) => ({ ...prev, button_text: e.target.value }))} className={inputClassName} /></Field>
            <Field label="Button Link"><input value={editorItem.button_link} onChange={(e) => setEditorItem((prev) => ({ ...prev, button_link: e.target.value }))} className={inputClassName} /></Field>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditorOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">Cancel</button>
            <button type="button" onClick={saveEditor} className={primaryButtonClassName}>Update Slide</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProcessStepsPanel({
  items,
  setItems,
  revision,
  setRevision,
}: {
  items: BespokeProcessItem[]
  setItems: (items: BespokeProcessItem[]) => void
  revision: string
  setRevision: (revision: string) => void
}) {
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editorItem, setEditorItem] = useState<BespokeProcessItem>(emptyProcessItem(1))
  const sorted = [...items].sort((left, right) => left.sort_order - right.sort_order || String(left.clientId).localeCompare(String(right.clientId)))
  const saveItems = sorted.map(({ id, eyebrow, title, description }) => ({ ...(id ? { id } : {}), eyebrow, title, description }))
  const [savedState, setSavedState] = useState(() => JSON.stringify(saveItems))
  const dirty = JSON.stringify(saveItems) !== savedState
  useUnsavedChanges(dirty || dialogOpen)
  const { prepareSave, acceptSave } = useCmsAtomicListSave(items, revision)
  const nextOrder = Math.max(...items.map((item) => item.sort_order), 0) + 1

  const openNew = () => {
    setEditorItem(emptyProcessItem(nextOrder))
    setDialogOpen(true)
  }

  const openEdit = (item: BespokeProcessItem) => {
    setEditorItem({ ...item })
    setDialogOpen(true)
  }

  const saveEditor = () => {
    if (!editorItem.title.trim()) {
      toast({ title: 'Title required', description: 'Add a process step title before saving.', variant: 'destructive' })
      return
    }

    const key = editorItem.id ? `id-${editorItem.id}` : editorItem.clientId
    const exists = items.some((item) => (item.id ? `id-${item.id}` : item.clientId) === key)
    const nextItems = exists
      ? items.map((item) => ((item.id ? `id-${item.id}` : item.clientId) === key ? editorItem : item))
      : [...items, editorItem]

    setItems(nextItems)
    setDialogOpen(false)
    toast({ title: 'Step updated', description: 'Draft updated locally. Save changes to publish.' })
  }

  const removeItem = (item: BespokeProcessItem) => {
    const key = item.id ? `id-${item.id}` : item.clientId
    setItems(items.filter((entry) => (entry.id ? `id-${entry.id}` : entry.clientId) !== key))
    toast({ title: 'Step removed', description: 'Draft updated locally. Save changes to publish.' })
  }

  const saveAll = async () => {
    setSaving(true)
    try {
      const response = await authedFetch('/api/cms/bespoke/process', {
        method: 'POST', body: JSON.stringify(prepareSave({ items: saveItems }, saveItems)),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save process steps.')
      if (!Array.isArray(payload?.items) || typeof payload.revision !== 'string') throw new Error('Save response was interrupted. Retry to confirm the same save.')
      const nextItems = payload.items.map((item: BespokeProcessItem) => ({ ...item, clientId: `id-${item.id}` }))
      setItems(nextItems)
      setSavedState(JSON.stringify(payload.items.map(({ id, eyebrow, title, description }: BespokeProcessItem) => ({ id, eyebrow, title, description }))))
      acceptSave(payload.items, payload.revision)
      setRevision(payload.revision)
      setConfirmOpen(false)
      toast({ title: 'Process steps saved', description: 'Bespoke process cards were updated.' })
    } catch (error) {
      toast({ title: 'Save failed', description: error instanceof Error ? error.message : 'Unable to save process steps.', variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return (
    <section className="rounded-lg border border-border bg-white p-6 shadow-xs space-y-6">
      <SectionHeader title="Process Steps" description="Manage the Bespoke process cards shown on the storefront." actionLabel="Add Step" onAction={openNew} />

      <DataTable
        headers={['Order', 'Eyebrow', 'Title', 'Edit', 'Delete']}
        rows={sorted.map((item) => ({
          id: item.clientId ?? `id-${item.id}`,
          cells: [
            item.sort_order,
            item.eyebrow,
            item.title,
            <IconButton key="edit" onClick={() => openEdit(item)}><Edit2 size={14} className="text-muted-foreground" /></IconButton>,
            <IconButton key="delete" onClick={() => removeItem(item)} destructive><Trash2 size={14} className="text-red-600" /></IconButton>,
          ],
        }))}
      />

      <div className="flex justify-end">
        <button type="button" onClick={() => setConfirmOpen(true)} disabled={saving || !dirty} className={primaryButtonClassName}>{saving ? 'Saving...' : 'Save Process Steps'}</button>
      </div>

      <FormDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Edit Process Step" description="Update eyebrow, title, and description.">
        <Field label="Order">
          <input type="number" value={editorItem.sort_order} onChange={(event) => setEditorItem((prev) => ({ ...prev, sort_order: Number(event.target.value) || 0 }))} className={inputClassName} />
        </Field>
        <Field label="Eyebrow">
          <input value={editorItem.eyebrow} onChange={(event) => setEditorItem((prev) => ({ ...prev, eyebrow: event.target.value }))} className={inputClassName} />
        </Field>
        <Field label="Title">
          <input value={editorItem.title} onChange={(event) => setEditorItem((prev) => ({ ...prev, title: event.target.value }))} className={inputClassName} />
        </Field>
        <Field label="Description">
          <textarea value={editorItem.description} onChange={(event) => setEditorItem((prev) => ({ ...prev, description: event.target.value }))} rows={4} className={inputClassName} />
        </Field>
        <Actions onSave={saveEditor} onCancel={() => setDialogOpen(false)} />
      </FormDialog>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Save process steps?"
        description="This will update the Bespoke process cards on the live site."
        confirmText="Save"
        isLoading={saving}
        onConfirm={() => void saveAll()}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  )
}

function PortfolioCategoriesPanel({ categories, onReload }: { categories: PortfolioCategory[]; onReload: () => Promise<void> }) {
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PortfolioCategory | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<PortfolioCategory>(emptyPortfolioCategory(categories.length + 1))
  const [originalForm, setOriginalForm] = useState<PortfolioCategory>(form)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [imageUploadState, setImageUploadState] = useState<'idle' | 'uploading'>('idle')
  const categoryHasChanges = dialogOpen && JSON.stringify(form) !== JSON.stringify(originalForm)
  const categoryUnsaved = useUnsavedChanges(categoryHasChanges)
  const closeCategoryEditor = () => categoryUnsaved.confirmNavigation(() => {
    setDialogOpen(false)
    setConfirmOpen(false)
  })

  const openNew = () => {
    const next = emptyPortfolioCategory(categories.length + 1)
    setSelectedId(null)
    setForm(next)
    setOriginalForm(next)
    setDialogOpen(true)
  }
  const openEdit = (item: PortfolioCategory) => {
    setSelectedId(item.id)
    setForm({ ...item })
    setOriginalForm({ ...item })
    setDialogOpen(true)
  }
  const uploadImage = async (file: File) => {


      const awsPath = await tryUploadAwsImage(file, '/api/bespoke/media', {kind:'image'})
      if (awsPath) { return awsPath }



    const body = new FormData()
    body.append('file', file)
    body.append('kind', 'image')
    const response = await authedFetch('/api/bespoke/media', { method: 'POST', body })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.path) throw new Error(payload?.error ?? 'Unable to upload category image.')
    return payload.path as string
  }
  const save = async () => {
    if (saving || imageUploadState === 'uploading') return
    setSaving(true)
    try {
      const response = await authedFetch(selectedId ? `/api/bespoke/portfolio-categories/${selectedId}` : '/api/bespoke/portfolio-categories', {
        method: selectedId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: form.name,
          slug: form.slug || slugify(form.name),
          image_path: form.image_path ?? null,
          display_order: form.display_order,
          status: form.status,
          ...(selectedId ? { expected_updated_at: form.updated_at } : {}),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        toast({ title: 'Save failed', description: payload?.error ?? 'Unable to save category.', variant: 'destructive' })
        return
      }
      setOriginalForm(payload.item)
      setForm(payload.item)
      setDialogOpen(false)
      setConfirmOpen(false)
      await onReload()
      toast({ title: 'Portfolio category saved', description: `${form.name} was updated successfully.` })
    } catch {
      toast({ title: 'Save failed', description: 'A network error prevented the category from being saved. Your changes are still in the form.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }
  const remove = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      const revision = encodeURIComponent(deleteTarget.updated_at)
      const response = await authedFetch(`/api/bespoke/portfolio-categories/${deleteTarget.id}?expected_updated_at=${revision}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        toast({ title: 'Delete failed', description: payload?.error ?? 'Unable to delete category.', variant: 'destructive' })
        return
      }
      setDeleteTarget(null)
      await onReload()
      toast({ title: 'Portfolio category deleted', description: 'Bespoke portfolio category removed.' })
    } catch {
      toast({ title: 'Delete failed', description: 'A network error prevented the category from being deleted.', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-white p-6 shadow-xs space-y-6">
      <SectionHeader title="Portfolio Categories" description="Categories map to the storefront filter pills." actionLabel="Add Category" onAction={openNew} />
      <DataTable
        headers={['Image', 'Name', 'Slug', 'Order', 'Status', 'Edit', 'Delete']}
        rows={categories.map((item) => ({
          id: item.id,
          cells: [
            item.image_path ? <img key="image" src={resolveCatalogImageUrl(item.image_path) ?? ''} alt="" className="h-10 w-10 rounded object-cover" /> : '—', // eslint-disable-line @next/next/no-img-element -- Admin-managed storage preview has runtime dimensions.
            item.name,
            item.slug,
            item.display_order,
            item.status === 'active' ? 'Active' : 'Hidden',
            <IconButton key="edit" onClick={() => openEdit(item)}><Edit2 size={14} className="text-muted-foreground" /></IconButton>,
            <IconButton key="delete" onClick={() => setDeleteTarget(item)} destructive><Trash2 size={14} className="text-red-600" /></IconButton>,
          ],
        }))}
      />
      <FormDialog open={dialogOpen} onOpenChange={(open) => { if (open) setDialogOpen(true); else if (!saving && imageUploadState !== 'uploading') closeCategoryEditor() }} title={selectedId ? 'Edit Portfolio Category' : 'Add Portfolio Category'} description="Manage Bespoke portfolio filter categories and their storefront rail images.">
        <Field label="Name"><input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value, slug: prev.slug || slugify(e.target.value) }))} className={inputClassName} /></Field>
        <Field label="Slug"><input value={form.slug} onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))} className={inputClassName} /></Field>
        <Field label="Category Image">
          <p className="text-xs text-muted-foreground">Optional. This image appears on the Bespoke collection rail. Use JPG, PNG, WebP, or AVIF.</p>
          {form.image_path ? (
            <div className="mt-3 flex items-center gap-3">
              {/* Native img is intentional for an admin upload preview with a runtime storage URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveCatalogImageUrl(form.image_path) ?? ''} alt={`${form.name || 'Bespoke category'} preview`} className="h-20 w-16 rounded border border-border object-cover" />
              <p className="min-w-0 break-all text-xs text-muted-foreground">{form.image_path}</p>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium transition-colors ${imageUploadState === 'uploading' ? 'bg-secondary/30 text-muted-foreground' : 'bg-secondary/20 text-foreground hover:bg-secondary/30'}`}>
              {imageUploadState === 'uploading' ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
              <span>{imageUploadState === 'uploading' ? 'Uploading image...' : form.image_path ? 'Change Image' : 'Upload Image'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                disabled={imageUploadState === 'uploading'}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  const input = e.currentTarget
                  if (!file) return
                  setImageUploadState('uploading')
                  try {
                    const path = await uploadImage(file)
                    setForm((prev) => ({ ...prev, image_path: path }))
                    toast({ title: 'Upload complete', description: 'Category image uploaded successfully.' })
                  } catch (error) {
                    toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Unable to upload category image.', variant: 'destructive' })
                  } finally {
                    setImageUploadState('idle')
                    input.value = ''
                  }
                }}
              />
            </label>
            {form.image_path ? <button type="button" onClick={() => setForm((prev) => ({ ...prev, image_path: null }))} disabled={imageUploadState === 'uploading'} className="rounded-lg border border-destructive/30 px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60">Remove Image</button> : null}
          </div>
        </Field>
        <Field label="Display Order"><input type="number" value={form.display_order} onChange={(e) => setForm((prev) => ({ ...prev, display_order: Number(e.target.value) || 0 }))} className={inputClassName} /></Field>
        <Field label="Status"><ToggleRow options={['Active', 'Hidden']} value={form.status === 'hidden' ? 'Hidden' : 'Active'} onChange={(value) => setForm((prev) => ({ ...prev, status: value === 'Hidden' ? 'hidden' : 'active' }))} /></Field>
        <Actions onSave={() => setConfirmOpen(true)} onCancel={closeCategoryEditor} disabled={saving || imageUploadState === 'uploading'} />
      </FormDialog>
      <ConfirmDialog isOpen={confirmOpen} title={selectedId ? 'Update category?' : 'Create category?'} description="This will save the portfolio category." confirmText="Save" isLoading={saving} onConfirm={save} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog isOpen={Boolean(deleteTarget)} title="Delete category?" description={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"?`} confirmText="Delete" type="delete" isLoading={deleting} onConfirm={remove} onCancel={() => setDeleteTarget(null)} />
      <ConfirmDialog isOpen={categoryUnsaved.showWarning} title="Discard unsaved category changes?" description="Your edits have not been saved." confirmText="Discard" type="warning" onConfirm={categoryUnsaved.handleDiscard} onCancel={() => categoryUnsaved.setShowWarning(false)} />
    </section>
  )
}

function PortfolioItemsPanel({ categories, items, onReload }: { categories: PortfolioCategory[]; items: PortfolioItem[]; onReload: () => Promise<void> }) {
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PortfolioItem | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<PortfolioItem>(emptyPortfolioItem(categories[0]?.id ?? '', items.length + 1))
  const [originalForm, setOriginalForm] = useState<PortfolioItem>(form)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [imageUploadState, setImageUploadState] = useState<'idle' | 'uploading'>('idle')
  const [thumbnailUploadState, setThumbnailUploadState] = useState<'idle' | 'uploading'>('idle')
  const busy = saving || deleting || imageUploadState === 'uploading' || thumbnailUploadState === 'uploading'
  const itemHasChanges = dialogOpen && JSON.stringify(form) !== JSON.stringify(originalForm)
  const itemUnsaved = useUnsavedChanges(itemHasChanges)
  const closeItemEditor = () => itemUnsaved.confirmNavigation(() => {
    setDialogOpen(false)
    setConfirmOpen(false)
  })
  const categoryName = (id: string) => categories.find((item) => item.id === id)?.name ?? ''

  const openNew = () => {
    const next = emptyPortfolioItem(categories[0]?.id ?? '', items.length + 1)
    setSelectedId(null)
    setForm(next)
    setOriginalForm(next)
    setDialogOpen(true)
  }
  const openEdit = (item: PortfolioItem) => {
    setSelectedId(item.id)
    setForm({ ...item })
    setOriginalForm({ ...item })
    setDialogOpen(true)
  }
  const uploadMedia = async (file: File) => {


      const awsPath = await tryUploadAwsImage(file, '/api/bespoke/media', {kind:'image'})
      if (awsPath) { return awsPath }



    const accessToken = await getAccessToken()
    const body = new FormData()
    body.append('file', file)
    body.append('kind', 'image')

    return await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/bespoke/media')
      if (accessToken) xhr.setRequestHeader('authorization', `Bearer ${accessToken}`)

      xhr.onerror = () => {
        reject(new Error('Network error while uploading media.'))
      }

      xhr.onload = () => {
        const payload = (() => {
          try {
            return xhr.responseText ? JSON.parse(xhr.responseText) : null
          } catch {
            return null
          }
        })()

        if (xhr.status < 200 || xhr.status >= 300 || !payload?.path) {
          reject(new Error(payload?.error ?? 'Unable to upload media.'))
          return
        }

        resolve(payload.path as string)
      }

      xhr.send(body)
    })
  }
  const isVideoMedia = form.media_type === 'video'
  const save = async () => {
    if (saving || imageUploadState === 'uploading' || thumbnailUploadState === 'uploading') return
    setSaving(true)
    try {
      const response = await authedFetch(selectedId ? `/api/bespoke/portfolio-items/${selectedId}` : '/api/bespoke/portfolio-items', {
        method: selectedId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          title: form.title,
          tag: form.tag,
          category_id: form.category_id,
          media_type: form.media_type,
          media_path: form.media_path ?? null,
          thumbnail_path: form.thumbnail_path ?? null,
          gem_style: form.gem_style ?? null,
          gem_color: form.gem_color ?? null,
          dark_theme: form.dark_theme,
          short_description: form.short_description ?? null,
          display_order: form.display_order,
          status: form.status,
          ...(selectedId ? { expected_updated_at: form.updated_at } : {}),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        toast({ title: 'Save failed', description: payload?.error ?? 'Unable to save item.', variant: 'destructive' })
        return
      }
      setOriginalForm(payload.item)
      setForm(payload.item)
      setDialogOpen(false)
      setConfirmOpen(false)
      await onReload()
      toast({ title: 'Portfolio item saved', description: `${form.title} was updated successfully.` })
    } catch {
      toast({ title: 'Save failed', description: 'A network error prevented the item from being saved. Your changes are still in the form.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }
  const remove = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      const revision = encodeURIComponent(deleteTarget.updated_at)
      const response = await authedFetch(`/api/bespoke/portfolio-items/${deleteTarget.id}?expected_updated_at=${revision}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        toast({ title: 'Delete failed', description: payload?.error ?? 'Unable to delete item.', variant: 'destructive' })
        return
      }
      setDeleteTarget(null)
      await onReload()
      toast({ title: 'Portfolio item deleted', description: 'Bespoke portfolio item removed.' })
    } catch {
      toast({ title: 'Delete failed', description: 'A network error prevented the item from being deleted.', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-white p-6 shadow-xs space-y-6">
      <SectionHeader title="Portfolio Items" description="These render in the Bespoke portfolio grid and modal." actionLabel="Add Item" onAction={openNew} />
      <DataTable
        headers={['Title', 'Tag', 'Category', 'Media', 'Order', 'Edit', 'Delete']}
        rows={items.map((item) => ({
          id: item.id,
          cells: [
            item.title,
            item.tag,
            categoryName(item.category_id),
            item.media_type,
            item.display_order,
            <IconButton key="edit" onClick={() => openEdit(item)}><Edit2 size={14} className="text-muted-foreground" /></IconButton>,
            <IconButton key="delete" onClick={() => setDeleteTarget(item)} destructive><Trash2 size={14} className="text-red-600" /></IconButton>,
          ],
        }))}
      />
      <FormDialog open={dialogOpen} onOpenChange={(open) => { if (open) setDialogOpen(true); else if (!busy) closeItemEditor() }} title={selectedId ? 'Edit Portfolio Item' : 'Add Portfolio Item'} description="Manage Bespoke showcase items.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title"><input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} className={inputClassName} /></Field>
          <Field label="Tag"><input value={form.tag} onChange={(e) => setForm((prev) => ({ ...prev, tag: e.target.value }))} className={inputClassName} /></Field>
          <Field label="Category">
            <Select value={form.category_id} onValueChange={(value) => setForm((prev) => ({ ...prev, category_id: value }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Media Type">
            <Select value={form.media_type} onValueChange={(value) => setForm((prev) => ({ ...prev, media_type: value as 'image' | 'video' }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select media type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="video">Video</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Gem Style"><input value={form.gem_style ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, gem_style: e.target.value }))} className={inputClassName} /></Field>
          <Field label="Gem Color"><input value={form.gem_color ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, gem_color: e.target.value }))} className={inputClassName} /></Field>
          <Field label="Display Order"><input type="number" value={form.display_order} onChange={(e) => setForm((prev) => ({ ...prev, display_order: Number(e.target.value) || 0 }))} className={inputClassName} /></Field>
          <Field label="Theme"><ToggleRow options={['Light', 'Dark']} value={form.dark_theme ? 'Dark' : 'Light'} onChange={(value) => setForm((prev) => ({ ...prev, dark_theme: value === 'Dark' }))} /></Field>
        </div>
        <Field label="Short Description"><textarea value={form.short_description ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, short_description: e.target.value }))} rows={4} className={inputClassName} /></Field>
        <Field label="Status"><ToggleRow options={['Active', 'Hidden']} value={form.status === 'hidden' ? 'Hidden' : 'Active'} onChange={(value) => setForm((prev) => ({ ...prev, status: value === 'Hidden' ? 'hidden' : 'active' }))} /></Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={isVideoMedia ? 'Video URL' : 'Image URL'}>
            <input
              value={form.media_path ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, media_path: e.target.value }))}
              placeholder={isVideoMedia ? 'https://cdn.example.com/bespoke-video.mp4' : 'https://cdn.example.com/bespoke-image.jpg'}
              className={inputClassName}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {isVideoMedia ? 'Paste a direct public HTTPS video URL. Video file upload is disabled for this section.' : 'Paste a public HTTPS image URL, or upload a JPG, PNG, WebP, or AVIF below.'}
            </p>
            {!isVideoMedia ? (
              <label className={`mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium transition-colors ${imageUploadState === 'uploading' ? 'bg-secondary/30 text-muted-foreground' : 'bg-secondary/20 text-foreground hover:bg-secondary/30'}`}>
                {imageUploadState === 'uploading' ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                <span>{imageUploadState === 'uploading' ? 'Uploading image...' : 'Upload Image'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="hidden"
                  disabled={imageUploadState === 'uploading'}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    const input = e.currentTarget
                    if (!file) return
                    setImageUploadState('uploading')
                    try {
                      const path = await uploadMedia(file)
                      setForm((prev) => ({ ...prev, media_path: path }))
                      toast({ title: 'Upload complete', description: 'Image uploaded successfully.' })
                    } catch (error) {
                      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Unable to upload image.', variant: 'destructive' })
                    } finally {
                      setImageUploadState('idle')
                      input.value = ''
                    }
                  }}
                />
              </label>
            ) : null}
            {form.media_path ? <p className="mt-2 text-xs text-muted-foreground">{form.media_path}</p> : null}
          </Field>
          <Field label="Thumbnail URL or Upload">
            <input
              value={form.thumbnail_path ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, thumbnail_path: e.target.value }))}
              placeholder={isVideoMedia ? 'https://cdn.example.com/bespoke-preview.mp4' : 'https://cdn.example.com/bespoke-thumb.jpg'}
              className={inputClassName}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {isVideoMedia
                ? 'Paste a direct image or video URL for the grid thumbnail. Video URLs play on hover. Upload is image-only.'
                : 'Use a direct image URL or upload a thumbnail.'}
            </p>
            <label className={`mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium transition-colors ${thumbnailUploadState === 'uploading' ? 'bg-secondary/30 text-muted-foreground' : 'bg-secondary/20 text-foreground hover:bg-secondary/30'}`}>
              {thumbnailUploadState === 'uploading' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              <span>{thumbnailUploadState === 'uploading' ? 'Uploading thumbnail...' : 'Upload Thumbnail'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                disabled={thumbnailUploadState === 'uploading'}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  const input = e.currentTarget
                  if (!file) return
                  setThumbnailUploadState('uploading')
                  try {
                    const path = await uploadMedia(file)
                    setForm((prev) => ({ ...prev, thumbnail_path: path }))
                    toast({ title: 'Upload complete', description: 'Thumbnail uploaded successfully.' })
                  } catch (error) {
                    toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Unable to upload thumbnail.', variant: 'destructive' })
                  } finally {
                    setThumbnailUploadState('idle')
                    input.value = ''
                  }
                }}
              />
            </label>
            {form.thumbnail_path ? <p className="mt-2 text-xs text-muted-foreground">{form.thumbnail_path}</p> : null}
          </Field>
        </div>
        <Actions onSave={() => setConfirmOpen(true)} onCancel={closeItemEditor} disabled={busy} />
      </FormDialog>
      <ConfirmDialog isOpen={confirmOpen} title={selectedId ? 'Update item?' : 'Create item?'} description="This will save the portfolio item." confirmText="Save" isLoading={saving} onConfirm={save} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog isOpen={Boolean(deleteTarget)} title="Delete item?" description={`Are you sure you want to delete "${deleteTarget?.title ?? ''}"?`} confirmText="Delete" type="delete" isLoading={deleting} onConfirm={remove} onCancel={() => setDeleteTarget(null)} />
      <ConfirmDialog isOpen={itemUnsaved.showWarning} title="Discard unsaved item changes?" description="Your edits and uploaded media paths have not been saved." confirmText="Discard" type="warning" onConfirm={itemUnsaved.handleDiscard} onCancel={() => itemUnsaved.setShowWarning(false)} />
    </section>
  )
}

function FormPanel({ formConfig, originalFormConfig, setFormConfig, onReload }: { formConfig: FormConfig; originalFormConfig: FormConfig; setFormConfig: (value: FormConfig) => void; onReload: () => Promise<void> }) {
  const pendingSave = useRef(createCmsPendingSave())
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const hasChanges = useMemo(() => JSON.stringify(formConfig) !== JSON.stringify(originalFormConfig), [formConfig, originalFormConfig])
  useUnsavedChanges(hasChanges)
  const updateList = (key: FormListKey, updater: (rows: SimpleRow[]) => SimpleRow[]) => {
    setFormConfig({ ...formConfig, [key]: updater(formConfig[key]) } as FormConfig)
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      const response = await authedFetch('/api/bespoke/form-config', {
        method: 'PUT',
        body: pendingSave.current.prepare(bespokeFormSaveBody(formConfig, originalFormConfig)),
      })
      const payload = await response.json().catch(() => null)
      if (response.ok) {
        if (!payload?.revision || !payload.settings) throw new Error('Save response was interrupted. Retry to confirm the same save.')
        pendingSave.current.clear()
        setConfirmOpen(false)
        await onReload()
        toast({ title: 'Form settings saved', description: 'Bespoke form content was updated.' })
      } else {
        toast({ title: 'Save failed', description: payload?.error ?? 'Unable to save form settings.', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Save failed', description: error instanceof Error ? error.message : 'Unable to save form settings.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-white p-6 shadow-xs space-y-5">
        <Field label="Intro Heading"><input value={formConfig.settings?.intro_heading ?? ''} onChange={(e) => setFormConfig({ ...formConfig, settings: { ...(formConfig.settings ?? {}), intro_heading: e.target.value } })} className={inputClassName} /></Field>
        <Field label="Intro Subtitle"><textarea value={formConfig.settings?.intro_subtitle ?? ''} onChange={(e) => setFormConfig({ ...formConfig, settings: { ...(formConfig.settings ?? {}), intro_subtitle: e.target.value } })} rows={4} className={inputClassName} /></Field>
        <Field label="Footer Note"><textarea value={formConfig.settings?.footer_note ?? ''} onChange={(e) => setFormConfig({ ...formConfig, settings: { ...(formConfig.settings ?? {}), footer_note: e.target.value } })} rows={3} className={inputClassName} /></Field>
      </section>
      <RepeatableListSection title="Guarantees" items={formConfig.guarantees} onChange={(rows) => updateList('guarantees', () => rows)} />
      <RepeatableListSection title="Piece Types" items={formConfig.pieceTypes} onChange={(rows) => updateList('pieceTypes', () => rows)} />
      <RepeatableListSection title="Stone Options" items={formConfig.stoneOptions} onChange={(rows) => updateList('stoneOptions', () => rows)} />
      <RepeatableListSection title="Carat Options" items={formConfig.caratOptions} onChange={(rows) => updateList('caratOptions', () => rows)} />
      <RepeatableListSection title="Metal Options" items={formConfig.metalOptions} onChange={(rows) => updateList('metalOptions', () => rows)} />
      <div className="flex justify-end"><button type="button" onClick={() => setConfirmOpen(true)} disabled={saving || !hasChanges} className={primaryButtonClassName}>{saving ? 'Saving...' : 'Save Form Settings'}</button></div>
      <ConfirmDialog isOpen={confirmOpen} title="Save form settings?" description="This will update the live Bespoke enquiry form." confirmText="Save" isLoading={saving} onConfirm={() => void save()} onCancel={() => setConfirmOpen(false)} />
    </div>
  )
}

function RepeatableListSection({ title, items, onChange }: { title: string; items: SimpleRow[]; onChange: (rows: SimpleRow[]) => void }) {
  return (
    <section className="rounded-lg border border-border bg-white p-6 shadow-xs">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-jakarta text-lg font-semibold text-foreground">{title}</h2>
        <button type="button" onClick={() => onChange([...(items ?? []), emptySimpleRow((items?.length ?? 0) + 1)])} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"><Plus size={14} />Add Row</button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_120px_auto]">
            <input value={item.label} onChange={(e) => onChange(items.map((entry, entryIndex) => entryIndex === index ? { ...entry, label: e.target.value } : entry))} className={inputClassName} placeholder="Label" />
            <input type="number" value={item.display_order} onChange={(e) => onChange(items.map((entry, entryIndex) => entryIndex === index ? { ...entry, display_order: Number(e.target.value) || 0 } : entry))} className={inputClassName} placeholder="Order" />
            <Select value={item.status} onValueChange={(value) => onChange(items.map((entry, entryIndex) => entryIndex === index ? { ...entry, status: value as 'active' | 'hidden' } : entry))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
              </SelectContent>
            </Select>
            <button type="button" onClick={() => onChange(items.filter((_, entryIndex) => entryIndex !== index))} className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
          </div>
        ))}
        {items.length === 0 ? <p className="text-sm text-muted-foreground">No rows added yet.</p> : null}
      </div>
    </section>
  )
}

function SectionHeader({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="font-jakarta text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <button type="button" onClick={onAction} className={primaryButtonClassName}>
        <Plus size={16} />
        {actionLabel}
      </button>
    </div>
  )
}

function FormDialog({ title, description, open, onOpenChange, children }: { title: string; description: string; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-lg font-semibold text-foreground">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">{children}</div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}

function ToggleRow({ options, value, onChange }: { options: readonly string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button key={option} type="button" onClick={() => onChange(option)} className={`rounded-full px-4 py-2 text-sm font-semibold ${value === option ? 'bg-primary text-white' : 'border border-border text-foreground hover:bg-secondary'}`}>{option}</button>
      ))}
    </div>
  )
}

function Actions({ onSave, onCancel, disabled = false }: { onSave: () => void; onCancel: () => void; disabled?: boolean }) {
  return (
    <div className="flex gap-3">
      <button type="button" onClick={onSave} disabled={disabled} className={`${primaryButtonClassName} disabled:cursor-not-allowed disabled:opacity-50`}>Save</button>
      <button type="button" onClick={onCancel} disabled={disabled} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
    </div>
  )
}

function IconButton({ children, onClick, destructive = false }: { children: ReactNode; onClick: () => void; destructive?: boolean }) {
  return <button type="button" onClick={onClick} className={`rounded p-1.5 transition-colors ${destructive ? 'hover:bg-red-100' : 'hover:bg-secondary'}`}>{children}</button>
}

function DataTable({ headers, rows }: { headers: string[]; rows: { id: string; cells: ReactNode[] }[] }) {
  const [page, setPage] = useState(1)
  const totalItems = rows.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visibleRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="rounded-lg border border-border bg-white shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              {headers.map((header) => <th key={header} className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                {row.cells.map((cell, index) => <td key={`${row.id}-${index}`} className="px-6 py-3.5 text-sm text-foreground">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination page={currentPage} totalItems={totalItems} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  )
}

const inputClassName = 'w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm'
const primaryButtonClassName = 'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90'
