'use client'

import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowLeft, Eye, Search } from 'lucide-react'
import { TablePagination } from '@/components/table-pagination'

export type BespokeSubmission = {
  id: string
  full_name: string
  email: string
  phone?: string | null
  country: string
  piece_type: string
  stone_preference?: string | null
  approx_carat?: string | null
  preferred_metal?: string | null
  message: string
  status: string
  created_at: string
}

const PAGE_SIZE = 20

export function BespokeSubmissionsClient({ initialItems }: { initialItems: BespokeSubmission[] }) {
  const [items, setItems] = useState<BespokeSubmission[]>(initialItems)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(
    initialItems.length ? `${initialItems.length} submission(s) found.` : 'No submissions found.'
  )
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  const visibleItems = useMemo(() => {
    return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  }, [items, page])

  const loadSubmissions = async (filters?: { from?: string; to?: string; q?: string }) => {
    setLoading(true)
    try {




      const params = new URLSearchParams()
      if (filters?.from) params.set('from', filters.from)
      if (filters?.to) params.set('to', filters.to)
      if (filters?.q) params.set('q', filters.q)
      const response = await cmsFetch(`/api/bespoke/submissions${params.size ? `?${params.toString()}` : ''}`, { headers: {  } })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setStatus(payload?.error ?? 'Unable to load submissions. Existing results were kept.')
        return
      }

      const nextItems = Array.isArray(payload?.items) ? payload.items : []
      setItems(nextItems)
      setPage(1)
      setStatus(nextItems.length ? `${nextItems.length} submission(s) found.` : 'No submissions found for the selected filter.')
    } catch {
      setStatus('Unable to reach the server. Existing results were kept.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link href="/dashboard/bespoke" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
          <ArrowLeft size={16} />
          Back to Bespoke
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Bespoke Submissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Filter enquiries and open any submission directly.</p>
        <p className="mt-2 text-xs text-muted-foreground">{loading ? 'Updating submissions...' : status}</p>
      </div>

      <div className="mb-6 grid gap-4 rounded-lg border border-border bg-white p-5 shadow-xs md:grid-cols-[1fr_1fr_1.2fr_auto]">
        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">From Date</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClassName} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">To Date</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputClassName} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, country, piece..." className={inputClassName} />
        </div>
        <div className="flex items-end gap-3">
          <button
            type="button"
            onClick={() => void loadSubmissions({ from: fromDate, to: toDate, q: search.trim() })}
            disabled={loading}
            className={primaryButtonClassName}
          >
            <Search size={14} />
            Apply
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setFromDate('')
              setToDate('')
              setSearch('')
              void loadSubmissions()
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white shadow-xs">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Name</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Email</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Piece</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Country</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Date</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-b-0">
                <td className="px-5 py-4 text-sm">
                  <div className="font-medium text-foreground">{item.full_name}</div>
                  <div className="text-xs text-muted-foreground">{item.phone || 'No phone'}</div>
                </td>
                <td className="px-5 py-4 text-sm">{item.email}</td>
                <td className="px-5 py-4 text-sm">{item.piece_type}</td>
                <td className="px-5 py-4 text-sm">{item.country}</td>
                <td className="px-5 py-4 text-sm">
                  <div>{new Date(item.created_at).toLocaleDateString()}</div>
                  <div className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleTimeString()}</div>
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/dashboard/bespoke/submissions/${item.id}`}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                  >
                    <Eye size={14} />
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-sm text-muted-foreground">
                  No bespoke enquiries found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePagination page={page} totalItems={items.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  )
}

const inputClassName = 'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm'
const primaryButtonClassName = 'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90'
