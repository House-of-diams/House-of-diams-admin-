'use client'

import { tryUploadAwsImage } from '@/lib/image-transport'
import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, Edit2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CmsSaveAction } from '@/components/cms-save-action'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

export type ProductListItem = {
  id: string
  name: string
  slug: string
  categoryPath: string
  detailTemplate: 'standard' | 'hiphop'
  status: string
}

type EditorState = {
  eyebrow: string
  heading: string
  cta_label: string
  cta_href: string
  selected_product_ids: string[]
  selected_products: Array<{ id?: string; product_id: string; display_title: string; display_image_path: string }>
}

type SavedProductOverride = { id: string; product_id: string; display_title: string; display_image_path: string }

function editableState(form: EditorState) { return JSON.stringify(form) }

export type HomeBestSellersInitialData = {
  revision: string
  section: EditorState
  products: ProductListItem[]
}

export function HomeBestSellersEditorClient({ initialData }: { initialData: HomeBestSellersInitialData }) {
  const { toast } = useToast()
  const router = useRouter()
  const [form, setForm] = useState<EditorState>(initialData.section)
  const [products] = useState<ProductListItem[]>(initialData.products)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('Best sellers loaded')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [uploadingProductId, setUploadingProductId] = useState<string | null>(null)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [revision, setRevision] = useState(initialData.revision)
  const [savedItemIds, setSavedItemIds] = useState(() => initialData.section.selected_products.flatMap((item) => item.id ? [item.id] : []))
  const [savedState, setSavedState] = useState(() => editableState(initialData.section))
  const pendingSave = useRef<{ fingerprint: string; id: string } | null>(null)
  const dirty = editableState(form) !== savedState
  const unsaved = useUnsavedChanges(dirty)

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return products
    return products.filter((product) =>
      [product.name, product.slug, product.categoryPath, product.detailTemplate]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
    )
  }, [products, search])

  const selectedProducts = useMemo(
    () =>
      form.selected_product_ids
        .map((id) => products.find((product) => product.id === id))
        .filter(Boolean) as ProductListItem[],
    [form.selected_product_ids, products]
  )

  const editingProduct = editingProductId ? products.find((product) => product.id === editingProductId) ?? null : null
  const editingOverride = editingProductId ? form.selected_products.find((item) => item.product_id === editingProductId) ?? null : null

  const toggleProduct = (id: string) => {
    setForm((current) => ({
      ...current,
      selected_product_ids: current.selected_product_ids.includes(id)
        ? current.selected_product_ids.filter((value) => value !== id)
        : [...current.selected_product_ids, id],
      selected_products: current.selected_product_ids.includes(id)
        ? current.selected_products.filter((item) => item.product_id !== id)
        : [...current.selected_products, { product_id: id, display_title: '', display_image_path: '' }],
    }))
  }

  const moveSelected = (id: string, direction: -1 | 1) => {
    setForm((current) => {
      const index = current.selected_product_ids.indexOf(id)
      const nextIndex = index + direction
      if (index === -1 || nextIndex < 0 || nextIndex >= current.selected_product_ids.length) return current

      const nextIds = [...current.selected_product_ids]
      const [item] = nextIds.splice(index, 1)
      nextIds.splice(nextIndex, 0, item)
      return { ...current, selected_product_ids: nextIds }
    })
  }

  const updateCardOverride = (productId: string, patch: Partial<{ display_title: string; display_image_path: string }>) => {
    setForm((current) => ({
      ...current,
      selected_products: current.selected_products.map((item) => item.product_id === productId ? { ...item, ...patch } : item),
    }))
  }

  const uploadCardImage = async (productId: string, file: File) => {
    if (file.size > 5 * 1024 * 1024) return setStatus('File too large. Max size is 5MB.')

    try {
      const awsPath = await tryUploadAwsImage(file, '/api/cms/uploads/home-bestsellers', {},{start:()=>setUploadingProductId(productId),finish:()=>setUploadingProductId(null)})
      if (awsPath) { updateCardOverride(productId,{display_image_path:awsPath}); setStatus('Best Seller card image uploaded'); return }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Upload failed.'); return }


    const { supabase } = await import('@/lib/supabase')
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) return setStatus('You are not signed in.')

    setUploadingProductId(productId)
    setStatus('Uploading Best Seller card image...')
    try {
      const upload = new FormData()
      upload.append('file', file)
      const response = await fetch('/api/cms/uploads/home-bestsellers', { method: 'POST', headers: { authorization: `Bearer ${accessToken}` }, body: upload })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.path) throw new Error(payload?.error ?? 'Unable to upload image.')
      updateCardOverride(productId, { display_image_path: payload.path })
      setStatus('Best Seller card image uploaded')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to upload image.')
    } finally {
      setUploadingProductId(null)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {




      const retainedIds = new Set(form.selected_products.flatMap((item) => item.id ? [item.id] : []))
      const saveBody = { ...form, expected_revision: revision, deleted_ids: savedItemIds.filter((id) => !retainedIds.has(id)) }
      const fingerprint = JSON.stringify(saveBody)
      if (pendingSave.current?.fingerprint !== fingerprint) pendingSave.current = { fingerprint, id: crypto.randomUUID() }
      const response = await cmsFetch('/api/cms/home/bestsellers', {
        method: 'POST',
        headers: { 'content-type': 'application/json',  },
        body: JSON.stringify({ ...saveBody, request_id: pendingSave.current.id }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save best sellers.')
      if (!Array.isArray(payload?.items) || typeof payload?.revision !== 'string' || !payload?.section) throw new Error('Save response was interrupted. Retry to confirm the same save.')
      const selectedProducts: SavedProductOverride[] = payload.items.map((item: { id: string; product_id: string; display_title?: string | null; display_image_path?: string | null }) => ({
        id: item.id, product_id: item.product_id, display_title: item.display_title ?? '', display_image_path: item.display_image_path ?? '',
      }))
      const nextForm = { ...payload.section, selected_product_ids: selectedProducts.map((item) => item.product_id), selected_products: selectedProducts } as EditorState
      setForm(nextForm)
      setSavedState(editableState(nextForm))
      setSavedItemIds(selectedProducts.map((item) => item.id))
      setRevision(payload.revision)
      pendingSave.current = null
      setConfirmOpen(false)
      setStatus('Best sellers saved')
      toast({ title: 'Saved', description: 'Homepage best sellers updated successfully.' })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save best sellers.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center gap-4">
        <Link href="/dashboard/cms/home" onClick={(event) => { event.preventDefault(); unsaved.confirmNavigation(() => router.push('/dashboard/cms/home')) }} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
          <ArrowLeft size={16} />
          Back to Home
        </Link>
      </div>

      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Best Sellers</h1>
        <p className="mt-1 text-sm text-muted-foreground">Select existing products to display in the homepage best sellers section.</p>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-4 rounded-lg border border-border bg-white p-6 shadow-xs">
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Eyebrow</label>
            <input value={form.eyebrow} onChange={(e) => setForm((prev) => ({ ...prev, eyebrow: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Heading</label>
            <input value={form.heading} onChange={(e) => setForm((prev) => ({ ...prev, heading: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">CTA Label</label>
              <input value={form.cta_label} onChange={(e) => setForm((prev) => ({ ...prev, cta_label: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">CTA Link</label>
              <input value={form.cta_href} onChange={(e) => setForm((prev) => ({ ...prev, cta_href: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <h2 className="text-sm font-semibold text-foreground">Selected Products</h2>
            <p className="mt-1 text-xs text-muted-foreground">These products will render on the homepage in this exact order.</p>
            <div className="mt-4 space-y-3">
              {selectedProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No products selected yet.</p>
              ) : (
                selectedProducts.map((product, index) => (
                  <div key={product.id} className="rounded-lg border border-border bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{index + 1}. {product.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{product.categoryPath}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setEditingProductId(product.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:text-primary"><Edit2 size={13} />Edit</button>
                        <button
                        type="button"
                        onClick={() => toggleProduct(product.id)}
                        className="text-xs font-semibold text-red-600 hover:text-red-700"
                      >
                        Remove
                        </button>
                      </div>
                    </div>
                    <div className="hidden">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-foreground">Card title</label>
                        <input value={form.selected_products.find((item) => item.product_id === product.id)?.display_title ?? ''} onChange={(event) => updateCardOverride(product.id, { display_title: event.target.value })} maxLength={160} placeholder={product.name} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-foreground">Card image</label>
                        <label className="inline-flex cursor-pointer rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary">
                          {uploadingProductId === product.id ? 'Uploading...' : 'Upload image'}
                          <input type="file" accept="image/*" className="hidden" disabled={uploadingProductId !== null} onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void uploadCardImage(product.id, file); event.target.value = '' }} />
                        </label>
                        <p className="mt-1 break-all text-xs text-muted-foreground">{form.selected_products.find((item) => item.product_id === product.id)?.display_image_path || 'Uses product image'}</p>
                        {form.selected_products.find((item) => item.product_id === product.id)?.display_image_path ? <button type="button" onClick={() => updateCardOverride(product.id, { display_image_path: '' })} className="mt-1 text-xs font-semibold text-red-600">Use product image instead</button> : null}
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => moveSelected(product.id, -1)} className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-secondary">
                        Up
                      </button>
                      <button type="button" onClick={() => moveSelected(product.id, 1)} className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-secondary">
                        Down
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-white p-6 shadow-xs">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Choose Existing Products</h2>
              <p className="mt-1 text-sm text-muted-foreground">Pick the products you want to display in the homepage best sellers section.</p>
            </div>
            <div className="w-full max-w-[320px]">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Select</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Product</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Path</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Template</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const checked = form.selected_product_ids.includes(product.id)
                  return (
                    <tr key={product.id} className="border-b border-border last:border-b-0">
                      <td className="px-5 py-4">
                        <input type="checkbox" checked={checked} onChange={() => toggleProduct(product.id)} />
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-foreground">{product.name}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{product.categoryPath}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{product.detailTemplate}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(editingProduct)} onOpenChange={(open) => { if (!open) setEditingProductId(null) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit selected product</DialogTitle>
            <DialogDescription>{editingProduct ? `Customize how ${editingProduct.name} appears in Best Sellers.` : ''}</DialogDescription>
          </DialogHeader>
          {editingProduct && editingOverride ? <div className="space-y-5">
            <div><label className="mb-2 block text-sm font-semibold text-foreground">Card title</label><input value={editingOverride.display_title} onChange={(event) => updateCardOverride(editingProduct.id, { display_title: event.target.value })} maxLength={160} placeholder={editingProduct.name} className="w-full rounded-lg border border-border px-3 py-2.5 text-sm" /></div>
            <div><label className="mb-2 block text-sm font-semibold text-foreground">Card image</label><label className="inline-flex cursor-pointer rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-secondary">{uploadingProductId === editingProduct.id ? 'Uploading...' : 'Upload image'}<input type="file" accept="image/*" className="hidden" disabled={uploadingProductId !== null} onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void uploadCardImage(editingProduct.id, file); event.target.value = '' }} /></label><p className="mt-2 break-all text-xs text-muted-foreground">{editingOverride.display_image_path || 'Uses product image'}</p>{editingOverride.display_image_path ? <button type="button" onClick={() => updateCardOverride(editingProduct.id, { display_image_path: '' })} className="mt-2 text-xs font-semibold text-red-600">Use product image instead</button> : null}</div>
          </div> : null}
          <DialogFooter><button type="button" onClick={() => setEditingProductId(null)} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Done</button></DialogFooter>
        </DialogContent>
      </Dialog>
      <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} disabled={!dirty} />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Save best sellers?"
        description="This will update the homepage best sellers section."
        confirmText="Save"
        cancelText="Cancel"
        type="confirm"
        isLoading={isSaving}
        onConfirm={handleSave}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved Best Sellers changes?" description="Your changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)} />
    </div>
  )
}
