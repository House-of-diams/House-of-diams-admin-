'use client'
import { compareCmsIds } from '@/lib/cms-id-safety'


import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
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
import { useCmsAtomicListSave } from '@/hooks/use-cms-atomic-list-save'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

type TimelineItem = {
  clientId: string
  id?: number | string
  sort_order: number
  year: string
  label: string
}

type ApiPayload = {
  items?: Array<{
    id: number | string
    sort_order: number
    year: string
    label: string
  }>
  revision?: string
  error?: string
}

type EditorItem = {
  clientId: string
  sort_order: number
  year: string
  label: string
}

export type TimelineInitialData = {
  revision: string
  items: Array<{
    id: number | string
    sort_order: number
    year: string
    label: string
  }>
}

const empty = (sortOrder: number): EditorItem => ({
  clientId: `draft-${Date.now()}`,
  sort_order: sortOrder,
  year: '',
  label: '',
})

export function TimelineEditorClient({ initialData }: { initialData: TimelineInitialData }) {
  const router = useRouter()
  const [items, setItems] = useState<TimelineItem[]>(
    initialData.items.map((item) => ({ clientId: `id-${item.id}`, ...item }))
  )
  const [status, setStatus] = useState(initialData.items.length ? 'Timeline loaded' : 'No timeline items found yet')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorItem, setEditorItem] = useState<EditorItem>(empty(1))
  const [savedState, setSavedState] = useState(() => JSON.stringify(
    [...initialData.items].sort((a, b) => a.sort_order - b.sort_order || compareCmsIds(a.id, b.id)).map(({ id, year, label }) => ({ id, year, label }))
  ))
  const { prepareSave, acceptSave } = useCmsAtomicListSave(initialData.items, initialData.revision)

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.sort_order - b.sort_order || a.clientId.localeCompare(b.clientId)),
    [items]
  )
  const saveItems = sorted.map(({ id, year, label }) => ({ ...(id ? { id } : {}), year, label }))
  const dirty = JSON.stringify(saveItems) !== savedState
  const unsaved = useUnsavedChanges(dirty || editorOpen)

  const nextOrder = Math.max(...items.map((item) => item.sort_order), 0) + 1

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



      const response = await cmsFetch('/api/cms/about/timeline', {
        method: 'POST',
        headers: { 'content-type': 'application/json',  },
        body: JSON.stringify(prepareSave({ items: saveItems }, saveItems)),
      })
      const payload = (await response.json().catch(() => null)) as ApiPayload | null
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save timeline.')
      if (!Array.isArray(payload?.items) || typeof payload.revision !== 'string') throw new Error('Save response was interrupted. Retry to confirm the same save.')
      setItems(payload.items.map((item) => ({ clientId: `id-${item.id}`, ...item })))
      setSavedState(JSON.stringify(payload.items.map(({ id, year, label }) => ({ id, year, label }))))
      acceptSave(payload.items, payload.revision)
      setConfirmOpen(false)
      setStatus('Timeline saved')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save timeline.')
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
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Timeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">Edit company history milestones</p>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white shadow-xs">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Order</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Year</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Label</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.clientId} className="border-b border-border last:border-b-0">
                <td className="px-5 py-4 text-sm">{item.sort_order}</td>
                <td className="px-5 py-4 text-sm">{item.year}</td>
                <td className="px-5 py-4 text-sm">{item.label}</td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2"><button onClick={() => { setEditorItem(item); setEditorOpen(true) }} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"><Edit2 size={14} />Edit</button><button onClick={() => setItems((current) => current.filter((entry) => entry.clientId !== item.clientId))} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 size={14} />Delete</button></div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-sm text-muted-foreground">No timeline items found yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <button onClick={() => { setEditorItem(empty(nextOrder)); setEditorOpen(true) }} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
        <Plus size={16} />
        Add Milestone
      </button>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Save timeline?"
        description="This will update the about timeline on the live site."
        confirmText="Save"
        cancelText="Cancel"
        type="confirm"
        isLoading={isSaving}
        onConfirm={saveAll}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved Timeline changes?" description="Your timeline changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)} />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Milestone</DialogTitle>
            <DialogDescription>Update the year and milestone label.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Year</label>
              <input value={editorItem.year} onChange={(e) => setEditorItem((prev) => ({ ...prev, year: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Label</label>
              <input value={editorItem.label} onChange={(e) => setEditorItem((prev) => ({ ...prev, label: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
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
