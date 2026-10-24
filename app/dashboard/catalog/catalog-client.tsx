'use client'

import { uploadAwsImage } from '@/lib/image-transport'
import { catalogFetch } from '@/lib/catalog-transport'
import { useEditGuard } from '@/hooks/use-unsaved-changes'

import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { TablePagination } from '@/components/table-pagination'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { CatalogImagePreview } from '@/components/catalog-image-preview'
import type { CatalogCategory, CatalogNavbarItem, CatalogOption, CatalogSubcategory, ProductContentRule } from '@/lib/product-catalog'
import { slugify } from '@/lib/product-catalog'
import { catalogMasterDeleteBody, catalogMasterSaveBody } from '@/lib/catalog-master-client'
import { catalogHierarchyDeleteBody, catalogHierarchySaveBody } from '@/lib/catalog-hierarchy-client'
import { CatalogSeoSection, catalogSeoFromItem, catalogSeoPayload, emptyCatalogSeo, type CatalogSeoState } from './catalog-seo-section'

type CatalogTab = 'categories' | 'policies'

type CategoryFormState = {
  name: string
  slug: string
  showInNav: boolean
  navType: 'Mega Menu' | 'Direct Link'
  directUrl: string
  displayOrder: number
  status: 'Active' | 'Hidden'
  seo: CatalogSeoState
  seoInitial: CatalogSeoState
}

type SubcategoryFormState = {
  name: string
  slug: string
  parentCategoryId: string
  iconSvgPath: string
  displayOrder: number
  status: 'Active' | 'Hidden'
  seo: CatalogSeoState
  seoInitial: CatalogSeoState
}

type OptionFormState = {
  name: string
  slug: string
  parentSubcategoryId: string
  iconSvgPath: string
  displayOrder: number
  status: 'Active' | 'Hidden'
  seo: CatalogSeoState
  seoInitial: CatalogSeoState
}

type PolicyFormState = {
  kind: 'shipping' | 'care_warranty'
  name: string
  slug: string
  title: string
  body: string
  displayOrder: number
  status: 'Active' | 'Hidden'
}

const PAGE_SIZE = 20

function directUrlFromSlug(slug: string) {
  const normalizedSlug = slug.trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/')
  return normalizedSlug ? `/${normalizedSlug}` : ''
}

function shouldSyncDirectUrl(directUrl: string, previousSlug: string) {
  const currentUrl = directUrl.trim()
  return currentUrl === '' || currentUrl === directUrlFromSlug(previousSlug)
}

function getCategoryNavStatus(category: CatalogCategory, navbarItems: CatalogNavbarItem[]) {
  const navbarItem = navbarItems.find((item) => item.linked_category_id === category.id || item.slug === category.slug)
  const categoryIsInNavbar = category.show_in_nav !== false && Boolean(category.nav_type)
  const navbarItemIsActive = navbarItem?.status === 'active'
  const isInNavbar = categoryIsInNavbar || navbarItemIsActive
  const navType = categoryIsInNavbar ? category.nav_type : navbarItem?.item_type

  if (!isInNavbar) {
    return { label: 'Not in Nav', className: 'bg-slate-100 text-slate-700' }
  }

  return navType === 'direct_link'
    ? { label: 'Direct Link', className: 'bg-slate-100 text-slate-700' }
    : { label: 'Mega Menu', className: 'bg-blue-100 text-blue-700' }
}

function emptyCategoryForm(nextOrder: number): CategoryFormState {
  return {
    name: '',
    slug: '',
    showInNav: true,
    navType: 'Mega Menu',
    directUrl: '',
    displayOrder: nextOrder,
    status: 'Active',
    seo: emptyCatalogSeo,
    seoInitial: emptyCatalogSeo,
  }
}

function emptySubcategoryForm(categoryId: string, nextOrder: number): SubcategoryFormState {
  return {
    name: '',
    slug: '',
    parentCategoryId: categoryId || '',
    iconSvgPath: '',
    displayOrder: nextOrder,
    status: 'Active',
    seo: emptyCatalogSeo,
    seoInitial: emptyCatalogSeo,
  }
}

function emptyOptionForm(subcategoryId: string, nextOrder: number): OptionFormState {
  return {
    name: '',
    slug: '',
    parentSubcategoryId: subcategoryId || '',
    iconSvgPath: '',
    displayOrder: nextOrder,
    status: 'Active',
    seo: emptyCatalogSeo,
    seoInitial: emptyCatalogSeo,
  }
}

function emptyPolicyForm(nextOrder: number): PolicyFormState {
  return {
    kind: 'shipping',
    name: '',
    slug: '',
    title: '',
    body: '',
    displayOrder: nextOrder,
    status: 'Active',
  }
}

async function authedFetch(url: string, options: RequestInit = {}) {
  return catalogFetch(url, options)
}

async function uploadCatalogSvg(kind: 'subcategories' | 'options', file: File) {
  return uploadAwsImage(file, `/api/catalog/${kind}/upload`, {})
}

export function CatalogClient({
  initialCategories,
  initialNavbarItems,
  initialProductContentRules,
}: {
  initialCategories: CatalogCategory[]
  initialNavbarItems: CatalogNavbarItem[]
  initialProductContentRules: ProductContentRule[]
}) {
  const [activeTab, setActiveTab] = useState<CatalogTab>('categories')
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<CatalogCategory[]>(initialCategories)
  const [navbarItems, setNavbarItems] = useState<CatalogNavbarItem[]>(initialNavbarItems)
  const [productContentRules, setProductContentRules] = useState<ProductContentRule[]>(initialProductContentRules)

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.slice(1)
      if (hash === 'categories' || hash === 'policies') {
        setActiveTab(hash)
      }
    }

    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const response = await authedFetch('/api/catalog/bootstrap')
      const payload = await response.json()
      if (response.ok) {
        setCategories(payload.categories ?? [])
        setNavbarItems(payload.navbarItems ?? [])
        setProductContentRules(payload.productContentRules ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Catalog Setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure top-level catalog categories and reusable master policies.</p>
      </div>

      <div className="mb-8 flex gap-2 overflow-x-auto border-b border-border">
        {[
          { id: 'categories' as const, label: 'Categories' },
          { id: 'policies' as const, label: 'Policies' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id)
              window.location.hash = tab.id
            }}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors duration-150 ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'categories' ? (
        <CategoriesPanel categories={categories} navbarItems={navbarItems} onChange={loadData} />
      ) : null}

      {activeTab === 'policies' ? (
        <PoliciesPanel productContentRules={productContentRules} onChange={loadData} />
      ) : null}

      {loading ? (
        <div className="mt-8 text-sm text-muted-foreground">Updating catalog data...</div>
      ) : null}
    </div>
  )
}

function CategoriesPanel({ categories, navbarItems, onChange }: { categories: CatalogCategory[]; navbarItems: CatalogNavbarItem[]; onChange: () => Promise<void> }) {
  const { toast } = useToast()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  // HOD-056: warn before leaving with unsaved edits.
  const edits = useEditGuard(isPanelOpen)
  const [formData, setFormData] = useState<CategoryFormState>(emptyCategoryForm(categories.length + 1))
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CatalogCategory | null>(null)
  const selectedCategory = selectedId ? categories.find((item) => item.id === selectedId) ?? null : null
  const isEditingLockedCategory = Boolean(selectedCategory?.is_system_locked)

  const openNew = () => {
    setSelectedId(null)
    setFormData(emptyCategoryForm(categories.length + 1))
    setIsPanelOpen(true)
  }

  const openEdit = (item: CatalogCategory) => {
    setSelectedId(item.id)
    setFormData({
      name: item.name,
      slug: item.slug,
      showInNav: item.show_in_nav ?? Boolean(item.nav_type),
      navType: item.nav_type === 'direct_link' ? 'Direct Link' : 'Mega Menu',
      directUrl: item.direct_link_url?.trim() || (item.nav_type === 'direct_link' ? directUrlFromSlug(item.slug) : ''),
      displayOrder: item.display_order,
      status: item.status === 'hidden' ? 'Hidden' : 'Active',
      seo: catalogSeoFromItem(item),
      seoInitial: catalogSeoFromItem(item),
    })
    setIsPanelOpen(true)
  }

  const saveItem = async () => {
    const directUrl = formData.directUrl.trim()
    if (formData.showInNav && formData.navType === 'Direct Link' && !directUrl) {
      setSaveConfirmOpen(false)
      toast({ title: 'Direct Link URL required', description: 'Enter a slug or provide a URL before saving this direct-link category.' })
      return
    }

    const response = await authedFetch(selectedId ? `/api/catalog/categories/${selectedId}` : '/api/catalog/categories', {
      method: selectedId ? 'PATCH' : 'POST',
      body: catalogHierarchySaveBody({
        code: formData.slug.replace(/-/g, '_'),
        name: formData.name,
        slug: formData.slug,
        show_in_nav: formData.showInNav,
        nav_type: formData.showInNav ? (formData.navType === 'Direct Link' ? 'direct_link' : 'mega_menu') : null,
        direct_link_url: formData.showInNav && formData.navType === 'Direct Link' ? directUrl : null,
        display_order: formData.displayOrder,
        status: formData.status === 'Hidden' ? 'hidden' : 'active',
      }, selectedCategory?._revision ?? null, catalogSeoPayload(formData.seo, formData.seoInitial)),
    })

    if (response.ok) {
      await onChange()
      setIsPanelOpen(false)
      setSelectedId(null)
      setSaveConfirmOpen(false)
      toast({ title: 'Category saved', description: `${formData.name} was updated successfully.` })
    } else {
      const payload = await response.json().catch(() => null)
      toast({ title: 'Save failed', description: payload?.error ?? 'Unable to save category.' })
    }
  }

  const deleteItem = async (id: string) => {
    const revision = categories.find((item) => item.id === id)?._revision
    if (!revision) { toast({ title: 'Reload required', description: 'Reload this category before deleting it.' }); return }
    const response = await authedFetch(`/api/catalog/categories/${id}`, { method: 'DELETE', body: catalogHierarchyDeleteBody(revision) })
    if (response.ok) {
      await onChange()
      setDeleteTarget(null)
      toast({ title: 'Category deleted', description: 'The category was removed successfully.' })
    } else {
      const payload = await response.json().catch(() => null)
      toast({ title: 'Delete failed', description: payload?.error ?? 'Unable to delete category.' })
    }
  }

  return (
    <div {...edits.bind} className="space-y-6">
      <SectionHeader title="Categories" description="Manage main catalog categories." actionLabel="Add New Category" onAction={openNew} />

      <DataTable
        headers={['Image', 'Name', 'Slug', 'Nav Type', 'Display Order', 'Status', 'View', 'Edit', 'Delete']}
        rows={categories.map((item) => {
          const navStatus = getCategoryNavStatus(item, navbarItems)
          return {
          id: item.id,
          cells: [
            <CatalogImagePreview
              key="image"
              path={item.banner_desktop_image_path || item.banner_mobile_image_path}
              alt={item.banner_desktop_image_alt || item.banner_mobile_image_alt || `${item.name} category banner`}
            />,
            <div key="name" className="flex items-center gap-2">
              <span>{item.name}</span>
              {item.is_system_locked ? <Badge className="bg-amber-100 text-amber-700">System Locked</Badge> : null}
            </div>,
            item.slug,
            <Badge key="nav" className={navStatus.className}>
              {navStatus.label}
            </Badge>,
            item.display_order,
            <Badge key="status" className={item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}>{item.status === 'active' ? 'Active' : 'Hidden'}</Badge>,
            <Link
              key="view"
              href={`/dashboard/catalog/${item.slug}`}
              className="inline-flex items-center rounded p-1.5 transition-colors hover:bg-secondary"
            >
              <span className="text-sm font-medium text-muted-foreground">View</span>
            </Link>,
            item.is_system_locked ? (
              <span key="edit-locked" className="text-xs font-medium text-muted-foreground">Locked</span>
            ) : (
              <IconButton key="edit" onClick={() => openEdit(item)}><Edit2 size={14} className="text-muted-foreground" /></IconButton>
            ),
            item.is_system_locked ? (
              <span key="delete-protected" className="text-xs font-medium text-muted-foreground">Protected</span>
            ) : (
              <IconButton key="delete" onClick={() => setDeleteTarget(item)} destructive><Trash2 size={14} className="text-red-600" /></IconButton>
            ),
          ],
        }})}
      />

      <FormDialog
        open={isPanelOpen}
        onOpenChange={setIsPanelOpen}
        title={selectedId ? 'Edit Category' : 'Add Category'}
        description="Use this popup to add or edit category records."
      >
        {isEditingLockedCategory ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This is a protected system category. Manage its subcategories and options from the category detail page, but do not edit or delete the main category record.
          </div>
        ) : null}
        <Field label="Name">
          <input
            value={formData.name}
            onChange={(e) => setFormData((prev) => {
              const nextName = e.target.value
              const nextSlug = prev.slug === '' || prev.slug === slugify(prev.name) ? slugify(nextName) : prev.slug
              return {
                ...prev,
                name: nextName,
                slug: nextSlug,
                directUrl: shouldSyncDirectUrl(prev.directUrl, prev.slug) ? directUrlFromSlug(nextSlug) : prev.directUrl,
              }
            })}
            disabled={isEditingLockedCategory}
            className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
          />
        </Field>
        <Field label="Slug">
          <input
            value={formData.slug}
            onChange={(e) => setFormData((prev) => {
              const nextSlug = e.target.value
              return {
                ...prev,
                slug: nextSlug,
                directUrl: shouldSyncDirectUrl(prev.directUrl, prev.slug) ? directUrlFromSlug(nextSlug) : prev.directUrl,
              }
            })}
            disabled={isEditingLockedCategory}
            className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
          />
        </Field>
        <Field label="Show in Navbar">
          <ToggleRow
            options={['Yes', 'No']}
            value={formData.showInNav ? 'Yes' : 'No'}
            onChange={(value) => setFormData((prev) => {
              const showInNav = value === 'Yes'
              return {
                ...prev,
                showInNav,
                directUrl: showInNav && prev.navType === 'Direct Link' && !prev.directUrl.trim()
                  ? directUrlFromSlug(prev.slug)
                  : prev.directUrl,
              }
            })}
            disabled={isEditingLockedCategory}
          />
        </Field>
        {formData.showInNav ? (
          <Field label="Nav Type">
            <ToggleRow
              options={['Mega Menu', 'Direct Link']}
              value={formData.navType}
              onChange={(value) => setFormData((prev) => {
                const navType = value as CategoryFormState['navType']
                return {
                  ...prev,
                  navType,
                  directUrl: navType === 'Direct Link' && !prev.directUrl.trim()
                    ? directUrlFromSlug(prev.slug)
                    : prev.directUrl,
                }
              })}
              disabled={isEditingLockedCategory}
            />
          </Field>
        ) : null}
        {formData.showInNav && formData.navType === 'Direct Link' ? (
          <Field label="Direct Link URL">
            <input value={formData.directUrl} onChange={(e) => setFormData((prev) => ({ ...prev, directUrl: e.target.value }))} disabled={isEditingLockedCategory} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
          </Field>
        ) : null}
        <Field label="Display Order">
          <input type="number" value={formData.displayOrder} onChange={(e) => setFormData((prev) => ({ ...prev, displayOrder: Number(e.target.value) || 0 }))} disabled={isEditingLockedCategory} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
        </Field>
        <Field label="Status">
          <ToggleRow options={['Active', 'Hidden']} value={formData.status} onChange={(value) => setFormData((prev) => ({ ...prev, status: value as CategoryFormState['status'] }))} disabled={isEditingLockedCategory} />
        </Field>
        <CatalogSeoSection idPrefix="category" value={formData.seo} onChange={(seo) => setFormData((prev) => ({ ...prev, seo }))} name={formData.name} slug={formData.slug} disabled={isEditingLockedCategory} />
        <Actions
          onSave={() => {
            if (formData.showInNav && formData.navType === 'Direct Link' && !formData.directUrl.trim()) {
              toast({ title: 'Direct Link URL required', description: 'Enter a slug or provide a URL before saving this direct-link category.' })
              return
            }
            setSaveConfirmOpen(true)
          }}
          onCancel={() => setIsPanelOpen(false)}
          saveDisabled={isEditingLockedCategory}
        />
      </FormDialog>

      <ConfirmDialog
        isOpen={saveConfirmOpen}
        title={selectedId ? 'Update category?' : 'Create category?'}
        description="This will save the category changes."
        confirmText="Save"
        onConfirm={() => void saveItem()}
        onCancel={() => setSaveConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete category?"
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

function SubcategoriesPanel({
  categories,
  subcategories,
  onChange,
}: {
  categories: CatalogCategory[]
  subcategories: CatalogSubcategory[]
  onChange: () => Promise<void>
}) {
  const { toast } = useToast()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  // HOD-056: warn before leaving with unsaved edits.
  const edits = useEditGuard(isPanelOpen)
  const [formData, setFormData] = useState<SubcategoryFormState>(emptySubcategoryForm(categories[0]?.id ?? '', subcategories.length + 1))
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CatalogSubcategory | null>(null)
  const [uploading, setUploading] = useState(false)

  const openNew = () => {
    setSelectedId(null)
    setFormData(emptySubcategoryForm('', subcategories.length + 1))
    setIsPanelOpen(true)
  }

  const openEdit = (item: CatalogSubcategory) => {
    setSelectedId(item.id)
    setFormData({
      name: item.name,
      slug: item.slug,
      parentCategoryId: item.category_id,
      iconSvgPath: item.icon_svg_path ?? '',
      displayOrder: item.display_order,
      status: item.status === 'hidden' ? 'Hidden' : 'Active',
      seo: catalogSeoFromItem(item),
      seoInitial: catalogSeoFromItem(item),
    })
    setIsPanelOpen(true)
  }

  const saveItem = async () => {
    if (!formData.parentCategoryId) {
      toast({ title: 'Parent category required', description: 'Choose which category this subcategory belongs to.' })
      return
    }

    const response = await authedFetch(selectedId ? `/api/catalog/subcategories/${selectedId}` : '/api/catalog/subcategories', {
      method: selectedId ? 'PATCH' : 'POST',
      body: catalogHierarchySaveBody({
        category_id: formData.parentCategoryId,
        name: formData.name,
        slug: formData.slug,
        sub_type: subcategories.find((item) => item.id === selectedId)?.sub_type ?? 'standard',
        icon_svg_path: formData.iconSvgPath || null,
        display_order: formData.displayOrder,
        status: formData.status === 'Hidden' ? 'hidden' : 'active',
      }, subcategories.find((item) => item.id === selectedId)?._revision ?? null, catalogSeoPayload(formData.seo, formData.seoInitial)),
    })

    if (response.ok) {
      await onChange()
      setIsPanelOpen(false)
      setSelectedId(null)
      setSaveConfirmOpen(false)
      toast({ title: 'Subcategory saved', description: `${formData.name} was updated successfully.` })
    } else {
      const payload = await response.json().catch(() => null)
      toast({ title: 'Save failed', description: payload?.error ?? 'Unable to save subcategory.' })
    }
  }

  const deleteItem = async (id: string) => {
    const revision = subcategories.find((item) => item.id === id)?._revision
    if (!revision) { toast({ title: 'Reload required', description: 'Reload this subcategory before deleting it.' }); return }
    const response = await authedFetch(`/api/catalog/subcategories/${id}`, { method: 'DELETE', body: catalogHierarchyDeleteBody(revision) })
    if (response.ok) {
      await onChange()
      setDeleteTarget(null)
      toast({ title: 'Subcategory deleted', description: 'The subcategory was removed successfully.' })
    } else {
      const payload = await response.json().catch(() => null)
      toast({ title: 'Delete failed', description: payload?.error ?? 'Unable to delete subcategory.' })
    }
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const path = await uploadCatalogSvg('subcategories', file)
      if (selectedId) {
        const response = await authedFetch(`/api/catalog/subcategories/${selectedId}`, {
          method: 'PATCH',
          body: catalogHierarchySaveBody({ icon_svg_path: path }, subcategories.find((item) => item.id === selectedId)?._revision ?? null),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error ?? 'SVG uploaded, but the subcategory could not be updated.')
        }
        await onChange()
      }
      setFormData((current) => ({ ...current, iconSvgPath: path }))
      toast({ title: 'SVG uploaded', description: 'Subcategory icon uploaded successfully.' })
    } catch (error) {
      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Unable to upload SVG.' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div {...edits.bind} className="space-y-6">
      <SectionHeader title="Subcategories" description="Manage category children and their display behavior." actionLabel="Add New Subcategory" onAction={openNew} />

      <DataTable
        headers={['Name', 'Slug', 'Icon', 'Parent Category', 'Display Order', 'Status', 'Edit', 'Delete']}
        rows={subcategories.map((item) => ({
          id: item.id,
          cells: [
            item.name,
            item.slug,
            item.icon_svg_path || 'No SVG',
            categories.find((category) => category.id === item.category_id)?.name ?? '',
            item.display_order,
            item.status === 'active' ? 'Active' : 'Hidden',
            <IconButton key="edit" onClick={() => openEdit(item)}><Edit2 size={14} className="text-muted-foreground" /></IconButton>,
            <IconButton key="delete" onClick={() => setDeleteTarget(item)} destructive><Trash2 size={14} className="text-red-600" /></IconButton>,
          ],
        }))}
      />

      <FormDialog
        open={isPanelOpen}
        onOpenChange={setIsPanelOpen}
        title={selectedId ? 'Edit Subcategory' : 'Add Subcategory'}
        description="Use this popup to add or edit subcategory records."
      >
        <Field label="Name">
          <input
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value, slug: prev.slug === '' || prev.slug === slugify(prev.name) ? slugify(e.target.value) : prev.slug }))}
            className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
          />
        </Field>
        <Field label="Slug">
          <input value={formData.slug} onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
        </Field>
        <Field label="Icon SVG">
          <div className="space-y-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
              Upload SVG
              <input
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleUpload(file)
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
            <p className="text-xs text-muted-foreground">
              {uploading ? 'Uploading SVG...' : formData.iconSvgPath || 'No SVG uploaded yet'}
            </p>
          </div>
        </Field>
        <Field label="Parent Category">
          <Select value={formData.parentCategoryId || undefined} onValueChange={(value) => setFormData((prev) => ({ ...prev, parentCategoryId: value }))}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Display Order">
          <input type="number" value={formData.displayOrder} onChange={(e) => setFormData((prev) => ({ ...prev, displayOrder: Number(e.target.value) || 0 }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
        </Field>
        <Field label="Status">
          <ToggleRow options={['Active', 'Hidden']} value={formData.status} onChange={(value) => setFormData((prev) => ({ ...prev, status: value as SubcategoryFormState['status'] }))} />
        </Field>
        <p className="text-xs text-muted-foreground">Pick the parent category from the dropdown above before saving.</p>
        <CatalogSeoSection idPrefix="subcategory" value={formData.seo} onChange={(seo) => setFormData((prev) => ({ ...prev, seo }))} name={formData.name} slug={formData.slug} />
        <Actions onSave={() => setSaveConfirmOpen(true)} onCancel={() => setIsPanelOpen(false)} />
      </FormDialog>

      <ConfirmDialog
        isOpen={saveConfirmOpen}
        title={selectedId ? 'Update subcategory?' : 'Create subcategory?'}
        description="This will save the subcategory changes."
        confirmText="Save"
        onConfirm={() => void saveItem()}
        onCancel={() => setSaveConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete subcategory?"
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

function OptionsPanel({
  subcategories,
  options,
  onChange,
}: {
  subcategories: CatalogSubcategory[]
  options: CatalogOption[]
  onChange: () => Promise<void>
}) {
  const { toast } = useToast()
  const availableSubcategories = subcategories.filter((item) => item.status === 'active')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  // HOD-056: warn before leaving with unsaved edits.
  const edits = useEditGuard(isPanelOpen)
  const [formData, setFormData] = useState<OptionFormState>(emptyOptionForm(availableSubcategories[0]?.id ?? '', options.length + 1))
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CatalogOption | null>(null)
  const [uploading, setUploading] = useState(false)

  const openNew = () => {
    setSelectedId(null)
    setFormData(emptyOptionForm('', options.length + 1))
    setIsPanelOpen(true)
  }

  const openEdit = (item: CatalogOption) => {
    setSelectedId(item.id)
    setFormData({
      name: item.name,
      slug: item.slug,
      parentSubcategoryId: item.subcategory_id,
      iconSvgPath: item.icon_svg_path ?? '',
      displayOrder: item.display_order,
      status: item.status === 'hidden' ? 'Hidden' : 'Active',
      seo: catalogSeoFromItem(item),
      seoInitial: catalogSeoFromItem(item),
    })
    setIsPanelOpen(true)
  }

  const saveItem = async () => {
    if (!formData.parentSubcategoryId) {
      toast({ title: 'Parent subcategory required', description: 'Choose which subcategory this option belongs to.' })
      return
    }

    const response = await authedFetch(selectedId ? `/api/catalog/options/${selectedId}` : '/api/catalog/options', {
      method: selectedId ? 'PATCH' : 'POST',
      body: catalogHierarchySaveBody({
        subcategory_id: formData.parentSubcategoryId,
        name: formData.name,
        slug: formData.slug,
        icon_svg_path: formData.iconSvgPath || null,
        display_order: formData.displayOrder,
        status: formData.status === 'Hidden' ? 'hidden' : 'active',
      }, options.find((item) => item.id === selectedId)?._revision ?? null, catalogSeoPayload(formData.seo, formData.seoInitial)),
    })

    if (response.ok) {
      await onChange()
      setIsPanelOpen(false)
      setSelectedId(null)
      setSaveConfirmOpen(false)
      toast({ title: 'Option saved', description: `${formData.name} was updated successfully.` })
    } else {
      const payload = await response.json().catch(() => null)
      toast({ title: 'Save failed', description: payload?.error ?? 'Unable to save option.' })
    }
  }

  const deleteItem = async (id: string) => {
    const revision = options.find((item) => item.id === id)?._revision
    if (!revision) { toast({ title: 'Reload required', description: 'Reload this option before deleting it.' }); return }
    const response = await authedFetch(`/api/catalog/options/${id}`, { method: 'DELETE', body: catalogHierarchyDeleteBody(revision) })
    if (response.ok) {
      await onChange()
      setDeleteTarget(null)
      toast({ title: 'Option deleted', description: 'The option was removed successfully.' })
    } else {
      const payload = await response.json().catch(() => null)
      toast({ title: 'Delete failed', description: payload?.error ?? 'Unable to delete option.' })
    }
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const path = await uploadCatalogSvg('options', file)
      if (selectedId) {
        const response = await authedFetch(`/api/catalog/options/${selectedId}`, {
          method: 'PATCH',
          body: catalogHierarchySaveBody({ icon_svg_path: path }, options.find((item) => item.id === selectedId)?._revision ?? null),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error ?? 'SVG uploaded, but the option could not be updated.')
        }
        await onChange()
      }
      setFormData((current) => ({ ...current, iconSvgPath: path }))
      toast({ title: 'SVG uploaded', description: 'Option icon uploaded successfully.' })
    } catch (error) {
      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Unable to upload SVG.' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div {...edits.bind} className="space-y-6">
      <SectionHeader title="Options" description="Manage manual child options for any subcategory." actionLabel="Add New Option" onAction={openNew} />

      <DataTable
        headers={['Name', 'Slug', 'Icon', 'Parent Subcategory', 'Display Order', 'Status', 'Edit', 'Delete']}
        rows={options.map((item) => ({
          id: item.id,
          cells: [
            item.name,
            item.slug,
            item.icon_svg_path || 'No SVG',
            subcategories.find((subcategory) => subcategory.id === item.subcategory_id)?.name ?? '',
            item.display_order,
            item.status === 'active' ? 'Active' : 'Hidden',
            <IconButton key="edit" onClick={() => openEdit(item)}><Edit2 size={14} className="text-muted-foreground" /></IconButton>,
            <IconButton key="delete" onClick={() => setDeleteTarget(item)} destructive><Trash2 size={14} className="text-red-600" /></IconButton>,
          ],
        }))}
      />

      <FormDialog
        open={isPanelOpen}
        onOpenChange={setIsPanelOpen}
        title={selectedId ? 'Edit Option' : 'Add Option'}
        description="Use this popup to add or edit option records."
      >
        <Field label="Name">
          <input
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value, slug: prev.slug === '' || prev.slug === slugify(prev.name) ? slugify(e.target.value) : prev.slug }))}
            className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
          />
        </Field>
        <Field label="Slug">
          <input value={formData.slug} onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
        </Field>
        <Field label="Icon SVG">
          <div className="space-y-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
              Upload SVG
              <input
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleUpload(file)
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
            <p className="text-xs text-muted-foreground">
              {uploading ? 'Uploading SVG...' : formData.iconSvgPath || 'No SVG uploaded yet'}
            </p>
          </div>
        </Field>
        <Field label="Parent Subcategory">
          <Select value={formData.parentSubcategoryId || undefined} onValueChange={(value) => setFormData((prev) => ({ ...prev, parentSubcategoryId: value }))}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select subcategory" />
            </SelectTrigger>
            <SelectContent>
              {availableSubcategories.map((subcategory) => (
                <SelectItem key={subcategory.id} value={subcategory.id}>{subcategory.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Display Order">
          <input type="number" value={formData.displayOrder} onChange={(e) => setFormData((prev) => ({ ...prev, displayOrder: Number(e.target.value) || 0 }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
        </Field>
        <Field label="Status">
          <ToggleRow options={['Active', 'Hidden']} value={formData.status} onChange={(value) => setFormData((prev) => ({ ...prev, status: value as OptionFormState['status'] }))} />
        </Field>
        <p className="text-xs text-muted-foreground">Pick the parent subcategory from the dropdown above before saving.</p>
        <CatalogSeoSection idPrefix="option" value={formData.seo} onChange={(seo) => setFormData((prev) => ({ ...prev, seo }))} name={formData.name} slug={formData.slug} />
        <Actions onSave={() => setSaveConfirmOpen(true)} onCancel={() => setIsPanelOpen(false)} />
      </FormDialog>

      <ConfirmDialog
        isOpen={saveConfirmOpen}
        title={selectedId ? 'Update option?' : 'Create option?'}
        description="This will save the option changes."
        confirmText="Save"
        onConfirm={() => void saveItem()}
        onCancel={() => setSaveConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete option?"
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

function PoliciesPanel({
  productContentRules,
  onChange,
}: {
  productContentRules: ProductContentRule[]
  onChange: () => Promise<void>
}) {
  const { toast } = useToast()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  // HOD-056: warn before leaving with unsaved edits.
  const edits = useEditGuard(isPanelOpen)
  const [formData, setFormData] = useState<PolicyFormState>(emptyPolicyForm(productContentRules.length + 1))
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProductContentRule | null>(null)

  const openNew = () => {
    setSelectedId(null)
    setFormData(emptyPolicyForm(productContentRules.length + 1))
    setIsPanelOpen(true)
  }

  const openEdit = (item: ProductContentRule) => {
    setSelectedId(item.id)
    setFormData({
      kind: item.kind,
      name: item.name,
      slug: item.slug,
      title: item.title,
      body: item.body,
      displayOrder: item.display_order ?? 0,
      status: item.status === 'hidden' ? 'Hidden' : 'Active',
    })
    setIsPanelOpen(true)
  }

  const saveItem = async () => {
    const response = await authedFetch(
      selectedId ? `/api/catalog/product-content-rules/${selectedId}` : '/api/catalog/product-content-rules',
      {
        method: selectedId ? 'PATCH' : 'POST',
        body: catalogMasterSaveBody({
          kind: formData.kind,
          name: formData.name,
          slug: formData.slug,
          title: formData.title,
          body: formData.body,
          display_order: formData.displayOrder,
          status: formData.status === 'Hidden' ? 'hidden' : 'active',
        }, selectedId ? productContentRules.find((item) => item.id === selectedId)?._revision : null),
      }
    )

    if (response.ok) {
      await onChange()
      setIsPanelOpen(false)
      setSelectedId(null)
      setSaveConfirmOpen(false)
      toast({ title: 'Policy saved', description: `${formData.name} was updated successfully.` })
    } else {
      const payload = await response.json().catch(() => null)
      toast({ title: 'Save failed', description: payload?.error ?? 'Unable to save policy.' })
    }
  }

  const deleteItem = async (id: string) => {
    const revision = productContentRules.find((item) => item.id === id)?._revision
    if (!revision) return
    const response = await authedFetch(`/api/catalog/product-content-rules/${id}`, { method: 'DELETE', body: catalogMasterDeleteBody(revision) })
    if (response.ok) {
      await onChange()
      setDeleteTarget(null)
      toast({ title: 'Policy deleted', description: 'The policy was removed successfully.' })
    } else {
      const payload = await response.json().catch(() => null)
      toast({ title: 'Delete failed', description: payload?.error ?? 'Unable to delete policy.' })
    }
  }

  return (
    <div {...edits.bind} className="space-y-6">
      <SectionHeader
        title="Policies"
        description="Manage reusable Shipping and Care & Warranty master rules."
        actionLabel="Add New Policy"
        onAction={openNew}
      />

      <DataTable
        headers={['Name', 'Kind', 'Title', 'Display Order', 'Status', 'Edit', 'Delete']}
        rows={productContentRules.map((item) => ({
          id: item.id,
          cells: [
            item.name,
            item.kind === 'shipping' ? 'Shipping' : 'Care & Warranty',
            item.title,
            item.display_order ?? 0,
            item.status === 'active' ? 'Active' : 'Hidden',
            <IconButton key="edit" onClick={() => openEdit(item)}><Edit2 size={14} className="text-muted-foreground" /></IconButton>,
            <IconButton key="delete" onClick={() => setDeleteTarget(item)} destructive><Trash2 size={14} className="text-red-600" /></IconButton>,
          ],
        }))}
      />

      <FormDialog
        open={isPanelOpen}
        onOpenChange={setIsPanelOpen}
        title={selectedId ? 'Edit Policy' : 'Add Policy'}
        description="Create reusable Shipping and Care & Warranty master rules."
      >
        <Field label="Policy Type">
          <ToggleRow
            options={['Shipping', 'Care & Warranty']}
            value={formData.kind === 'shipping' ? 'Shipping' : 'Care & Warranty'}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                kind: value === 'Shipping' ? 'shipping' : 'care_warranty',
              }))
            }
          />
        </Field>
        <Field label="Name">
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
        </Field>
        <Field label="Slug">
          <input value={formData.slug} onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
        </Field>
        <Field label="Display Title">
          <input
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
          />
        </Field>
        <Field label="Body">
          <textarea
            value={formData.body}
            onChange={(e) => setFormData((prev) => ({ ...prev, body: e.target.value }))}
            rows={6}
            className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
          />
        </Field>
        <Field label="Display Order">
          <input type="number" value={formData.displayOrder} onChange={(e) => setFormData((prev) => ({ ...prev, displayOrder: Number(e.target.value) || 0 }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
        </Field>
        <Field label="Status">
          <ToggleRow options={['Active', 'Hidden']} value={formData.status} onChange={(value) => setFormData((prev) => ({ ...prev, status: value as PolicyFormState['status'] }))} />
        </Field>
        <Actions onSave={() => setSaveConfirmOpen(true)} onCancel={() => setIsPanelOpen(false)} />
      </FormDialog>

      <ConfirmDialog
        isOpen={saveConfirmOpen}
        title={selectedId ? 'Update policy?' : 'Create policy?'}
        description="This will save the policy changes."
        confirmText="Save"
        onConfirm={() => void saveItem()}
        onCancel={() => setSaveConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete policy?"
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

function SectionHeader({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="font-jakarta text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <button type="button" onClick={onAction} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors">
        <Plus size={16} />
        {actionLabel}
      </button>
    </div>
  )
}

function FormDialog({
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  title: string
  description: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-lg font-semibold text-foreground">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">{children}</div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}

function ToggleRow({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: readonly string[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          disabled={disabled}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${value === option ? 'bg-primary text-white' : 'border border-border text-foreground hover:bg-secondary'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function Actions({
  onSave,
  onCancel,
  saveDisabled = false,
}: {
  onSave: () => void
  onCancel: () => void
  saveDisabled?: boolean
}) {
  return (
    <div className="flex gap-3">
      <button type="button" onClick={onSave} disabled={saveDisabled} className={`rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 ${saveDisabled ? 'cursor-not-allowed opacity-60' : ''}`}>Save</button>
      <button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">Cancel</button>
    </div>
  )
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>
}

function IconButton({ children, onClick, destructive = false }: { children: ReactNode; onClick: () => void; destructive?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`rounded p-1.5 transition-colors ${destructive ? 'hover:bg-red-100' : 'hover:bg-secondary'}`}>
      {children}
    </button>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: { id: string; cells: ReactNode[] }[] }) {
  const [page, setPage] = useState(1)
  const totalItems = rows.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visibleRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="rounded-lg border border-border bg-white shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              {headers.map((header) => (
                <th key={header} className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                {row.cells.map((cell, index) => (
                  <td key={`${row.id}-${index}`} className="px-6 py-3.5 text-sm text-foreground">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination page={currentPage} totalItems={totalItems} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  )
}
