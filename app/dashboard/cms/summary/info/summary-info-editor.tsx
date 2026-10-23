'use client'

import { uploadAwsImage } from '@/lib/image-transport'
import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { CMSTabs } from '@/components/cms-tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useCmsAtomicListSave } from '@/hooks/use-cms-atomic-list-save'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

type Pointer = { id: string; sort_order: number; icon_url: string | null; pointer_text: string; video_url: string | null; video_link_text: string | null }
type Draft = { id?: string; sort_order: number; icon_url: string; pointer_text: string; video_url: string; video_link_text: string }
type InitialData = { heading: string; enabled: boolean; hasSection: boolean; pointers: Pointer[] }
const emptyDraft: Draft = { sort_order: 0, icon_url: '', pointer_text: '', video_url: '', video_link_text: '' }
const input = 'mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary'
const fingerprint = (heading:string,enabled:boolean,pointers:Array<Pointer|Draft>) => JSON.stringify({heading,enabled,pointers:pointers.map(({id,sort_order,icon_url,pointer_text,video_url,video_link_text})=>({id,sort_order,icon_url:icon_url??'',pointer_text,video_url:video_url??'',video_link_text:video_link_text??''}))})

export function SummaryInfoEditor({ initialData, initialRevision = '' }: { initialData?: InitialData; initialRevision?: string }) {
  const router = useRouter()
  const safeInitialData = initialData ?? { heading: 'Additional Summary Details', enabled: false, hasSection: false, pointers: [] }
  const [heading, setHeading] = useState(safeInitialData.heading)
  const [enabled, setEnabled] = useState(safeInitialData.enabled)
  const [hasSection, setHasSection] = useState(safeInitialData.hasSection)
  const [pointers, setPointers] = useState<Pointer[]>(safeInitialData.pointers)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Pointer | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [savedFingerprint, setSavedFingerprint] = useState(() => fingerprint(safeInitialData.heading,safeInitialData.enabled,safeInitialData.pointers))
  const { prepareSave, acceptSave } = useCmsAtomicListSave(safeInitialData.pointers, initialRevision)
  const dirty = useMemo(()=>fingerprint(heading,enabled,pointers)!==savedFingerprint,[heading,enabled,pointers,savedFingerprint])
  const unsaved = useUnsavedChanges(dirty || Boolean(draft))

  const api = async (method: string, body?: unknown) => {
    const response = await cmsFetch('/api/cms/summary', { method, headers: {  ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error ?? 'Unable to save summary.')
    return payload
  }

  const persist = async (nextHeading: string, nextEnabled: boolean, nextPointers: Array<Pointer | Draft>) => {
    const body=prepareSave({parent:{heading:nextHeading,is_enabled:nextEnabled},items:nextPointers.map((pointer)=>({...pointer,icon_url:pointer.icon_url??'',video_url:pointer.video_url??'',video_link_text:pointer.video_link_text??''}))},nextPointers)
    const payload=await api('POST',body)
    if(!payload?.parent||!Array.isArray(payload.items)||!payload.revision)throw new Error('Save response was interrupted. Retry to confirm the same save.')
    setHeading(payload.parent.heading);setEnabled(payload.parent.is_enabled);setPointers(payload.items);setSavedFingerprint(fingerprint(payload.parent.heading,payload.parent.is_enabled,payload.items));setHasSection(true);acceptSave(payload.items,payload.revision)
  }

  const saveHeading = async () => {
    setBusy(true); setMessage('')
    try { await persist(heading, enabled, pointers); setMessage('Summary heading saved.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed.') }
    finally { setBusy(false) }
  }

  const savePointer = async () => {
    if (!draft) return
    setBusy(true); setMessage('')
    try { const next=draft.id?pointers.map((pointer)=>pointer.id===draft.id?{...draft,id:draft.id}:pointer):[...pointers,draft];await persist(heading,enabled,next); setDraft(null); setMessage('Pointer saved.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed.') }
    finally { setBusy(false) }
  }

  const deletePointer = async (id: string) => {
    setBusy(true); setMessage('')
    try { await persist(heading,enabled,pointers.filter((pointer)=>pointer.id!==id)); setDeleteTarget(null); setMessage('Pointer deleted.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Delete failed.') }
    finally { setBusy(false) }
  }

  const uploadIcon = async (file: File) => {

    try {
      const awsPath = await uploadAwsImage(file, '/api/cms/uploads/summary-icon', {},{start:()=>setUploading(true),finish:()=>setUploading(false)})
      if (awsPath) { setDraft(current => current ? {...current,icon_url:awsPath}:current); return }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed.'); return }


    setUploading(true); setMessage('')
  }

  return <div>
    <CMSTabs />
    <div className="max-w-5xl p-8">
      <Link href="/dashboard/cms/summary" onClick={(event)=>{event.preventDefault();unsaved.confirmNavigation(()=>router.push('/dashboard/cms/summary'))}} className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={16} />Back to Summary</Link>
      <h1 className="mt-6 font-jakarta text-3xl font-semibold">Summary Info</h1>
      <p className="mt-1 text-sm text-muted-foreground">Shared content that can be placed on any storefront page.</p>
      {message && <p role="status" className="mt-5 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm">{message}</p>}
      <>
        <section className="mt-8 rounded-xl border border-border bg-white p-6 shadow-xs">
          <h2 className="text-lg font-semibold">Section heading</h2>
          <label className="mt-4 block text-sm font-medium">Heading text<input className={input} value={heading} maxLength={200} onChange={(event) => setHeading(event.target.value)} /></label>
          <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Show this section</label>
          <button type="button" disabled={busy || !heading.trim() || !dirty} onClick={saveHeading} className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save heading'}</button>
        </section>
        <section className="mt-8 overflow-hidden rounded-xl border border-border bg-white shadow-xs">
          <div className="flex items-center justify-between gap-4 border-b border-border p-5"><div><h2 className="text-lg font-semibold">Pointers</h2><p className="text-sm text-muted-foreground">Each pointer can include an icon and an optional video link.</p></div><button type="button" disabled={!hasSection || busy} onClick={() => setDraft({ ...emptyDraft, sort_order: pointers.length + 1 })} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus size={15} />Add pointer</button></div>
          {!hasSection ? <p className="p-5 text-sm text-muted-foreground">Save the heading before adding pointers.</p> : pointers.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No pointers yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary/40 text-left"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Icon</th><th className="px-5 py-3">Pointer text</th><th className="px-5 py-3">Video link</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>{pointers.map((point) => <tr key={point.id} className="border-t border-border"><td className="px-5 py-3">{point.sort_order}</td><td className="px-5 py-3">{point.icon_url ? <Image unoptimized width={32} height={32} src={point.icon_url} alt="" className="h-8 w-8 object-contain" /> : '—'}</td><td className="px-5 py-3">{point.pointer_text}</td><td className="px-5 py-3">{point.video_link_text || (point.video_url ? 'Video URL' : '—')}</td><td className="px-5 py-3 text-right"><button type="button" aria-label={`Edit ${point.pointer_text}`} onClick={() => setDraft({ ...point, icon_url: point.icon_url ?? '', video_url: point.video_url ?? '', video_link_text: point.video_link_text ?? '' })} className="mr-2 rounded border border-border p-2"><Pencil size={15} /></button><button type="button" aria-label={`Delete ${point.pointer_text}`} disabled={busy} onClick={() => setDeleteTarget(point)} className="rounded border border-border p-2 text-red-600"><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>}
        </section>
      </>
    </div>
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open && !busy) setDraft(null) }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{draft?.id ? 'Edit pointer' : 'Add pointer'}</DialogTitle><DialogDescription>Enter the icon, text, and optional video link for this row.</DialogDescription></DialogHeader>{draft && <form onSubmit={(event) => { event.preventDefault(); void savePointer() }} className="space-y-4">
      {message && <p role="alert" className="rounded-lg bg-secondary/40 p-3 text-sm">{message}</p>}
      <label className="block text-sm font-medium">Order<input type="number" min={0} max={10000} required className={input} value={draft.sort_order} onChange={(event) => setDraft({ ...draft, sort_order: Number(event.target.value) })} /></label>
      <div><label className="block text-sm font-medium">Icon URL<input type="url" className={input} placeholder="https://example.com/icon.png" value={draft.icon_url} onChange={(event) => setDraft({ ...draft, icon_url: event.target.value })} /></label><label className="mt-2 inline-block cursor-pointer rounded-lg border border-border px-3 py-2 text-sm">{uploading ? 'Uploading…' : 'Upload icon'}<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/svg+xml,.svg" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadIcon(file); event.target.value = '' }} /></label>{draft.icon_url && <Image unoptimized width={32} height={32} src={draft.icon_url} alt="Icon preview" className="ml-3 inline-block h-8 w-8 object-contain align-middle" />}</div>
      <label className="block text-sm font-medium">Pointer text<input required maxLength={500} className={input} value={draft.pointer_text} onChange={(event) => setDraft({ ...draft, pointer_text: event.target.value })} /></label>
      <label className="block text-sm font-medium">Video URL (optional)<input type="url" className={input} placeholder="https://example.com/video.mp4" value={draft.video_url} onChange={(event) => setDraft({ ...draft, video_url: event.target.value })} /></label>
      <label className="block text-sm font-medium">Video link text (optional)<input maxLength={150} className={input} placeholder="Watch unboxing video" value={draft.video_link_text} onChange={(event) => setDraft({ ...draft, video_link_text: event.target.value })} /></label>
      <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button><button disabled={busy || uploading} type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save pointer'}</button></div>
    </form>}</DialogContent></Dialog>
    <ConfirmDialog isOpen={Boolean(deleteTarget)} title="Delete summary pointer?" description={deleteTarget?`This permanently removes “${deleteTarget.pointer_text}” when confirmed.`:undefined} confirmText="Delete Pointer" cancelText="Cancel" type="delete" isLoading={busy} onConfirm={()=>deleteTarget?deletePointer(deleteTarget.id):undefined} onCancel={()=>setDeleteTarget(null)}/>
    <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved summary changes?" description="Your summary changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={()=>unsaved.setShowWarning(false)}/>
  </div>
}
