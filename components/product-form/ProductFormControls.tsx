'use client'

import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function FormField({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}

export function TagList({ items, onRemove }: { items: string[]; onRemove: (value: string) => void }) {
  if (items.length === 0) return null

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <div key={item} className="inline-flex items-center gap-2 rounded bg-secondary px-3 py-1 text-sm">
          <span>{item}</span>
          <button type="button" onClick={() => onRemove(item)} className="hover:text-destructive">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function PillToggle({
  value,
  onChange,
  onLabel,
  offLabel,
}: {
  value: boolean
  onChange: (next: boolean) => void
  onLabel: string
  offLabel: string
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-white p-1">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${value ? 'bg-foreground text-white' : 'text-muted-foreground hover:bg-secondary'}`}
      >
        {onLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${!value ? 'bg-foreground text-white' : 'text-muted-foreground hover:bg-secondary'}`}
      >
        {offLabel}
      </button>
    </div>
  )
}

export function TogglePillGroup({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string
  items: { id: string; label: string }[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div>
      <label className="mb-3 block text-sm font-semibold text-foreground">{label}</label>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            className={`rounded px-3 py-2 text-sm font-medium transition-colors ${selected.includes(item.id) ? 'bg-primary text-white' : 'border border-border hover:bg-secondary'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
