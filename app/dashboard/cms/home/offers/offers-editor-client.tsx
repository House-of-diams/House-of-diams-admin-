'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Save, Trash2, Upload } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cmsFetch } from '@/lib/cms-transport'
import { uploadAwsImage } from '@/lib/image-transport'
import { NEW_OFFER_DEFAULTS, type HomeOffer, type OfferCoupon } from '@/lib/home-offers-validation'

const inputClass = 'w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring'
const labelClass = 'mb-2 block text-sm font-semibold text-foreground'
const hintClass = 'mt-2 text-xs text-muted-foreground'

type Draft = Omit<HomeOffer, 'id' | 'revision'> & { id?: string; revision?: string }
type ImageField = 'home_image_path' | 'promo_image_left_path' | 'promo_image_right_path'

const IMAGE_FIELDS: { path: ImageField; alt: 'home_image_alt' | 'promo_image_left_alt' | 'promo_image_right_alt'; title: string; hint: string }[] = [
  { path: 'home_image_path', alt: 'home_image_alt', title: 'Home page image', hint: 'The only image shown on the home page. Put any wording inside the picture itself.' },
  { path: 'promo_image_left_path', alt: 'promo_image_left_alt', title: 'Offers page: left image', hint: 'Shown on the left of the Promo Codes & Offers banner.' },
  { path: 'promo_image_right_path', alt: 'promo_image_right_alt', title: 'Offers page: right image', hint: 'Shown on the right of the Promo Codes & Offers banner.' },
]

function describeCoupon(coupon: OfferCoupon) {
  const kind = coupon.has_gift ? 'free gift' : 'coupon code'
  return `${coupon.code} (${kind}${coupon.is_active ? '' : ', inactive'})`
}

function OfferCard({ initial, coupons, disabled, onSaved, onDeleted, onDiscard }: {
  initial: Draft; coupons: OfferCoupon[]; disabled: boolean
  onSaved: (offer: HomeOffer) => void; onDeleted: (id: string) => void; onDiscard: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<Draft>(initial)
  const [saved, setSaved] = useState<Draft>(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setForm((current) => ({ ...current, [key]: value }))
  const imagesReady = Boolean(form.home_image_path && form.promo_image_left_path && form.promo_image_right_path)
  const linked = coupons.find((coupon) => coupon.id === form.coupon_id)

  async function upload(file: File, field: ImageField) {
    setBusy(field)
    try { set(field, await uploadAwsImage(file, '/api/cms/uploads/offers')) }
    catch (error) { toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Upload failed.', variant: 'destructive' }) }
    finally { setBusy(null) }
  }

  async function save() {
    setBusy('save')
    try {
      const { revision, ...body } = form
      const response = await cmsFetch('/api/cms/home/offers', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(form.id && revision ? { 'x-expected-revision': revision } : {}) },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null) as { item?: HomeOffer; error?: string } | null
      if (!response.ok || !payload?.item) throw new Error(payload?.error ?? 'Unable to save the offer.')
      const next: Draft = payload.item
      setForm(next); setSaved(next); onSaved(payload.item)
      toast({ title: 'Saved', description: payload.item.is_active ? 'This is now the active offer. The website shows it within about 2 minutes.' : 'The offer was saved.' })
    } catch (error) {
      toast({ title: 'Save failed', description: error instanceof Error ? error.message : 'Unable to save the offer.', variant: 'destructive' })
    } finally { setBusy(null) }
  }

  async function remove() {
    if (!form.id) { onDiscard(); return }
    if (!window.confirm(`Delete the offer "${form.name}"? This cannot be undone.`)) return
    setBusy('delete')
    try {
      const response = await cmsFetch(`/api/cms/home/offers/${form.id}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to delete the offer.')
      onDeleted(form.id)
      toast({ title: 'Deleted', description: 'The offer was deleted.' })
    } catch (error) {
      toast({ title: 'Delete failed', description: error instanceof Error ? error.message : 'Unable to delete the offer.', variant: 'destructive' })
      setBusy(null)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-white p-6" aria-label={form.name || 'New offer'}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-jakarta text-xl font-semibold text-foreground">{form.name || 'New offer'}</h2>
          {saved.is_active ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Active on the website</span> : <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">Not shown</span>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={remove} disabled={disabled || busy !== null} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-50"><Trash2 size={16} />{form.id ? 'Delete' : 'Discard'}</button>
          <button type="button" onClick={save} disabled={disabled || busy !== null || !dirty || !form.name.trim() || !form.button_label.trim()} className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2 text-sm font-semibold text-white hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"><Save size={16} />{busy === 'save' ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`name-${form.id ?? 'new'}`}>Offer name (only you see this)</label>
          <input id={`name-${form.id ?? 'new'}`} value={form.name} maxLength={120} onChange={(event) => set('name', event.target.value)} className={inputClass} placeholder="Diwali gift with purchase" />
        </div>
        <div>
          <label className={labelClass} htmlFor={`button-${form.id ?? 'new'}`}>Home page button text</label>
          <input id={`button-${form.id ?? 'new'}`} value={form.button_label} maxLength={40} onChange={(event) => set('button_label', event.target.value)} className={inputClass} />
          <p className={hintClass}>The button under the home page image. It opens the Promo Codes &amp; Offers page.</p>
        </div>
        <div className="lg:col-span-2">
          <label className={labelClass} htmlFor={`coupon-${form.id ?? 'new'}`}>Coupon for this offer</label>
          <select id={`coupon-${form.id ?? 'new'}`} value={form.coupon_id ?? ''} onChange={(event) => set('coupon_id', event.target.value || null)} className={inputClass}>
            <option value="">No coupon (banner only)</option>
            {coupons.map((coupon) => <option key={coupon.id} value={coupon.id}>{describeCoupon(coupon)}</option>)}
          </select>
          <p className={hintClass}>
            {linked?.has_gift ? 'This coupon gives a free gift, so the Offers page shows a link to the gift.' : linked ? 'Visitors reveal and copy this coupon code on the Offers page.' : 'Choose a coupon to show a gift link or a code under the banner. The offer is hidden when its coupon is inactive or expired.'}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {IMAGE_FIELDS.map((field) => (
          <div key={field.path} className="rounded-lg border border-border p-4">
            <p className="text-sm font-semibold text-foreground">{field.title}</p>
            <div className="mt-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-secondary/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {form[field.path] ? <img src={form[field.path]} alt="" className="h-full w-full object-contain" /> : <span className="text-xs text-muted-foreground">No image yet</span>}
            </div>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
              <Upload size={16} />{busy === field.path ? 'Uploading…' : form[field.path] ? 'Replace image' : 'Upload image'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={disabled || busy !== null}
                onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file, field.path) }} />
            </label>
            <input value={form[field.alt]} maxLength={200} onChange={(event) => set(field.alt, event.target.value)} className={`${inputClass} mt-3`} placeholder="Describe the picture (alt text)" aria-label={`${field.title} alt text`} />
            <p className={hintClass}>{field.hint}</p>
          </div>
        ))}
      </div>

      <label className="mt-6 flex items-center gap-3 text-sm font-semibold text-foreground">
        <input type="checkbox" checked={form.is_active} disabled={disabled || (!imagesReady && !form.is_active)} onChange={(event) => set('is_active', event.target.checked)} className="size-4" />
        Make this the active offer
      </label>
      <p className={hintClass}>{imagesReady ? 'Only one offer is active at a time. Saving this one active switches the current one off.' : 'Upload all three images to be able to make this offer active.'}</p>
    </section>
  )
}

export function OffersEditorClient({ initialItems, coupons, notice }: { initialItems: HomeOffer[]; coupons: OfferCoupon[]; notice: string | null }) {
  const [items, setItems] = useState<HomeOffer[]>(initialItems)
  const [creating, setCreating] = useState(false)

  // Saving an offer active switches the others off on the server; mirror that here so the badges stay correct.
  const handleSaved = (offer: HomeOffer) => {
    setCreating(false)
    setItems((current) => {
      const others = current.filter((item) => item.id !== offer.id).map((item) => (offer.is_active ? { ...item, is_active: false } : item))
      return [offer, ...others]
    })
  }

  return (
    <div className="p-8">
      <Link href="/dashboard/cms/home" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Back to Home Page</Link>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Offers</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">The active offer shows as one image with a button on the home page. The button opens the Promo Codes &amp; Offers page with the two banner images and the gift link or coupon code.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} disabled={creating || Boolean(notice)} className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-white hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} />New offer</button>
      </div>

      {notice ? <div role="alert" className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</div> : null}

      <div className="space-y-6">
        {creating ? (
          <OfferCard key="new" initial={{ ...NEW_OFFER_DEFAULTS }} coupons={coupons} disabled={Boolean(notice)} onSaved={handleSaved} onDeleted={() => setCreating(false)} onDiscard={() => setCreating(false)} />
        ) : null}
        {items.map((offer) => (
          <OfferCard key={`${offer.id}-${offer.revision}`} initial={offer} coupons={coupons} disabled={Boolean(notice)} onSaved={handleSaved}
            onDeleted={(id) => setItems((current) => current.filter((item) => item.id !== id))} onDiscard={() => undefined} />
        ))}
        {!items.length && !creating && !notice ? <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No offers yet. Create one to show it on the home page.</p> : null}
      </div>
    </div>
  )
}
