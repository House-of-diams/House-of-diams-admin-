'use client'

import { catalogFetch } from '@/lib/catalog-transport'

import { useMemo, useState } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { slugify } from '@/lib/product-catalog'
import { catalogMasterDeleteBody, catalogMasterSaveBody } from '@/lib/catalog-master-client'

export type MaterialValueItem = {
  id: string
  _revision?: string
  name: string
  slug: string
  cta_mode?: 'both' | 'enquire_only' | 'checkout_only'
  cta_label?: string | null
  display_order: number
  status: 'active' | 'hidden'
}

export function MaterialValuesClient({ initialItems }: { initialItems: MaterialValueItem[] }) {
  const { toast } = useToast()
  const [items, setItems] = useState<MaterialValueItem[]>(initialItems)
  const [loading, setLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MaterialValueItem | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    cta_mode: 'both' as 'both' | 'enquire_only' | 'checkout_only',
    cta_label: '',
    display_order: 1,
    status: 'active' as 'active' | 'hidden',
  })

  const nextOrder = useMemo(() => (items.at(-1)?.display_order ?? items.length) + 1, [items])

  const loadItems = async () => {
    setLoading(true)
    try {

      const response = await catalogFetch('/api/catalog/material-values')
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.items) {
        toast({ title: 'Load failed', description: payload?.error ?? 'Unable to load material values.', variant: 'destructive' })
        return
      }
      setItems(payload.items)
    } finally {
      setLoading(false)
    }
  }

  const openNew = () => {
    setEditingId(null)
    setFormData({ name: '', slug: '', cta_mode: 'both', cta_label: '', display_order: nextOrder, status: 'active' })
    setIsDialogOpen(true)
  }

  const openEdit = (item: MaterialValueItem) => {
    setEditingId(item.id)
    setFormData({
      name: item.name,
      slug: item.slug,
      cta_mode: item.cta_mode || 'both',
      cta_label: item.cta_label || '',
      display_order: item.display_order,
      status: item.status,
    })
    setIsDialogOpen(true)
  }

  const saveItem = async () => {

    const response = await catalogFetch(editingId ? `/api/catalog/material-values/${editingId}` : '/api/catalog/material-values', {
      method: editingId ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: catalogMasterSaveBody({
        name: formData.name,
        slug: formData.slug,
        cta_mode: formData.cta_mode,
        cta_label: formData.cta_label || null,
        display_order: formData.display_order,
        status: formData.status,
      }, editingId ? items.find((item) => item.id === editingId)?._revision : null),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      toast({ title: 'Save failed', description: payload?.error ?? 'Unable to save material value.', variant: 'destructive' })
      return
    }

    await loadItems()
    setIsDialogOpen(false)
    setEditingId(null)
    toast({ title: 'Saved', description: 'Material values updated successfully.' })
  }

  const deleteItem = async (id: string) => {

    const revision = items.find((item) => item.id === id)?._revision
    if (!revision) return
    const response = await catalogFetch(`/api/catalog/material-values/${id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: catalogMasterDeleteBody(revision),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      toast({ title: 'Delete failed', description: payload?.error ?? 'Unable to delete material value.', variant: 'destructive' })
      return
    }

    await loadItems()
    setDeleteTarget(null)
    toast({ title: 'Deleted', description: 'Material value removed successfully.' })
  }

  return (
    <div className="p-8">
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Material Values</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage selectable stone and material values used in the product form.</p>
        </div>

        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">
          <Plus size={16} />
          Add New Value
        </button>
      </div>

      <div className="rounded-lg border border-border bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Value Name</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Slug</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Display Order</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Status</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Edit</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Delete</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border hover:bg-secondary/20">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">{item.name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{item.slug}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{item.display_order}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                      {item.status === 'active' ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button type="button" onClick={() => openEdit(item)} className="rounded p-1.5 hover:bg-secondary transition-colors">
                      <Edit2 size={14} className="text-muted-foreground" />
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <button type="button" onClick={() => setDeleteTarget(item)} className="rounded p-1.5 hover:bg-red-100 transition-colors">
                      <Trash2 size={14} className="text-red-600" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loading ? <div className="mt-8 text-sm text-muted-foreground">Updating material values...</div> : null}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Material Value' : 'Add New Material Value'}</DialogTitle>
            <DialogDescription>Manage the selectable master values shown in product Attributes.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Value Name</label>
              <input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value, slug: prev.slug === '' || prev.slug === slugify(prev.name) ? slugify(e.target.value) : prev.slug }))}
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Slug</label>
              <input value={formData.slug} onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">CTA Rule</label>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'both', label: 'Show Both' },
                  { value: 'enquire_only', label: 'Enquire Only' },
                  { value: 'checkout_only', label: 'Checkout Only' },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, cta_mode: option.value }))}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${formData.cta_mode === option.value ? 'bg-primary text-white' : 'border border-border text-foreground hover:bg-secondary'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Optional CTA Label</label>
              <input
                value={formData.cta_label}
                onChange={(e) => setFormData((prev) => ({ ...prev, cta_label: e.target.value }))}
                placeholder="Optional button label override"
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Display Order</label>
              <input type="number" value={formData.display_order} onChange={(e) => setFormData((prev) => ({ ...prev, display_order: Number(e.target.value) || 0 }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Status</label>
              <div className="flex flex-wrap gap-2">
                {(['active', 'hidden'] as const).map((status) => (
                  <button key={status} type="button" onClick={() => setFormData((prev) => ({ ...prev, status }))} className={`rounded-full px-4 py-2 text-sm font-semibold ${formData.status === status ? 'bg-primary text-white' : 'border border-border text-foreground hover:bg-secondary'}`}>
                    {status === 'active' ? 'Active' : 'Hidden'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => void saveItem()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">Save</button>
              <button type="button" onClick={() => setIsDialogOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">Cancel</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete material value?"
        description={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"?`}
        confirmText="Delete"
        type="delete"
        onConfirm={() => {
          if (!deleteTarget) return
          void deleteItem(deleteTarget.id)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
