'use client'

import { tryUploadAwsImage } from '@/lib/image-transport'
import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useState, type ChangeEvent } from 'react'
import { ArrowLeft, Edit2, Trash2, Upload } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CmsSaveAction } from '@/components/cms-save-action'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/hooks/use-toast'

type CollectionItem = {
  id: string
  sort_order: number
  label: string
  title: string
  description: string
  image_path: string
  link: string
}

type ApiPayload = {
  items?: CollectionItem[]
  path?: string
  url?: string
  error?: string
}

export type CollectionEditorInitialData = {
  items: CollectionItem[]
}

function createCollectionItem(overrides?: Partial<CollectionItem>): CollectionItem {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    sort_order: overrides?.sort_order ?? 1,
    label: overrides?.label ?? '',
    title: overrides?.title ?? '',
    description: overrides?.description ?? '',
    image_path: overrides?.image_path ?? '',
    link: overrides?.link ?? '',
  }
}

function normalizeCollectionItems(items: CollectionItem[]) {
  return items
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order || left.title.localeCompare(right.title))
    .map((item, index) => ({
      ...item,
      sort_order: index + 1,
    }))
}

export function CollectionEditorClient({ initialData }: { initialData: CollectionEditorInitialData }) {
  const { toast } = useToast()
  const [items, setItems] = useState<CollectionItem[]>(normalizeCollectionItems(initialData.items.map((item) => createCollectionItem(item))))
  const [loadStatus, setLoadStatus] = useState(initialData.items.length ? 'Collection loaded' : 'No collection items found yet')
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<CollectionItem | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorItem, setEditorItem] = useState<CollectionItem | null>(null)

  const handleOpenEditor = (item?: CollectionItem) => {
    setEditorItem(item ? { ...item } : createCollectionItem({ sort_order: items.length + 1 }))
    setEditorOpen(true)
  }

  const saveEditor = () => {
    if (!editorItem) return
    setItems((prev) => {
      const nextItems = prev.some((item) => item.id === editorItem.id)
        ? prev.map((item) => (item.id === editorItem.id ? editorItem : item))
        : [...prev, editorItem]
      return normalizeCollectionItems(nextItems)
    })
    setEditorOpen(false)
  }

  const uploadImage = async (file: File) => {

    try {
      const awsPath = await tryUploadAwsImage(file, '/api/cms/uploads/collection', {},{start:()=>setUploadState('uploading'),finish:ok=>setUploadState(ok?'done':'error')})
      if (awsPath) { setEditorItem(prev => prev ? {...prev,image_path:awsPath}:prev); setLoadStatus('Image uploaded successfully'); return }
    } catch (error) { setLoadStatus(error instanceof Error ? error.message : 'Upload failed.'); return }


    const { supabase } = await import('@/lib/supabase')
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token

    if (!accessToken) {
      setLoadStatus('You are not signed in.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadState('error')
      setLoadStatus('File too large. Max size is 5MB.')
      return
    }

    setUploadState('uploading')
    setLoadStatus('Uploading image...')

    let uploadedPath = ''
    try {
      const preparedFile = await prepareCollectionCardImage(file)
      const signResponse = await fetch('/api/cms/uploads/collection/sign', {
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
      uploadedPath = signed.path
    } catch {
      const fallbackFormData = new FormData()
      fallbackFormData.append('file', file)
      const fallbackResponse = await fetch('/api/cms/uploads/collection', {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}` },
        body: fallbackFormData,
      })
      const fallbackPayload = (await fallbackResponse.json().catch(() => null)) as ApiPayload | null
      if (!fallbackResponse.ok || !fallbackPayload?.path) {
        setUploadState('error')
        setLoadStatus(fallbackPayload?.error ?? 'Unable to upload image.')
        return
      }
      uploadedPath = fallbackPayload.path
    }

    if (!uploadedPath) {
      setUploadState('error')
      setLoadStatus('Unable to upload image.')
      return
    }

    setEditorItem((prev) => (prev ? { ...prev, image_path: uploadedPath } : prev))
    setUploadState('done')
    setLoadStatus('Image uploaded successfully')
    toast({
      title: 'Uploaded',
      description: 'Collection image uploaded successfully.',
    })
  }

  const handleSave = () => setConfirmOpen(true)

  const handleRemoveRequest = (item: CollectionItem) => {
    setRemoveTarget(item)
    setRemoveConfirmOpen(true)
  }

  const confirmRemove = () => {
    if (!removeTarget) return
    setItems((prev) => normalizeCollectionItems(prev.filter((item) => item.id !== removeTarget.id)))
    setLoadStatus('Collection item removed. Save changes to publish.')
    setRemoveTarget(null)
    setRemoveConfirmOpen(false)
    toast({
      title: 'Removed',
      description: 'Collection item removed from this draft. Save changes to publish.',
    })
  }

  const confirmSave = async () => {
    setIsSaving(true)





    const response = await cmsFetch('/api/cms/home/collection', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',

      },
      body: JSON.stringify({
        items: items.map((collectionItem) => ({
          sort_order: collectionItem.sort_order,
          label: collectionItem.label,
          title: collectionItem.title,
          description: collectionItem.description,
          image_path: collectionItem.image_path,
          link: collectionItem.link,
        })),
      }),
    })

    const payload = (await response.json().catch(() => null)) as ApiPayload | null
    setIsSaving(false)

    if (!response.ok) {
      setLoadStatus(payload?.error ?? 'Unable to save Collection.')
      return
    }

    if (payload?.items) {
      setItems(normalizeCollectionItems(payload.items.map((item) => createCollectionItem(item))))
    }

    setConfirmOpen(false)
    setLoadStatus('Collection saved')
    toast({ title: 'Saved', description: 'Collection updated successfully.' })
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
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Collection</h1>
        <p className="mt-1 text-sm text-muted-foreground">Edit collection cards, images, and links</p>
        <p className="mt-2 text-xs text-muted-foreground">{loadStatus}</p>
      </div>

      <div className="mb-6 flex justify-end">
        <button
          onClick={() => handleOpenEditor()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
        >
          <Edit2 size={16} />
          Add Collection
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white shadow-xs">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Order</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Label</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Title</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Image</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Link</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-b-0">
                <td className="px-5 py-4 text-sm">{item.sort_order}</td>
                <td className="px-5 py-4 text-sm">{item.label}</td>
                <td className="px-5 py-4 text-sm">{item.title}</td>
                <td className="px-5 py-4 text-sm">{item.image_path}</td>
                <td className="px-5 py-4 text-sm">{item.link}</td>
                <td className="px-5 py-4 text-right">
                  <div className="inline-flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEditor(item)}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                    <button
                      onClick={() => handleRemoveRequest(item)}
                      className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CmsSaveAction onClick={handleSave} isSaving={isSaving} />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Save Collection?"
        description="This will update the collection cards on the homepage."
        confirmText="Save"
        cancelText="Cancel"
        type="confirm"
        isLoading={isSaving}
        onConfirm={confirmSave}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        isOpen={removeConfirmOpen}
        title="Remove Collection Item?"
        description={`This will remove "${removeTarget?.title || removeTarget?.label || 'this item'}" from the collection list. Uploaded images will not be deleted.`}
        confirmText="Remove"
        cancelText="Cancel"
        type="delete"
        onConfirm={confirmRemove}
        onCancel={() => {
          setRemoveTarget(null)
          setRemoveConfirmOpen(false)
        }}
      />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Collection</DialogTitle>
            <DialogDescription>Update label, title, description, image, and link.</DialogDescription>
          </DialogHeader>

          {editorItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">Order</label>
                  <input
                    type="number"
                    value={editorItem.sort_order}
                    onChange={(e) =>
                      setEditorItem((prev) => (prev ? { ...prev, sort_order: Number(e.target.value) } : prev))
                    }
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">Label</label>
                  <input
                    type="text"
                    value={editorItem.label}
                    onChange={(e) =>
                      setEditorItem((prev) => (prev ? { ...prev, label: e.target.value } : prev))
                    }
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Title</label>
                <input
                  type="text"
                  value={editorItem.title}
                  onChange={(e) =>
                    setEditorItem((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                  }
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Description</label>
                <textarea
                  value={editorItem.description}
                  onChange={(e) =>
                    setEditorItem((prev) => (prev ? { ...prev, description: e.target.value } : prev))
                  }
                  rows={4}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Image</label>
                <div className="flex items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
                    <Upload size={14} />
                    {uploadState === 'uploading' ? 'Uploading...' : 'Upload Image'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadState === 'uploading'}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        const file = e.target.files?.[0]
                        if (file) void uploadImage(file)
                      }}
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">{editorItem.image_path || 'No image uploaded yet'}</span>
                </div>
                <div className="mt-3 overflow-hidden rounded-md border border-border bg-secondary/30">
                  <div
                    className={`h-1.5 transition-all ${
                      uploadState === 'uploading'
                        ? 'w-2/3 animate-pulse bg-primary'
                        : uploadState === 'done'
                          ? 'w-full bg-emerald-500'
                          : uploadState === 'error'
                            ? 'w-full bg-red-500'
                            : 'w-0 bg-primary'
                    }`}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {uploadState === 'uploading'
                    ? 'Uploading and validating image...'
                    : uploadState === 'done'
                      ? 'Upload complete. You can now save the item.'
                      : uploadState === 'error'
                        ? 'Upload failed. Please try another image.'
                        : 'Choose a JPG, PNG, WebP, or AVIF image up to 5MB.'}
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Link</label>
                <input
                  type="text"
                  value={editorItem.link}
                  onChange={(e) =>
                    setEditorItem((prev) => (prev ? { ...prev, link: e.target.value } : prev))
                  }
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <button
              onClick={() => setEditorOpen(false)}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              onClick={saveEditor}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Update Item
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

async function prepareCollectionCardImage(file: File) {
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
