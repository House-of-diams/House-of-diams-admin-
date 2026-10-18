'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import { PillToggle } from './ProductFormControls'
import type { ProductCustomDropdown } from '@/lib/product-custom-dropdowns'

const inputClass = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring'
const uuid = () => crypto.randomUUID()

export function ProductCustomDropdownEditor({ enabled, onEnabledChange, groups, onChange }: { enabled: boolean; onEnabledChange: (value: boolean) => void; groups: ProductCustomDropdown[]; onChange: (groups: ProductCustomDropdown[]) => void }) {
  const [draggingOption, setDraggingOption] = useState<{ groupIndex: number; optionIndex: number } | null>(null)
  const addGroup = () => onChange([...groups, { id: uuid(), name: '', label: '', is_enabled: true, is_required: false, display_order: groups.length, options: [{ id: uuid(), label: '', value: '', is_enabled: true, display_order: 0 }] }])
  const updateGroup = (index: number, patch: Partial<ProductCustomDropdown>) => onChange(groups.map((group, i) => i === index ? { ...group, ...patch } : group))
  const move = (index: number, offset: number) => { const next = [...groups]; const target = index + offset; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next) }
  const moveOption = (groupIndex: number, optionIndex: number, targetIndex: number) => {
    const options = [...groups[groupIndex].options]
    if (targetIndex < 0 || targetIndex >= options.length || targetIndex === optionIndex) return
    const [option] = options.splice(optionIndex, 1)
    options.splice(targetIndex, 0, option)
    updateGroup(groupIndex, { options })
  }

  return <div className="rounded-lg border border-border bg-secondary/10 p-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-semibold">Custom Product Dropdowns</p><p className="mt-2 text-xs text-muted-foreground">Create product-specific choices shown as dropdowns on the product page.</p></div>
      <PillToggle value={enabled} onChange={onEnabledChange} onLabel="Enabled" offLabel="Disabled" />
    </div>
    {enabled ? <div className="mt-5 space-y-4">
      {groups.length ? groups.map((group, groupIndex) => <div key={group.id} className="rounded-md border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm font-semibold">Dropdown {groupIndex + 1}</p><div className="flex gap-1">
          <button type="button" aria-label="Move up" onClick={() => move(groupIndex, -1)} disabled={!groupIndex} className="rounded border p-2 disabled:opacity-30"><ArrowUp size={14}/></button>
          <button type="button" aria-label="Move down" onClick={() => move(groupIndex, 1)} disabled={groupIndex === groups.length - 1} className="rounded border p-2 disabled:opacity-30"><ArrowDown size={14}/></button>
          <button type="button" aria-label="Remove dropdown" onClick={() => onChange(groups.filter((_, i) => i !== groupIndex))} className="rounded border p-2 text-destructive"><Trash2 size={14}/></button>
        </div></div>
        <label className="block text-xs font-medium">Customer label<input className={`${inputClass} mt-1`} value={group.label} onChange={(e) => updateGroup(groupIndex, { label: e.target.value })} placeholder="e.g. Select chain style" /><span className="mt-1.5 block font-normal text-muted-foreground">The question customers will see on the product page.</span></label>
        <div className="mt-3 flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={group.is_enabled} onChange={(e) => updateGroup(groupIndex, { is_enabled: e.target.checked })}/> Enabled</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={group.is_required} onChange={(e) => updateGroup(groupIndex, { is_required: e.target.checked })}/> Required</label></div>
        <div className="mt-4 space-y-3">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer options</p><p className="mt-1 text-xs text-muted-foreground">Add the answers customers can choose from.</p></div>
          <div className="flex flex-wrap items-stretch gap-2">
            {group.options.map((option, optionIndex) => <div
              key={option.id}
              onDragOver={(event) => { if (draggingOption?.groupIndex === groupIndex) event.preventDefault() }}
              onDrop={(event) => { event.preventDefault(); if (draggingOption?.groupIndex === groupIndex) moveOption(groupIndex, draggingOption.optionIndex, optionIndex); setDraggingOption(null) }}
              className={`flex min-w-0 basis-full items-center gap-1.5 rounded-xl border bg-secondary/30 p-1.5 shadow-sm transition-all sm:basis-auto ${draggingOption?.groupIndex === groupIndex && draggingOption.optionIndex === optionIndex ? 'border-ring opacity-50 ring-2 ring-ring' : option.is_enabled ? 'border-border hover:border-foreground/25' : 'border-dashed border-border/70 opacity-60'}`}
            >
              <button
                type="button"
                draggable
                aria-label={`Reorder option ${optionIndex + 1}. Use up and down arrow keys, or drag.`}
                aria-describedby={`option-reorder-instructions-${group.id}`}
                className="inline-flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', option.id); setDraggingOption({ groupIndex, optionIndex }) }}
                onDragEnd={() => setDraggingOption(null)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                  event.preventDefault()
                  moveOption(groupIndex, optionIndex, optionIndex + (event.key === 'ArrowUp' ? -1 : 1))
                }}
              ><GripVertical size={16}/></button>
              {optionIndex === 0 ? <span id={`option-reorder-instructions-${group.id}`} className="sr-only">Drag to reorder. When using a keyboard, press the up or down arrow key to move this option.</span> : null}
              <input aria-label={`Customer option ${optionIndex + 1} label`} className="h-9 min-w-0 flex-1 rounded-lg border-0 bg-background px-3 text-sm font-medium text-foreground outline-none ring-1 ring-inset ring-border placeholder:font-normal placeholder:text-muted-foreground focus:ring-2 focus:ring-ring sm:w-44" value={option.label} onChange={(e) => updateGroup(groupIndex, { options: group.options.map((row, i) => i === optionIndex ? { ...row, label: e.target.value } : row) })} placeholder="Option label"/>
              <button
                type="button"
                role="switch"
                aria-checked={option.is_enabled}
                aria-label={`Enable option ${optionIndex + 1}`}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${option.is_enabled ? 'bg-primary' : 'bg-muted-foreground/35'}`}
                onClick={() => updateGroup(groupIndex, { options: group.options.map((row, i) => i === optionIndex ? { ...row, is_enabled: !row.is_enabled } : row) })}
              ><span aria-hidden="true" className={`block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform ${option.is_enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}/></button>
              <div className="flex border-l border-border/70 pl-1.5">
                <button type="button" aria-label={`Remove option ${optionIndex + 1}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => updateGroup(groupIndex, { options: group.options.filter((_, i) => i !== optionIndex) })}><Trash2 size={14}/></button>
              </div>
            </div>)}
            <button type="button" className="inline-flex min-h-12 basis-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-secondary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:basis-auto" onClick={() => updateGroup(groupIndex, { options: [...group.options, { id: uuid(), label: '', value: '', is_enabled: true, display_order: group.options.length }] })}><Plus size={14}/> Add option</button>
          </div>
        </div>
      </div>) : <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">No dropdowns yet. Add one to create a customer-selectable product option.</div>}
      <button type="button" onClick={addGroup} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold"><Plus size={15}/> Add dropdown</button>
    </div> : null}
  </div>
}
