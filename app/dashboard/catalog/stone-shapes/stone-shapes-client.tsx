'use client'

import { uploadAwsImage } from '@/lib/image-transport'
import { catalogFetch } from '@/lib/catalog-transport'
import { useEditGuard } from '@/hooks/use-unsaved-changes'

import { useState } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { slugify } from '@/lib/product-catalog'
import { catalogMasterDeleteBody, catalogMasterSaveBody } from '@/lib/catalog-master-client'

export type StoneShape = {
  id: string
  _revision?: string
  name: string
  slug: string
  svgName: string | null
  displayOrder: number
  status: 'Active' | 'Hidden'
}

export function StoneShapesClient({ initialShapes }: { initialShapes: StoneShape[] }) {
  const { toast } = useToast()
  const [shapes, setShapes] = useState<StoneShape[]>(initialShapes)
  const [isFormOpen, setIsFormOpen] = useState(false)
  // HOD-056: warn before leaving with unsaved edits.
  const edits = useEditGuard(isFormOpen)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StoneShape | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    svgName: '' as string | null,
    displayOrder: 1,
    status: 'Active' as 'Active' | 'Hidden',
  })

  const loadShapes = async () => {
    setLoading(true)
    try {

      const response = await catalogFetch('/api/catalog/stone-shapes')
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.items) return

      setShapes(
        payload.items.map((item: { id: string; _revision: string; name: string; slug: string; svg_asset_url: string | null; display_order: number; status: 'active' | 'hidden' }) => ({
          id: item.id,
          _revision: item._revision,
          name: item.name,
          slug: item.slug,
          svgName: item.svg_asset_url,
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
    setFormData({ name: '', slug: '', svgName: '', displayOrder: shapes.length + 1, status: 'Active' })
    setIsFormOpen(true)
  }

  const openEdit = (shape: StoneShape) => {
    setEditingId(shape.id)
    setFormData({
      name: shape.name,
      slug: shape.slug,
      svgName: shape.svgName,
      displayOrder: shape.displayOrder,
      status: shape.status,
    })
    setIsFormOpen(true)
  }

  const saveShape = async () => {
    setSaving(true)

    const response = await catalogFetch(editingId ? `/api/catalog/stone-shapes/${editingId}` : '/api/catalog/stone-shapes', {
      method: editingId ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: catalogMasterSaveBody({
        name: formData.name,
        slug: formData.slug,
        svg_asset_url: formData.svgName || null,
        display_order: formData.displayOrder,
        status: formData.status === 'Hidden' ? 'hidden' : 'active',
      }, editingId ? shapes.find((shape) => shape.id === editingId)?._revision : null),
    })

    if (response.ok) {
      await loadShapes()
      setIsFormOpen(false)
      setEditingId(null)
      setSaveConfirmOpen(false)
      toast({ title: 'Stone shape saved', description: `${formData.name} was updated successfully.` })
    } else {
      const payload = await response.json().catch(() => null)
      toast({ title: 'Save failed', description: payload?.error ?? 'Unable to save stone shape.' })
    }

    setSaving(false)
  }

  const deleteShape = async (id: string) => {

    const revision = shapes.find((shape) => shape.id === id)?._revision
    if (!revision) return
    const response = await catalogFetch(`/api/catalog/stone-shapes/${id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: catalogMasterDeleteBody(revision),
    })

    if (response.ok) {
      await loadShapes()
      setDeleteTarget(null)
      toast({ title: 'Stone shape deleted', description: 'The stone shape was removed successfully.' })
    } else {
      const payload = await response.json().catch(() => null)
      toast({ title: 'Delete failed', description: payload?.error ?? 'Unable to delete stone shape.' })
    }
  }

  const uploadSvg = async (file: File) => {
    try {
      const path = await uploadAwsImage(file, '/api/catalog/stone-shapes/upload', {}, { start: () => setUploading(true), finish: () => setUploading(false) })
      setFormData((prev) => ({ ...prev, svgName: path }))
    } catch (error) {
      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Upload failed.' })
    }
  }

  return (
    <div {...edits.bind} className="p-8">
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Stone Shapes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage the shape options shown in ring and stone selectors.</p>
        </div>

        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
        >
          <Plus size={16} />
          Add New Shape
        </button>
      </div>

      <div className="rounded-lg border border-border bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Name</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Slug</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Image</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Display Order</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Status</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Edit</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Delete</th>
              </tr>
            </thead>
            <tbody>
              {shapes.map((shape) => (
                <tr key={shape.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                  <td className="px-6 py-3.5 text-sm font-medium text-foreground">{shape.name}</td>
                  <td className="px-6 py-3.5 text-sm text-muted-foreground">{shape.slug}</td>
                  <td className="px-6 py-3.5 text-sm text-muted-foreground">{shape.svgName || 'No image selected'}</td>
                  <td className="px-6 py-3.5 text-sm text-foreground">{shape.displayOrder}</td>
                  <td className="px-6 py-3.5 text-sm">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${shape.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                      {shape.status}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <button type="button" onClick={() => openEdit(shape)} className="rounded p-1.5 hover:bg-secondary transition-colors">
                      <Edit2 size={14} className="text-muted-foreground" />
                    </button>
                  </td>
                  <td className="px-6 py-3.5">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(shape)}
                      className="rounded p-1.5 hover:bg-red-100 transition-colors"
                    >
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
        <div className="mt-8 text-sm text-muted-foreground">Updating stone shapes...</div>
      ) : null}

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-jakarta text-lg font-semibold text-foreground">{editingId ? 'Edit Stone Shape' : 'Add Stone Shape'}</DialogTitle>
            <DialogDescription>Manage the stone shape record and upload its image (SVG, PNG, JPG, WebP or AVIF).</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Name</label>
              <input
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    name: e.target.value,
                    slug: prev.slug === '' || prev.slug === slugify(prev.name) ? slugify(e.target.value) : prev.slug,
                  }))
                }
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Slug</label>
              <input
                value={formData.slug}
                onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Shape Image</label>
              <div className="rounded-lg border-2 border-dashed border-border p-4 text-sm text-muted-foreground">
                <p>Upload an SVG, PNG, JPG, WebP or AVIF image (up to 1 MB)</p>
                <p className="mt-1 text-xs">Uploads to the `catalog/stone-shapes/` folder in your storage bucket.</p>
                <input
                  type="file"
                  accept=".svg,.png,.webp,.jpg,.jpeg,.avif,image/svg+xml,image/png,image/webp,image/jpeg,image/avif"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void uploadSvg(file)
                  }}
                  className="mt-3 block w-full text-sm"
                />
                {uploading ? <p className="mt-2 text-xs font-medium text-foreground">Uploading image...</p> : null}
              </div>
              {formData.svgName && <p className="mt-2 text-xs text-muted-foreground">Selected: {formData.svgName}</p>}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Display Order</label>
              <input
                type="number"
                value={formData.displayOrder}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    displayOrder: Number(e.target.value) || 0,
                  }))
                }
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
              />
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
              <button type="button" onClick={() => setSaveConfirmOpen(true)} disabled={saving || uploading} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={() => setIsFormOpen(false)} disabled={saving || uploading} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60">
                Cancel
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={saveConfirmOpen}
        title={editingId ? 'Update stone shape?' : 'Create stone shape?'}
        description="This will save the stone shape changes."
        confirmText="Save"
        isLoading={saving}
        onConfirm={() => void saveShape()}
        onCancel={() => setSaveConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete stone shape?"
        description={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"?`}
        confirmText="Delete"
        type="delete"
        onConfirm={() => {
          if (!deleteTarget) return
          void deleteShape(deleteTarget.id)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
