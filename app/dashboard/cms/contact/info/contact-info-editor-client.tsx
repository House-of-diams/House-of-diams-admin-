'use client'

import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type ChangeEvent } from 'react'
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
import { uploadCmsAssetDirectWithFallback } from '@/lib/cms-direct-upload-client'
import { useCmsAtomicListSave } from '@/hooks/use-cms-atomic-list-save'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

type ContactInfoItem = {
  clientId: string
  id?: number | string
  sort_order: number
  label: string
  value: string
  note: string
  href: string
  icon_path: string
}

type EditorItem = ContactInfoItem

export type ContactInfoInitialData = {
  revision: string
  items: Array<{
    id: number | string
    sort_order: number
    label: string
    value: string
    note: string
    href: string
    icon_path: string
  }>
}

const empty = (sortOrder: number): EditorItem => ({
  clientId: `draft-${Date.now()}`,
  sort_order: sortOrder,
  label: '',
  value: '',
  note: '',
  href: '',
  icon_path: '',
})

const fingerprint = (items: ContactInfoItem[]) => JSON.stringify([...items]
  .sort((a, b) => a.sort_order - b.sort_order || a.clientId.localeCompare(b.clientId))
  .map(({ id, label, value, note, href, icon_path }) => ({ id, label, value, note, href, icon_path })))

export function ContactInfoEditorClient({ initialData }: { initialData: ContactInfoInitialData }) {
  const router = useRouter()
  const { toast } = useToast()
  const [items, setItems] = useState<ContactInfoItem[]>(
    initialData.items.map((item) => ({ clientId: `id-${item.id}`, ...item }))
  )
  const [status, setStatus] = useState(initialData.items.length ? 'Contact info loaded' : 'No contact cards found yet')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorItem, setEditorItem] = useState<EditorItem>(empty(1))
  const [deleteTarget, setDeleteTarget] = useState<ContactInfoItem | null>(null)
  const [uploading, setUploading] = useState(false)
  const [savedFingerprint, setSavedFingerprint] = useState(() => fingerprint(initialData.items.map((item) => ({ clientId: `id-${item.id}`, ...item }))))
  const { prepareSave, acceptSave } = useCmsAtomicListSave(initialData.items, initialData.revision)

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.sort_order - b.sort_order || a.clientId.localeCompare(b.clientId)),
    [items]
  )
  const nextOrder = Math.max(...items.map((item) => item.sort_order), 0) + 1
  const dirty = useMemo(() => fingerprint(items) !== savedFingerprint, [items, savedFingerprint])
  const unsaved = useUnsavedChanges(dirty || editorOpen)

  const save = async () => {
    setIsSaving(true)
    try {




      const saveItems = sorted.map(({ id, label, value, note, href, icon_path }) => ({
        ...(id ? { id } : {}), label, value, note, href, icon_path,
      }))
      const response = await cmsFetch('/api/cms/contact/info', {
        method: 'POST',
        headers: { 'content-type': 'application/json',  },
        body: JSON.stringify(prepareSave({ items: saveItems }, saveItems)),
      })

      const payload = (await response.json().catch(() => null)) as { items?: ContactInfoInitialData['items']; revision?: string; error?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save contact info.')
      if (!Array.isArray(payload?.items) || !payload.revision) throw new Error('Save response was interrupted. Retry to confirm the same save.')
      const canonical = payload.items.map((item) => ({ clientId: `id-${item.id}`, ...item }))
      setItems(canonical)
      setSavedFingerprint(fingerprint(canonical))
      acceptSave(payload.items, payload.revision)

      setConfirmOpen(false)
      setStatus('Contact info saved')
      toast({ title: 'Contact info saved', description: 'Contact info cards were updated successfully.' })
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save contact info.'
      setStatus(message)
      toast({ title: 'Save failed', description: message, variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const saveEditorItem = () => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.clientId === editorItem.clientId)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = editorItem
        return copy
      }
      return [...prev, editorItem]
    })
    setEditorOpen(false)
    setStatus('Draft updated. Save changes to publish.')
    toast({ title: 'Draft updated', description: 'Use Save Changes to publish the contact info cards.' })
  }

  const uploadIcon = async (file: File) => {



    setUploading(true)
    try {
      const path = await uploadCmsAssetDirectWithFallback({
        file, accessToken: undefined,
        signEndpoint: '/api/cms/uploads/contact/sign',
        fallbackEndpoint: '/api/cms/uploads/contact',
        svgOnly: true,
      })
      setEditorItem((prev) => ({ ...prev, icon_path: path }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to upload contact icon.'
      setStatus(message)
      toast({ title: 'Upload failed', description: message, variant: 'destructive' })
      return
    } finally {
      setUploading(false)
    }
    setStatus('Contact icon uploaded')
    toast({ title: 'Contact icon uploaded', description: 'Icon uploaded successfully.' })
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/dashboard/cms/contact" onClick={(event) => { event.preventDefault(); unsaved.confirmNavigation(() => router.push('/dashboard/cms/contact')) }} className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
          <ArrowLeft size={16} />
          Back to Contact
        </Link>
        <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} disabled={!dirty || editorOpen || uploading} position="inline" />
      </div>

      <div className="mb-10">
        <h1 className="text-3xl font-semibold">Contact Info</h1>
        <p className="text-sm text-muted-foreground">Manage the contact info cards</p>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase">Order</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase">Label</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase">Value</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase">Icon</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.clientId} className="border-b border-border">
                <td className="px-5 py-4 text-sm">{item.sort_order}</td>
                <td className="px-5 py-4 text-sm">{item.label}</td>
                <td className="px-5 py-4 text-sm">{item.value}</td>
                <td className="px-5 py-4 text-sm">{item.icon_path}</td>
                <td className="px-5 py-4 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={() => { setEditorItem(item); setEditorOpen(true) }} className="rounded-md border px-3 py-2 text-sm">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => setDeleteTarget(item)} className="rounded-md border px-3 py-2 text-sm">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-sm text-muted-foreground">No contact cards found yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <button onClick={() => { setEditorItem(empty(nextOrder)); setEditorOpen(true) }} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
        <Plus size={16} />
        Add Card
      </button>

      <ConfirmDialog isOpen={confirmOpen} title="Save contact info?" description="This updates the contact info cards." confirmText="Save" cancelText="Cancel" type="confirm" isLoading={isSaving} onConfirm={save} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog isOpen={Boolean(deleteTarget)} title="Delete contact card?" description="The card will be removed from the draft. Save changes afterward to publish the deletion." confirmText="Delete Card" cancelText="Cancel" type="delete" onConfirm={() => { if (deleteTarget) setItems((prev) => prev.filter((item) => item.clientId !== deleteTarget.clientId)); setDeleteTarget(null); setStatus('Contact card removed from draft. Save changes to publish.') }} onCancel={() => setDeleteTarget(null)} />
      <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved contact info changes?" description="Your contact card changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)} />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact Info</DialogTitle>
            <DialogDescription>Update label, value, note, link, and icon.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <input value={editorItem.label} onChange={(e) => setEditorItem((p) => ({ ...p, label: e.target.value }))} placeholder="Label" className="w-full rounded-lg border px-3 py-2" />
            <input value={editorItem.value} onChange={(e) => setEditorItem((p) => ({ ...p, value: e.target.value }))} placeholder="Value" className="w-full rounded-lg border px-3 py-2" />
            <input value={editorItem.note} onChange={(e) => setEditorItem((p) => ({ ...p, note: e.target.value }))} placeholder="Note" className="w-full rounded-lg border px-3 py-2" />
            <input value={editorItem.href} onChange={(e) => setEditorItem((p) => ({ ...p, href: e.target.value }))} placeholder="Href" className="w-full rounded-lg border px-3 py-2" />
            <div>
              <label className="mb-2 block text-sm font-semibold">Icon</label>
              <div className="flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold">
                  <Plus size={14} />
                  {uploading ? 'Uploading...' : 'Upload SVG'}
                  <input type="file" accept=".svg,image/svg+xml" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) void uploadIcon(file) }} />
                </label>
                <span className="text-xs text-muted-foreground">{editorItem.icon_path || 'No icon uploaded yet'}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setEditorOpen(false)} className="rounded-lg border px-4 py-2.5 text-sm">Cancel</button>
            <button onClick={saveEditorItem} className="rounded-lg bg-primary px-4 py-2.5 text-sm text-white">Update</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
