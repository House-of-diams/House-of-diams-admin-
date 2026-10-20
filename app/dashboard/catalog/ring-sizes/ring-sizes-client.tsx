'use client'

import { catalogFetch } from '@/lib/catalog-transport'
import { useEditGuard } from '@/hooks/use-unsaved-changes'

import { useMemo, useState } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { slugify } from '@/lib/product-catalog'
import { catalogRingSaveBody } from '@/lib/catalog-ring-client'

export type RingCategory = {
  id: string
  _revision?: string
  name: string
  slug: string
  description?: string | null
  display_order: number
  status: 'active' | 'hidden'
}

export type RingCategorySize = {
  id: string
  _revision?: string
  ring_category_id: string
  size_label: string
  size_value?: string | null
  display_order: number
  status: 'active' | 'hidden'
}

export function RingSizesClient({
  initialCategories,
  initialSizes,
  initialRevision,
}: {
  initialCategories: RingCategory[]
  initialSizes: RingCategorySize[]
  initialRevision: string
}) {
  const { toast } = useToast()
  const [categories, setCategories] = useState<RingCategory[]>(initialCategories)
  const [sizes, setSizes] = useState<RingCategorySize[]>(initialSizes)
  const [revision, setRevision] = useState(initialRevision)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [sizeDialogOpen, setSizeDialogOpen] = useState(false)
  // HOD-056: warn before leaving with unsaved edits.
  const edits = useEditGuard(categoryDialogOpen || sizeDialogOpen)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingSizeId, setEditingSizeId] = useState<string | null>(null)
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<RingCategory | null>(null)
  const [deleteSizeTarget, setDeleteSizeTarget] = useState<RingCategorySize | null>(null)
  const [categoryForm, setCategoryForm] = useState({ name: '', slug: '', description: '', display_order: 1, status: 'active' as 'active' | 'hidden' })
  const [sizeForm, setSizeForm] = useState({ ring_category_id: '', size_label: '', size_value: '', display_order: 1, status: 'active' as 'active' | 'hidden' })

  const nextCategoryOrder = useMemo(() => (categories.at(-1)?.display_order ?? categories.length) + 1, [categories])
  const nextSizeOrder = useMemo(() => (sizes.at(-1)?.display_order ?? sizes.length) + 1, [sizes])

  const saveSnapshot = async (nextCategories: RingCategory[], nextSizes: RingCategorySize[], deletedCategoryIds: string[] = [], deletedSizeIds: string[] = []) => {

    const response = await catalogFetch('/api/catalog/ring-catalog', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: catalogRingSaveBody(nextCategories, nextSizes, revision, deletedCategoryIds, deletedSizeIds) })
    const payload = await response.json().catch(() => null)
    if (!response.ok) { toast({ title: 'Save failed', description: payload?.error ?? 'Unable to save ring catalog.', variant: 'destructive' }); return false }
    setCategories(payload.categories ?? [])
    setSizes(payload.sizes ?? [])
    setRevision(payload.revision ?? revision)
    return true
  }

  const openNewCategory = () => {
    setEditingCategoryId(null)
    setCategoryForm({ name: '', slug: '', description: '', display_order: nextCategoryOrder, status: 'active' })
    setCategoryDialogOpen(true)
  }

  const openEditCategory = (item: RingCategory) => {
    setEditingCategoryId(item.id)
    setCategoryForm({
      name: item.name,
      slug: item.slug,
      description: item.description ?? '',
      display_order: item.display_order,
      status: item.status,
    })
    setCategoryDialogOpen(true)
  }

  const openNewSize = (ringCategoryId?: string) => {
    setEditingSizeId(null)
    setSizeForm({ ring_category_id: ringCategoryId ?? categories[0]?.id ?? '', size_label: '', size_value: '', display_order: nextSizeOrder, status: 'active' })
    setSizeDialogOpen(true)
  }

  const openEditSize = (item: RingCategorySize) => {
    setEditingSizeId(item.id)
    setSizeForm({
      ring_category_id: item.ring_category_id,
      size_label: item.size_label,
      size_value: item.size_value ?? '',
      display_order: item.display_order,
      status: item.status,
    })
    setSizeDialogOpen(true)
  }

  const saveCategory = async () => {
    const next = editingCategoryId
      ? categories.map((item) => item.id === editingCategoryId ? { ...item, ...categoryForm } : item)
      : [...categories, categoryForm]
    if (!await saveSnapshot(next as RingCategory[], sizes)) return
    setCategoryDialogOpen(false)
    setEditingCategoryId(null)
    toast({ title: 'Saved', description: 'Ring category updated successfully.' })
  }

  const saveSize = async () => {
    const next = editingSizeId
      ? sizes.map((item) => item.id === editingSizeId ? { ...item, ...sizeForm } : item)
      : [...sizes, sizeForm]
    if (!await saveSnapshot(categories, next as RingCategorySize[])) return
    setSizeDialogOpen(false)
    setEditingSizeId(null)
    toast({ title: 'Saved', description: 'Ring category size updated successfully.' })
  }

  const deleteCategory = async (id: string) => {
    if (!await saveSnapshot(categories.filter((item) => item.id !== id), sizes, [id])) return
    setDeleteCategoryTarget(null)
    toast({ title: 'Deleted', description: 'Ring category removed successfully.' })
  }

  const deleteSize = async (id: string) => {
    if (!await saveSnapshot(categories, sizes.filter((item) => item.id !== id), [], [id])) return
    setDeleteSizeTarget(null)
    toast({ title: 'Deleted', description: 'Ring category size removed successfully.' })
  }

  const sizesByCategory = (ringCategoryId: string) => sizes.filter((item) => item.ring_category_id === ringCategoryId).sort((a, b) => a.display_order - b.display_order)

  return (
    <div {...edits.bind} className="p-8">
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Ring Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage separate ring categories and the sizes inside each one.</p>
        </div>
        <button onClick={openNewCategory} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">
          <Plus size={16} />
          Add Ring Category
        </button>
      </div>

      <div className="space-y-6">
        {categories.map((category) => (
          <section key={category.id} className="rounded-lg border border-border bg-white p-6 shadow-xs">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="font-jakarta text-lg font-semibold text-foreground">{category.name}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${category.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-secondary text-foreground'}`}>
                    {category.status === 'active' ? 'Active' : 'Hidden'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{category.description || category.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => openNewSize(category.id)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
                  <Plus size={14} />
                  Add Size
                </button>
                <button type="button" onClick={() => openEditCategory(category)} className="rounded p-1.5 hover:bg-secondary">
                  <Edit2 size={14} className="text-muted-foreground" />
                </button>
                <button type="button" onClick={() => setDeleteCategoryTarget(category)} className="rounded p-1.5 hover:bg-red-100">
                  <Trash2 size={14} className="text-red-600" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {sizesByCategory(category.id).map((item) => (
                <div key={item.id} className="rounded-2xl border border-border p-3">
                  <div className={`rounded-full px-4 py-3 text-center text-sm font-semibold ${item.status === 'active' ? 'bg-foreground text-white' : 'bg-secondary text-foreground'}`}>{item.size_label}</div>
                  <div className="mt-2 text-center text-xs text-muted-foreground">{item.size_value || 'No value'}</div>
                  <div className="mt-3 flex items-center justify-between">
                    <button type="button" onClick={() => openEditSize(item)} className="rounded p-1.5 hover:bg-secondary transition-colors">
                      <Edit2 size={14} className="text-muted-foreground" />
                    </button>
                    <button type="button" onClick={() => setDeleteSizeTarget(item)} className="rounded p-1.5 hover:bg-red-100 transition-colors">
                      <Trash2 size={14} className="text-red-600" />
                    </button>
                  </div>
                </div>
              ))}
              {sizesByCategory(category.id).length === 0 ? <p className="text-sm text-muted-foreground">No sizes added yet.</p> : null}
            </div>
          </section>
        ))}
        {categories.length === 0 ? <div className="rounded-lg border border-border bg-white p-6 text-sm text-muted-foreground">No ring categories added yet.</div> : null}
      </div>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingCategoryId ? 'Edit Ring Category' : 'Add Ring Category'}</DialogTitle>
            <DialogDescription>Manage the separate ring category used by products and the frontend selector.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Name</label>
              <input value={categoryForm.name} onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value, slug: prev.slug === '' || prev.slug === slugify(prev.name) ? slugify(e.target.value) : prev.slug }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Slug</label>
              <input value={categoryForm.slug} onChange={(e) => setCategoryForm((prev) => ({ ...prev, slug: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Description</label>
              <textarea value={categoryForm.description} onChange={(e) => setCategoryForm((prev) => ({ ...prev, description: e.target.value }))} rows={3} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Display Order</label>
              <input type="number" value={categoryForm.display_order} onChange={(e) => setCategoryForm((prev) => ({ ...prev, display_order: Number(e.target.value) || 0 }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div className="flex gap-2">
              {(['active', 'hidden'] as const).map((status) => (
                <button key={status} type="button" onClick={() => setCategoryForm((prev) => ({ ...prev, status }))} className={`rounded-full px-4 py-2 text-sm font-semibold ${categoryForm.status === status ? 'bg-primary text-white' : 'border border-border text-foreground hover:bg-secondary'}`}>
                  {status === 'active' ? 'Active' : 'Hidden'}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => void saveCategory()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">Save</button>
              <button type="button" onClick={() => setCategoryDialogOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">Cancel</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sizeDialogOpen} onOpenChange={setSizeDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingSizeId ? 'Edit Ring Category Size' : 'Add Ring Category Size'}</DialogTitle>
            <DialogDescription>Manage the size buttons available inside a ring category.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Ring Category</label>
              <Select value={sizeForm.ring_category_id} onValueChange={(value) => setSizeForm((prev) => ({ ...prev, ring_category_id: value }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select ring category" /></SelectTrigger>
                <SelectContent>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Size Label</label>
              <input value={sizeForm.size_label} onChange={(e) => setSizeForm((prev) => ({ ...prev, size_label: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Size Value</label>
              <input value={sizeForm.size_value} onChange={(e) => setSizeForm((prev) => ({ ...prev, size_value: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Display Order</label>
              <input type="number" value={sizeForm.display_order} onChange={(e) => setSizeForm((prev) => ({ ...prev, display_order: Number(e.target.value) || 0 }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div className="flex gap-2">
              {(['active', 'hidden'] as const).map((status) => (
                <button key={status} type="button" onClick={() => setSizeForm((prev) => ({ ...prev, status }))} className={`rounded-full px-4 py-2 text-sm font-semibold ${sizeForm.status === status ? 'bg-primary text-white' : 'border border-border text-foreground hover:bg-secondary'}`}>
                  {status === 'active' ? 'Active' : 'Hidden'}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => void saveSize()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">Save</button>
              <button type="button" onClick={() => setSizeDialogOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">Cancel</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog isOpen={Boolean(deleteCategoryTarget)} title="Delete ring category?" description={`Are you sure you want to delete "${deleteCategoryTarget?.name ?? ''}"?`} confirmText="Delete" type="delete" onConfirm={() => { if (!deleteCategoryTarget) return; void deleteCategory(deleteCategoryTarget.id) }} onCancel={() => setDeleteCategoryTarget(null)} />
      <ConfirmDialog isOpen={Boolean(deleteSizeTarget)} title="Delete ring size?" description={`Are you sure you want to delete "${deleteSizeTarget?.size_label ?? ''}"?`} confirmText="Delete" type="delete" onConfirm={() => { if (!deleteSizeTarget) return; void deleteSize(deleteSizeTarget.id) }} onCancel={() => setDeleteSizeTarget(null)} />
    </div>
  )
}
