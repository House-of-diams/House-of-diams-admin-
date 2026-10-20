'use client'

import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowLeft, Edit2, Plus } from 'lucide-react'
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

type TestimonialItem = {
  clientId: string
  id?: number | string
  sort_order: number
  quote: string
  author: string
  origin: string
  rating: number
}

type ApiPayload = {
  section?: { section_key: string; eyebrow: string; heading: string }
  items?: Array<{ id: number | string; sort_order: number; quote: string; author: string; origin: string; rating: number }>
  error?: string
}

type EditorItem = {
  clientId: string
  sort_order: number
  quote: string
  author: string
  origin: string
  rating: number
}

export type TestimonialsCardsInitialData = {
  section: { section_key: string; eyebrow: string; heading: string }
  items: Array<{ id: number | string; sort_order: number; quote: string; author: string; origin: string; rating: number }>
}

const emptyEditorItem = (sortOrder: number): EditorItem => ({
  clientId: `draft-${Date.now()}`,
  sort_order: sortOrder,
  quote: '',
  author: '',
  origin: '',
  rating: 5,
})

export function TestimonialsCardsEditorClient({ initialData }: { initialData: TestimonialsCardsInitialData }) {
  const { toast } = useToast()
  // HOD-056: warn before leaving with unsaved edits.
  const edits = useEditGuard()
  const [eyebrow, setEyebrow] = useState(initialData.section.eyebrow)
  const [heading, setHeading] = useState(initialData.section.heading)
  const [items, setItems] = useState<TestimonialItem[]>(
    initialData.items.map((item) => ({ clientId: `id-${item.id}`, ...item }))
  )
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loadStatus, setLoadStatus] = useState(
    initialData.items.length ? 'Testimonial cards loaded' : 'No testimonial cards found yet'
  )
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorItem, setEditorItem] = useState<EditorItem>(emptyEditorItem(1))

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.sort_order - b.sort_order || a.clientId.localeCompare(b.clientId)),
    [items]
  )

  const saveEditor = () =>
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.clientId === editorItem.clientId)
      const next = {
        ...editorItem,
        sort_order: Number.isFinite(editorItem.sort_order) ? editorItem.sort_order : 1,
        rating: Math.max(1, Math.min(5, Number(editorItem.rating) || 5)),
      }
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], ...next }
        return copy
      }
      return [...prev, next]
    })

  const saveAll = async () => {
    setIsSaving(true)



    const res = await cmsFetch('/api/cms/home/testimonials-cards', {
      method: 'POST',
      headers: { 'content-type': 'application/json',  },
      body: JSON.stringify({
        section: { eyebrow, heading },
        items: sorted.map(({ sort_order, quote, author, origin, rating }) => ({
          sort_order,
          quote,
          author,
          origin,
          rating,
        })),
      }),
    })
    const payload = (await res.json().catch(() => null)) as ApiPayload | null
    setIsSaving(false)
    if (!res.ok) return setLoadStatus(payload?.error ?? 'Unable to save testimonial cards.')
    setConfirmOpen(false)
    edits.reset()
    toast({ title: 'Saved', description: 'Testimonial cards updated successfully.' })
    setLoadStatus('Testimonial cards saved')
  }

  const nextOrder = Math.max(...items.map((it) => it.sort_order), 0) + 1

  return (
    <div className="p-8" {...edits.bind}>
      <div className="mb-8 flex items-center justify-between gap-4">
        <Link href="/dashboard/cms/home" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
          <ArrowLeft size={16} />
          Back to Home
        </Link>
        <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} position="inline" />
      </div>

      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Testimonials Cards</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage the testimonial cards after certifications</p>
        <p className="mt-2 text-xs text-muted-foreground">{loadStatus}</p>
      </div>

      <div className="mb-6 max-w-4xl space-y-4">
        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Eyebrow</label>
          <input value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Heading</label>
          <input value={heading} onChange={(e) => setHeading(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white shadow-xs">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Order</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Quote</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Author</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Origin</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Stars</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((it) => (
              <tr key={it.clientId} className="border-b border-border last:border-b-0">
                <td className="px-5 py-4 text-sm">{it.sort_order}</td>
                <td className="px-5 py-4 text-sm">{it.quote}</td>
                <td className="px-5 py-4 text-sm">{it.author}</td>
                <td className="px-5 py-4 text-sm">{it.origin}</td>
                <td className="px-5 py-4 text-sm">{it.rating}</td>
                <td className="px-5 py-4 text-right">
                  <button
                    onClick={() => {
                      setEditorItem(it)
                      setEditorOpen(true)
                    }}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-sm text-muted-foreground">
                  No testimonial cards found yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <button
        onClick={() => {
          setEditorItem(emptyEditorItem(nextOrder))
          setEditorOpen(true)
        }}
        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"
      >
        <Plus size={16} />
        Add Testimonial
      </button>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Save testimonial cards?"
        description="This will update the homepage testimonial cards section."
        confirmText="Save"
        cancelText="Cancel"
        type="confirm"
        isLoading={isSaving}
        onConfirm={saveAll}
        onCancel={() => setConfirmOpen(false)}
      />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Testimonial Card</DialogTitle>
            <DialogDescription>Update quote, author, origin, rating, and order.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Quote</label>
              <textarea value={editorItem.quote} onChange={(e) => setEditorItem((prev) => ({ ...prev, quote: e.target.value }))} rows={4} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Author</label>
              <input value={editorItem.author} onChange={(e) => setEditorItem((prev) => ({ ...prev, author: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Origin</label>
              <input value={editorItem.origin} onChange={(e) => setEditorItem((prev) => ({ ...prev, origin: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Stars</label>
              <input type="number" min={1} max={5} value={editorItem.rating} onChange={(e) => setEditorItem((prev) => ({ ...prev, rating: Math.max(1, Math.min(5, Number(e.target.value) || 5)) }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            </div>
          </div>

          <DialogFooter>
            <button onClick={() => setEditorOpen(false)} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary">
              Cancel
            </button>
            <button
              onClick={() => {
                saveEditor()
                setEditorOpen(false)
              }}
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
