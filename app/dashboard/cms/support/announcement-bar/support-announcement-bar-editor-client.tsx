'use client'

import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ArrowLeft, Edit2, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CmsSaveAction } from '@/components/cms-save-action'
import { useToast } from '@/hooks/use-toast'
import { useCmsAtomicListSave } from '@/hooks/use-cms-atomic-list-save'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

type AnnouncementItem = {
  clientId: string
  id?: number | string
  sort_order: number
  message: string
  link_url: string
  open_in_new_tab: boolean
  is_active: boolean
}

type EditorItem = {
  clientId: string
  sort_order: number
  message: string
  link_url: string
  open_in_new_tab: boolean
  is_active: boolean
}

export type SupportAnnouncementBarInitialData = {
  section: { section_key: string; is_active: boolean; autoplay: boolean; speed_ms: number }
  items: Array<{ id: number | string; sort_order: number; message: string; link_url: string; open_in_new_tab: boolean; is_active: boolean }>
}

const emptyEditorItem = (sort_order: number): EditorItem => ({
  clientId: `draft-${Date.now()}`,
  sort_order,
  message: '',
  link_url: '',
  open_in_new_tab: false,
  is_active: true,
})

const fingerprint = (parent: { is_active: boolean; autoplay: boolean; speed_ms: number }, items: AnnouncementItem[]) => JSON.stringify({
  parent: { is_active: parent.is_active, autoplay: parent.autoplay, speed_ms: parent.speed_ms },
  items: [...items].sort((a, b) => a.sort_order - b.sort_order || a.clientId.localeCompare(b.clientId))
    .map(({ id, sort_order, message, link_url, open_in_new_tab, is_active }) => ({ id, sort_order, message, link_url, open_in_new_tab, is_active })),
})

export function SupportAnnouncementBarEditorClient({ initialData, initialRevision }: { initialData: SupportAnnouncementBarInitialData; initialRevision: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [barActive, setBarActive] = useState(initialData.section.is_active)
  const [autoplay, setAutoplay] = useState(initialData.section.autoplay)
  const speedMs = 3000
  const [items, setItems] = useState<AnnouncementItem[]>(initialData.items.map((item) => ({ clientId: `id-${item.id}`, ...item })))
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loadStatus, setLoadStatus] = useState(initialData.items.length ? 'Announcement bar loaded' : 'No announcement items found yet')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorItem, setEditorItem] = useState<EditorItem>(emptyEditorItem(1))
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementItem | null>(null)
  const [savedFingerprint, setSavedFingerprint] = useState(() => fingerprint(initialData.section, initialData.items.map((item) => ({ clientId: `id-${item.id}`, ...item }))))
  const { prepareSave, acceptSave } = useCmsAtomicListSave(initialData.items, initialRevision)

  const sorted = useMemo(() => [...items].sort((a, b) => a.sort_order - b.sort_order || a.clientId.localeCompare(b.clientId)), [items])
  const dirty = useMemo(() => fingerprint({ is_active: barActive, autoplay, speed_ms: speedMs }, items) !== savedFingerprint, [barActive, autoplay, items, savedFingerprint])
  const unsaved = useUnsavedChanges(dirty || editorOpen)

  const saveEditor = () =>
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

  const saveAll = async () => {
    setIsSaving(true)
    try {



      const res = await cmsFetch('/api/cms/support/announcement-bar', { method: 'POST', headers: { 'content-type': 'application/json',  }, body: JSON.stringify(prepareSave({ parent: { is_active: barActive, autoplay, speed_ms: speedMs }, items: sorted.map(({ id, sort_order, message, link_url, open_in_new_tab, is_active }) => ({ id, sort_order, message, link_url, open_in_new_tab, is_active })) }, sorted)) })
      const payload = (await res.json().catch(() => null)) as { error?: string; parent?: { is_active: boolean; autoplay: boolean; speed_ms: number }; items?: SupportAnnouncementBarInitialData['items']; revision?: string } | null
      if (!res.ok) throw new Error(payload?.error ?? 'Unable to save announcement bar.')
      if (!payload?.parent || !Array.isArray(payload.items) || !payload.revision) throw new Error('Save response was interrupted. Retry to confirm the same save.')
      const canonical = payload.items.map((item) => ({ clientId: `id-${item.id}`, ...item }))
      setBarActive(payload.parent.is_active); setAutoplay(payload.parent.autoplay); setItems(canonical)
      setSavedFingerprint(fingerprint(payload.parent, canonical)); acceptSave(payload.items, payload.revision)
      setConfirmOpen(false); toast({ title: 'Saved', description: 'Announcement bar updated successfully.' }); setLoadStatus('Announcement bar saved')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save announcement bar.'
      setLoadStatus(message); toast({ title: 'Save failed', description: message, variant: 'destructive' })
    } finally { setIsSaving(false) }
  }

  const nextOrder = Math.max(...items.map((item) => item.sort_order), 0) + 1

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Link href="/dashboard/cms/support" onClick={(event) => { event.preventDefault(); unsaved.confirmNavigation(() => router.push('/dashboard/cms/support')) }} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"><ArrowLeft size={16} />Back to Support</Link>
        <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} disabled={!dirty || editorOpen} position="inline" />
      </div>
      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Announcement Bar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage the top scrolling announcement bar</p>
        <p className="mt-2 text-xs text-muted-foreground">{loadStatus}</p>
      </div>
      <div className="mb-6 max-w-4xl space-y-4">
        <label className="flex items-center gap-3 text-sm font-medium text-foreground"><input type="checkbox" checked={barActive} onChange={(e) => setBarActive(e.target.checked)} />Bar active</label>
        <label className="flex items-center gap-3 text-sm font-medium text-foreground"><input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} />Rotate announcements automatically</label>
        <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3"><p className="text-sm font-semibold text-foreground">Rotation interval</p><p className="mt-1 text-xs text-muted-foreground">Each active announcement crossfades to the next every 3 seconds.</p></div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-white shadow-xs">
        <table className="w-full">
          <thead><tr className="border-b border-border bg-secondary/40"><th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Order</th><th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Message</th><th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Link</th><th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Active</th><th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">Actions</th></tr></thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.clientId} className="border-b border-border last:border-b-0">
                <td className="px-5 py-4 text-sm">{item.sort_order}</td>
                <td className="px-5 py-4 text-sm">{item.message}</td>
                <td className="px-5 py-4 text-sm">{item.link_url || '-'}</td>
                <td className="px-5 py-4 text-sm">{item.is_active ? 'Yes' : 'No'}</td>
                <td className="px-5 py-4 text-right"><div className="inline-flex gap-2"><button onClick={() => { setEditorItem(item); setEditorOpen(true) }} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"><Edit2 size={14} />Edit</button><button onClick={() => setDeleteTarget(item)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 size={14} />Delete</button></div></td>
              </tr>
            ))}
            {sorted.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-sm text-muted-foreground">No announcement items found yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <button onClick={() => { setEditorItem(emptyEditorItem(nextOrder)); setEditorOpen(true) }} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"><Plus size={16} />Add Announcement</button>
      <ConfirmDialog isOpen={confirmOpen} title="Save announcement bar?" description="This will update the top announcement bar on the live site." confirmText="Save" cancelText="Cancel" type="confirm" isLoading={isSaving} onConfirm={saveAll} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog isOpen={Boolean(deleteTarget)} title="Delete announcement?" description="The announcement will be removed from the draft. Save changes afterward to publish the deletion." confirmText="Delete Announcement" cancelText="Cancel" type="delete" onConfirm={() => { if (deleteTarget) setItems((prev) => prev.filter((item) => item.clientId !== deleteTarget.clientId)); setDeleteTarget(null); setLoadStatus('Announcement removed locally. Save changes to publish.') }} onCancel={() => setDeleteTarget(null)} />
      <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved announcement changes?" description="Your announcement changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)} />
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Edit Announcement</DialogTitle><DialogDescription>Update message, link, order, and status.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><label className="mb-2 block text-sm font-semibold text-foreground">Message</label><input value={editorItem.message} onChange={(e) => setEditorItem((prev) => ({ ...prev, message: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" /></div>
            <div><label className="mb-2 block text-sm font-semibold text-foreground">Link URL</label><input value={editorItem.link_url} onChange={(e) => setEditorItem((prev) => ({ ...prev, link_url: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" /></div>
            <div><label className="mb-2 block text-sm font-semibold text-foreground">Sort Order</label><input type="number" value={editorItem.sort_order} onChange={(e) => setEditorItem((prev) => ({ ...prev, sort_order: Number(e.target.value) || 1 }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" /></div>
            <label className="flex items-center gap-3 text-sm font-medium text-foreground"><input type="checkbox" checked={editorItem.open_in_new_tab} onChange={(e) => setEditorItem((prev) => ({ ...prev, open_in_new_tab: e.target.checked }))} />Open link in new tab</label>
            <label className="flex items-center gap-3 text-sm font-medium text-foreground"><input type="checkbox" checked={editorItem.is_active} onChange={(e) => setEditorItem((prev) => ({ ...prev, is_active: e.target.checked }))} />Active</label>
          </div>
          <DialogFooter><button onClick={() => setEditorOpen(false)} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary">Cancel</button><button onClick={() => { saveEditor(); setLoadStatus('Draft updated locally. Save changes to publish.'); setEditorOpen(false) }} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">Update Item</button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
