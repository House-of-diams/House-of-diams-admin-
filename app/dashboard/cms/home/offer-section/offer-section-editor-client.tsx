'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { cmsFetch } from '@/lib/cms-transport'
import type { OfferSection } from '@/lib/offer-section-validation'

const inputClass = 'w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring'
const labelClass = 'mb-2 block text-sm font-semibold text-foreground'
const hintClass = 'mt-2 text-xs text-muted-foreground'

const fill = (template: string, values: { offer?: string; minimum?: string }) =>
  template.replaceAll('{offer}', values.offer ?? '').replaceAll('{minimum}', values.minimum ?? '').replace(/\s{2,}/g, ' ').trim()

export function OfferSectionEditorClient({ initialItem, initialRevision, notice }: { initialItem: OfferSection; initialRevision: string; notice: string | null }) {
  const { toast } = useToast()
  const [form, setForm] = useState<OfferSection>(initialItem)
  const [saved, setSaved] = useState<OfferSection>(initialItem)
  const [saving, setSaving] = useState(false)
  const revision = useRef(initialRevision)
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved])
  useUnsavedChanges(dirty)

  const set = <K extends keyof OfferSection>(key: K, value: OfferSection[K]) => setForm((current) => ({ ...current, [key]: value }))
  const emptyField = !form.label.trim() || !form.heading.trim() || !form.gift_heading.trim() || !form.button_text.trim()

  async function save() {
    setSaving(true)
    try {
      const response = await cmsFetch('/api/cms/home/offer-section', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-expected-revision': revision.current },
        body: JSON.stringify({
          is_enabled: form.is_enabled,
          label: form.label.trim(),
          heading: form.heading.trim(),
          gift_heading: form.gift_heading.trim(),
          description: form.description.trim(),
          button_text: form.button_text.trim(),
        }),
      })
      const payload = await response.json().catch(() => null) as { item?: OfferSection; revision?: string; error?: string } | null
      if (!response.ok || !payload?.item || typeof payload.revision !== 'string') throw new Error(payload?.error ?? 'Unable to save the Offer Section.')
      revision.current = payload.revision
      setForm(payload.item)
      setSaved(payload.item)
      toast({ title: 'Saved', description: 'The offer section was updated. The website shows it within about 2 minutes.' })
    } catch (error) {
      toast({ title: 'Save failed', description: error instanceof Error ? error.message : 'Unable to save the Offer Section.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const previews = [
    { title: 'With a 10% discount coupon', text: fill(form.heading, { offer: '10%', minimum: '$1,000' }) },
    { title: 'With a free-gift coupon', text: fill(form.gift_heading, { minimum: '$1,000' }) },
  ]

  return (
    <div className="p-8">
      <Link href="/dashboard/cms/home" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Back to Home Page</Link>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Offer Section</h1>
          <p className="mt-1 text-sm text-muted-foreground">The banner above the footer that promotes the coupon selected in Promotion.</p>
        </div>
        <button type="button" onClick={save} disabled={saving || !dirty || emptyField || Boolean(notice)} className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-50">
          <Save size={16} />{saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {notice ? <div role="alert" className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</div> : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6 rounded-xl border border-border bg-white p-6">
          <label className="flex items-center gap-3 text-sm font-semibold text-foreground">
            <input type="checkbox" checked={form.is_enabled} onChange={(event) => set('is_enabled', event.target.checked)} />
            Show this section on the website
          </label>
          <div>
            <label className={labelClass} htmlFor="offer-label">Small label</label>
            <input id="offer-label" className={inputClass} maxLength={80} value={form.label} onChange={(event) => set('label', event.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="offer-heading">Heading (discount coupons)</label>
            <input id="offer-heading" className={inputClass} maxLength={160} value={form.heading} onChange={(event) => set('heading', event.target.value)} />
            <p className={hintClass}>Use <code>{'{offer}'}</code> for the discount (for example 10% or $50) and <code>{'{minimum}'}</code> for the minimum order.</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="offer-gift-heading">Heading (free-gift coupon)</label>
            <input id="offer-gift-heading" className={inputClass} maxLength={160} value={form.gift_heading} onChange={(event) => set('gift_heading', event.target.value)} />
            <p className={hintClass}>Used when the selected coupon is a free gift. <code>{'{minimum}'}</code> becomes the minimum order, for example $1,000.</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="offer-description">Description</label>
            <textarea id="offer-description" className={inputClass} rows={3} maxLength={600} value={form.description} onChange={(event) => set('description', event.target.value)} />
            <p className={hintClass}>Leave empty to use the description written on the Promotion popup.</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="offer-button">Button text</label>
            <input id="offer-button" className={inputClass} maxLength={60} value={form.button_text} onChange={(event) => set('button_text', event.target.value)} />
          </div>
        </div>

        <div className="space-y-6">
          {previews.map((preview) => (
            <div key={preview.title} className="rounded-xl border border-border bg-secondary/40 p-6 text-center">
              <p className="mb-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview: {preview.title}</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em]">{form.label || ' '}</p>
              <h2 className="mt-3 text-3xl font-medium">{preview.text || ' '}</h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">{form.description || 'The description from the Promotion popup is shown here.'}</p>
              <span className="mt-4 inline-block bg-foreground px-5 py-3 text-xs font-semibold uppercase tracking-wider text-background">{form.button_text || ' '}</span>
            </div>
          ))}
          {!form.is_enabled ? <p className="text-sm text-muted-foreground">The section is switched off, so visitors will not see it.</p> : null}
        </div>
      </div>
    </div>
  )
}
