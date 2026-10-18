'use client'

import { tryUploadAwsImage } from '@/lib/image-transport'
import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bold, Heading2, Heading3, Italic, List, ListOrdered, Pilcrow, Plus, Quote, Trash2, Upload } from 'lucide-react'
import { CmsSaveAction } from '@/components/cms-save-action'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

type EducationTag = { clientId: string; id?: number | string; value: string }
type EducationProduct = {
  id: string
  relationId?: number | string
  slug: string
  name: string
  status?: string | null
  base_price?: number | null
}

async function prepareEducationImage(file: File) {
  if (file.type === 'image/svg+xml') return file
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
    throw new Error('Invalid image type.')
  }

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
type EducationContentBlock = {
  clientId: string
  id?: number | string
  block_type: 'text' | 'image' | 'heading' | 'quote'
  sort_order: number
  heading: string
  body_html: string
  image_path: string
  image_alt: string
  image_caption: string
  is_enabled: boolean
}

type EducationForm = {
  slug: string
  title: string
  title_html: string
  card_title: string
  subtitle: string
  category: string
  author: string
  date_label: string
  read_time: string
  bg_key: string
  bg_color: string
  hero_image_path: string
  card_image_path: string
  hero_image_alt: string
  body_html: string
  is_published: boolean
  sort_order: number
}

type Payload = {
  post?: EducationForm & { id: number | string }
  tags?: Array<{ id: number | string; tag: string; sort_order: number }>
  products?: Array<{
    id: number | string
    product_id: string
    sort_order: number
    product: EducationProduct | EducationProduct[] | null
  }>
  revision?: string
  content_blocks?: Array<{
    id: number | string
    block_type: 'text' | 'image' | 'heading' | 'quote'
    sort_order: number
    heading: string | null
    body_html: string | null
    image_path: string | null
    image_alt: string | null
    image_caption: string | null
    is_enabled: boolean | null
  }>
  error?: string
}

function relationProducts(items: NonNullable<Payload['products']>): EducationProduct[] {
  return items.flatMap((item): EducationProduct[] => {
    const product = Array.isArray(item.product) ? item.product[0] : item.product
    return product?.id ? [{ ...product, relationId: item.id }] : []
  })
}

function createEmptyBlock(
  type: EducationContentBlock['block_type'],
  sortOrder: number
): EducationContentBlock {
  return {
    clientId: `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    block_type: type,
    sort_order: sortOrder,
    heading: '',
    body_html: type === 'text' ? '<p></p>' : '',
    image_path: '',
    image_alt: '',
    image_caption: '',
    is_enabled: true,
  }
}

function formatEducationUrl(slug: string) {
  return `/education/${slug.replace(/^\/+/, '').replace(/^education\/?/, '')}`
}

function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Placeholder.configure({ placeholder: 'Write the education body here...' }),
    ],
    content: value || '<p></p>',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'min-h-[320px] w-full px-4 py-3 text-sm text-foreground outline-none prose prose-sm max-w-none',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (value !== current) editor.commands.setContent(value || '<p></p>')
  }, [editor, value])

  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      paragraph: currentEditor?.isActive('paragraph') ?? false,
      heading2: currentEditor?.isActive('heading', { level: 2 }) ?? false,
      heading3: currentEditor?.isActive('heading', { level: 3 }) ?? false,
      bold: currentEditor?.isActive('bold') ?? false,
      italic: currentEditor?.isActive('italic') ?? false,
      bulletList: currentEditor?.isActive('bulletList') ?? false,
      orderedList: currentEditor?.isActive('orderedList') ?? false,
      blockquote: currentEditor?.isActive('blockquote') ?? false,
    }),
  })

  const buttonClass = (active: boolean) =>
    `inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-white text-foreground hover:bg-secondary'}`

  return (
    <div className="max-h-[620px] overflow-y-auto rounded-lg border border-border bg-white focus-within:ring-2 focus-within:ring-primary/25">
      <div className="sticky top-0 z-10 flex flex-wrap gap-2 border-b border-border bg-secondary/95 p-2 shadow-sm backdrop-blur-sm">
        <button type="button" aria-pressed={state?.paragraph ?? false} disabled={!editor?.can().chain().focus().setParagraph().run()} onClick={() => editor?.chain().focus().setParagraph().run()} className={buttonClass(state?.paragraph ?? false)}><Pilcrow size={13} />Paragraph</button>
        <button type="button" aria-pressed={state?.heading2 ?? false} disabled={!editor?.can().chain().focus().toggleHeading({ level: 2 }).run()} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={buttonClass(state?.heading2 ?? false)}><Heading2 size={13} />H2</button>
        <button type="button" aria-pressed={state?.heading3 ?? false} disabled={!editor?.can().chain().focus().toggleHeading({ level: 3 }).run()} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className={buttonClass(state?.heading3 ?? false)}><Heading3 size={13} />H3</button>
        <button type="button" aria-pressed={state?.bold ?? false} disabled={!editor?.can().chain().focus().toggleBold().run()} onClick={() => editor?.chain().focus().toggleBold().run()} className={buttonClass(state?.bold ?? false)}><Bold size={13} />Bold</button>
        <button type="button" aria-pressed={state?.italic ?? false} disabled={!editor?.can().chain().focus().toggleItalic().run()} onClick={() => editor?.chain().focus().toggleItalic().run()} className={buttonClass(state?.italic ?? false)}><Italic size={13} />Italic</button>
        <button type="button" aria-pressed={state?.bulletList ?? false} disabled={!editor?.can().chain().focus().toggleBulletList().run()} onClick={() => editor?.chain().focus().toggleBulletList().run()} className={buttonClass(state?.bulletList ?? false)}><List size={13} />Bullet</button>
        <button type="button" aria-pressed={state?.orderedList ?? false} disabled={!editor?.can().chain().focus().toggleOrderedList().run()} onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={buttonClass(state?.orderedList ?? false)}><ListOrdered size={13} />Numbered</button>
        <button type="button" aria-pressed={state?.blockquote ?? false} disabled={!editor?.can().chain().focus().toggleBlockquote().run()} onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={buttonClass(state?.blockquote ?? false)}><Quote size={13} />Quote</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

const emptyForm: EducationForm = {
  slug: '',
  title: '',
  title_html: '',
  card_title: '',
  subtitle: '',
  category: '',
  author: '',
  date_label: '',
  read_time: '',
  bg_key: 'bg-0',
  bg_color: '#EEF1F8',
  hero_image_path: '',
  card_image_path: '',
  hero_image_alt: '',
  body_html: '<p></p>',
  is_published: true,
  sort_order: 1,
}

function educationDraftFingerprint(form: EducationForm, tags: EducationTag[], products: EducationProduct[], blocks: EducationContentBlock[]) {
  return JSON.stringify({
    form,
    tags: tags.filter((tag) => tag.value.trim()).map(({ id, value }) => ({ id, value: value.trim() })),
    products: products.map(({ id, relationId }) => ({ id, relationId })),
    blocks: blocks.map((block) => ({ id: block.id, block_type: block.block_type, heading: block.heading, body_html: block.body_html, image_path: block.image_path, image_alt: block.image_alt, image_caption: block.image_caption, is_enabled: block.is_enabled })),
  })
}

export function EducationEditorPage({ mode, id }: { mode: 'create' | 'edit'; id?: string }) {
  const { toast } = useToast()
  const router = useRouter()
  const [form, setForm] = useState<EducationForm>(emptyForm)
  const [tags, setTags] = useState<EducationTag[]>([{ clientId: 'tag-empty', value: '' }])
  const [selectedProducts, setSelectedProducts] = useState<EducationProduct[]>([])
  const [availableProducts, setAvailableProducts] = useState<EducationProduct[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [contentBlocks, setContentBlocks] = useState<EducationContentBlock[]>([])
  const [status, setStatus] = useState(mode === 'create' ? 'Create a new education post.' : 'Loading education post...')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [revision, setRevision] = useState('')
  const [savedTagIds, setSavedTagIds] = useState<string[]>([])
  const [savedProductIds, setSavedProductIds] = useState<string[]>([])
  const [savedBlockIds, setSavedBlockIds] = useState<string[]>([])
  const [savedFingerprint, setSavedFingerprint] = useState(() => educationDraftFingerprint(emptyForm, [], [], []))
  const pendingSave = useRef<{ fingerprint: string; requestId: string } | null>(null)
  const pendingDeleteId = useRef<string | null>(null)
  const currentFingerprint = useMemo(() => educationDraftFingerprint(form, tags, selectedProducts, contentBlocks), [form, tags, selectedProducts, contentBlocks])
  const isDirty = currentFingerprint !== savedFingerprint
  const unsaved = useUnsavedChanges(isDirty)

  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase()
    const selectedIds = new Set(selectedProducts.map((product) => product.id))
    return availableProducts
      .filter((product) => !selectedIds.has(product.id))
      .filter((product) => {
        if (!search) return true
        return [product.name, product.slug, product.status].some((value) => String(value ?? '').toLowerCase().includes(search))
      })
      .slice(0, 8)
  }, [availableProducts, productSearch, selectedProducts])

  useEffect(() => {
    const loadProducts = async () => {
      const response = await cmsFetch('/api/cms/references/products')
      const payload = (await response.json().catch(() => null)) as { items?: EducationProduct[] } | null
      if (!response.ok) return
      setAvailableProducts(payload?.items ?? [])
    }

    loadProducts()
  }, [])

  useEffect(() => {
    if (mode !== 'edit' || !id) return

    const load = async () => {




      const response = await cmsFetch(`/api/cms/education/posts/${id}`, { headers: {  } })
      const payload = (await response.json().catch(() => null)) as Payload | null
      if (!response.ok || !payload?.post) return setStatus(payload?.error ?? 'Unable to load education post.')

      const nextForm = { ...payload.post, card_title: payload.post.card_title ?? '', card_image_path: payload.post.card_image_path ?? '', hero_image_alt: payload.post.hero_image_alt ?? '' }
      const nextTags = (payload.tags ?? []).map((tag) => ({ clientId: `tag-${tag.id}`, id: tag.id, value: tag.tag }))
      const nextProducts = relationProducts(payload.products ?? [])
      const nextBlocks = (payload.content_blocks ?? []).map((block, index) => ({
          clientId: `block-${block.id}`,
          id: block.id,
          block_type: block.block_type,
          sort_order: block.sort_order ?? index + 1,
          heading: block.heading ?? '',
          body_html: block.body_html ?? '',
          image_path: block.image_path ?? '',
          image_alt: block.image_alt ?? '',
          image_caption: block.image_caption ?? '',
          is_enabled: block.is_enabled !== false,
        }))
      setForm(nextForm)
      setTags(nextTags)
      setSelectedProducts(nextProducts)
      setContentBlocks(nextBlocks)
      setSavedFingerprint(educationDraftFingerprint(nextForm, nextTags, nextProducts, nextBlocks))
      setRevision(payload.revision ?? '')
      setSavedTagIds((payload.tags ?? []).map((item) => String(item.id)))
      setSavedProductIds((payload.products ?? []).map((item) => String(item.id)))
      setSavedBlockIds((payload.content_blocks ?? []).map((item) => String(item.id)))
      setStatus('Education post loaded')
    }

    load()
  }, [mode, id])

  const uploadEducationMedia = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) throw new Error('File too large. Max size is 5MB.')


      const awsPath = await tryUploadAwsImage(file, '/api/cms/uploads/education', {})
      if (awsPath) { return awsPath }
      const { supabase } = await import('@/lib/supabase')
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token
      if (!accessToken) throw new Error('You are not signed in.')




    try {
      const preparedFile = await prepareEducationImage(file)
      const signResponse = await fetch('/api/cms/uploads/education/sign', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ contentType: preparedFile.type, declaredSize: preparedFile.size }),
      })
      const signed = (await signResponse.json().catch(() => null)) as { bucket?: string; path?: string; token?: string; error?: string } | null
      if (!signResponse.ok || !signed?.bucket || !signed.path || !signed.token) {
        throw new Error(signed?.error ?? 'Unable to prepare upload.')
      }

      const { error } = await supabase.storage.from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, preparedFile, { contentType: preparedFile.type })
      if (error) throw error
      return signed.path
    } catch (directError) {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch('/api/cms/uploads/education', {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}` },
        body: formData,
      })
      const payload = (await response.json().catch(() => null)) as { path?: string; error?: string } | null
      if (!response.ok || !payload?.path) {
        throw new Error(payload?.error ?? (directError instanceof Error ? directError.message : 'Unable to upload image.'))
      }
      return payload.path
    }
  }

  const uploadImage = async (file: File) => {

    setUploading(true)
    setStatus('Uploading education image...')
    try {
      const path = await uploadEducationMedia(file)
      setForm((prev) => ({ ...prev, hero_image_path: path }))
      setStatus('Education image uploaded successfully')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to upload image.')
    } finally {
      setUploading(false)
    }
  }

  const uploadCardImage = async (file: File) => {
    setUploading(true)
    try {
      const path = await uploadEducationMedia(file)
      setForm((prev) => ({ ...prev, card_image_path: path }))
      setStatus('Education display image uploaded successfully')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to upload image.') } finally { setUploading(false) }
  }
  const uploadBlockImage = async (clientId: string, file: File) => {

    setUploading(true)
    setStatus('Uploading block image...')
    try {
      const path = await uploadEducationMedia(file)
      setContentBlocks((prev) =>
        prev.map((block) => (block.clientId === clientId ? { ...block, image_path: path } : block))
      )
      setStatus('Block image uploaded successfully')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to upload image.')
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    setIsSaving(true)
    try {



      const endpoint = mode === 'create' ? '/api/cms/education/posts' : `/api/cms/education/posts/${id}`
      const retainedTagIds = new Set(tags.flatMap((tag) => tag.id ? [String(tag.id)] : []))
      const retainedProductIds = new Set(selectedProducts.flatMap((product) => product.relationId ? [String(product.relationId)] : []))
      const retainedBlockIds = new Set(contentBlocks.flatMap((block) => block.id ? [String(block.id)] : []))
      const saveBody = {
        expected_revision: mode === 'edit' ? revision : null, post: form,
        tags: tags.filter((tag) => tag.value.trim()).map((tag) => ({ id: tag.id, tag: tag.value.trim() })),
        content_blocks: contentBlocks.map(({ id, block_type, heading, body_html, image_path, image_alt, image_caption, is_enabled }) => ({ id, block_type, heading, body_html, image_path, image_alt, image_caption, is_enabled })),
        products: selectedProducts.map((product) => ({ id: product.relationId, product_id: product.id })),
        deleted_tag_ids: savedTagIds.filter((savedId) => !retainedTagIds.has(savedId)),
        deleted_product_ids: savedProductIds.filter((savedId) => !retainedProductIds.has(savedId)),
        deleted_block_ids: savedBlockIds.filter((savedId) => !retainedBlockIds.has(savedId)),
      }
      const fingerprint = JSON.stringify(saveBody)
      if (pendingSave.current?.fingerprint !== fingerprint) pendingSave.current = { fingerprint, requestId: crypto.randomUUID() }
      const response = await cmsFetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json',  }, body: JSON.stringify({ ...saveBody, request_id: pendingSave.current.requestId }) })
      const payload = (await response.json().catch(() => null)) as (Payload & { id?: number | string; slug?: string; error?: string }) | null
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save education post.')
      if (!payload?.post || !payload.revision || !Array.isArray(payload.tags) || !Array.isArray(payload.products) || !Array.isArray(payload.content_blocks)) {
        throw new Error('Save response was interrupted. Retry to confirm the same save.')
      }
      const nextForm = { ...payload.post, card_title: payload.post.card_title ?? '', card_image_path: payload.post.card_image_path ?? '', hero_image_alt: payload.post.hero_image_alt ?? '' }
      const nextTags = payload.tags.map((tag) => ({ clientId: `tag-${tag.id}`, id: tag.id, value: tag.tag }))
      const nextProducts = relationProducts(payload.products)
      const nextBlocks = payload.content_blocks.map((block, index) => ({ clientId: `block-${block.id}`, id: block.id, block_type: block.block_type, sort_order: block.sort_order ?? index + 1, heading: block.heading ?? '', body_html: block.body_html ?? '', image_path: block.image_path ?? '', image_alt: block.image_alt ?? '', image_caption: block.image_caption ?? '', is_enabled: block.is_enabled !== false }))
      setForm(nextForm)
      setTags(nextTags)
      setSelectedProducts(nextProducts)
      setContentBlocks(nextBlocks)
      setRevision(payload.revision)
      setSavedTagIds(payload.tags.map((item) => String(item.id)))
      setSavedProductIds(payload.products.map((item) => String(item.id)))
      setSavedBlockIds(payload.content_blocks.map((item) => String(item.id)))
      setSavedFingerprint(educationDraftFingerprint(nextForm, nextTags, nextProducts, nextBlocks))
      pendingSave.current = null
      setConfirmOpen(false)
      setStatus('Education post saved')
      toast({ title: 'Saved', description: 'Education post updated successfully.' })
      if (mode === 'create' && payload.id) { router.push(`/dashboard/cms/education/${payload.id}`); router.refresh() }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save education post.'
      setStatus(message)
      toast({ title: 'Save failed', description: message, variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const deletePost = async () => {
    if (mode !== 'edit' || !id) return





    setIsDeleting(true)
    try {
      pendingDeleteId.current ??= crypto.randomUUID()
      const response = await cmsFetch(`/api/cms/education/posts/${id}`, { method: 'DELETE', headers: { 'content-type': 'application/json',  }, body: JSON.stringify({ request_id: pendingDeleteId.current, expected_revision: revision }) })
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? 'Delete response was interrupted. Reload before retrying.')
      setDeleteConfirmOpen(false)
      toast({ title: 'Deleted', description: 'Education post deleted successfully.' })
      router.push('/dashboard/cms/education')
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete education post.'
      setStatus(message)
      toast({ title: 'Delete failed', description: message, variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  const moveSelectedProduct = (productId: string, direction: -1 | 1) => {
    setSelectedProducts((prev) => {
      const index = prev.findIndex((product) => product.id === productId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Link href="/dashboard/cms/education" onClick={(event) => { event.preventDefault(); unsaved.confirmNavigation(() => router.push('/dashboard/cms/education')) }} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
          <ArrowLeft size={16} />
          Back to Education
        </Link>
        <div className="flex items-center gap-3">
          {mode === 'edit' ? (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={isDeleting || isSaving}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-5 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 size={16} />
              {isDeleting ? 'Deleting...' : 'Delete Education'}
            </button>
          ) : null}
          <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} disabled={!isDirty || uploading} position="inline" />
        </div>
      </div>

      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">{mode === 'create' ? 'Create Education' : 'Edit Education'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Write the article, upload images, and control whether it is live. The public URL is created automatically from the title.</p>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      </div>

      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg border border-border bg-white p-6 shadow-xs">
          {mode === 'edit' && form.slug ? (
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Public URL</label>
              <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">
                {formatEducationUrl(form.slug)}
              </div>
            </div>
          ) : null}
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Article Title</label>
            <input placeholder="Title shown in admin, SEO, and fallbacks" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Display Title</label>
            <textarea placeholder="Optional. Leave blank to use the Article Title. Advanced: supports simple HTML for line breaks or emphasis." value={form.title_html} onChange={(e) => setForm((prev) => ({ ...prev, title_html: e.target.value }))} rows={3} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-muted-foreground">Optional styled title for the website cards and article hero.</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Education Card Title</label>
            <input placeholder="Optional. Falls back to Article Title" value={form.card_title} onChange={(e) => setForm((prev) => ({ ...prev, card_title: e.target.value }))} maxLength={160} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-muted-foreground">Shown on education listing cards.</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Short Intro</label>
            <textarea placeholder="Brief summary shown near the top of the article" value={form.subtitle} onChange={(e) => setForm((prev) => ({ ...prev, subtitle: e.target.value }))} rows={4} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><label className="mb-2 block text-sm font-semibold text-foreground">Topic</label><input placeholder="example: Buying Guide" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" /></div>
            <div><label className="mb-2 block text-sm font-semibold text-foreground">Written By</label><input placeholder="Author name" value={form.author} onChange={(e) => setForm((prev) => ({ ...prev, author: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" /></div>
            <div><label className="mb-2 block text-sm font-semibold text-foreground">Publish Date Text</label><input placeholder="example: Apr 22, 2026" value={form.date_label} onChange={(e) => setForm((prev) => ({ ...prev, date_label: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" /></div>
            <div><label className="mb-2 block text-sm font-semibold text-foreground">Reading Time</label><input placeholder="example: 5 min read" value={form.read_time} onChange={(e) => setForm((prev) => ({ ...prev, read_time: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" /></div>
            <div><label className="mb-2 block text-sm font-semibold text-foreground">Card Style Key</label><input placeholder="example: bg-0" value={form.bg_key} onChange={(e) => setForm((prev) => ({ ...prev, bg_key: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" /></div>
            <div><label className="mb-2 block text-sm font-semibold text-foreground">Card Background Color</label><input placeholder="#EEF1F8" value={form.bg_color} onChange={(e) => setForm((prev) => ({ ...prev, bg_color: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" /></div>
            <div><label className="mb-2 block text-sm font-semibold text-foreground">Display Order</label><input type="number" value={form.sort_order} onChange={(e) => setForm((prev) => ({ ...prev, sort_order: Number(e.target.value) || 0 }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" /></div>
            <label className="flex items-center gap-3 pt-8 text-sm font-semibold text-foreground"><input type="checkbox" checked={form.is_published} onChange={(e) => setForm((prev) => ({ ...prev, is_published: e.target.checked }))} className="h-4 w-4" />Show on website</label>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-white p-6 shadow-xs">
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Main Education Image</label>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
                <Upload size={14} />
                {uploading ? 'Uploading...' : 'Upload Image'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) void uploadImage(file) }} />
              </label>
              <span className="text-xs text-muted-foreground">{form.hero_image_path || 'No image uploaded yet'}</span>
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Education Card Image</label>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
                <Upload size={14} />
                {uploading ? 'Uploading...' : 'Upload Card Image'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) void uploadCardImage(file) }} />
              </label>
              <span className="text-xs text-muted-foreground">{form.card_image_path || 'Uses main education image'}</span>
            </div>
            {form.card_image_path ? <button type="button" onClick={() => setForm((prev) => ({ ...prev, card_image_path: '' }))} className="mt-2 text-xs font-semibold text-red-600 hover:text-red-700">Use main image instead</button> : null}
          </div>
          <div>
            <label htmlFor="hero-image-alt" className="mb-2 block text-sm font-semibold text-foreground">Main Image Alt Text</label>
            <input
              id="hero-image-alt"
              value={form.hero_image_alt}
              onChange={(e) => setForm((prev) => ({ ...prev, hero_image_alt: e.target.value }))}
              placeholder="Describe the image for people who cannot see it"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Describe the image’s subject and purpose. Leave empty only when the image is purely decorative.</p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-semibold text-foreground">Tags</label>
              <button type="button" onClick={() => setTags((prev) => [...prev, { clientId: `tag-${Date.now()}-${prev.length}`, value: '' }])} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
                <Plus size={14} />
                Add Tag
              </button>
            </div>
            <div className="space-y-2">
              {tags.map((tag) => (
                <div key={tag.clientId} className="flex items-center gap-2">
                  <input value={tag.value} onChange={(e) => setTags((prev) => prev.map((item) => item.clientId === tag.clientId ? { ...item, value: e.target.value } : item))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
                  <button type="button" onClick={() => setTags((prev) => prev.filter((item) => item.clientId !== tag.clientId))} className="rounded-lg border border-border px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-semibold text-foreground">Featured Products</label>
              <span className="text-xs text-muted-foreground">{selectedProducts.length} selected</span>
            </div>
            <input
              placeholder="Search products from any category"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="mb-3 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
            <div className="mb-3 space-y-2">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setSelectedProducts((prev) => [...prev, product])}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-foreground">{product.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{product.slug}</span>
                  </span>
                  <Plus size={14} />
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {selectedProducts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
                  No featured products selected.
                </div>
              ) : null}
              {selectedProducts.map((product, index) => (
                <div key={product.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{index + 1}. {product.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{product.slug}</div>
                  </div>
                  <button type="button" onClick={() => moveSelectedProduct(product.id, -1)} disabled={index === 0} className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-40">Up</button>
                  <button type="button" onClick={() => moveSelectedProduct(product.id, 1)} disabled={index === selectedProducts.length - 1} className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-40">Down</button>
                  <button type="button" onClick={() => setSelectedProducts((prev) => prev.filter((item) => item.id !== product.id))} className="rounded-lg border border-border px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 max-w-6xl rounded-lg border border-border bg-white p-6 shadow-xs">
        <label className="mb-3 block text-sm font-semibold text-foreground">Article Content</label>
        <RichTextEditor value={form.body_html} onChange={(value) => setForm((prev) => ({ ...prev, body_html: value }))} />
      </div>

      <div className="mt-6 max-w-6xl rounded-lg border border-border bg-white p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground">Extra Article Sections</label>
            <p className="mt-1 text-xs text-muted-foreground">Optional sections shown below the main article content, such as extra images, headings, quotes, or text.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['image', 'text', 'heading', 'quote'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setContentBlocks((prev) => [...prev, createEmptyBlock(type, prev.length + 1)])}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                <Plus size={14} />
                Add {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {contentBlocks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No extra blocks added yet.
            </div>
          ) : null}

          {contentBlocks.map((block, index) => (
            <div key={block.clientId} className="rounded-lg border border-border bg-[#fcfcfd] p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">
                  Block {index + 1} · {block.block_type}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setContentBlocks((prev) => prev.filter((entry) => entry.clientId !== block.clientId).map((entry, order) => ({ ...entry, sort_order: order + 1 })))
                    }
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {block.block_type === 'image' ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-foreground">Section Image</label>
                    <div className="flex items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
                        <Upload size={14} />
                        {uploading ? 'Uploading...' : 'Upload Block Image'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploading}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            const file = e.target.files?.[0]
                            if (file) void uploadBlockImage(block.clientId, file)
                          }}
                        />
                      </label>
                      <span className="text-xs text-muted-foreground">{block.image_path || 'No image uploaded yet'}</span>
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-foreground">Image Alt Text</label>
                    <input
                      value={block.image_alt}
                      onChange={(e) => setContentBlocks((prev) => prev.map((entry) => (entry.clientId === block.clientId ? { ...entry, image_alt: e.target.value } : entry)))}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Briefly describe what this image communicates for visitors using a screen reader.</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-semibold text-foreground">Caption</label>
                    <textarea
                      value={block.image_caption}
                      onChange={(e) => setContentBlocks((prev) => prev.map((entry) => (entry.clientId === block.clientId ? { ...entry, image_caption: e.target.value } : entry)))}
                      rows={3}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              ) : block.block_type === 'heading' ? (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">Heading</label>
                  <input
                    value={block.heading}
                    onChange={(e) => setContentBlocks((prev) => prev.map((entry) => (entry.clientId === block.clientId ? { ...entry, heading: e.target.value } : entry)))}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  />
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">{block.block_type === 'quote' ? 'Quote Text' : 'Section Text'}</label>
                  <RichTextEditor
                    value={block.body_html || '<p></p>'}
                    onChange={(value) =>
                      setContentBlocks((prev) => prev.map((entry) => (entry.clientId === block.clientId ? { ...entry, body_html: value } : entry)))
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={mode === 'create' ? 'Create education post?' : 'Save education post?'}
        description="This will update the education content on the live site."
        confirmText="Save"
        cancelText="Cancel"
        type="confirm"
        isLoading={isSaving}
        onConfirm={save}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete education post?"
        description="This permanently deletes the education post, its tags, and its content blocks."
        confirmText="Delete"
        cancelText="Cancel"
        type="delete"
        isLoading={isDeleting}
        onConfirm={deletePost}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={unsaved.showWarning}
        title="Discard unsaved education changes?"
        description="Your changes have not been saved and will be lost."
        confirmText="Discard"
        cancelText="Keep editing"
        type="warning"
        onConfirm={unsaved.handleDiscard}
        onCancel={() => unsaved.setShowWarning(false)}
      />
    </div>
  )
}
