'use client'

import { uploadAwsImage } from '@/lib/image-transport'
import { catalogFetch } from '@/lib/catalog-transport'
import { useEditGuard } from '@/hooks/use-unsaved-changes'

import { useState } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { catalogMasterDeleteBody, catalogMasterSaveBody } from '@/lib/catalog-master-client'
import { resolveStoredImage } from '@/lib/image-reference'

export type CatalogStyleItem = {
  id: string
  _revision?: string
  name: string
  iconSvgPath: string
  displayOrder: number
  status: 'Active' | 'Hidden'
}

async function uploadStyleSvg(file: File) {
  return uploadAwsImage(file, '/api/catalog/styles/upload', {})
}

function resolveStyleIconUrl(path: string | null | undefined) {
  return resolveStoredImage(path)
}

export function StylesClient({ initialItems }: { initialItems: CatalogStyleItem[] }) {
  const { toast } = useToast()
  const [items, setItems] = useState<CatalogStyleItem[]>(initialItems)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  // HOD-056: warn before leaving with unsaved edits.
  const edits = useEditGuard(formOpen)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CatalogStyleItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    iconSvgPath: '',
    displayOrder: 1,
    status: 'Active' as 'Active' | 'Hidden',
  })

  const loadItems = async () => {
    setLoading(true)
    try {

      const response = await catalogFetch('/api/catalog/styles')
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.items) return

      setItems(
        payload.items.map((item: { id: string; _revision: string; name: string; icon_svg_path?: string | null; display_order: number; status: 'active' | 'hidden' }) => ({
          id: item.id,
          _revision: item._revision,
          name: item.name,
          iconSvgPath: item.icon_svg_path ?? '',
          displayOrder: item.display_order,
          status: item.status === 'hidden' ? 'Hidden' : 'Active',
        }))
      )
    } finally {
      setLoading(false)
    }
  }

  const openNew = () => {
    setEditingId(null)
    setFormData({ name: '', iconSvgPath: '', displayOrder: items.length + 1, status: 'Active' })
    setFormOpen(true)
  }

  const openEdit = (item: CatalogStyleItem) => {
    setEditingId(item.id)
    setFormData({ name: item.name, iconSvgPath: item.iconSvgPath ?? '', displayOrder: item.displayOrder, status: item.status })
    setFormOpen(true)
  }

  const handleSvgUpload = async (file: File) => {
    setUploading(true)
    try {
      const path = await uploadStyleSvg(file)
      setFormData((current) => ({ ...current, iconSvgPath: path }))
      toast({ title: 'SVG uploaded', description: 'Style icon uploaded successfully.' })
    } catch (error) {
      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Unable to upload SVG.' })
    } finally {
      setUploading(false)
    }
  }

  const saveItem = async () => {
    setSaving(true)

    const response = await catalogFetch(editingId ? `/api/catalog/styles/${editingId}` : '/api/catalog/styles', {
      method: editingId ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: catalogMasterSaveBody({
        name: formData.name,
        icon_svg_path: formData.iconSvgPath || null,
        display_order: formData.displayOrder,
        status: formData.status === 'Hidden' ? 'hidden' : 'active',
      }, editingId ? items.find((item) => item.id === editingId)?._revision : null),
    })

    if (response.ok) {
      await loadItems()
      setFormOpen(false)
      setEditingId(null)
      setSaveConfirmOpen(false)
      toast({ title: 'Style saved', description: `${formData.name} was updated successfully.` })
    } else {
      const payload = await response.json().catch(() => null)
      toast({ title: 'Save failed', description: payload?.error ?? 'Unable to save style.' })
    }

    setSaving(false)
  }

  const deleteItem = async (id: string) => {

    const revision = items.find((item) => item.id === id)?._revision
    if (!revision) return
    const response = await catalogFetch(`/api/catalog/styles/${id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: catalogMasterDeleteBody(revision),
    })

    if (response.ok) {
      await loadItems()
      setDeleteTarget(null)
      toast({ title: 'Style deleted', description: 'The style was removed successfully.' })
    } else {
      const payload = await response.json().catch(() => null)
      toast({ title: 'Delete failed', description: payload?.error ?? 'Unable to delete style.' })
    }
  }

  return (
    <div {...edits.bind} className="p-8">
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Styles</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage global style values used across products and navbar setup.</p>
        </div>

        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
        >
          <Plus size={16} />
          Add New Style
        </button>
      </div>

      <div className="rounded-lg border border-border bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Name</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Icon</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Display Order</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Status</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Edit</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Delete</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                  <td className="px-6 py-3.5 text-sm font-medium text-foreground">{item.name}</td>
                  <td className="px-6 py-3.5 text-sm text-foreground">
                    {item.iconSvgPath ? (
                      // Native img preserves uploaded SVG behavior for admin-managed runtime URLs.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveStyleIconUrl(item.iconSvgPath) ?? item.iconSvgPath} alt={item.name} className="h-8 w-8 object-contain" />
                    ) : (
                      <span className="text-muted-foreground">No icon</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-sm text-foreground">{item.displayOrder}</td>
                  <td className="px-6 py-3.5 text-sm">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <button type="button" onClick={() => openEdit(item)} className="rounded p-1.5 hover:bg-secondary transition-colors">
                      <Edit2 size={14} className="text-muted-foreground" />
                    </button>
                  </td>
                  <td className="px-6 py-3.5">
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

      {loading ? (
        <div className="mt-8 text-sm text-muted-foreground">Updating styles...</div>
      ) : null}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-jakarta text-lg font-semibold text-foreground">{editingId ? 'Edit Style' : 'Add Style'}</DialogTitle>
            <DialogDescription>Create or update a reusable style value.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Name</label>
              <input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Display Order</label>
              <input
                type="number"
                value={formData.displayOrder}
                onChange={(e) => setFormData((prev) => ({ ...prev, displayOrder: Number(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">SVG Icon</label>
              <div className="space-y-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
                  Upload SVG
                  <input
                    type="file"
                    accept=".svg,image/svg+xml"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void handleSvgUpload(file)
                      }
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
                {formData.iconSvgPath ? (
                  <button
                    type="button"
                    onClick={() => setFormData((current) => ({ ...current, iconSvgPath: '' }))}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    Remove SVG
                  </button>
                ) : null}
                <p className="text-xs text-muted-foreground">{uploading ? 'Uploading SVG...' : formData.iconSvgPath || 'No SVG uploaded yet'}</p>
                {formData.iconSvgPath ? (
                  // Native img preserves uploaded SVG behavior for admin-managed runtime URLs.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveStyleIconUrl(formData.iconSvgPath) ?? formData.iconSvgPath} alt="Style icon preview" className="h-12 w-12 object-contain" />
                ) : null}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Status</label>
              <div className="flex flex-wrap gap-2">
                {(['Active', 'Hidden'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, status }))}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${formData.status === status ? 'bg-primary text-white' : 'border border-border text-foreground hover:bg-secondary'}`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setSaveConfirmOpen(true)} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60">
                Cancel
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={saveConfirmOpen}
        title={editingId ? 'Update style?' : 'Create style?'}
        description="This will save the style changes."
        confirmText="Save"
        isLoading={saving}
        onConfirm={() => void saveItem()}
        onCancel={() => setSaveConfirmOpen(false)}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete style?"
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
