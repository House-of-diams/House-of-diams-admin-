'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Copy, Package } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { escapeHtmlText } from '@/lib/html-escape'
import { operationsFetch } from '@/lib/operations-transport'

type OrderDetailPageProps = {
  params: Promise<{
    id: string
  }>
}

type OrderDetail = {
  id: string
  order_number: string
  customer_email: string
  customer_first_name: string
  customer_last_name: string | null
  customer_phone: string | null
  shipping_country: string | null
  shipping_state: string | null
  shipping_city: string | null
  shipping_postal_code: string | null
  shipping_address_line_1: string | null
  shipping_address_line_2: string | null
  total_amount: number
  subtotal_amount?: number | null
  gst_amount?: number | null
  shipping_amount?: number | null
  love_letter_included?: boolean
  love_letter_type?: 'generate_for_me' | 'write_myself' | 'no_letter' | null
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  payment_status: string
  payment_gateway?: string | null
  payment_currency?: string | null
  payment_amount?: number | null
  razorpay_order_id?: string | null
  razorpay_payment_id?: string | null
  razorpay_payment_method?: string | null
  razorpay_payment_contact?: string | null
  razorpay_payment_email?: string | null
  gateway_order_status?: string | null
  gateway_payment_status?: string | null
  payment_verified_at?: string | null
  payment_failed_at?: string | null
  payment_captured_at?: string | null
  razorpay_error_code?: string | null
  razorpay_error_description?: string | null
  courier_name?: string | null
  courier_awb_number?: string | null
  shipped_at?: string | null
  created_at: string
  notes: string | null
}

type OrderItem = {
  id: string
  product_name: string
  product_slug: string | null
  sku: string | null
  quantity: number
  unit_price: number
  line_total: number
  selected_metal: string | null
  selected_purity: string | null
  selected_size_or_fit: string | null
  selected_gemstone: string | null
  selected_carat: string | null
  image_url: string | null
  selected_custom_dropdowns?: { dropdown_id: string; label: string; option_label: string }[]
  item_type?: 'regular' | 'free_gift'
  original_unit_price?: number | null
}

type OrderLoveLetter = {
  id: string
  wants_letter: boolean
  letter_type: 'generate_for_me' | 'write_myself' | 'no_letter'
  recipient_name: string | null
  sender_name: string | null
  occasion_key: 'proposal' | 'anniversary' | 'birthday' | 'justbecause' | 'apology' | 'mother' | 'newchapter' | null
  about_her_text: string | null
  custom_letter_text: string | null
  final_letter_text: string | null
  final_letter_html: string | null
  print_status: 'pending' | 'ready' | 'printed' | 'skipped'
  admin_notes: string | null
}

function buildSelectionLabel(metal?: string | null, purity?: string | null) {
  const normalizedMetal = metal?.trim() || ''
  const normalizedPurity = purity?.trim() || ''
  if (!normalizedMetal) return normalizedPurity
  if (!normalizedPurity || normalizedMetal.toLowerCase().includes(normalizedPurity.toLowerCase())) return normalizedMetal
  return `${normalizedPurity} ${normalizedMetal}`.trim()
}

const OCCASION_LABELS: Record<NonNullable<OrderLoveLetter['occasion_key']>, string> = {
  proposal: 'A marriage proposal',
  anniversary: 'An anniversary',
  birthday: 'A birthday',
  justbecause: 'No occasion - just love',
  apology: 'A reconciliation',
  mother: 'A gift for her mother',
  newchapter: 'A new chapter',
}

const authedFetch = operationsFetch

export default function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { toast } = useToast()
  const [id, setId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<'not-found' | 'failed' | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false)
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [loveLetter, setLoveLetter] = useState<OrderLoveLetter | null>(null)
  const [status, setStatus] = useState<OrderDetail['status']>('pending')
  const [courierName, setCourierName] = useState('')
  const [courierAwbNumber, setCourierAwbNumber] = useState('')
  const [showLetterPreview, setShowLetterPreview] = useState(false)

  const hasStatusChanges = Boolean(order) && (
    status !== order?.status || courierName.trim() !== (order?.courier_name ?? '') || courierAwbNumber.trim() !== (order?.courier_awb_number ?? '')
  )
  const { showWarning, setShowWarning, confirmNavigation, handleDiscard } = useUnsavedChanges(hasStatusChanges)

  useEffect(() => {
    void params.then((resolved) => setId(resolved.id))
  }, [params])

  useEffect(() => {
    if (!id) return
    const loadOrder = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const response = await authedFetch(`/api/orders/${id}`)
        const payload = await response.json().catch(() => null)
        if (response.ok && payload) {
          setOrder(payload.order)
          setItems(payload.items ?? [])
          setLoveLetter(payload.loveLetter ?? null)
          setStatus(payload.order.status)
          setCourierName(payload.order.courier_name ?? '')
          setCourierAwbNumber(payload.order.courier_awb_number ?? '')
        } else {
          setOrder(null)
          setLoadError(response.status === 404 ? 'not-found' : 'failed')
        }
      } catch {
        setOrder(null)
        setLoadError('failed')
      } finally {
        setLoading(false)
      }
    }
    void loadOrder()
  }, [id, loadAttempt])

  const saveStatus = async () => {
    if (!order) return
    if (status === 'shipped') {
      if (!courierName.trim()) {
        toast({
          title: 'Courier required',
          description: 'Please add the courier name before marking the order as shipped.',
          variant: 'destructive',
        })
        return
      }
      if (!courierAwbNumber.trim()) {
        toast({
          title: 'AWB required',
          description: 'Please add the AWB or tracking number before marking the order as shipped.',
          variant: 'destructive',
        })
        return
      }
    }
    setSavingStatus(true)
    try {
      const response = await authedFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          expected_status: order.status,
          expected_courier_name: order.courier_name ?? null,
          expected_courier_awb_number: order.courier_awb_number ?? null,
          courier_name: courierName.trim() || null,
          courier_awb_number: courierAwbNumber.trim() || null,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (response.ok) {
        if (payload?.emailStatus === 'failed') {
          toast({
            title: 'Status updated with email warning',
            description: payload?.emailError ?? 'The order status changed, but the email was not sent.',
            variant: 'destructive',
          })
        } else if (payload?.emailStatus === 'sent') {
          toast({ title: 'Status updated', description: 'Order status updated and customer email sent.' })
        } else {
          toast({ title: 'Status updated', description: 'Order status updated successfully.' })
        }
        setOrder((current) => current ? { ...current, ...payload.item } : current)
        setStatus(payload.item.status)
        setCourierName(payload.item.courier_name ?? '')
        setCourierAwbNumber(payload.item.courier_awb_number ?? '')
        setStatusConfirmOpen(false)
      } else {
        toast({
          title: 'Status update failed',
          description: payload?.error ?? 'Unable to update order status.',
          variant: 'destructive',
        })
      }
    } catch {
      toast({ title: 'Status update failed', description: 'Unable to reach the server. Your edits are still available.', variant: 'destructive' })
    } finally {
      setSavingStatus(false)
    }
  }

  const statusSteps: OrderDetail['status'][] = ['pending', 'processing', 'shipped', 'delivered']
  const activeStatusIndex = status === 'cancelled' ? -1 : statusSteps.indexOf(status)
  const formatStatusLabel = (value: OrderDetail['status']) => value.charAt(0).toUpperCase() + value.slice(1)
  const formatOccasionLabel = (value: OrderLoveLetter['occasion_key']) => (value ? OCCASION_LABELS[value] : '-')
  const letterTypeLabel =
    loveLetter?.letter_type === 'generate_for_me'
      ? 'Generated for me'
      : loveLetter?.letter_type === 'write_myself'
        ? 'Written by customer'
        : 'No letter'
  const customerName = [order?.customer_first_name, order?.customer_last_name].filter(Boolean).join(' ') || '-'
  const shippingCityLine =
    [order?.shipping_city, order?.shipping_state, order?.shipping_postal_code].filter(Boolean).join(', ') || '-'
  const copyText = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast({ title: 'Copied to clipboard' }) } catch { toast({ title: 'Copy failed', description: 'Please select and copy the value manually.', variant: 'destructive' }) }
  }
  const paymentCurrency = order?.payment_currency?.trim().toUpperCase() || null
  const formatAmount = (value: number | null | undefined, currency: string | null) => {
    const amount = Number(value ?? 0)
    const formattedAmount = Number.isFinite(amount) ? amount.toLocaleString() : '—'
    return `${currency ?? 'Currency unavailable'} ${formattedAmount}`
  }
  // Product and order totals are stored in the storefront's base currency. The payment
  // amount is the separately converted amount actually charged by the gateway.
  const formatStoreAmount = (value: number | null | undefined) => formatAmount(value, 'USD')
  const formatChargedAmount = (value: number | null | undefined) => formatAmount(value, paymentCurrency)
  const statusBadgeClass =
    status === 'delivered'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'shipped'
        ? 'bg-sky-50 text-sky-700 border-sky-200'
        : status === 'processing'
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : status === 'cancelled'
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : 'bg-slate-50 text-slate-700 border-slate-200'
  const printableLetterHtml =
    loveLetter?.final_letter_html ||
    (loveLetter?.final_letter_text
      ? loveLetter.final_letter_text
          .split(/\n\n+/)
          .map((entry) => `<p>${escapeHtmlText(entry)}</p>`)
          .join('')
      : '<p>No printable letter body saved.</p>')

  const printLoveLetter = () => {
    if (!order || !loveLetter?.wants_letter) return
    const printWindow = window.open('', '_blank', 'width=900,height=1200')
    if (!printWindow) return

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtmlText(order.order_number)} Love Letter</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Manrope, Arial, sans-serif; background: #f6f1e8; color: #0a1628; margin: 0; padding: 32px; }
            .sheet { max-width: 820px; margin: 0 auto; }
            .brand { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 28px; }
            .wordmark { font-size: 22px; font-weight: 600; letter-spacing: .28em; text-transform: uppercase; color: #0a1628; }
            .submark { font-size: 10px; letter-spacing: .34em; text-transform: uppercase; color: #7c8696; }
            .meta { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: #8b94a5; }
            .paper { background: linear-gradient(180deg,#fffdf9 0%,#fbf5ea 100%); border: 1px solid #ddd8d0; padding: 42px; box-shadow: 0 20px 48px rgba(10,22,40,0.08); }
            .divider { width: 64px; height: 1px; background: rgba(166,124,34,0.35); margin: 22px 0; }
            .dear { font-size: 28px; font-weight: 600; margin-bottom: 0; color: #0a1628; }
            .body { font-size: 15px; line-height: 1.9; color: #253246; }
            .body p { margin: 0 0 16px; }
            .sign { margin-top: 28px; font-size: 12px; font-style: italic; color: #8b94a5; }
            .name { font-size: 22px; font-weight: 600; font-style: italic; margin-top: 8px; color: #0a1628; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="brand">
              <div>
                <div class="wordmark">House of Diams</div>
                <div class="submark">Fine Jewellery</div>
              </div>
              <div class="meta">Order ${escapeHtmlText(order.order_number)}</div>
            </div>
            <div class="paper">
              <div class="dear">Dear <em>${escapeHtmlText(loveLetter.recipient_name || 'Her')}</em>,</div>
              <div class="divider"></div>
              <div class="body">${printableLetterHtml}</div>
              <div class="divider"></div>
              <div class="sign">Yours, always</div>
              <div class="name">${escapeHtmlText(loveLetter.sender_name || '-')}</div>
            </div>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  if (loading) {
    return <div className="space-y-6 p-8" aria-busy="true"><div className="h-5 w-32 animate-pulse rounded bg-secondary" /><div className="h-10 w-72 animate-pulse rounded bg-secondary" /><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="h-72 animate-pulse rounded-lg border border-border bg-white" /><div className="h-72 animate-pulse rounded-lg border border-border bg-white" /></div></div>
  }

  if (!order) {
    return <div className="p-8"><div className="rounded-lg border border-border bg-white px-6 py-12 text-sm text-muted-foreground"><p className="font-semibold text-foreground">{loadError === 'not-found' ? 'Order not found' : 'Couldn’t load this order'}</p><p className="mt-1">{loadError === 'not-found' ? 'This order may have been removed or the link is incorrect.' : 'Try again, or check that your admin session is still active.'}</p>{loadError !== 'not-found' ? <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">Retry</button> : null}</div></div>
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-[rgba(166,124,34,0.22)] pb-6">
        <div>
          <Link href="/dashboard/orders" onClick={(event) => { if (hasStatusChanges) { event.preventDefault(); confirmNavigation(() => window.location.assign('/dashboard/orders')) } }} className="text-sm font-semibold text-primary hover:text-primary/80">Back to Orders</Link>
          <div className="mt-3 flex flex-wrap items-center gap-2"><h1 className="font-jakarta text-3xl font-semibold text-[#0A1628]">{order.order_number}</h1><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${order.payment_status?.toLowerCase() === 'paid' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : order.payment_status?.toLowerCase() === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>Payment: {order.payment_status || 'Pending'}</span><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass}`}>{formatStatusLabel(status)}</span></div>
          <p className="mt-2 border-l-2 border-primary/30 pl-3 text-sm text-muted-foreground">Placed on {new Date(order.created_at).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-white p-6 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-jakarta text-lg font-semibold text-[#0A1628]">Status &amp; shipment</h2><p className="mt-1 text-sm text-muted-foreground">Update fulfilment details in one place.</p></div>
              {status === 'cancelled' ? <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">Cancelled</span> : null}
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div><label className="mb-2 block text-[13px] text-muted-foreground">Order status</label><Select value={status} onValueChange={(value) => setStatus(value as OrderDetail['status'])}><SelectTrigger className="h-10 rounded-lg border-border text-sm"><SelectValue placeholder="Select status" /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="processing">Processing</SelectItem><SelectItem value="shipped">Shipped</SelectItem><SelectItem value="delivered">Delivered</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div>
              <div><label className="mb-2 block text-[13px] text-muted-foreground">Courier name</label><input value={courierName} onChange={(event) => setCourierName(event.target.value)} placeholder="Bluedart, DHL, FedEx..." className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary" /></div>
              <div><label className="mb-2 block text-[13px] text-muted-foreground">AWB / tracking number</label><input value={courierAwbNumber} onChange={(event) => setCourierAwbNumber(event.target.value)} placeholder="Shipment tracking number" className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary" /></div>
            </div>
            {(status === 'shipped' || status === 'delivered') && order.shipped_at ? <p className="mt-4 text-[13px] text-muted-foreground">Shipped on {new Date(order.shipped_at).toLocaleString()}</p> : null}
            {status !== 'cancelled' ? <div className="relative mt-6 max-w-2xl"><div className="absolute left-[12.5%] right-[12.5%] top-2 h-px bg-border" /><div className="absolute left-[12.5%] top-2 h-px bg-primary" style={{ width: `${(activeStatusIndex / (statusSteps.length - 1)) * 75}%` }} /><div className="relative grid grid-cols-4">{statusSteps.map((step, index) => <div key={step} className="relative pt-5 text-center text-[13px] text-muted-foreground"><span className={`absolute left-1/2 top-2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${index <= activeStatusIndex ? 'border-primary bg-primary' : 'border-border bg-white'}`} />{formatStatusLabel(step)}</div>)}</div></div> : null}
            <div className="mt-6 flex justify-end border-t border-border pt-4"><button onClick={() => setStatusConfirmOpen(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60" disabled={savingStatus || !hasStatusChanges}>{savingStatus ? 'Saving...' : 'Update Status'}</button></div>
          </section>
          <div className="overflow-hidden rounded-lg border border-border bg-white shadow-xs">
            <div className="border-b border-border px-6 py-4">
              <h2 className="font-jakarta text-lg font-semibold text-foreground">Order Items</h2>
            </div>
            <div className="divide-y divide-border">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4 px-6 py-5">
                  <div className="h-20 w-20 overflow-hidden rounded-lg border border-border bg-secondary/30">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" />
                    ) : <div className="flex h-full items-center justify-center text-muted-foreground"><Package size={22} aria-label="Product image unavailable" /></div>}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><div className="text-[15px] font-semibold text-foreground">{item.product_name}</div>{item.item_type === 'free_gift' ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Free gift</span> : null}</div>
                    <div className="mt-1 text-[13px] text-muted-foreground">SKU: {item.sku || '-'}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[13px] text-muted-foreground">
                      {buildSelectionLabel(item.selected_metal, item.selected_purity) ? (
                        <span>Metal: {buildSelectionLabel(item.selected_metal, item.selected_purity)}</span>
                      ) : null}
                      {item.selected_gemstone ? <span>Stone: {item.selected_gemstone}</span> : null}
                      {item.selected_carat ? <span>Carat: {item.selected_carat}</span> : null}
                      {item.selected_size_or_fit ? <span>Size/Fit: {item.selected_size_or_fit}</span> : null}
                      {item.selected_custom_dropdowns?.map((selection) => <span key={selection.dropdown_id}>{selection.label}: {selection.option_label}</span>)}
                    </div>
                  </div>
                    <div className="text-right tabular-nums">
                    <div className="text-sm text-muted-foreground">Qty {item.quantity} · {formatStoreAmount(item.unit_price)} each</div>
                    <div className="mt-1 text-sm font-bold text-foreground">{item.item_type === 'free_gift' ? <><span className="mr-2 font-normal text-muted-foreground line-through">{formatStoreAmount(item.original_unit_price)}</span><span className="text-emerald-700">Free</span></> : formatStoreAmount(item.line_total)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="ml-auto w-full max-w-xs space-y-2 border-t border-border px-6 py-5 text-sm tabular-nums">
              {(() => { const subtotal = Number(order.subtotal_amount ?? items.reduce((sum, item) => sum + Number(item.line_total || 0), 0)); const tax = Number(order.gst_amount ?? 0); const shipping = Number(order.shipping_amount ?? 0); const discount = Math.max(0, subtotal + tax + shipping - Number(order.total_amount ?? 0)); return <><div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatStoreAmount(subtotal)}</span></div>{discount > 0 ? <div className="flex justify-between text-muted-foreground"><span>Discount</span><span>−{formatStoreAmount(discount)}</span></div> : null}<div className="flex justify-between text-muted-foreground"><span>Shipping</span><span>{formatStoreAmount(shipping)}</span></div><div className="flex justify-between text-muted-foreground"><span>GST / Tax</span><span>{formatStoreAmount(tax)}</span></div><div className="flex justify-between border-t border-border pt-3 text-base font-bold text-[#0A1628]"><span>Total</span><span>{formatStoreAmount(order.total_amount)}</span></div><div className="pt-1 text-sm text-muted-foreground">Charged ({formatChargedAmount(order.payment_amount ?? order.total_amount)})</div></> })()}
            </div>
          </div>
          <section className="rounded-lg border border-border bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between gap-3"><div><h2 className="font-jakarta text-lg font-semibold text-foreground">Love Letter</h2><p className="mt-1 text-sm text-muted-foreground">{loveLetter?.wants_letter ? 'Letter included' : 'No letter'}</p></div></div>
            {loveLetter?.wants_letter ? <div className="mt-5 divide-y divide-border">{[["Type", letterTypeLabel], ["Print status", loveLetter.print_status], ["Recipient", loveLetter.recipient_name || '-'], ["Sender", loveLetter.sender_name || '-'], ["Occasion", formatOccasionLabel(loveLetter.occasion_key)]].map(([label, value]) => <div key={label} className="flex justify-between gap-5 py-2.5 text-sm"><span className="text-[13px] text-muted-foreground">{label}</span><span className="text-right font-medium text-foreground">{value}</span></div>)}<div className="flex flex-wrap justify-end gap-2 pt-5"><button type="button" onClick={() => setShowLetterPreview((current) => !current)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">{showLetterPreview ? 'Hide Preview' : 'Preview Letter'}</button><button type="button" onClick={printLoveLetter} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">Print Letter</button></div></div> : <p className="mt-5 text-sm text-muted-foreground">This customer chose not to include a love letter with the order.</p>}
            {loveLetter?.about_her_text ? <details className="mt-5 border-t border-border pt-3"><summary className="cursor-pointer text-sm font-semibold text-foreground">About Her</summary><p className="mt-3 text-sm leading-7 text-muted-foreground">{loveLetter.about_her_text}</p></details> : null}
            {loveLetter?.custom_letter_text ? <details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer text-sm font-semibold text-foreground">Original Draft</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{loveLetter.custom_letter_text}</p></details> : null}
            {showLetterPreview && loveLetter?.wants_letter ? <div className="mt-5 border-t border-border pt-5"><div className="text-2xl font-semibold text-foreground">Dear <em>{loveLetter.recipient_name || 'Her'}</em>,</div><div className="prose prose-neutral mt-5 max-h-[320px] max-w-none overflow-y-auto text-[15px] leading-8 text-[#253246] [&_p]:mb-4" dangerouslySetInnerHTML={{ __html: printableLetterHtml }} /></div> : null}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-lg border border-border bg-white p-6 shadow-xs">
            <h2 className="font-jakarta text-lg font-semibold text-foreground">Customer</h2>
            <div className="mt-4 divide-y divide-border text-sm"><div className="flex items-center justify-between gap-3 py-2.5"><span className="text-[13px] text-muted-foreground">Name</span><span className="flex items-center gap-1 text-right font-medium">{customerName}<button type="button" onClick={() => void copyText(customerName)} className="p-1" aria-label="Copy customer name"><Copy size={14} /></button></span></div><div className="flex items-center justify-between gap-3 py-2.5"><span className="text-[13px] text-muted-foreground">Phone</span><span className="flex items-center gap-1 text-right font-medium">{order.customer_phone || '-'}{order.customer_phone ? <button type="button" onClick={() => void copyText(order.customer_phone || '')} className="p-1" aria-label="Copy phone"><Copy size={14} /></button> : null}</span></div><div className="flex items-start justify-between gap-3 py-2.5"><span className="text-[13px] text-muted-foreground">Email</span><span className="flex items-start gap-1 break-all text-right font-medium">{order.customer_email}<button type="button" onClick={() => void copyText(order.customer_email)} className="p-1" aria-label="Copy email"><Copy size={14} /></button></span></div></div>
          </section>
          <section className="rounded-lg border border-border bg-white p-6 shadow-xs"><div className="flex items-center justify-between gap-3"><h2 className="font-jakarta text-lg font-semibold text-foreground">Ship to</h2><button type="button" onClick={() => void copyText([order.shipping_address_line_1, order.shipping_address_line_2, shippingCityLine, order.shipping_country].filter(Boolean).join('\n'))} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80"><Copy size={14} />Copy address</button></div><address className="mt-4 not-italic text-sm leading-6 text-muted-foreground">{order.shipping_address_line_1 || '-'}<br />{order.shipping_address_line_2 ? <>{order.shipping_address_line_2}<br /></> : null}{shippingCityLine}<br />{order.shipping_country || '-'}</address></section>
          <section className="rounded-lg border border-border bg-white p-6 shadow-xs"><div className="flex items-center justify-between gap-3"><h2 className="font-jakarta text-lg font-semibold text-foreground">Payment</h2><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${order.payment_status?.toLowerCase() === 'paid' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : order.payment_status?.toLowerCase() === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{order.payment_status || 'Pending'}</span></div><div className="mt-4 divide-y divide-border text-sm"><div className="flex justify-between gap-4 py-2.5"><span className="text-[13px] text-muted-foreground">Method</span><span className="font-medium capitalize">{order.razorpay_payment_method || '-'}</span></div>{order.payment_captured_at ? <div className="flex justify-between gap-4 py-2.5"><span className="text-[13px] text-muted-foreground">Captured</span><span className="text-right font-medium">{new Date(order.payment_captured_at).toLocaleString()}</span></div> : null}{order.payment_failed_at ? <div className="flex justify-between gap-4 py-2.5"><span className="text-[13px] text-muted-foreground">Failed</span><span className="text-right font-medium">{new Date(order.payment_failed_at).toLocaleString()}</span></div> : null}{order.razorpay_error_description ? <div className="py-2.5"><div className="text-[13px] text-muted-foreground">Failure note</div><p className="mt-1 text-sm text-foreground">{order.razorpay_error_description}</p></div> : null}</div></section>
          <details className="rounded-lg border border-border bg-white p-6 shadow-xs"><summary className="cursor-pointer text-lg font-semibold text-foreground">Technical details</summary><div className="mt-4 divide-y divide-border text-sm"><div className="flex justify-between gap-4 py-2.5"><span className="text-[13px] text-muted-foreground">Gateway order ID</span><span className="break-all text-right font-medium">{order.razorpay_order_id || '-'}</span></div><div className="flex justify-between gap-4 py-2.5"><span className="text-[13px] text-muted-foreground">Gateway payment ID</span><span className="break-all text-right font-medium">{order.razorpay_payment_id || '-'}</span></div><div className="flex justify-between gap-4 py-2.5"><span className="text-[13px] text-muted-foreground">Gateway status</span><span className="text-right font-medium">{order.gateway_payment_status || order.gateway_order_status || '-'}</span></div></div></details>
          {order.notes ? <section className="rounded-lg border border-border bg-white p-6 shadow-xs"><h2 className="font-jakarta text-lg font-semibold text-foreground">Notes</h2><p className="mt-4 text-sm leading-6 text-muted-foreground">{order.notes}</p></section> : null}

        </aside>
      </div>
      <ConfirmDialog isOpen={statusConfirmOpen} title="Update order status?" description="This will update the order and notify the customer when the status changes." confirmText="Update status" isLoading={savingStatus} onConfirm={saveStatus} onCancel={() => { if (!savingStatus) setStatusConfirmOpen(false) }} />
      <ConfirmDialog isOpen={showWarning} title="Discard unsaved order changes?" description="Your status or shipping edits have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={handleDiscard} onCancel={() => setShowWarning(false)} />
    </div>
  )
}
