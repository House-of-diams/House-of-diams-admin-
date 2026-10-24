'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CMSTabs } from '@/components/cms-tabs'
import { CmsSaveAction } from '@/components/cms-save-action'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SeoFields } from '@/components/seo-fields'
import { useToast } from '@/hooks/use-toast'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { cmsFetch } from '@/lib/cms-transport'

type Hub = {
  id: number | null
  slug: string
  name: string
  intro_html: string
  pillar_post_id: number | null
  seo_title: string
  seo_description: string
  seo_h1: string
  seo_indexable: boolean
  is_published: boolean
  sort_order: number
}
type PostChoice = { id: number; title: string; slug: string; hub_id: number | null }
type Snapshot = { hubs: Array<Hub & { id: number }>; posts: PostChoice[]; revision: string }

const emptyHub = (sortOrder: number): Hub => ({
  id: null, slug: '', name: '', intro_html: '', pillar_post_id: null, seo_title: '', seo_description: '', seo_h1: '', seo_indexable: true, is_published: false, sort_order: sortOrder,
})
const slugify = (value: string) => value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
const inputClass = 'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm'

export function EducationHubsEditorClient() {
  const { toast } = useToast()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [editing, setEditing] = useState<Hub | null>(null)
  const [saved, setSaved] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [status, setStatus] = useState('Loading hubs...')

  const dirty = editing !== null && JSON.stringify(editing) !== saved
  const unsaved = useUnsavedChanges(dirty)

  const load = async () => {
    const response = await cmsFetch('/api/cms/education/hubs')
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload) throw new Error(payload?.error ?? 'Unable to load hubs.')
    setSnapshot(payload as Snapshot)
    setStatus('A hub is a topic page such as "Diamond 4Cs". File articles under it from each article’s editor.')
  }

  useEffect(() => {
    let active = true
    load()
      .catch((error) => { if (active) setStatus(error instanceof Error ? error.message : 'Unable to load hubs.') })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
    // Load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const open = (hub: Hub) => { setEditing(hub); setSaved(JSON.stringify(hub)) }
  const filed = useMemo(() => (editing?.id && snapshot ? snapshot.posts.filter((post) => post.hub_id === editing.id) : []), [editing, snapshot])

  const set = (patch: Partial<Hub>) => setEditing((current) => (current ? { ...current, ...patch } : current))

  const save = async () => {
    if (!editing || !snapshot) return
    setIsSaving(true)
    try {
      const response = await cmsFetch('/api/cms/education/hubs', { method: 'POST', body: JSON.stringify({ expected_revision: snapshot.revision, hub: editing }) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save the hub.')
      unsaved.release()
      setSnapshot(payload as Snapshot)
      setEditing(null)
      setConfirmOpen(false)
      toast({ title: 'Hub saved', description: 'The website shows the change within a few minutes.' })
    } catch (error) {
      setConfirmOpen(false)
      toast({ title: 'Save failed', description: error instanceof Error ? error.message : 'Unable to save the hub.' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <CMSTabs />
      <div className="p-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <Link href="/dashboard/cms/education" className="text-sm text-muted-foreground underline-offset-2 hover:underline">&larr; Education articles</Link>
            <h1 className="mt-2 font-jakarta text-3xl font-semibold text-foreground">Education hubs</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{status}</p>
          </div>
          {editing ? (
            <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} disabled={!dirty || isLoading} position="inline" />
          ) : (
            <button type="button" onClick={() => open(emptyHub((snapshot?.hubs.length ?? 0) + 1))} disabled={isLoading} className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">New hub</button>
          )}
        </div>

        {!editing && snapshot ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">Hub</th><th className="px-4 py-3">Address</th><th className="px-4 py-3">Articles</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody>
                {snapshot.hubs.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-muted-foreground">No hubs yet.</td></tr> : null}
                {snapshot.hubs.map((hub) => (
                  <tr key={hub.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{hub.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">/education/{hub.slug}</td>
                    <td className="px-4 py-3">{snapshot.posts.filter((post) => post.hub_id === hub.id).length}</td>
                    <td className="px-4 py-3">{hub.is_published ? 'Published' : 'Draft'}</td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => open(hub)} className="text-sm font-semibold text-primary">Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {editing ? (
          <div className="max-w-3xl space-y-6 rounded-xl border border-border bg-white p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold" htmlFor="hub-name">Name</label>
                <input id="hub-name" maxLength={120} value={editing.name} onChange={(event) => set({ name: event.target.value, ...(editing.id === null && (editing.slug === '' || editing.slug === slugify(editing.name)) ? { slug: slugify(event.target.value) } : {}) })} className={inputClass} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold" htmlFor="hub-slug">Address</label>
                <input id="hub-slug" maxLength={80} value={editing.slug} disabled={editing.id !== null} onChange={(event) => set({ slug: event.target.value })} className={`${inputClass} disabled:bg-muted`} />
                <p className="mt-1 text-xs text-muted-foreground">{editing.id === null ? 'Lowercase words with hyphens. It cannot be changed later.' : 'Fixed after creation, so links never break.'}</p>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="hub-intro">Introduction</label>
              <textarea id="hub-intro" rows={6} maxLength={20000} value={editing.intro_html} onChange={(event) => set({ intro_html: event.target.value })} placeholder="<p>What this topic covers and where to start.</p>" className={`${inputClass} font-mono`} />
              <p className="mt-1 text-xs text-muted-foreground">Simple HTML only (p, h2, h3, ul, li, a, strong). Anything unsafe is removed on save.</p>
            </div>
            {editing.id !== null ? (
              <div>
                <label className="mb-2 block text-sm font-semibold" htmlFor="hub-pillar">Pillar article (shown first)</label>
                <select id="hub-pillar" value={editing.pillar_post_id ?? ''} onChange={(event) => set({ pillar_post_id: event.target.value ? Number(event.target.value) : null })} className={inputClass}>
                  <option value="">None</option>
                  {filed.map((post) => <option key={post.id} value={post.id}>{post.title}</option>)}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">{filed.length === 0 ? 'No article is filed under this hub yet. Choose a hub inside an article’s editor first.' : `${filed.length} article${filed.length === 1 ? '' : 's'} filed here.`}</p>
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold" htmlFor="hub-order">Order</label>
                <input id="hub-order" type="number" min={0} value={editing.sort_order} onChange={(event) => set({ sort_order: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} className={inputClass} />
              </div>
              <label className="flex items-start gap-3 text-sm md:mt-8">
                <input type="checkbox" checked={editing.is_published} onChange={(event) => set({ is_published: event.target.checked })} className="mt-0.5 h-4 w-4" />
                <span><span className="font-semibold">Show on website</span><span className="block text-xs text-muted-foreground">Articles move under this hub’s address only while it is published.</span></span>
              </label>
            </div>
            <fieldset className="space-y-4 rounded-xl border border-border p-4">
              <legend className="px-1 text-sm font-semibold">Search results (SEO)</legend>
              <SeoFields
                idPrefix="hub"
                title={editing.seo_title}
                description={editing.seo_description}
                onTitleChange={(seo_title) => set({ seo_title })}
                onDescriptionChange={(seo_description) => set({ seo_description })}
                indexable={editing.seo_indexable}
                onIndexableChange={(seo_indexable) => set({ seo_indexable })}
                fallbackTitle={editing.name}
                fallbackDescription="The start of the introduction is used."
                path={`/education/${editing.slug}`}
              />
              <div>
                <label className="mb-2 block text-sm font-semibold" htmlFor="hub-h1">Page heading (H1)</label>
                <input id="hub-h1" maxLength={160} value={editing.seo_h1} onChange={(event) => set({ seo_h1: event.target.value })} placeholder={editing.name} className={inputClass} />
              </div>
            </fieldset>
            <button type="button" onClick={() => setEditing(null)} className="text-sm text-muted-foreground underline-offset-2 hover:underline">Cancel</button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog isOpen={confirmOpen} title={editing?.id === null ? 'Create hub?' : 'Save hub?'} description="This changes the hub page on the website." confirmText="Save" onConfirm={() => void save()} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved hub changes?" description="Your changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)} />
    </div>
  )
}
