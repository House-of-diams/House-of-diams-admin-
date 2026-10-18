'use client'

import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Plus, Trash2, X } from 'lucide-react'
import { CmsSaveAction } from '@/components/cms-save-action'
import { useToast } from '@/hooks/use-toast'
import { canonicalizeInstagramUrl } from '@/lib/instagram-url'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

type Reel = {
  clientId: string
  id?: string
  instagram_url: string
  title: string
  display_order: number
  is_enabled: boolean
}

type ReelDraft = {
  instagram_url: string
  title: string
  is_enabled: boolean
}

export type ReelsInitialData = {
  revision: string | null
  heading: string
  subtitle: string
  is_enabled: boolean
  marquee_duration_seconds: number
  pause_on_hover: boolean
  items: Array<Omit<Reel, 'clientId'>>
}

const emptyDraft: ReelDraft = {
  instagram_url: '',
  title: '',
  is_enabled: true,
}

function normalizeInitialItem(item: Omit<Reel, 'clientId'>): Reel {
  return {
    ...item,
    clientId: item.id ?? crypto.randomUUID(),
  }
}

function saveState(data: Omit<ReelsInitialData, 'revision'>) {
  return {
    heading: data.heading.trim(), subtitle: data.subtitle.trim(),
    is_enabled: data.is_enabled, marquee_duration_seconds: data.marquee_duration_seconds,
    pause_on_hover: data.pause_on_hover,
    items: data.items.map(({ id, instagram_url, title, is_enabled }) => ({
      ...(id ? { id } : {}), instagram_url: canonicalizeInstagramUrl(instagram_url) ?? instagram_url,
      title: title.trim(), is_enabled,
    })),
  }
}

export function ReelsEditorClient({ initialData }: { initialData: ReelsInitialData }) {
  const { toast } = useToast()
  const router = useRouter()
  const [heading, setHeading] = useState(initialData.heading)
  const [subtitle, setSubtitle] = useState(initialData.subtitle)
  const [enabled, setEnabled] = useState(initialData.is_enabled)
  const [duration, setDuration] = useState(initialData.marquee_duration_seconds)
  const [pauseOnHover, setPauseOnHover] = useState(initialData.pause_on_hover)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [items, setItems] = useState<Reel[]>(initialData.items.map(normalizeInitialItem))
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState<ReelDraft>(emptyDraft)
  const [draftError, setDraftError] = useState('')
  const ordered = useMemo(() => items.map((item, index) => ({ ...item, display_order: index })), [items])
  const [revision, setRevision] = useState(initialData.revision)
  const [savedState, setSavedState] = useState(() => saveState(initialData))
  const [conflict, setConflict] = useState(false)
  const inFlight = useRef(false)
  const pendingRequest = useRef<{ fingerprint: string; id: string } | null>(null)
  const currentState = saveState({ heading, subtitle, is_enabled: enabled, marquee_duration_seconds: duration, pause_on_hover: pauseOnHover, items: ordered })
  const dirty = JSON.stringify(currentState) !== JSON.stringify(savedState)
  const unsaved = useUnsavedChanges(dirty)

  const update = (clientId: string, patch: Partial<Reel>) => {
    setItems((current) => current.map((item) => item.clientId === clientId ? { ...item, ...patch } : item))
  }

  const move = (index: number, delta: number) => {
    setItems((current) => {
      const next = [...current]
      const target = index + delta
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const openAddDialog = () => {
    setDraft(emptyDraft)
    setDraftError('')
    setAddOpen(true)
  }

  const closeAddDialog = () => {
    if (saving) return
    setAddOpen(false)
    setDraftError('')
  }

  const addDraftToList = () => {
    const instagramUrl = canonicalizeInstagramUrl(draft.instagram_url)
    if (!instagramUrl) { setDraftError('Add a valid public Instagram Reel or post URL.'); return }
    if (ordered.some((item) => canonicalizeInstagramUrl(item.instagram_url) === instagramUrl)) { setDraftError('This Instagram URL is already in the marquee.'); return }
    if (draft.title.trim().length > 100) { setDraftError('Display title must be 100 characters or less.'); return }

    setItems((current) => [...current, {
      clientId: crypto.randomUUID(),
      instagram_url: instagramUrl,
      title: draft.title.trim(),
      display_order: current.length,
      is_enabled: draft.is_enabled,
    }])
    setAddOpen(false)
    setDraft(emptyDraft)
    setDraftError('')
  }

  const save = async () => {
    if (inFlight.current || !dirty || !revision || conflict) return
    setError('')
    const canonical = ordered.map((item) => canonicalizeInstagramUrl(item.instagram_url))
    if (!heading.trim()) { setError('Add a section heading before saving.'); return }
    if (canonical.some((url) => !url) || new Set(canonical).size !== canonical.length) { setError('Use unique public Instagram Reel or post URLs.'); return }

    const retainedIds = new Set(currentState.items.map((item) => item.id).filter(Boolean))
    const deletedIds = savedState.items.flatMap((item) => item.id && !retainedIds.has(item.id) ? [item.id] : [])
    const body = { ...currentState, expected_revision: revision, deleted_ids: deletedIds }
    const fingerprint = JSON.stringify(body)
    if (pendingRequest.current?.fingerprint !== fingerprint) {
      pendingRequest.current = { fingerprint, id: crypto.randomUUID() }
    }
    inFlight.current = true
    setSaving(true)
    try {


      const response = await cmsFetch('/api/cms/home/reels', {
        method: 'POST',
        headers: { 'content-type': 'application/json',  },
        body: JSON.stringify({ ...body, request_id: pendingRequest.current.id }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        if (response.status === 409) setConflict(true)
        throw new Error(payload?.error ?? 'Unable to save Instagram Reels.')
      }
      if (!Array.isArray(payload?.items) || typeof payload.revision !== 'string') throw new Error('Save response was interrupted. Retry to confirm the same save.')
      const next = saveState({ ...currentState, items: payload.items })
      setItems(payload.items.map((item: Omit<Reel, 'clientId'>) => normalizeInitialItem(item)))
      setHeading(next.heading)
      setSubtitle(next.subtitle)
      setSavedState(next)
      setRevision(payload.revision)
      pendingRequest.current = null
      toast({ title: 'Saved', description: 'Instagram Reels section updated.' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Connection interrupted. Retry to confirm your save.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return <main className="p-8">
    <div className="mb-8 flex items-center justify-between gap-4"><Link href="/dashboard/cms/home" onClick={(event) => { event.preventDefault(); unsaved.confirmNavigation(() => router.push('/dashboard/cms/home')) }} className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={16}/>Back to Home</Link><CmsSaveAction onClick={save} isSaving={saving} disabled={!dirty || !revision || conflict} position="inline"/></div>
    <header className="mb-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">Homepage / Social</p><h1 className="mt-2 font-jakarta text-3xl font-semibold">Instagram Reels</h1><p className="mt-1 text-sm text-muted-foreground">Curate up to 30 public Instagram posts for the homepage marquee. Each card displays the reel frame directly from Instagram.</p></header>
    {error ? <div role="alert" className="mb-6 max-w-6xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
    {!revision ? <p role="status" className="mb-6 text-sm text-amber-800">Reels are available to view. Saving will be enabled after the database update is installed and this page is reloaded.</p> : null}
    {conflict ? <p className="mb-6 text-sm text-amber-800">Keep a copy of your changes, then reload this page to see the latest saved reels.</p> : null}
    <fieldset disabled={saving || !revision || conflict} className="min-w-0">
    <section className="mb-8 grid max-w-6xl gap-5 rounded-lg border bg-white p-6 shadow-xs md:grid-cols-2">
      <label className="text-sm font-semibold">Heading<input maxLength={120} value={heading} onChange={(e)=>setHeading(e.target.value)} className="mt-2 w-full rounded-md border px-3 py-2 font-normal"/></label>
      <label className="text-sm font-semibold">Subtitle<input maxLength={240} value={subtitle} onChange={(e)=>setSubtitle(e.target.value)} className="mt-2 w-full rounded-md border px-3 py-2 font-normal"/></label>
      <label className="text-sm font-semibold">Marquee duration (seconds)<input type="number" min={10} max={180} value={duration} onChange={(e)=>setDuration(Number(e.target.value))} className="mt-2 w-full rounded-md border px-3 py-2 font-normal"/></label>
      <div className="flex items-end gap-6 pb-2"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={enabled} onChange={(e)=>setEnabled(e.target.checked)}/>Section enabled</label><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={pauseOnHover} onChange={(e)=>setPauseOnHover(e.target.checked)}/>Pause on hover</label></div>
    </section>
    <section className="max-w-6xl overflow-hidden rounded-lg border bg-white shadow-xs">
      <div className="flex items-center justify-between border-b bg-secondary/40 px-5 py-4"><div><h2 className="font-semibold">Marquee entries</h2><p className="text-xs text-muted-foreground">Enabled rows appear on the homepage in this order.</p></div><button type="button" disabled={items.length >= 30} onClick={openAddDialog} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus size={15}/>Add Reel</button></div>
      {ordered.length === 0 ? <p className="px-5 py-12 text-center text-sm text-muted-foreground">No reels yet. Add a public Instagram URL to begin.</p> : <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
          <thead className="border-b bg-secondary/20 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th scope="col" className="w-36 px-5 py-3">Order</th>
              <th scope="col" className="w-[38%] px-4 py-3">Instagram URL</th>
              <th scope="col" className="w-[28%] px-4 py-3">Display title</th>
              <th scope="col" className="w-28 px-4 py-3">Status</th>
              <th scope="col" className="w-52 px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ordered.map((item,index)=><tr key={item.clientId} className="align-middle transition-colors hover:bg-secondary/10">
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-center text-sm font-semibold tabular-nums text-foreground">{index + 1}</span>
                  <div className="flex gap-1">
                    <button type="button" aria-label={`Move reel ${index + 1} up`} disabled={!index} onClick={()=>move(index,-1)} className="rounded-md border border-border bg-white p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"><ArrowUp size={15}/></button>
                    <button type="button" aria-label={`Move reel ${index + 1} down`} disabled={index===ordered.length-1} onClick={()=>move(index,1)} className="rounded-md border border-border bg-white p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"><ArrowDown size={15}/></button>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4"><label className="sr-only" htmlFor={`reel-url-${item.clientId}`}>Instagram URL for reel {index + 1}</label><input id={`reel-url-${item.clientId}`} value={item.instagram_url} onChange={(e)=>update(item.clientId,{instagram_url:e.target.value})} onBlur={()=>{const url=canonicalizeInstagramUrl(item.instagram_url);if(url)update(item.clientId,{instagram_url:url})}} placeholder="https://www.instagram.com/reel/SHORTCODE/" className="w-full rounded-md border px-3 py-2 text-sm font-normal"/></td>
              <td className="px-4 py-4"><label className="sr-only" htmlFor={`reel-title-${item.clientId}`}>Display title for reel {index + 1}</label><input id={`reel-title-${item.clientId}`} maxLength={100} value={item.title} onChange={(e)=>update(item.clientId,{title:e.target.value})} className="w-full rounded-md border px-3 py-2 text-sm font-normal"/></td>
              <td className="px-4 py-4"><label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={item.is_enabled} onChange={(e)=>update(item.clientId,{is_enabled:e.target.checked})}/>Enabled</label></td>
              <td className="px-5 py-4">
                <div className="flex items-center justify-end gap-2">
                  {canonicalizeInstagramUrl(item.instagram_url)?<a href={canonicalizeInstagramUrl(item.instagram_url)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"><ExternalLink size={15}/>Open Instagram</a>:null}
                  <button type="button" aria-label={`Delete reel ${index + 1}`} onClick={()=>setItems((v)=>v.filter((x)=>x.clientId!==item.clientId))} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"><Trash2 size={15}/>Delete</button>
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>

    {addOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="add-reel-title">
      <div className="w-full max-w-2xl rounded-lg border bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b px-6 py-5"><div><h2 id="add-reel-title" className="text-xl font-semibold">Add Instagram Reel</h2><p className="mt-1 text-sm text-muted-foreground">Paste a public Instagram URL.</p></div><button type="button" onClick={closeAddDialog} className="rounded border p-2 text-muted-foreground hover:text-foreground" aria-label="Close add reel dialog"><X size={16}/></button></div>
        <div className="space-y-5 px-6 py-5">
          {draftError ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{draftError}</div> : null}
          <label className="block text-sm font-semibold">Instagram URL<input autoFocus value={draft.instagram_url} onChange={(e)=>setDraft((current)=>({...current, instagram_url:e.target.value}))} onBlur={()=>{const url=canonicalizeInstagramUrl(draft.instagram_url);if(url)setDraft((current)=>({...current, instagram_url:url}))}} placeholder="https://www.instagram.com/reel/SHORTCODE/" className="mt-2 w-full rounded-md border px-3 py-2 font-normal"/></label>
          <label className="block text-sm font-semibold">Display title<input maxLength={100} value={draft.title} onChange={(e)=>setDraft((current)=>({...current, title:e.target.value}))} placeholder="Optional title shown on the cover" className="mt-2 w-full rounded-md border px-3 py-2 font-normal"/></label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.is_enabled} onChange={(e)=>setDraft((current)=>({...current, is_enabled:e.target.checked}))}/>Enabled on homepage</label>
        </div>
        <div className="flex justify-end gap-3 border-t px-6 py-4"><button type="button" onClick={closeAddDialog} className="rounded-md border px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" onClick={addDraftToList} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Add Reel</button></div>
      </div>
    </div> : null}
    </fieldset>
    <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved Instagram Reels changes?" description="Your changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)}/>
  </main>
}
