'use client'

import { useMemo, useState } from 'react'
import { Loader2, SlidersHorizontal } from 'lucide-react'
import { productFetch } from '@/lib/product-transport'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Operation = 'increase_amount' | 'decrease_amount' | 'increase_percent' | 'decrease_percent'
type SelectedProduct = { id: string; name: string; price: number | null }
type BulkPriceDialogProps = {
  open: boolean
  products: SelectedProduct[]
  allProducts: SelectedProduct[]
  lane: 'standard' | 'hiphop' | 'collection'
  onClose: () => void
  onApplied: (items: Array<{ id: string; price: number }>) => void
}

function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100 }
function formatPrice(value: number) { return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` }
function calculatePrice(price: number, operation: Operation, value: number) {
  const delta = operation.endsWith('_percent') ? price * (value / 100) : value
  return roundMoney(operation.startsWith('increase_') ? price + delta : price - delta)
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
  const [requestId] = useState(() => crypto.randomUUID())
  const effectiveProducts = scope === 'all' ? allProducts : products
  const value = Number(rawValue)
  const invalidPriceCount = effectiveProducts.filter((product) => product.price == null || !Number.isFinite(product.price) || product.price <= 0).length
  const valueIsValid = Number.isFinite(value) && value > 0 && value <= 1_000_000_000 && (!operation.endsWith('_percent') || value <= 1000) && (operation !== 'decrease_percent' || value < 100)
  const preview = useMemo(() => effectiveProducts.filter((product): product is SelectedProduct & { price: number } => product.price != null && Number.isFinite(product.price)).slice(0, 4).map((product) => ({ ...product, nextPrice: valueIsValid ? calculatePrice(product.price, operation, value) : product.price })), [effectiveProducts, operation, value, valueIsValid])
  const hasInvalidResult = preview.some((product) => product.nextPrice <= 0 || product.nextPrice > 1_000_000_000)

  const apply = async () => {
    if (loading || !requestId || !confirmed || !valueIsValid || invalidPriceCount || hasInvalidResult || !effectiveProducts.length) return
    setLoading(true)
    setError('')
    try {
      const response = await productFetch('/api/products/bulk-price', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, ids: effectiveProducts.map((product) => product.id), expectedPrices: effectiveProducts.map((product) => ({ id: product.id, price: product.price })), lane, operation, value, confirmation: 'ADJUST_BASE_PRICES' }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Unable to update the selected prices.')
      onApplied(Array.isArray(payload?.items) ? payload.items : [])
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Unable to update the selected prices.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !loading) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2 font-jakarta text-lg font-semibold"><SlidersHorizontal size={19} />Adjust base prices</DialogTitle><DialogDescription>Updates only the listed base price. It cannot delete products or modify stock, status, variants, or discounts.</DialogDescription></DialogHeader>
        <div className="space-y-5 py-2">
          <div className="grid grid-cols-2 rounded-lg border border-border p-1">
            <button type="button" onClick={() => { setScope('selected'); setConfirmed(false); setError('') }} disabled={!products.length} className={`rounded-md px-3 py-2 text-sm font-semibold ${scope === 'selected' ? 'bg-primary text-white' : 'text-foreground hover:bg-secondary'} disabled:cursor-not-allowed disabled:opacity-40`}>Selected ({products.length})</button>
            <button type="button" onClick={() => { setScope('all'); setConfirmed(false); setError('') }} disabled={!allProducts.length} className={`rounded-md px-3 py-2 text-sm font-semibold ${scope === 'all' ? 'bg-primary text-white' : 'text-foreground hover:bg-secondary'} disabled:cursor-not-allowed disabled:opacity-40`}>All filtered ({allProducts.length})</button>
          </div>
          <p className="text-xs text-muted-foreground">“All filtered” applies only to this price change and does not add products to the deletion selection.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-foreground">Operation<select value={operation} onChange={(event) => { setOperation(event.target.value as Operation); setConfirmed(false); setError('') }} className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm font-normal outline-none focus:border-primary"><option value="increase_amount">Increase by amount</option><option value="decrease_amount">Decrease by amount</option><option value="increase_percent">Increase by percentage</option><option value="decrease_percent">Decrease by percentage</option></select></label>
            <label className="space-y-2 text-sm font-semibold text-foreground">{operation.endsWith('_percent') ? 'Percentage' : 'Amount'}<div className="relative"><input type="number" min="0.01" max={operation === 'decrease_percent' ? '99.99' : operation.endsWith('_percent') ? '1000' : '1000000000'} step="0.01" value={rawValue} onChange={(event) => { setRawValue(event.target.value); setConfirmed(false); setError('') }} className="h-11 w-full rounded-lg border border-border bg-white px-3 pr-10 text-sm outline-none focus:border-primary" placeholder="0.00" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{operation.endsWith('_percent') ? '%' : '$'}</span></div></label>
          </div>
          {invalidPriceCount ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{invalidPriceCount} product{invalidPriceCount === 1 ? ' has' : 's have'} no valid base price. Change the scope or add their prices before continuing.</p> : null}
          <div className="rounded-lg border border-border bg-secondary/30 p-4"><p className="text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Preview · {effectiveProducts.length} product{effectiveProducts.length === 1 ? '' : 's'}</p><div className="mt-3 space-y-2">{preview.map((product) => <div key={product.id} className="flex items-center justify-between gap-4 text-sm"><span className="min-w-0 truncate text-foreground">{product.name}</span><span className="shrink-0 font-jakarta font-semibold">{formatPrice(product.price)} → {formatPrice(product.nextPrice)}</span></div>)}</div>{effectiveProducts.length > preview.length ? <p className="mt-3 text-xs text-muted-foreground">Plus {effectiveProducts.length - preview.length} more products.</p> : null}</div>
          <label className="flex items-start gap-3 rounded-lg border border-border p-4 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-ring" /><span>I confirm these base-price changes. Product records, stock, status, variants, discounts, and selections will not be deleted or modified.</span></label>
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        </div>
        <DialogFooter><button type="button" onClick={onClose} disabled={loading} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-secondary disabled:opacity-60">Cancel</button><button type="button" onClick={() => void apply()} disabled={loading || !confirmed || !valueIsValid || invalidPriceCount > 0 || hasInvalidResult || effectiveProducts.length === 0} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 size={16} className="animate-spin" /> : null}{loading ? 'Updating prices…' : 'Apply price changes'}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
