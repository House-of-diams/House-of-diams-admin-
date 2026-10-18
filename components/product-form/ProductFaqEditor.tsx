'use client'

import { useMemo, useState } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { TablePagination } from '@/components/table-pagination'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ProductFaqItem } from '@/lib/product-catalog'

const FAQ_PAGE_SIZE = 5
const inputClassName =
  'w-full rounded border border-border bg-white px-4 py-2 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring'

const emptyFaqItem = (): ProductFaqItem => ({
  question: '',
  answer: '',
  sort_order: 1,
  is_active: true,
  source: 'admin',
})

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}

export function ProductFaqEditor({
  items,
  onChange,
  onValidationError,
}: {
  items: ProductFaqItem[]
  onChange: (items: ProductFaqItem[]) => void
  onValidationError: (message: string) => void
}) {
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<ProductFaqItem>(() => emptyFaqItem())

  const totalPages = Math.max(1, Math.ceil(items.length / FAQ_PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const paginatedItems = useMemo(
    () => items.slice((safePage - 1) * FAQ_PAGE_SIZE, safePage * FAQ_PAGE_SIZE),
    [items, safePage]
  )

  const openDialog = (index: number | null = null) => {
    setEditingIndex(index)
    setDraft(index === null ? emptyFaqItem() : { ...items[index] })
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingIndex(null)
    setDraft(emptyFaqItem())
  }

  const saveDraft = () => {
    const question = draft.question.trim()
    const answer = draft.answer.trim()

    if (!question || !answer) {
      onValidationError('Please enter both a question and an answer before adding it.')
      return
    }

    if (editingIndex === null) {
      const nextItems = [
        ...items,
        {
          ...draft,
          question,
          answer,
          sort_order: items.length + 1,
          is_active: draft.is_active !== false,
          source: draft.source || 'admin',
        },
      ]
      onChange(nextItems)
      setPage(Math.max(1, Math.ceil(nextItems.length / FAQ_PAGE_SIZE)))
    } else {
      onChange(
        items.map((item, index) =>
          index === editingIndex
            ? {
                ...item,
                ...draft,
                question,
                answer,
                sort_order: item.sort_order ?? index + 1,
                is_active: draft.is_active !== false,
                source: draft.source || item.source || 'admin',
              }
            : item
        )
      )
    }

    closeDialog()
  }

  return (
    <>
      <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Product FAQs</h2>
            <p className="mt-2 text-xs text-muted-foreground">Add product-specific questions that appear on this product detail page only.</p>
          </div>
          <button
            type="button"
            onClick={() => openDialog()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
          >
            <Plus size={14} />
            Add FAQ
          </button>
        </div>

        <div className="space-y-4">
          {items.length < 1 ? (
            <div className="rounded-lg border border-dashed border-border bg-secondary/10 px-4 py-6 text-sm text-muted-foreground">
              No product FAQs added yet.
            </div>
          ) : null}

          {paginatedItems.map((item, visibleIndex) => {
            const index = (safePage - 1) * FAQ_PAGE_SIZE + visibleIndex

            return (
              <div key={item.id ?? `faq-${index}`} className="rounded-lg border border-border bg-secondary/10 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">FAQ {index + 1}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.is_active === false ? 'bg-muted text-muted-foreground' : 'bg-emerald-50 text-emerald-700'}`}>
                        {item.is_active === false ? 'Inactive' : 'Active'}
                      </span>
                    </div>
                    <p className="truncate text-sm font-semibold text-foreground">{item.question || 'Untitled question'}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.answer || 'No answer added yet.'}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <input
                        type="checkbox"
                        checked={item.is_active !== false}
                        onChange={(event) =>
                          onChange(items.map((entry, entryIndex) => (entryIndex === index ? { ...entry, is_active: event.target.checked } : entry)))
                        }
                        className="rounded border-border"
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      onClick={() => openDialog(index)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
                    >
                      <Edit2 size={14} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange(items.filter((_, entryIndex) => entryIndex !== index))}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {items.length > FAQ_PAGE_SIZE ? (
            <TablePagination page={safePage} totalItems={items.length} pageSize={FAQ_PAGE_SIZE} onPageChange={setPage} />
          ) : null}
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-jakarta text-lg font-semibold text-foreground">
              {editingIndex === null ? 'Add Product FAQ' : 'Edit Product FAQ'}
            </DialogTitle>
            <DialogDescription>
              Add a product-specific question and answer. It will show only on this product detail page.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <FormField label="Question">
              <input
                value={draft.question}
                onChange={(event) => setDraft((prev) => ({ ...prev, question: event.target.value }))}
                className={inputClassName}
                placeholder="Can this product be customized?"
              />
            </FormField>
            <FormField label="Answer">
              <textarea
                value={draft.answer}
                onChange={(event) => setDraft((prev) => ({ ...prev, answer: event.target.value }))}
                rows={5}
                className={inputClassName}
                placeholder="Yes, our team can help with metal, size, and stone preferences."
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={draft.is_active !== false}
                onChange={(event) => setDraft((prev) => ({ ...prev, is_active: event.target.checked }))}
                className="rounded border-border"
              />
              Active
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={closeDialog}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveDraft}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/90"
            >
              {editingIndex === null ? 'Add FAQ' : 'Save FAQ'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
