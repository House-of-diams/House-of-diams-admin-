'use client'
import { uploadAwsImage } from '@/lib/image-transport'
import { compareCmsIds } from '@/lib/cms-id-safety'


import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ArrowLeft, Edit2, Plus, Trash2, Upload } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CmsSaveAction } from '@/components/cms-save-action'
import { useCmsAtomicListSave } from '@/hooks/use-cms-atomic-list-save'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

type FounderItem = {
  clientId: string
  id?: number | string
  sort_order: number
  name: string
  designation: string
  bio: string
  image_path: string
}

type ApiPayload = {
  items?: Array<{
    id: number | string
    sort_order: number
    name: string
    designation: string
    bio: string
    image_path: string
  }>
  revision?: string
  error?: string
}

type EditorItem = {
  clientId: string
  sort_order: number
  name: string
  designation: string
  bio: string
  image_path: string
}

export type FoundersInitialData = {
  revision: string
  items: Array<{
    id: number | string
    sort_order: number
    name: string
    designation: string
    bio: string
    image_path: string
  }>
}

const empty = (sortOrder: number): EditorItem => ({
  clientId: `draft-${Date.now()}`,
  sort_order: sortOrder,
  name: '',
  designation: '',
  bio: '',
  image_path: '',
})

export function FoundersEditorClient({ initialData }: { initialData: FoundersInitialData }) {
  const router = useRouter()
  const [items, setItems] = useState<FounderItem[]>(
    initialData.items.map((item) => ({ clientId: `id-${item.id}`, ...item }))
  )
  const [status, setStatus] = useState(initialData.items.length ? 'Founders loaded' : 'No founders found yet')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorItem, setEditorItem] = useState<EditorItem>(empty(1))
  const [uploadState, setUploadState] = useState<'idle' | 'uploading'>('idle')
  const [savedState, setSavedState] = useState(() => JSON.stringify(
    [...initialData.items].sort((a, b) => a.sort_order - b.sort_order || compareCmsIds(a.id, b.id))
      .map(({ id, name, designation, bio, image_path }) => ({ id, name, designation, bio, image_path }))
  ))
  const { prepareSave, acceptSave } = useCmsAtomicListSave(initialData.items, initialData.revision)

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.sort_order - b.sort_order || a.clientId.localeCompare(b.clientId)),
    [items]
  )
  const saveItems = sorted.map(({ id, name, designation, bio, image_path }) => ({ ...(id ? { id } : {}), name, designation, bio, image_path }))
  const dirty = JSON.stringify(saveItems) !== savedState
  const unsaved = useUnsavedChanges(dirty || editorOpen)

  const nextOrder = Math.max(...items.map((item) => item.sort_order), 0) + 1

  const uploadImage = async (file: File) => {

    try {
      const awsPath = await uploadAwsImage(file, '/api/cms/uploads/founders', {},{start:()=>setUploadState('uploading'),finish:()=>setUploadState('idle')})
      if (awsPath) { setEditorItem(prev => ({...prev,image_path:awsPath})); setStatus('Founder image uploaded successfully'); return }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Upload failed.'); return }


  }

  const saveEditor = () => {
    setItems((prev) => {
      const idx = prev.findIndex((item) => item.clientId === editorItem.clientId)
      const next = { ...editorItem, sort_order: Number.isFinite(editorItem.sort_order) ? editorItem.sort_order : 1 }
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], ...next }
        return copy
      }
      return [...prev, next]
    })
  }

  const saveAll = async () => {
    setIsSaving(true)
    try {



      const response = await cmsFetch('/api/cms/about/founders', {
        method: 'POST',
        headers: { 'content-type': 'application/json',  },
        body: JSON.stringify(prepareSave({ items: saveItems }, saveItems)),
      })
      const payload = (await response.json().catch(() => null)) as ApiPayload | null
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save founders.')
      if (!Array.isArray(payload?.items) || typeof payload.revision !== 'string') throw new Error('Save response was interrupted. Retry to confirm the same save.')
      const nextItems = payload.items.map((item) => ({ clientId: `id-${item.id}`, ...item }))
      setItems(nextItems)
      setSavedState(JSON.stringify(payload.items.map(({ id, name, designation, bio, image_path }) => ({ id, name, designation, bio, image_path }))))
      acceptSave(payload.items, payload.revision)
      setConfirmOpen(false)
      setStatus('Founders saved')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save founders.')
    } finally { setIsSaving(false) }
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Link href="/dashboard/cms/about" onClick={(event) => { event.preventDefault(); unsaved.confirmNavigation(() => router.push('/dashboard/cms/about')) }} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
          <ArrowLeft size={16} />
          Back to About
        </Link>
        <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} disabled={!dirty} position="inline" />
      </div>

      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Founders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage founder profiles</p>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white shadow-xs">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Order</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Name</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Designation</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Image</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.clientId} className="border-b border-border last:border-b-0">
                <td className="px-5 py-4 text-sm">{item.sort_order}</td>
                <td className="px-5 py-4 text-sm">{item.name}</td>
                <td className="px-5 py-4 text-sm">{item.designation}</td>
                <td className="px-5 py-4 text-sm">{item.image_path}</td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => { setEditorItem(item); setEditorOpen(true) }} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                      <Edit2 size={14} />
                      Edit
                    </button>
                    <button type="button" onClick={() => { setItems((current) => current.filter((founder) => founder.clientId !== item.clientId)); setStatus('Founder removed locally. Save changes to publish the deletion.') }} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-sm text-muted-foreground">No founders found yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <button onClick={() => { setEditorItem(empty(nextOrder)); setEditorOpen(true) }} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
        <Plus size={16} />
        Add Founder
      </button>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Save founders?"
        description="This will update the founders section on the homepage."
        confirmText="Save"
        cancelText="Cancel"
        type="confirm"
        isLoading={isSaving}
        onConfirm={saveAll}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved Founder changes?" description="Your founder changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)} />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Founder</DialogTitle>
            <DialogDescription>Update the founder card and upload an image.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Name</label>
              <input value={editorItem.name} onChange={(e) => setEditorItem((prev) => ({ ...prev, name: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Designation</label>
              <input value={editorItem.designation} onChange={(e) => setEditorItem((prev) => ({ ...prev, designation: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Bio</label>
              <textarea value={editorItem.bio} onChange={(e) => setEditorItem((prev) => ({ ...prev, bio: e.target.value }))} rows={5} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
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
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void uploadImage(file)
                    }}
                  />
                </label>
                <span className="text-xs text-muted-foreground">{editorItem.image_path || 'No image uploaded yet'}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <button onClick={() => setEditorOpen(false)} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary">Cancel</button>
            <button onClick={() => { saveEditor(); setEditorOpen(false) }} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">Update Item</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

async function prepareFounderImage(file: File) {
  if (file.type === 'image/svg+xml') return file
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Invalid image type.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const width = Math.min(bitmap.width, 1200)
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

