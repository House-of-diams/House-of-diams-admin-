'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Mail, Phone, Sparkles, MessageSquareText, ShoppingBag, Newspaper, ExternalLink, Gift, Eye, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import type { AdminEnquiryItem, EnquiriesPageData, EnquiryTab } from '@/lib/enquiries'

const TAB_ORDER: Array<{ id: EnquiryTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'bespoke', label: 'Bespoke' },
  { id: 'contact', label: 'Contact' },
  { id: 'product', label: 'Product' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'promotion', label: 'Promotion Leads' },
]

function getTabIcon(source: AdminEnquiryItem['source']) {
  switch (source) {
    case 'bespoke':
      return Sparkles
    case 'product':
      return ShoppingBag
    case 'newsletter':
      return Newspaper
    case 'promotion':
      return Gift
    default:
      return MessageSquareText
  }
}

function normalizeTab(value: string | null): EnquiryTab {
  if (value === 'bespoke' || value === 'contact' || value === 'product' || value === 'newsletter' || value === 'promotion') return value
  return 'all'
}

export function EnquiriesClient({ initialData }: { initialData: EnquiriesPageData }) {
  const searchParams = useSearchParams()
  const activeTab = normalizeTab(searchParams.get('tab'))
  const [selectedPromotionLead, setSelectedPromotionLead] = useState<Extract<AdminEnquiryItem, { source: 'promotion' }> | null>(null)

  const filteredItems = useMemo(() => {
    if (activeTab === 'all') return initialData.items
    return initialData.items.filter((item) => item.source === activeTab)
  }, [activeTab, initialData.items])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Enquiries</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One inbox for bespoke, contact, product, newsletter, and promotion leads.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {TAB_ORDER.map((tab) => {
          const isActive = tab.id === activeTab
          const count = initialData.counts[tab.id]

          return (
            <Link
              key={tab.id}
              href={tab.id === 'all' ? '/dashboard/enquiries' : `/dashboard/enquiries?tab=${tab.id}`}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-white text-foreground hover:bg-secondary'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] ${isActive ? 'bg-white/20 text-white' : 'bg-secondary text-foreground'}`}>
                {count}
              </span>
            </Link>
          )
        })}
      </div>

      {!initialData.newsletterEnabled ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Newsletter inbox is ready in the UI, but newsletter persistence will only appear after the new `newsletter_submissions` table is added.
        </div>
      ) : null}

      {!initialData.promotionLeadsEnabled ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Promotion leads will appear after the promotion submissions table is available.
        </div>
      ) : null}

      {activeTab === 'promotion' ? (
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-secondary/35 text-xs font-semibold text-muted-foreground"><tr><th className="px-5 py-3">Email</th><th className="px-5 py-3">Coupon</th><th className="px-5 py-3">Submitted</th><th className="px-5 py-3 text-right">Answers</th></tr></thead>
            <tbody className="divide-y divide-border">{filteredItems.map((item) => item.source === 'promotion' ? <tr key={item.id} className="hover:bg-secondary/20"><td className="px-5 py-4 font-medium text-foreground">{item.email}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${item.coupon_revealed ? 'bg-emerald-50 text-emerald-700' : 'bg-secondary text-muted-foreground'}`}>{item.coupon_revealed ? 'Revealed' : 'Not revealed'}</span></td><td className="px-5 py-4 text-muted-foreground">{new Date(item.created_at).toLocaleString()}</td><td className="px-5 py-4 text-right"><button type="button" onClick={() => setSelectedPromotionLead(item)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary"><Eye size={14} />View</button></td></tr> : null)}</tbody>
          </table>
          {filteredItems.length === 0 ? <p className="px-6 py-10 text-center text-sm text-muted-foreground">No promotion leads yet.</p> : null}
        </div>
      ) : <div className="space-y-4">
        {filteredItems.map((item) => {
          const Icon = getTabIcon(item.source)

          return (
            <article key={item.id} className="rounded-2xl border border-border bg-white p-5 shadow-xs">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
                      <Icon size={12} />
                      {item.source}
                    </span>
                    <span className="inline-flex rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                      {item.status || 'new'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>

                  <h2 className="font-jakarta text-lg font-semibold text-foreground">{item.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{item.full_name}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</div>
                      <a href={`mailto:${item.email}`} className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary">
                        <Mail size={14} />
                        {item.email}
                      </a>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone</div>
                      {item.phone ? (
                        <a href={`tel:${item.phone}`} className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary">
                          <Phone size={14} />
                          {item.phone}
                        </a>
                      ) : (
                        <div className="mt-1 text-sm text-muted-foreground">No phone shared</div>
                      )}
                    </div>
                  </div>

                  {item.message ? (
                    <div className="mt-4 rounded-xl border border-border/70 bg-secondary/20 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Message</div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{item.message}</p>
                    </div>
                  ) : null}
                </div>

                <div className="lg:pl-4">
                  <Link
                    href={item.href}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
                  >
                    Open
                    <ExternalLink size={14} />
                  </Link>
                </div>
              </div>
            </article>
          )
        })}

        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white px-6 py-10 text-sm text-muted-foreground">
            No enquiries found for this tab yet.
          </div>
        ) : null}
      </div>}

      {selectedPromotionLead ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="promotion-lead-title"><div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-border px-6 py-5"><div><h2 id="promotion-lead-title" className="font-jakarta text-lg font-semibold text-foreground">Promotion lead</h2><p className="mt-1 text-sm text-muted-foreground">{selectedPromotionLead.email}</p></div><button type="button" onClick={() => setSelectedPromotionLead(null)} className="rounded-md border border-border p-2 text-muted-foreground hover:bg-secondary" aria-label="Close"><X size={16}/></button></div><dl className="divide-y divide-border px-6">{selectedPromotionLead.answers.map((answer) => <div key={answer.label} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,0.45fr)_1fr] sm:gap-5"><dt className="text-sm text-muted-foreground">{answer.label}</dt><dd className="break-words text-sm font-medium text-foreground">{answer.value || '—'}</dd></div>)}{selectedPromotionLead.answers.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No additional answers were submitted.</p> : null}<div className="grid gap-1 py-3 sm:grid-cols-[minmax(0,0.45fr)_1fr] sm:gap-5"><dt className="text-sm text-muted-foreground">Coupon</dt><dd className="text-sm font-medium text-foreground">{selectedPromotionLead.coupon_revealed ? `Revealed${selectedPromotionLead.revealed_at ? ` · ${new Date(selectedPromotionLead.revealed_at).toLocaleString()}` : ''}` : 'Not revealed'}</dd></div></dl><div className="flex justify-end border-t border-border px-6 py-4"><button type="button" onClick={() => setSelectedPromotionLead(null)} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Close</button></div></div></div> : null}
    </div>
  )
}
