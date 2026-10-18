'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, Edit2, Trash2, CheckCircle2, Circle, Copy, MoreHorizontal, EyeOff, SlidersHorizontal } from 'lucide-react'
import { productRequestHeaders } from '@/lib/product-transport'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { TablePagination } from '@/components/table-pagination'
import type { ProductListPage } from './product-list'
import { BulkPriceDialog } from '@/components/bulk-price-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'

export type ProductRow = {
  id: string
  slug: string | null
  name: string
  sku: string
  productLane?: 'standard' | 'hiphop' | 'collection'
  categoryPath: string
  type: string
  price: number | null
  stock: number
  featured: boolean
  status: string
  detailTemplate?: 'standard' | 'hiphop'
  mainCategorySlug?: string
  mainCategoryName?: string
}

const PAGE_SIZE = 20

function matchesLane(product: ProductRow, lane: 'standard' | 'hiphop' | 'collection') {
  const productLane = product.productLane ?? 'standard'
  return productLane === lane
}

function getProductEditHref(product: ProductRow, editBaseHref: string) {
  const slug = product.slug?.trim()
  if (slug) return `${editBaseHref}/${encodeURIComponent(slug)}`
  if (editBaseHref === '/dashboard/products/edit') return `/dashboard/products/${encodeURIComponent(product.id)}`
  return `${editBaseHref}/${encodeURIComponent(product.id)}`
}

export function ProductsClient({
  initialData,
  lane,
  title,
  description,
  createHref,
  createLabel,
  editBaseHref,
  emptyMessage,
}: {
  initialData: ProductListPage
  lane: 'standard' | 'hiphop' | 'collection'
  title: string
  description: string
  createHref?: string
  createLabel?: string
  editBaseHref: string
  emptyMessage: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [products, setProducts] = useState<ProductRow[]>(initialData.items)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [duplicateTarget, setDuplicateTarget] = useState<ProductRow | null>(null)
  const [duplicateRequestId, setDuplicateRequestId] = useState<string | null>(null)
  const [duplicateLoading, setDuplicateLoading] = useState(false)
  const [draftTarget, setDraftTarget] = useState<ProductRow | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [page, setPage] = useState(initialData.page)
  const [total, setTotal] = useState(initialData.total)
  const [activatingDrafts, setActivatingDrafts] = useState(false)
  const [activateDialogOpen, setActivateDialogOpen] = useState(false)
  const [activateRequestId, setActivateRequestId] = useState<string | null>(null)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false)
  const [bulkDeleteRequestId, setBulkDeleteRequestId] = useState<string | null>(null)
  const [bulkPriceDialogOpen, setBulkPriceDialogOpen] = useState(false)

  const loadProducts = async (nextPage = 1, nextSearch = search) => {
    setLoading(true)
    try {
      const requestHeaders = await productRequestHeaders(false)
      const response = await fetch(`/api/products/list?lane=${encodeURIComponent(lane)}&page=${nextPage}&q=${encodeURIComponent(nextSearch)}`, {
        headers: requestHeaders,
      })
      const payload = await response.json().catch(() => null)
      if (response.ok && payload?.items) {
        setProducts(payload.items.filter((product: ProductRow) => matchesLane(product, lane)))
        setPage(payload.page)
        setTotal(payload.total)
        setSelectedProductIds([])
      }
    } catch (error) {
      toast({ title: 'Product load failed', description: error instanceof Error ? error.message : 'Unable to load products.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.name.toLowerCase().includes(search.toLowerCase()) ||
          product.categoryPath.toLowerCase().includes(search.toLowerCase()) ||
          product.sku.toLowerCase().includes(search.toLowerCase())
      ),
    [products, search]
  )
  const visibleProducts = filteredProducts
  const selectedProducts = useMemo(
    () => products.filter((product) => selectedProductIds.includes(product.id)),
    [products, selectedProductIds]
  )
  const selectedDraftIds = useMemo(
    () => selectedProducts.filter((product) => product.status === 'draft').map((product) => product.id),
    [selectedProducts]
  )
  const selectedDraftCount = selectedDraftIds.length
  const largeBulkDelete = selectedProductIds.length > 5
  const allVisibleProductsSelected =
    visibleProducts.length > 0 && visibleProducts.every((product) => selectedProductIds.includes(product.id))
  const visibleProductIds = visibleProducts.map((product) => product.id)

  const deleteProduct = async (id: string) => {
    setDeleteLoading(true)
    try {
      const requestHeaders = await productRequestHeaders()
      const response = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: requestHeaders,
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        toast({ title: 'Delete failed', description: payload?.error ?? 'Unable to delete this product.', variant: 'destructive' })
        return
      }

      const deletedName = deleteTarget?.name
      setDeleteTarget(null)
      setProducts((current) => current.filter((product) => product.id !== id))
      setTotal((current) => Math.max(0, current - 1))
      setSelectedProductIds((current) => current.filter((productId) => productId !== id))
      toast({
        title: 'Product deleted',
        description: deletedName ? `“${deletedName}” was removed successfully.` : 'The product was removed successfully.',
      })
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unable to delete this product.',
        variant: 'destructive',
      })
    } finally {
      setDeleteLoading(false)
    }
  }

  const openDuplicateDialog = (product: ProductRow) => {
    setDuplicateTarget(product)
    setDuplicateRequestId(crypto.randomUUID())
  }

  const duplicateProduct = async () => {
    if (!duplicateTarget || !duplicateRequestId || duplicateLoading) return

    setDuplicateLoading(true)
    toast({
      title: 'Creating duplicate…',
      description: `A safe draft copy of “${duplicateTarget.name}” is being created.`,
    })
    try {
      const requestHeaders = await productRequestHeaders()

      const response = await fetch(`/api/products/${duplicateTarget.id}/duplicate`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ requestId: duplicateRequestId }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.item?.slug) {
        toast({
          title: 'Duplication failed',
          description: payload?.error ?? 'Unable to duplicate this product. The original product was not changed.',
          variant: 'destructive',
        })
        return
      }

      toast({ title: 'Draft created', description: 'The product copy is now listed as a draft with stock and checkout disabled.' })
      setDuplicateTarget(null)
      setDuplicateRequestId(null)
      await loadProducts()
    } catch (error) {
      toast({
        title: 'Duplication failed',
        description: error instanceof Error ? error.message : 'Unable to duplicate this product. The original product was not changed.',
        variant: 'destructive',
      })
    } finally {
      setDuplicateLoading(false)
    }
  }

  const markProductAsDraft = async () => {
    if (!draftTarget || draftLoading) return

    setDraftLoading(true)
    try {
      const requestHeaders = await productRequestHeaders()

      const response = await fetch(`/api/products/${draftTarget.id}/status`, {
        method: 'PATCH',
        headers: requestHeaders,
        body: JSON.stringify({ status: 'draft', expected_status: draftTarget.status }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        toast({ title: 'Status update failed', description: payload?.error ?? 'Unable to mark this product as draft.', variant: 'destructive' })
        return
      }

      const productName = draftTarget.name
      setProducts((current) => current.map((product) => product.id === draftTarget.id ? { ...product, status: 'draft' } : product))
      setDraftTarget(null)
      toast({ title: 'Product marked as draft', description: `“${productName}” is now hidden from the storefront.` })
    } catch (error) {
      toast({
        title: 'Status update failed',
        description: error instanceof Error ? error.message : 'Unable to mark this product as draft.',
        variant: 'destructive',
      })
    } finally {
      setDraftLoading(false)
    }
  }

  const deleteSelectedProducts = async () => {
    if (bulkDeleteLoading || !bulkDeleteRequestId || selectedProductIds.length === 0) return
    setBulkDeleteLoading(true)

    try {
      const requestHeaders = await productRequestHeaders()
      const response = await fetch('/api/products/bulk-delete', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ requestId: bulkDeleteRequestId, ids: selectedProductIds, lane, confirmation: 'DELETE_PRODUCTS' }),
      })
      const payload = await response.json().catch(() => null)

      if (response.ok) {
        const deletedCount = selectedProductIds.length
        setBulkDeleteDialogOpen(false)
        setBulkDeleteRequestId(null)
        setSelectedProductIds([])
        await loadProducts()
        toast({
          title: 'Products deleted',
          description: `${deletedCount} product${deletedCount === 1 ? '' : 's'} removed successfully.`,
        })
      } else {
        toast({ title: 'Delete failed', description: payload?.error ?? 'Unable to delete the selected products.', variant: 'destructive' })
      }
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unable to delete the selected products.',
        variant: 'destructive',
      })
    } finally {
      setBulkDeleteLoading(false)
    }
  }

  const activateDraftProducts = async () => {
    if (activatingDrafts || !activateRequestId || selectedDraftIds.length === 0) return
    setActivatingDrafts(true)

    try {
      const requestHeaders = await productRequestHeaders()
      const response = await fetch('/api/products/activate-drafts', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ requestId: activateRequestId, lane, ids: selectedDraftIds, confirmation: 'ACTIVATE_DRAFTS' }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        toast({ title: 'Activation failed', description: payload?.error ?? 'Unable to activate the selected drafts.', variant: 'destructive' })
        return
      }
      setActivateDialogOpen(false)
      setActivateRequestId(null)
      setSelectedProductIds((current) => current.filter((id) => !selectedDraftIds.includes(id)))
      await loadProducts()
      toast({ title: 'Drafts activated', description: `${payload?.activatedCount ?? selectedDraftIds.length} product${selectedDraftIds.length === 1 ? '' : 's'} published successfully.` })
    } catch (error) {
      toast({ title: 'Activation failed', description: error instanceof Error ? error.message : 'Unable to activate the selected drafts.', variant: 'destructive' })
    } finally {
      setActivatingDrafts(false)
    }
  }

  const toggleProductSelection = (productId: string, selected: boolean) => {
    setSelectedProductIds((prev) =>
      selected ? (prev.includes(productId) ? prev : [...prev, productId]) : prev.filter((id) => id !== productId)
    )
  }

  const toggleVisibleProductSelections = (selected: boolean) => {
    setSelectedProductIds((prev) => {
      if (selected) return [...new Set([...prev, ...visibleProductIds])]
      return prev.filter((id) => !visibleProductIds.includes(id))
    })
  }

  return (
    <div className="p-8">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setBulkPriceDialogOpen(true)}
            disabled={filteredProducts.length === 0}
            className="flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SlidersHorizontal size={18} />
            {selectedProductIds.length > 0 ? `Adjust Prices (${selectedProductIds.length})` : 'Select Products to Adjust'}
          </button>
          <button
            type="button"
            onClick={() => { setBulkDeleteRequestId(crypto.randomUUID()); setBulkDeleteDialogOpen(true) }}
            disabled={selectedProductIds.length === 0 || bulkDeleteLoading}
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors duration-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 size={18} />
            {selectedProductIds.length > 0 ? `Delete Selected (${selectedProductIds.length})` : 'Select Products to Delete'}
          </button>
          <button
            type="button"
            onClick={() => { setActivateRequestId(crypto.randomUUID()); setActivateDialogOpen(true) }}
            disabled={selectedDraftCount === 0 || activatingDrafts}
            className="flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={18} />
            {selectedDraftCount > 0 ? `Activate Selected Drafts (${selectedDraftCount})` : 'Select Drafts to Activate'}
          </button>
          {createHref && createLabel ? (
            <Link
              href={createHref}
              onMouseEnter={() => router.prefetch(createHref)}
              onFocus={() => router.prefetch(createHref)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors duration-200"
            >
              <Plus size={18} />
              {createLabel}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mb-8">
        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, SKU, or category..."
            value={search}
            onChange={(e) => {
              const nextSearch = e.target.value
              setSearch(nextSearch)
              void loadProducts(1, nextSearch)
            }}
            className="w-full rounded-lg border border-border bg-white py-2.5 pl-10 pr-4 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-foreground">
                  <input
                    type="checkbox"
                    checked={allVisibleProductsSelected}
                    onChange={(event) => toggleVisibleProductSelections(event.target.checked)}
                    disabled={visibleProducts.length === 0}
                    aria-label="Select visible products"
                    className="h-4 w-4 rounded border-border text-primary focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Name</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Category</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Type</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Price</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Stock</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Featured</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Status</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product) => {
                const editHref = getProductEditHref(product, editBaseHref)
                return (
                <tr key={product.id} className="border-b border-border hover:bg-secondary/30 transition-colors duration-150">
                  <td className="px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={(event) => toggleProductSelection(product.id, event.target.checked)}
                      aria-label={`Select product ${product.name}`}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                    />
                  </td>
                  <td className="px-6 py-3.5 text-sm font-medium text-foreground">{product.name}</td>
                  <td className="px-6 py-3.5 text-sm text-muted-foreground">{product.categoryPath}</td>
                  <td className="px-6 py-3.5 text-sm text-muted-foreground">{product.type}</td>
                  <td className="px-6 py-3.5 text-sm font-jakarta font-semibold text-foreground">{product.price == null ? '-' : `$${product.price.toLocaleString()}`}</td>
                  <td className="px-6 py-3.5 text-sm font-jakarta font-bold text-foreground">{product.stock}</td>
                  <td className="px-6 py-3.5">
                    {product.featured ? <CheckCircle2 size={16} className="text-primary" /> : <Circle size={16} className="text-muted-foreground" />}
                  </td>
                  <td className="px-6 py-3.5 text-sm">
                    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${product.status === 'active' ? 'bg-green-100 text-green-700' : product.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-700'}`}>
                      {product.status === 'active' ? 'Active' : product.status === 'draft' ? 'Draft' : product.status}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <Link href={editHref} onMouseEnter={() => router.prefetch(editHref)} onFocus={() => router.prefetch(editHref)} className="rounded p-1.5 hover:bg-secondary transition-colors" title="Edit">
                        <Edit2 size={14} className="text-muted-foreground" />
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="rounded p-1.5 transition-colors hover:bg-secondary"
                            aria-label={`More actions for ${product.name}`}
                          >
                            <MoreHorizontal size={14} className="text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {product.status !== 'draft' ? (
                            <DropdownMenuItem onClick={() => setDraftTarget(product)}>
                              <EyeOff size={14} />
                              Mark as Draft
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onClick={() => openDuplicateDialog(product)}>
                            <Copy size={14} />
                            Duplicate Product
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(product)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 size={14} />
                            Delete Product
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 text-sm text-muted-foreground">Updating products...</div>
      ) : null}

      {!loading && filteredProducts.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : null}
      {total > PAGE_SIZE ? (
        <TablePagination page={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={(nextPage) => void loadProducts(nextPage)} />
      ) : null}

      <BulkPriceDialog
        open={bulkPriceDialogOpen}
        products={selectedProducts.map((product) => ({ id: product.id, name: product.name, price: product.price }))}
        allProducts={filteredProducts.map((product) => ({ id: product.id, name: product.name, price: product.price }))}
        lane={lane}
        onClose={() => setBulkPriceDialogOpen(false)}
        onApplied={(items) => {
          const nextPrices = new Map(items.map((item) => [item.id, item.price]))
          setProducts((current) => current.map((product) => nextPrices.has(product.id) ? { ...product, price: nextPrices.get(product.id)! } : product))
          setBulkPriceDialogOpen(false)
          setSelectedProductIds([])
          toast({ title: 'Prices updated', description: `${items.length} product base price${items.length === 1 ? '' : 's'} updated successfully.` })
        }}
      />

      <ConfirmDialog
        isOpen={activateDialogOpen}
        title="Activate selected draft products?"
        description={`This will publish ${selectedDraftCount} selected draft product${selectedDraftCount === 1 ? '' : 's'} one by one so the website can show only the items you picked.`}
        confirmText="Activate Drafts"
        cancelText="Cancel"
        isLoading={activatingDrafts}
        onConfirm={() => void activateDraftProducts()}
        onCancel={() => {
          if (!activatingDrafts) { setActivateDialogOpen(false); setActivateRequestId(null) }
        }}
      />

      <ConfirmDialog
        isOpen={bulkDeleteDialogOpen}
        title={largeBulkDelete ? 'Large product deletion?' : 'Delete selected products?'}
        description={
          largeBulkDelete
            ? `You are about to permanently delete ${selectedProductIds.length} products from admin and storefront. This is a large deletion and cannot be undone. Are you sure you want to continue?`
            : `This will permanently remove ${selectedProductIds.length} selected product${selectedProductIds.length === 1 ? '' : 's'} from admin and storefront.`
        }
        confirmText="Delete Products"
        cancelText="Cancel"
        type={largeBulkDelete ? 'warning' : 'delete'}
        isLoading={bulkDeleteLoading}
        onConfirm={() => void deleteSelectedProducts()}
        onCancel={() => {
          if (!bulkDeleteLoading) { setBulkDeleteDialogOpen(false); setBulkDeleteRequestId(null) }
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(draftTarget)}
        title="Mark this product as draft?"
        description={`This will hide${draftTarget?.name ? ` “${draftTarget.name}”` : ' this product'} from the storefront. You can activate it again from the product list.`}
        confirmText="Mark as Draft"
        cancelText="Cancel"
        type="warning"
        isLoading={draftLoading}
        onConfirm={() => void markProductAsDraft()}
        onCancel={() => {
          if (!draftLoading) setDraftTarget(null)
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(duplicateTarget)}
        title="Duplicate this product?"
        description={`This will create a hidden draft copy${duplicateTarget?.name ? ` of “${duplicateTarget.name}”` : ''}. Its stock will be zero and checkout and featured status will be disabled until you review it.`}
        confirmText="Create Draft Copy"
        cancelText="Cancel"
        isLoading={duplicateLoading}
        onConfirm={() => void duplicateProduct()}
        onCancel={() => {
          if (!duplicateLoading) {
            setDuplicateTarget(null)
            setDuplicateRequestId(null)
          }
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete this product?"
        description={`This will remove product${deleteTarget?.name ? ` "${deleteTarget.name}"` : ''} from the admin and storefront.`}
        confirmText="Delete Product"
        cancelText="Cancel"
        type="delete"
        isLoading={deleteLoading}
        onConfirm={() => (deleteTarget ? void deleteProduct(deleteTarget.id) : undefined)}
        onCancel={() => {
          if (!deleteLoading) setDeleteTarget(null)
        }}
      />
    </div>
  )
}
