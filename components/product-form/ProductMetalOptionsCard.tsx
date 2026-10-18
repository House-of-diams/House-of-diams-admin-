'use client'

import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { ProductMetalVariant } from '@/lib/product-catalog'
import type { CatalogMetal } from '@/lib/product-catalog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buildCombinedMetalDisplayLabel } from '@/lib/product-metal-variants'

export function ProductMetalOptionsCard({
  metalVariants,
  combinedMetalOptions,
  setMetalVariants,
  getMetalVariantLabel,
  selectedMetalIds,
  onMetalAdd,
  onMetalRemove,
  onMetalReplace,
  inputClassName,
}: {
  metalVariants: ProductMetalVariant[]
  combinedMetalOptions: CatalogMetal[]
  setMetalVariants: Dispatch<SetStateAction<ProductMetalVariant[]>>
  getMetalVariantLabel: (metalId: string) => string
  selectedMetalIds: string[]
  onMetalAdd: (metalId: string) => void
  onMetalRemove: (metalId: string) => void
  onMetalReplace: (oldMetalId: string, newMetalId: string) => void
  inputClassName: string
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draftMetalId, setDraftMetalId] = useState('')
  const [draftPrice, setDraftPrice] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const openEdit = (index: number) => {
    const entry = metalVariants[index]
    if (!entry) return
    setEditingIndex(index)
    setDraftMetalId(entry.metal_id)
    setDraftPrice(String(entry.price ?? ''))
  }

  const closeEdit = () => setEditingIndex(null)

  const saveEdit = () => {
    if (editingIndex === null) return
    const nextPrice = Number(draftPrice)
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) return
    const current = metalVariants[editingIndex]
    if (!current || (draftMetalId !== current.metal_id && metalVariants.some((row, index) => index !== editingIndex && row.metal_id === draftMetalId))) return
    setMetalVariants((prev) => prev.map((row, index) =>
      index === editingIndex ? { ...row, metal_id: draftMetalId, price: nextPrice } : row
    ))
    if (current.metal_id !== draftMetalId) onMetalReplace(current.metal_id, draftMetalId)
    closeEdit()
  }

  const removeEntry = (index: number) => {
    setMetalVariants((prev) => {
      const removed = prev[index]
      const next = prev.filter((_, rowIndex) => rowIndex !== index)
      if (removed?.is_default && next[0]) {
        return next.map((row, rowIndex) => ({ ...row, is_default: rowIndex === 0 }))
      }
      return next
    })
    if (metalVariants[index]) onMetalRemove(metalVariants[index].metal_id)
  }

  const setDefault = (index: number) => {
    setMetalVariants((prev) => prev.map((entry, rowIndex) => ({ ...entry, is_default: rowIndex === index })))
  }

  return (
    <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Metal Options</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Each selected metal option gets its own price. Mark one as default and that option will control the storefront price first.
          </p>
        </div>
        <button type="button" onClick={() => setAddDialogOpen(true)} className="shrink-0 rounded-md bg-foreground px-4 py-2 text-xs font-semibold text-background hover:opacity-90">
          Add metal
        </button>
      </div>
      {metalVariants.length > 0 ? (
        <div className="mt-5 overflow-hidden rounded-lg border border-border">
          <div className="hidden grid-cols-[minmax(0,1fr)_160px_130px_170px] gap-4 bg-secondary/30 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground md:grid">
            <span>Metal</span><span>Price</span><span>Storefront</span><span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-border">
            {metalVariants.map((entry, index) => {
              return (
                <div key={`${entry.metal_id}-${index}`} className="grid grid-cols-1 gap-3 bg-white px-4 py-4 md:grid-cols-[minmax(0,1fr)_160px_130px_170px] md:items-center md:gap-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{getMetalVariantLabel(entry.metal_id)}</p>
                    <p className="mt-1 text-xs text-muted-foreground md:hidden">Metal pricing option</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{entry.price > 0 ? `$${Number(entry.price).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}</p>
                  <button type="button" onClick={() => setDefault(index)} className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold transition ${entry.is_default ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-secondary'}`}>
                    {entry.is_default ? 'Default' : 'Set as default'}
                  </button>
                  <div className="flex items-center gap-2 md:justify-end">
                    <button type="button" onClick={() => openEdit(index)} className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary">Edit</button>
                    <button type="button" onClick={() => removeEntry(index)} className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          Select at least one combined metal option above first.
        </div>
      )}

      <Dialog open={editingIndex !== null} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit metal pricing</DialogTitle>
            <DialogDescription>Update the selected metal and its selling price.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Metal
              <select value={draftMetalId} onChange={(event) => setDraftMetalId(event.target.value)} className={inputClassName}>
                {metalVariants.map((entry) => <option key={entry.metal_id} value={entry.metal_id}>{getMetalVariantLabel(entry.metal_id)}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Price
              <input type="number" min="1" step="0.01" value={draftPrice} onChange={(event) => setDraftPrice(event.target.value)} className={inputClassName} />
            </label>
          </div>
          <DialogFooter>
            <button type="button" onClick={closeEdit} className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
            <button type="button" onClick={saveEdit} className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background">Save changes</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add metal pricing</DialogTitle>
            <DialogDescription>Select a metal to add it to the pricing table. Set its dollar price using Edit afterward.</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto py-2">
            {combinedMetalOptions.filter((metal) => !selectedMetalIds.includes(metal.id)).map((metal) => (
              <button key={metal.id} type="button" onClick={() => { onMetalAdd(metal.id); setAddDialogOpen(false) }} className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-secondary">
                <span>{buildCombinedMetalDisplayLabel(metal)}</span>
                <span className="text-xs font-medium text-muted-foreground">Add</span>
              </button>
            ))}
            {!combinedMetalOptions.some((metal) => !selectedMetalIds.includes(metal.id)) ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">All available metals are already selected.</p>
            ) : null}
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setAddDialogOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Close</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
