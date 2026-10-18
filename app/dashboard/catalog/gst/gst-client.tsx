'use client'

import { catalogFetch } from '@/lib/catalog-transport'

import { useMemo, useState } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CatalogGstSlab } from '@/lib/product-catalog'
import { catalogMasterDeleteBody, catalogMasterSaveBody } from '@/lib/catalog-master-client'

async function authedFetch(url: string, options: RequestInit = {}) {
  return catalogFetch(url, options)
}

type GstFormState = {
  name: string
  code: string
  percentage: string
  description: string
  display_order: string
  status: 'active' | 'hidden'
}

const EMPTY_FORM: GstFormState = {
  name: '',
  code: '',
  percentage: '0',
  description: '',
  display_order: '0',
  status: 'active',
}

export function GstClient({ initialItems }: { initialItems: CatalogGstSlab[] }) {
  const [items, setItems] = useState<CatalogGstSlab[]>(initialItems)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<GstFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  const nextDisplayOrder = useMemo(() => String((items.at(-1)?.display_order ?? items.length) + 1), [items])

  async function loadItems() {
    setLoading(true)
    try {
      const response = await authedFetch('/api/catalog/gst-slabs')
      const payload = await response.json().catch(() => null)
      if (response.ok) setItems(payload?.items ?? [])
    } finally {
      setLoading(false)
    }
  }

  function openNew() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, display_order: nextDisplayOrder })
    setIsDialogOpen(true)
  }

  function openEdit(item: CatalogGstSlab) {
    setEditingId(item.id)
    setForm({
      name: item.name,
      code: item.code,
      percentage: String(item.percentage ?? 0),
      description: item.description ?? '',
      display_order: String(item.display_order ?? 0),
      status: item.status === 'hidden' ? 'hidden' : 'active',
    })
    setIsDialogOpen(true)
  }

  async function saveItem() {
    if (!form.name.trim() || !form.code.trim()) return
    setSaving(true)
    try {
      const response = await authedFetch(editingId ? `/api/catalog/gst-slabs/${editingId}` : '/api/catalog/gst-slabs', {
        method: editingId ? 'PATCH' : 'POST',
        body: catalogMasterSaveBody({
          name: form.name,
          code: form.code,
          percentage: Number(form.percentage || 0),
          description: form.description || null,
          display_order: Number(form.display_order || 0),
          status: form.status,
        }, editingId ? items.find((item) => item.id === editingId)?._revision : null),
      })

      if (response.ok) {
        await loadItems()
        setIsDialogOpen(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function deleteItem(id: string) {
    const revision = items.find((item) => item.id === id)?._revision
    if (!revision) return
    const response = await authedFetch(`/api/catalog/gst-slabs/${id}`, { method: 'DELETE', body: catalogMasterDeleteBody(revision) })
    if (response.ok) await loadItems()
  }

  return (
    <div className="p-8">
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">GST</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage tax slabs and assign them on product create/edit.</p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
        >
          <Plus size={16} />
          Add GST Slab
        </button>
      </div>

      <div className="rounded-lg border border-border bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Name</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Code</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Percentage</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Status</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Edit</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Delete</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border hover:bg-secondary/20">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">{item.name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{item.code}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{item.percentage}%</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.status === 'hidden' ? 'bg-slate-100 text-slate-600' : 'bg-green-100 text-green-700'}`}>
                      {item.status === 'hidden' ? 'Hidden' : 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button type="button" onClick={() => openEdit(item)} className="rounded p-1.5 hover:bg-secondary transition-colors">
                      <Edit2 size={14} className="text-muted-foreground" />
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <button type="button" onClick={() => void deleteItem(item.id)} className="rounded p-1.5 hover:bg-red-100 transition-colors">
                      <Trash2 size={14} className="text-red-600" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 text-sm text-muted-foreground">Updating GST slabs...</div>
      ) : null}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit GST Slab' : 'Add GST Slab'}</DialogTitle>
            <DialogDescription>Create reusable tax slabs for product pricing and checkout totals.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Name</label>
              <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Code</label>
              <input value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Percentage</label>
              <input type="number" min="0" max="100" step="0.01" value={form.percentage} onChange={(e) => setForm((prev) => ({ ...prev, percentage: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Display Order</label>
              <input type="number" min="0" value={form.display_order} onChange={(e) => setForm((prev) => ({ ...prev, display_order: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-foreground">Description</label>
              <textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} rows={3} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-foreground">Status</label>
              <div className="inline-flex rounded-full border border-border bg-white p-1">
                <button type="button" onClick={() => setForm((prev) => ({ ...prev, status: 'active' }))} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${form.status === 'active' ? 'bg-foreground text-white' : 'text-muted-foreground hover:bg-secondary'}`}>Active</button>
                <button type="button" onClick={() => setForm((prev) => ({ ...prev, status: 'hidden' }))} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${form.status === 'hidden' ? 'bg-foreground text-white' : 'text-muted-foreground hover:bg-secondary'}`}>Hidden</button>
              </div>
            </div>
            <div className="sm:col-span-2 flex gap-3">
              <button type="button" disabled={saving} onClick={() => void saveItem()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={() => setIsDialogOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
                Cancel
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
