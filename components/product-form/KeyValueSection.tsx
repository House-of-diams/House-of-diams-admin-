'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ProductKeyValue } from '@/lib/product-catalog'

const inputClassName =
  'w-full rounded border border-border bg-white px-4 py-2 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring'

const emptyRow = (): ProductKeyValue => ({ key: '', value: '' })

export function KeyValueSection({
  title,
  description,
  rows,
  onChange,
}: {
  title: string
  description: string
  rows: ProductKeyValue[]
  onChange: Dispatch<SetStateAction<ProductKeyValue[]>>
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-xs text-muted-foreground">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange((prev) => [...prev, emptyRow()])}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
        >
          <Plus size={14} />
          Add Row
        </button>
      </div>

      <div className="space-y-0">
        {rows.map((row, index) => (
          <div key={`${title}-${index}`} className={`grid grid-cols-1 gap-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] ${index < rows.length - 1 ? 'border-b border-border/40' : ''}`}>
            <input
              value={row.key}
              onChange={(event) => onChange((prev) => prev.map((entry, rowIndex) => (rowIndex === index ? { ...entry, key: event.target.value } : entry)))}
              placeholder="Label"
              className={inputClassName}
            />
            <input
              value={row.value}
              onChange={(event) => onChange((prev) => prev.map((entry, rowIndex) => (rowIndex === index ? { ...entry, value: event.target.value } : entry)))}
              placeholder="Value"
              className={inputClassName}
            />
            <button
              type="button"
              onClick={() => onChange((prev) => (prev.length > 1 ? prev.filter((_, rowIndex) => rowIndex !== index) : prev))}
              className="inline-flex items-center justify-center rounded-lg border border-transparent px-3 py-2 text-sm text-muted-foreground hover:border-border hover:bg-secondary"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
