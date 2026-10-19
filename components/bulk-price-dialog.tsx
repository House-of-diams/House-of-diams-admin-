'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, SlidersHorizontal } from 'lucide-react'
import { productFetch } from '@/lib/product-transport'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Operation = 'increase_amount' | 'decrease_amount' | 'increase_percent' | 'decrease_percent'
type SelectedProduct = { id: string; name: string; price: number | null }
type Metal = { id: string; name: string; label: string }
type PreviewVariant = { variant_id: string; product_id: string; product_name: string; metal_id: string; metal_label: string; price: number; is_default: boolean }
export type BulkPriceAppliedItem = { variantId: string; productId: string; metalId: string; price: number; isDefault: boolean }
type BulkPriceDialogProps = {
  open: boolean
  products: SelectedProduct[]
  allProducts: SelectedProduct[]
  lane: 'standard' | 'hiphop' | 'collection'
  onClose: () => void
  onApplied: (items: BulkPriceAppliedItem[], skippedProductIds: string[]) => void
}

// Matches admin_product_bulk_price_v2: new prices are rounded to whole units.
function calculatePrice(price: number, operation: Operation, value: number) {
  const delta = operation.endsWith('_percent') ? price * (value / 100) : value
  return Math.round(operation.startsWith('increase_') ? price + delta : price - delta)
}
function formatPrice(value: number) { return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` }

async function postBulkPrice(body: unknown) {
  const response = await productFetch('/api/products/bulk-price', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || 'Bulk price service unavailable.')
  return payload
}

export function BulkPriceDialog(props: BulkPriceDialogProps) {
  if (!props.open) return null
  return <BulkPriceDialogContent {...props} />
}

function BulkPriceDialogContent({ products, allProducts, lane, onClose, onApplied }: BulkPriceDialogProps) {
  const [operation, setOperation] = useState<Operation>('increase_percent')
  const [rawValue, setRawValue] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [scope, setScope] = useState<'selected' | 'all'>(() => products.length ? 'selected' : 'all')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [metals, setMetals] = useState<Metal[] | null>(null)
  const [metalIds, setMetalIds] = useState<string[]>([])
  const [variants, setVariants] = useState<PreviewVariant[] | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const effectiveProducts = scope === 'all' ? allProducts : products
  const productIdsKey = effectiveProducts.map((product) => product.id).join(',')
  const value = Number(rawValue)
  const valueIsValid = Number.isFinite(value) && value > 0 && value <= 1_000_000_000 && (!operation.endsWith('_percent') || value <= 1000) && (operation !== 'decrease_percent' || value < 100)

  useEffect(() => {
    let ignore = false
    postBulkPrice({ action: 'metals' })
      .then((payload) => { if (!ignore) setMetals(Array.isArray(payload?.metals) ? payload.metals : []) })
      .catch((loadError) => { if (!ignore) { setMetals([]); setError(loadError instanceof Error ? loadError.message : 'Unable to load metals.') } })
    return () => { ignore = true }
  }, [])

  // The preview's prices are sent back on apply, so the server refuses to apply
  // if anything changed since the admin looked at it.
  useEffect(() => {
    let ignore = false
    if (!metalIds.length || !productIdsKey) return
    void (async () => {
      setPreviewing(true)
      try {
        const payload = await postBulkPrice({ action: 'preview', ids: productIdsKey.split(','), metalIds, lane })
        if (!ignore) setVariants(Array.isArray(payload?.variants) ? payload.variants : [])
      } catch (previewError) {
        if (!ignore) { setVariants(null); setError(previewError instanceof Error ? previewError.message : 'Unable to preview prices.') }
      } finally {
        if (!ignore) setPreviewing(false)
      }
    })()
    return () => { ignore = true }
  }, [lane, metalIds, productIdsKey])

  const previewRows = useMemo(() => (variants ?? []).map((variant) => ({ ...variant, nextPrice: valueIsValid ? calculatePrice(variant.price, operation, value) : variant.price })), [operation, value, valueIsValid, variants])
  const hasInvalidResult = previewRows.some((row) => row.nextPrice < 1 || row.nextPrice > 1_000_000_000)
  const coveredProductIds = new Set(previewRows.map((row) => row.product_id))
  const skippedProducts = effectiveProducts.filter((product) => !coveredProductIds.has(product.id))
  const canApply = !loading && !previewing && confirmed && valueIsValid && !hasInvalidResult && metalIds.length > 0 && previewRows.length > 0

  const resetReview = () => { setConfirmed(false); setError(''); setRequestId(crypto.randomUUID()) }
  const toggleMetal = (id: string) => { setVariants(null); resetReview(); setMetalIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]) }

  const apply = async () => {
    if (!canApply || !variants) return
    setLoading(true)
    setError('')
    try {
      const payload = await postBulkPrice({
        action: 'apply', requestId, ids: effectiveProducts.map((product) => product.id), metalIds, lane, operation, value,
        expectedPrices: variants.map((variant) => ({ variant_id: variant.variant_id, price: variant.price })),
        confirmation: 'ADJUST_METAL_PRICES',
      })
      onApplied(Array.isArray(payload?.items) ? payload.items : [], Array.isArray(payload?.skippedProductIds) ? payload.skippedProductIds : [])
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Unable to update the selected prices.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !loading) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2 font-jakarta text-lg font-semibold"><SlidersHorizontal size={19} />Adjust prices by metal</DialogTitle><DialogDescription>Changes the price of the chosen metals on each product. This is the price customers see and pay. New prices are rounded to whole dollars, and a product&apos;s base price follows its default metal.</DialogDescription></DialogHeader>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto py-2">
          <div className="grid grid-cols-2 rounded-lg border border-border p-1">
            <button type="button" onClick={() => { setScope('selected'); setVariants(null); resetReview() }} disabled={!products.length} className={`rounded-md px-3 py-2 text-sm font-semibold ${scope === 'selected' ? 'bg-primary text-white' : 'text-foreground hover:bg-secondary'} disabled:cursor-not-allowed disabled:opacity-40`}>Selected ({products.length})</button>
            <button type="button" onClick={() => { setScope('all'); setVariants(null); resetReview() }} disabled={!allProducts.length} className={`rounded-md px-3 py-2 text-sm font-semibold ${scope === 'all' ? 'bg-primary text-white' : 'text-foreground hover:bg-secondary'} disabled:cursor-not-allowed disabled:opacity-40`}>All on this page ({allProducts.length})</button>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground">Metals to update</legend>
            {metals === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading metals…</p> : (
              <div className="grid gap-2 sm:grid-cols-2">{metals.map((metal) => <label key={metal.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><input type="checkbox" checked={metalIds.includes(metal.id)} onChange={() => toggleMetal(metal.id)} className="h-4 w-4 rounded border-border text-primary focus:ring-ring" />{metal.label}</label>)}</div>
            )}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-foreground">Operation<select value={operation} onChange={(event) => { setOperation(event.target.value as Operation); resetReview() }} className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm font-normal outline-none focus:border-primary"><option value="increase_amount">Increase by amount</option><option value="decrease_amount">Decrease by amount</option><option value="increase_percent">Increase by percentage</option><option value="decrease_percent">Decrease by percentage</option></select></label>
            <label className="space-y-2 text-sm font-semibold text-foreground">{operation.endsWith('_percent') ? 'Percentage' : 'Amount'}<div className="relative"><input type="number" min="0.01" max={operation === 'decrease_percent' ? '99.99' : operation.endsWith('_percent') ? '1000' : '1000000000'} step="0.01" value={rawValue} onChange={(event) => { setRawValue(event.target.value); resetReview() }} className="h-11 w-full rounded-lg border border-border bg-white px-3 pr-10 text-sm outline-none focus:border-primary" placeholder="0" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{operation.endsWith('_percent') ? '%' : '$'}</span></div></label>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Preview{variants ? ` · ${previewRows.length} price${previewRows.length === 1 ? '' : 's'} on ${coveredProductIds.size} product${coveredProductIds.size === 1 ? '' : 's'}` : ''}</p>
            {!metalIds.length ? <p className="mt-3 text-sm text-muted-foreground">Choose at least one metal.</p> : previewing ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading current prices…</p> : (
              <div className="mt-3 space-y-2">{previewRows.slice(0, 8).map((row) => <div key={row.variant_id} className="flex items-center justify-between gap-4 text-sm"><span className="min-w-0 truncate text-foreground">{row.product_name} · {row.metal_label}{row.is_default ? ' (default)' : ''}</span><span className="shrink-0 font-jakarta font-semibold">{formatPrice(row.price)} → {formatPrice(row.nextPrice)}</span></div>)}{previewRows.length > 8 ? <p className="text-xs text-muted-foreground">Plus {previewRows.length - 8} more prices.</p> : null}</div>
            )}
            {variants && skippedProducts.length ? <p className="mt-3 text-xs text-amber-700">{skippedProducts.length} product{skippedProducts.length === 1 ? ' does' : 's do'} not offer the chosen metals and will be skipped: {skippedProducts.slice(0, 3).map((product) => product.name).join(', ')}{skippedProducts.length > 3 ? '…' : ''}</p> : null}
            {hasInvalidResult ? <p className="mt-3 text-xs text-red-700">This change would make a price lower than $1. Use a smaller decrease.</p> : null}
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-border p-4 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-ring" /><span>I confirm these price changes for the chosen metals. Other metals, stock, status, discounts and product details are not changed.</span></label>
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        </div>
        <DialogFooter><button type="button" onClick={onClose} disabled={loading} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-secondary disabled:opacity-60">Cancel</button><button type="button" onClick={() => void apply()} disabled={!canApply} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 size={16} className="animate-spin" /> : null}{loading ? 'Updating prices…' : 'Apply price changes'}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
