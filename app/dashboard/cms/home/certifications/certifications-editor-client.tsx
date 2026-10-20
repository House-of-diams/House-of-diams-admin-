'use client'

import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, Edit2, Plus, Trash2 } from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'
import { useEditGuard } from '@/hooks/use-unsaved-changes'
import { uploadCmsAssetDirectWithFallback } from '@/lib/cms-direct-upload-client'

type CertificationItem = {
  clientId: string
  id?: number | string
  sort_order: number
  title: string
  description: string
  badge: string
  icon_path: string
}

type ApiPayload = {
  section?: {
    eyebrow: string
    heading: string
  }
  items?: Array<{
    id?: number | string
    sort_order: number
    title: string
    description: string
    badge: string
    icon_path: string
  }>
  error?: string
}

export type CertificationsInitialData = {
  revision: string
  section: {
    eyebrow: string
    heading: string
  }
  items: Array<{
    id?: number | string
    sort_order: number
    title: string
    description: string
    badge: string
    icon_path: string
  }>
}

const emptyItem = (sortOrder: number): CertificationItem => ({
  clientId: `draft-${Date.now()}-${sortOrder}`,
  sort_order: sortOrder,
  title: '',
  description: '',
  badge: '',
  icon_path: '',
})

export function CertificationsEditorClient({ initialData }: { initialData: CertificationsInitialData }) {
  const { toast } = useToast()
  // HOD-056: warn before leaving with unsaved edits.
  const edits = useEditGuard()
  const [items, setItems] = useState<CertificationItem[]>(
    initialData.items.map((item) => ({
      clientId: `id-${item.id ?? item.sort_order}`,
      ...item,
      title: item.title || item.description || '',
      description: item.description || '',
      badge: item.badge || '',
    }))
  )
  const [loadStatus, setLoadStatus] = useState(initialData.items.length ? 'Why Choose items loaded' : 'No Why Choose rows found yet')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorItem, setEditorItem] = useState<CertificationItem | null>(null)
  const [revision, setRevision] = useState(initialData.revision)
  const [savedItemIds, setSavedItemIds] = useState(() => initialData.items.flatMap((item) => item.id ? [String(item.id)] : []))
  const pendingSave = useRef<{ fingerprint: string; id: string } | null>(null)

  const openEditor = (item?: CertificationItem) => {
    setEditorItem(item ?? emptyItem(items.length + 1))
    setEditorOpen(true)
  }

  const uploadIcon = async (file: File) => {




    try {
      const path = await uploadCmsAssetDirectWithFallback({
        file, accessToken: undefined,
        signEndpoint: '/api/cms/uploads/certifications/sign',
        fallbackEndpoint: '/api/cms/uploads/certifications',
        maxInputBytes: 5 * 1024 * 1024, rasterWidth: 800, webpQuality: 82,
      })
      setEditorItem((prev) => (prev ? { ...prev, icon_path: path } : prev))
    } catch (error) {
      setLoadStatus(error instanceof Error ? error.message : 'Unable to upload icon.')
      return
    }
    setLoadStatus('Icon uploaded')
    toast({ title: 'Uploaded', description: 'Why Choose icon uploaded successfully.' })
  }

  const handleSaveEditor = () => {
    if (!editorItem) return
    setItems((prev) => {
      const exists = prev.some((item) => item.clientId === editorItem.clientId)
      const normalized = {
        ...editorItem,
        description: '',
        badge: '',
      }
      return exists ? prev.map((item) => (item.clientId === editorItem.clientId ? normalized : item)) : [...prev, normalized]
    })
    setEditorOpen(false)
  }

  const handleSave = () => setConfirmOpen(true)

  const confirmSave = async () => {
    setIsSaving(true)
    setConfirmOpen(false)





    const retainedIds = new Set(items.flatMap((item) => item.id ? [String(item.id)] : []))
    const saveBody = {
      expected_revision: revision,
      deleted_ids: savedItemIds.filter((id) => !retainedIds.has(id)),
      section: { eyebrow: 'Our Promise', heading: 'Why Choose House of Diams' },
      items: items.map(({ id, title, icon_path }) => ({ ...(id ? { id } : {}), title, description: '', badge: '', icon_path })),
    }
    const fingerprint = JSON.stringify(saveBody)
    if (pendingSave.current?.fingerprint !== fingerprint) pendingSave.current = { fingerprint, id: crypto.randomUUID() }
    const response = await cmsFetch('/api/cms/home/certifications', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',

      },
      body: JSON.stringify({ ...saveBody, request_id: pendingSave.current.id }),
    })

    const payload = (await response.json().catch(() => null)) as ApiPayload | null
    setIsSaving(false)

    if (!response.ok) {
      setLoadStatus(payload?.error ?? 'Unable to save Why Choose content.')
      return
    }

    if (Array.isArray(payload?.items) && typeof (payload as { revision?: unknown }).revision === 'string') {
      const saved = payload.items.map((item, index) => ({ clientId: `id-${item.id}`, ...item, sort_order: index + 1 }))
      setItems(saved)
      setSavedItemIds(saved.map((item) => String(item.id)))
      setRevision((payload as { revision: string }).revision)
      pendingSave.current = null
    }

    setLoadStatus('Why Choose section saved')
    edits.reset()
    toast({ title: 'Saved', description: 'Why Choose House of Diams updated successfully.' })
  }

  return (
    <div className="p-8" {...edits.bind}>
      <div className="mb-8 flex items-center gap-4">
        <Link href="/dashboard/cms/home" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
          <ArrowLeft size={16} />
          Back to Home
        </Link>
      </div>

      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Why Choose House of Diams</h1>
        <p className="mt-1 text-sm text-muted-foreground">Keep this section simple: each card only needs an icon and one line of text.</p>
        <p className="mt-2 text-xs text-muted-foreground">{loadStatus}</p>
      </div>

      <div className="mb-6 mt-6 flex justify-end">
        <button onClick={() => openEditor()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">
          <Plus size={16} />
          Add Item
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white shadow-xs">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Order</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Text</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Icon</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.clientId} className="border-b border-border last:border-b-0">
                <td className="px-5 py-4 text-sm">{item.sort_order}</td>
                <td className="px-5 py-4 text-sm">{item.title}</td>
                <td className="px-5 py-4 text-sm">{item.icon_path || 'No icon yet'}</td>
                <td className="px-5 py-4 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button onClick={() => openEditor(item)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                      <Edit2 size={14} />
                      Edit
                    </button>
                    <button
                      onClick={() => setItems((prev) => prev.filter((x) => x.clientId !== item.clientId))}
                      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
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

      <CmsSaveAction onClick={handleSave} isSaving={isSaving} />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Save Why Choose section?"
        description="This will update the Why Choose House of Diams section on the homepage."
        confirmText="Save"
        cancelText="Cancel"
        type="confirm"
        isLoading={isSaving}
        onConfirm={confirmSave}
        onCancel={() => setConfirmOpen(false)}
      />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Why Choose Item</DialogTitle>
            <DialogDescription>Only icon and text are needed here.</DialogDescription>
          </DialogHeader>

          {editorItem && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Order</label>
                <input
                  type="number"
                  value={editorItem.sort_order}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setEditorItem((prev) => (prev ? { ...prev, sort_order: Number(e.target.value) } : prev))
                  }
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Text</label>
                <textarea
                  value={editorItem.title}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                    setEditorItem((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                  }
                  rows={3}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Icon</label>
                <div className="flex items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
                    <Plus size={14} />
                    Upload Icon
                    <input
                      type="file"
                      accept="image/*,.svg"
                      className="hidden"
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        const file = e.target.files?.[0]
                        if (file) void uploadIcon(file)
                      }}
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">{editorItem.icon_path || 'No icon uploaded yet'}</span>
                </div>
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
              onClick={handleSaveEditor}
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
