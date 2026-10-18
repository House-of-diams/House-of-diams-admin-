'use client'
import { readCmsId } from '@/lib/cms-id-safety'


import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, CheckCircle2, ExternalLink, Plus, Trash2, Edit2 } from 'lucide-react'
import { CmsSaveAction } from '@/components/cms-save-action'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { getCachedDocsPage, loadDocsPage, setCachedDocsPage, type DocsAdminPayload } from '@/lib/docs-admin-cache'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Pilcrow,
  Quote,
} from 'lucide-react'

type Block = {
  clientId: string
  id?: number | string
  sort_order: number
  heading: string
  description: string
  body: string
}

type Payload = DocsAdminPayload

const DOCS_META: Record<string, { label: string; description: string }> = {
  shipping: { label: 'Shipping', description: 'Manage shipping timelines and delivery details' },
  returns: { label: 'Returns', description: 'Manage returns, exchanges, and claim language' },
  terms: { label: 'Terms & Conditions', description: 'Manage purchase and website terms' },
  'privacy-policy': { label: 'Privacy Policy', description: 'Manage privacy and data usage copy' },
}

const emptyBlock = (sort_order: number): Block => ({
  clientId: `draft-${Date.now()}`,
  sort_order,
  heading: '',
  description: '',
  body: '',
})

function docsDraftFingerprint(page: { eyebrow: string; title: string; subtitle: string; faq_category_id: number | string | null }, blocks: Block[]) {
  return JSON.stringify({
    page,
    blocks: [...blocks].sort((a, b) => a.sort_order - b.sort_order || a.clientId.localeCompare(b.clientId))
      .map(({ id, heading, description, body }) => ({ id, heading, description, body })),
  })
}

function RichTextEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Placeholder.configure({
        placeholder: 'Write the block body here...',
      }),
    ],
    content: value || '<p></p>',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'min-h-[260px] w-full rounded-lg border border-border bg-white px-4 py-3 text-sm text-foreground outline-none focus:border-primary prose prose-sm max-w-none',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (value !== current) {
      editor.commands.setContent(value || '<p></p>')
    }
  }, [editor, value])

  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex flex-wrap gap-2 border-b border-border bg-secondary/30 p-2">
        <button
          type="button"
          onClick={() => editor?.chain().focus().setParagraph().run()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <Pilcrow size={13} />
          Paragraph
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <Heading2 size={13} />
          H2
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <Heading3 size={13} />
          H3
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <Bold size={13} />
          Bold
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <Italic size={13} />
          Italic
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <List size={13} />
          Bullet
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <ListOrdered size={13} />
          Numbered
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <Quote size={13} />
          Quote
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

export default function DocsEditorPage() {
  const { toast } = useToast()
  const router = useRouter()
  const params = useParams<{ slug: string }>()
  const slug = useMemo(() => (Array.isArray(params?.slug) ? params.slug[0] : params?.slug ?? ''), [params])
  const meta = DOCS_META[slug] ?? { label: 'Docs', description: 'Edit docs page content' }
  const initialCachedPayload = useMemo(() => getCachedDocsPage(slug), [slug])
  const [pageData, setPageData] = useState(() => ({
    eyebrow: initialCachedPayload?.page?.eyebrow ?? '',
    title: initialCachedPayload?.page?.title ?? '',
    subtitle: initialCachedPayload?.page?.subtitle ?? '',
    faq_category_id: initialCachedPayload?.page?.faq_category_id ?? null,
  }))
  const [faqCategories, setFaqCategories] = useState(initialCachedPayload?.faqCategories ?? [])
  const [blocks, setBlocks] = useState<Block[]>(() =>
    (initialCachedPayload?.blocks ?? []).map((block, index) => ({ clientId: block.id ? `id-${block.id}` : `cached-${index}`, ...block }))
  )
  const [status, setStatus] = useState(initialCachedPayload ? `${meta.label} ready` : 'Loading docs page...')
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string; previewUrl?: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorConfirmOpen, setEditorConfirmOpen] = useState(false)
  const [editorBlock, setEditorBlock] = useState<Block>(emptyBlock(1))
  const [deleteTarget, setDeleteTarget] = useState<Block | null>(null)
  const [revision, setRevision] = useState(initialCachedPayload?.revision ?? '')
  const [savedBlockIds, setSavedBlockIds] = useState(() => (initialCachedPayload?.blocks ?? []).flatMap((block) => block.id ? [String(block.id)] : []))
  const [savedFingerprint, setSavedFingerprint] = useState(() => docsDraftFingerprint(
    { eyebrow: initialCachedPayload?.page?.eyebrow ?? '', title: initialCachedPayload?.page?.title ?? '', subtitle: initialCachedPayload?.page?.subtitle ?? '', faq_category_id: initialCachedPayload?.page?.faq_category_id ?? null },
    (initialCachedPayload?.blocks ?? []).map((block, index) => ({ clientId: block.id ? `id-${block.id}` : `cached-${index}`, ...block }))
  ))
  const pendingSave = useRef<{ fingerprint: string; requestId: string } | null>(null)

  const sortedBlocks = useMemo(() => [...blocks].sort((a, b) => a.sort_order - b.sort_order || a.clientId.localeCompare(b.clientId)), [blocks])
  const nextOrder = Math.max(...blocks.map((block) => block.sort_order), 0) + 1
  const isEditingExistingBlock = blocks.some((block) => block.clientId === editorBlock.clientId)
  const currentFingerprint = useMemo(() => docsDraftFingerprint(pageData, blocks), [pageData, blocks])
  const isDirty = currentFingerprint !== savedFingerprint
  const unsaved = useUnsavedChanges(isDirty || editorOpen)

  useEffect(() => {
    const load = async () => {
      if (!slug) return
      try {
        const payload = await loadDocsPage(slug)

        const nextPage = {
          eyebrow: payload?.page?.eyebrow ?? '',
          title: payload?.page?.title ?? '',
          subtitle: payload?.page?.subtitle ?? '',
          faq_category_id: payload?.page?.faq_category_id ?? null,
        }
        const nextBlocks = (payload?.blocks ?? []).map((block, index) => ({ clientId: block.id ? `id-${block.id}` : `loaded-${index}`, ...block }))
        setPageData(nextPage)
        setFaqCategories(payload?.faqCategories ?? [])
        setBlocks(nextBlocks)
        setSavedFingerprint(docsDraftFingerprint(nextPage, nextBlocks))
        setRevision(payload?.revision ?? '')
        setSavedBlockIds((payload?.blocks ?? []).flatMap((block) => block.id ? [String(block.id)] : []))
        setStatus(`${meta.label} loaded`)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Unable to load docs page.')
      }
    }

    load()
  }, [slug, meta.label])

  const saveEditor = () => {
    const action = isEditingExistingBlock ? 'updated' : 'added'
    setBlocks((prev) => {
      const next = {
        ...editorBlock,
        sort_order: Number.isFinite(editorBlock.sort_order) ? editorBlock.sort_order : nextOrder,
      }
      const idx = prev.findIndex((block) => block.clientId === editorBlock.clientId)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = next
        return copy
      }
      return [...prev, next]
    })
    setSaveFeedback(null)
    setStatus(`Block ${action} to the draft. Save changes to publish.`)
    setEditorOpen(false)
    toast({
      title: `Block ${action}`,
      description: 'This is a draft change. Click Save Changes to publish it on the storefront.',
    })
  }

  const deleteBlock = () => {
    if (!deleteTarget) return
    setBlocks((prev) => prev.filter((block) => block.clientId !== deleteTarget.clientId))
    setSaveFeedback(null)
    setStatus('Block removed from the draft. Save changes to publish.')
    setDeleteTarget(null)
    toast({
      title: 'Block removed',
      description: 'This is a draft change. Click Save Changes to remove it from the storefront.',
    })
  }

  const saveAll = async () => {
    setIsSaving(true)
    setSaveFeedback(null)

    try {




      const retainedBlockIds = new Set(sortedBlocks.flatMap((block) => block.id ? [String(block.id)] : []))
      const saveBody = {
        expected_revision: revision,
        page: pageData,
        blocks: sortedBlocks.map(({ id, heading, description, body }) => ({ id, heading, description, body })),
        deleted_block_ids: savedBlockIds.filter((savedId) => !retainedBlockIds.has(savedId)),
      }
      const fingerprint = JSON.stringify(saveBody)
      if (pendingSave.current?.fingerprint !== fingerprint) pendingSave.current = { fingerprint, requestId: crypto.randomUUID() }
      const response = await cmsFetch(`/api/cms/docs/${slug}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',

        },
        body: JSON.stringify({ ...saveBody, request_id: pendingSave.current.requestId }),
      })
      const payload = (await response.json().catch(() => null)) as Payload | null
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save docs page.')
      if (!payload?.page || !Array.isArray(payload.blocks) || !payload.revision) {
        throw new Error('Save response was interrupted. Retry to confirm the same save.')
      }

      const message = `${meta.label} saved successfully and is available on the storefront.`
      setStatus(`${meta.label} saved`)
      const storefrontUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL || 'https://www.houseofdiams.com'
      const canonicalPage = payload.page
      const canonicalBlocks = payload.blocks
      const nextPage = {
        eyebrow: canonicalPage.eyebrow ?? '', title: canonicalPage.title ?? '', subtitle: canonicalPage.subtitle ?? '',
        faq_category_id: canonicalPage.faq_category_id ?? null,
      }
      const nextBlocks = canonicalBlocks.map((block, index) => ({ clientId: block.id ? `id-${block.id}` : `saved-${index}`, ...block }))
      setPageData(nextPage)
      setBlocks(nextBlocks)
      setRevision(payload.revision)
      setSavedBlockIds(canonicalBlocks.flatMap((block) => block.id ? [String(block.id)] : []))
      setSavedFingerprint(docsDraftFingerprint(nextPage, nextBlocks))
      pendingSave.current = null
      setCachedDocsPage(slug, {
        page: canonicalPage,
        blocks: canonicalBlocks,
        faqCategories,
        revision: payload.revision,
      })
      setSaveFeedback({ type: 'success', message, previewUrl: `${storefrontUrl}/${slug}?preview=${Date.now()}` })
      setConfirmOpen(false)
      toast({ title: 'Changes saved successfully', description: message })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save docs page.'
      setStatus(message)
      setSaveFeedback({ type: 'error', message })
      toast({ title: 'Save failed', description: message, variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Link href="/dashboard/cms/docs" onClick={(event) => { event.preventDefault(); unsaved.confirmNavigation(() => router.push('/dashboard/cms/docs')) }} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
          <ArrowLeft size={16} />
          Back to Docs
        </Link>
        <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} disabled={!isDirty || editorOpen} position="inline" />
      </div>

      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">{meta.label}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      </div>

      {saveFeedback ? (
        <div
          role="status"
          aria-live="polite"
          className={`mb-6 flex max-w-5xl items-start justify-between gap-4 rounded-lg border p-4 ${
            saveFeedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <div className="flex items-start gap-3">
            {saveFeedback.type === 'success' ? <CheckCircle2 className="mt-0.5 shrink-0" size={19} /> : <AlertCircle className="mt-0.5 shrink-0" size={19} />}
            <div>
              <p className="text-sm font-semibold">{saveFeedback.type === 'success' ? 'Saved successfully' : 'Changes were not saved'}</p>
              <p className="mt-1 text-xs leading-5 opacity-80">{saveFeedback.message}</p>
            </div>
          </div>
          {saveFeedback.type === 'success' && saveFeedback.previewUrl ? (
            <a
              href={saveFeedback.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold underline underline-offset-4"
            >
              View live page <ExternalLink size={13} />
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="max-w-5xl space-y-6 rounded-lg border border-border bg-white p-8 shadow-xs">
        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Eyebrow</label>
          <input
            value={pageData.eyebrow}
            onChange={(e) => setPageData((prev) => ({ ...prev, eyebrow: e.target.value }))}
            className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Title</label>
          <input
            value={pageData.title}
            onChange={(e) => setPageData((prev) => ({ ...prev, title: e.target.value }))}
            className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Subtitle</label>
          <textarea
            value={pageData.subtitle}
            onChange={(e) => setPageData((prev) => ({ ...prev, subtitle: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
          />
        </div>
        {slug === 'returns' ? (
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">FAQ category shown on Returns</label>
            <select value={pageData.faq_category_id ?? ''} onChange={(e) => setPageData((prev) => ({ ...prev, faq_category_id: e.target.value ? readCmsId(e.target.value) : null }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm">
              <option value="">No FAQ category selected</option>
              {faqCategories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">Only questions assigned to this category will appear on the Returns page.</p>
          </div>
        ) : null}
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-border bg-white shadow-xs">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Order</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Heading</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Description</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedBlocks.map((block) => (
              <tr key={block.clientId} className="border-b border-border last:border-b-0">
                <td className="px-5 py-4 text-sm">{block.sort_order}</td>
                <td className="px-5 py-4 text-sm">{block.heading}</td>
                <td className="px-5 py-4 text-sm">{block.description}</td>
                <td className="px-5 py-4 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button
                      onClick={() => { setEditorBlock(block); setEditorOpen(true) }}
                      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                    >
                      <Edit2 size={14} />
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(block)}
                      className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={() => { setEditorBlock(emptyBlock(nextOrder)); setEditorOpen(true) }}
        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"
      >
        <Plus size={16} />
        Add Block
      </button>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={`Save ${meta.label}?`}
        description={`This will update the ${meta.label.toLowerCase()} page on the live site.`}
        confirmText="Save"
        cancelText="Cancel"
        type="confirm"
        isLoading={isSaving}
        onConfirm={saveAll}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete this block?"
        description="The block will be removed from the draft. Use Save Changes afterward to publish the deletion on the storefront."
        confirmText="Delete Block"
        cancelText="Cancel"
        type="delete"
        onConfirm={deleteBlock}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        isOpen={editorConfirmOpen}
        title={isEditingExistingBlock ? 'Update this block?' : 'Add this block?'}
        description="This updates the local draft. Use Save Changes afterward to publish it on the storefront."
        confirmText={isEditingExistingBlock ? 'Update Block' : 'Add Block'}
        cancelText="Cancel"
        type="confirm"
        onConfirm={() => {
          setEditorConfirmOpen(false)
          saveEditor()
        }}
        onCancel={() => setEditorConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={unsaved.showWarning}
        title="Discard unsaved document changes?"
        description="Your page or open block changes have not been saved and will be lost."
        confirmText="Discard"
        cancelText="Keep editing"
        type="warning"
        onConfirm={unsaved.handleDiscard}
        onCancel={() => unsaved.setShowWarning(false)}
      />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Block</DialogTitle>
            <DialogDescription>Update heading, description, and body text.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Heading</label>
              <input
                value={editorBlock.heading}
                onChange={(e) => setEditorBlock((prev) => ({ ...prev, heading: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Description</label>
              <input
                value={editorBlock.description}
                onChange={(e) => setEditorBlock((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Body</label>
              <RichTextEditor
                value={editorBlock.body}
                onChange={(body) => setEditorBlock((prev) => ({ ...prev, body }))}
              />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setEditorOpen(false)} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary">
              Cancel
            </button>
            <button onClick={() => setEditorConfirmOpen(true)} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">
              {isEditingExistingBlock ? 'Update Block' : 'Add Block'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
