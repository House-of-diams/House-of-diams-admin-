'use client'

import { uploadAwsImage } from '@/lib/image-transport'
import { catalogFetch } from '@/lib/catalog-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type Dispatch, type SetStateAction, useMemo, useState } from 'react'
import { ArrowLeft, Eye, EyeOff, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { useEditGuard } from '@/hooks/use-unsaved-changes'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  getSectionCategoryOptions,
  type NavbarSectionSourceItem,
  type NavbarBuilderPayload,
  type NavbarItem,
  type NavbarSection,
  type NavbarSectionType,
} from '@/lib/navbar'
import { navbarItemSaveBody } from '@/lib/navbar-client'

const SECTION_TYPE_OPTIONS: NavbarSectionType[] = ['Subcategory Options', 'Category Link', 'Metal Swatches', 'Stone Shapes', 'Ring Sizes', 'Certificates', 'Styles', 'Manual Links']

type CatalogPayload = Omit<NavbarBuilderPayload, 'items' | 'revision' | 'itemRevisions'>

type NavbarBuilderInitialData = {
  revision: string
  itemRevisions: Record<string, string>
  items: NavbarItem[]
  categories: NavbarBuilderPayload['categories']
  subcategories: NavbarBuilderPayload['subcategories']
  options: NavbarBuilderPayload['options']
  metals: NavbarBuilderPayload['metals']
  stoneShapes: NavbarBuilderPayload['stoneShapes']
  ringSizes: NavbarBuilderPayload['ringSizes']
  certificates: NonNullable<NavbarBuilderPayload['certificates']>
  styles: NonNullable<NavbarBuilderPayload['styles']>
}

type NavbarBuilderState = {
  items: NavbarItem[]
  originalItems: NavbarItem[]
  revision: string
  itemRevisions: Record<string, string>
  catalog: CatalogPayload
  setItems: Dispatch<SetStateAction<NavbarItem[]>>
  reload: () => Promise<NavbarItem[]>
}

function useNavbarBuilderState(initialData: NavbarBuilderInitialData): NavbarBuilderState {
  const { toast } = useToast()
  const [items, setItems] = useState<NavbarItem[]>(initialData.items)
  const [originalItems, setOriginalItems] = useState<NavbarItem[]>(initialData.items)
  const [revision, setRevision] = useState(initialData.revision)
  const [itemRevisions, setItemRevisions] = useState(initialData.itemRevisions)
  const [catalog, setCatalog] = useState<CatalogPayload>({
    categories: initialData.categories,
    subcategories: initialData.subcategories,
    options: initialData.options,
    metals: initialData.metals,
    stoneShapes: initialData.stoneShapes,
    ringSizes: initialData.ringSizes,
    certificates: initialData.certificates,
    styles: initialData.styles,
  })

  const loadNavbar = async () => {
    try {

      const response = await catalogFetch('/api/navbar')

      const payload = (await response.json().catch(() => null)) as NavbarBuilderPayload | { error?: string } | null

      if (!response.ok || !payload || !('items' in payload)) {
        throw new Error((payload as { error?: string } | null)?.error ?? 'Failed to load navbar builder.')
      }

      setItems(payload.items)
      setOriginalItems(payload.items)
      setRevision(payload.revision)
      setItemRevisions(payload.itemRevisions ?? {})
      setCatalog({
        categories: payload.categories,
        subcategories: payload.subcategories,
        options: payload.options,
        metals: payload.metals,
        stoneShapes: payload.stoneShapes,
        ringSizes: payload.ringSizes,
        certificates: payload.certificates ?? [],
        styles: payload.styles ?? [],
      })
      return payload.items
    } catch (error) {
      toast({
        title: 'Load failed',
        description: error instanceof Error ? error.message : 'Unable to load navbar builder.',
        variant: 'destructive',
      })
      return []
    }
  }

  return {
    items,
    originalItems,
    revision,
    itemRevisions,
    catalog,
    setItems,
    reload: loadNavbar,
  }
}

async function uploadFeaturedImage(file: File) {
  return uploadAwsImage(file, '/api/navbar/featured-image', {})
}

function sectionSummary(section: NavbarSection) {
  if (section.type === 'Subcategory Options') return section.sourceLabel || 'No subcategory selected'
  if (section.type === 'Category Link') return section.sourceLabel || 'No category selected'
  if (section.type === 'Manual Links') return `${section.links.length} manual link${section.links.length === 1 ? '' : 's'}`
  return section.type
}

function sectionSourceHint(type: NavbarSectionType) {
  return type === 'Subcategory Options'
    ? 'Pick a subcategory. This section will automatically show all options linked to that subcategory.'
    : type === 'Category Link'
      ? 'Pick a category. This section will render a direct category link instead of option links.'
      : type === 'Metal Swatches'
        ? 'This section pulls directly from the Metals master table.'
        : type === 'Stone Shapes'
          ? 'This section pulls directly from the Stone Shapes master table.'
          : type === 'Ring Sizes'
            ? 'This section pulls directly from the Ring Sizes master table.'
          : type === 'Certificates'
              ? 'This section pulls directly from the Certificates master table.'
              : type === 'Styles'
                ? 'This section pulls directly from the Styles master table.'
              : 'Add manual links to control exactly what appears in this section.'
}

function saveableSection(sectionDraft: NavbarSection): NavbarSection {
  return {
    ...sectionDraft,
    title: sectionDraft.title.trim(),
    showAsFilter: Boolean(sectionDraft.showAsFilter),
    links: sectionDraft.type === 'Manual Links' ? sectionDraft.links : [],
  }
}

export function NavbarBuilderOverview({ initialData }: { initialData: NavbarBuilderInitialData }) {
  const { items } = useNavbarBuilderState(initialData)

  return (
    <div className="p-8">
      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Navbar Builder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage mega menu items from a cleaner overview, then open each item on its own edit page.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-white p-6 shadow-xs">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-jakarta text-lg font-semibold text-foreground">Navigation Items</h2>
            <p className="mt-1 text-sm text-muted-foreground">Each card opens a dedicated edit page with just that item and its sections.</p>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
            {items.length} item{items.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-border bg-white p-5 shadow-xs">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-jakarta text-lg font-semibold text-foreground">{item.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.type === 'mega' ? `${item.sections?.length ?? 0} sections` : item.url || 'Direct link'}
                  </p>
                </div>

                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  {item.type === 'mega' ? 'Mega Menu' : 'Direct Link'}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                    item.visible ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {item.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  {item.visible ? 'Visible' : 'Hidden'}
                </span>

                <Link
                  href={`/dashboard/navbar-builder/${item.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
                >
                  <Pencil size={14} />
                  Edit Item
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export function NavbarItemEditor({ itemId, initialData }: { itemId: string; initialData: NavbarBuilderInitialData }) {
  const router = useRouter()
  const { toast } = useToast()
  // HOD-056: warn before leaving with unsaved edits.
  const edits = useEditGuard()
  const { items, originalItems, itemRevisions, catalog, setItems, reload } = useNavbarBuilderState(initialData)
  const [saving, setSaving] = useState(false)
  const [sectionSaving, setSectionSaving] = useState(false)
  const [featuredImageUploading, setFeaturedImageUploading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [pendingDeleteSectionId, setPendingDeleteSectionId] = useState<string | null>(null)
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false)
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [sectionDraft, setSectionDraft] = useState<NavbarSection | null>(null)

  const selectedItem = items.find((item) => item.id === itemId) ?? null

  const sectionCategoryOptions = useMemo(() => getSectionCategoryOptions(catalog.subcategories), [catalog.subcategories])

  const previewColumns = useMemo(() => {
    if (!selectedItem || selectedItem.type !== 'mega') return []
    const count = Math.max(1, ...(selectedItem.sections ?? []).map((section) => section.column))
    return Array.from({ length: count }, (_, index) => ({
      column: index + 1,
      sections: (selectedItem.sections ?? []).filter((section) => section.column === index + 1),
    }))
  }, [selectedItem])

  const dynamicSourceChoices = useMemo(() => {
    if (!sectionDraft) return []

    if (sectionDraft.type === 'Subcategory Options' && sectionDraft.sourceSubcategoryId) {
      return catalog.options
        .filter((entry) => entry.subcategory_id === sectionDraft.sourceSubcategoryId)
        .sort((left, right) => left.display_order - right.display_order)
        .map((entry) => ({ id: entry.id, label: entry.name, kind: 'subcategory_option' as const }))
    }

    if (sectionDraft.type === 'Metal Swatches') {
      return catalog.metals
        .sort((left, right) => left.display_order - right.display_order)
        .map((entry) => ({ id: entry.id, label: entry.name, kind: 'metal' as const }))
    }

    if (sectionDraft.type === 'Stone Shapes') {
      return catalog.stoneShapes
        .sort((left, right) => left.display_order - right.display_order)
        .map((entry) => ({ id: entry.id, label: entry.name, kind: 'stone_shape' as const }))
    }

    if (sectionDraft.type === 'Ring Sizes') {
      return catalog.ringSizes
        .sort((left, right) => left.display_order - right.display_order)
        .map((entry) => ({ id: entry.id, label: entry.name, kind: 'ring_size' as const }))
    }

    if (sectionDraft.type === 'Certificates') {
      return catalog.certificates
        .sort((left, right) => (left.display_order ?? 0) - (right.display_order ?? 0))
        .map((entry) => ({ id: entry.id, label: entry.name, kind: 'certificate' as const }))
    }

    if (sectionDraft.type === 'Styles') {
      return catalog.styles
        .sort((left, right) => left.display_order - right.display_order)
        .map((entry) => ({ id: entry.id, label: entry.name, kind: 'style' as const }))
    }

    return []
  }, [catalog, sectionDraft])

  const updateItem = (updater: (item: NavbarItem) => NavbarItem) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? updater(item) : item)))
  }

  const buildDefaultSection = (): NavbarSection => {
    const firstOption = sectionCategoryOptions[0]
    return {
      id: `section-${Date.now()}`,
      title: '',
      iconSvgPath: '',
      type: 'Subcategory Options',
      sourceLabel: firstOption?.label ?? '',
      sourceSubcategoryId: firstOption?.id ?? null,
      sourceCategorySlug: null,
      column: 1,
      showAsFilter: false,
      enableCategoryLink: false,
      linkedCategoryId: null,
      selectedSourceItems: [],
      links: [{ label: '', url: '' }],
    }
  }

  const openAddSectionDialog = () => {
    if (!selectedItem || selectedItem.type !== 'mega') return
    setEditingSectionId(null)
    setSectionDraft(buildDefaultSection())
    setSectionDialogOpen(true)
  }

  const openEditSectionDialog = (section: NavbarSection) => {
    setEditingSectionId(section.id)
    setSectionDraft({
      ...section,
      iconSvgPath: section.iconSvgPath ?? '',
      showAsFilter: Boolean(section.showAsFilter),
      enableCategoryLink: Boolean(section.enableCategoryLink),
      linkedCategoryId: section.linkedCategoryId ?? null,
      selectedSourceItems: section.selectedSourceItems ?? [],
      links: section.links.length > 0 ? section.links : [{ label: '', url: '' }],
    })
    setSectionDialogOpen(true)
  }

  const saveSectionDraft = () => {
    if (!selectedItem || selectedItem.type !== 'mega' || !sectionDraft) return
    setSectionSaving(true)
    const nextSection = saveableSection(sectionDraft)

    updateItem((item) => ({
      ...item,
      sections: editingSectionId
        ? (item.sections ?? []).map((section) => (section.id === editingSectionId ? nextSection : section))
        : [...(item.sections ?? []), nextSection],
    }))

    setSectionDialogOpen(false)
    setEditingSectionId(null)
    setSectionDraft(null)
    setSectionSaving(false)
  }

  const uploadSectionIcon = async (file: File) => {
    const path = await uploadAwsImage(file, '/api/navbar/section-icon', {})
    setSectionDraft((current) => (current ? { ...current, iconSvgPath: path } : current))
  }

  const saveNavbar = async () => {
    setSaving(true)
    try {
      if (!selectedItem) throw new Error('Navbar item not found.')
      const originalItem = originalItems.find((item) => item.id === itemId)
      const itemRevision = itemRevisions[itemId]
      if (!originalItem || !itemRevision) throw new Error('Reload this navbar item before saving.')
      const currentSlug = selectedItem?.slug ?? null

      const response = await catalogFetch(`/api/navbar/${itemId}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: navbarItemSaveBody(selectedItem, originalItem, itemRevision),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to save navbar builder.')
      }

      setConfirmOpen(false)
      edits.reset()
      toast({
        title: 'Saved',
        description: 'Navbar item updated successfully.',
      })
      const reloadedItems = await reload()
      const savedItem = currentSlug ? reloadedItems.find((item) => item.slug === currentSlug) : null

      if (savedItem && savedItem.id !== itemId) {
        router.replace(`/dashboard/navbar-builder/${savedItem.id}`)
      }
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unable to save navbar builder.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const requestDeleteSection = (sectionId: string) => {
    setPendingDeleteSectionId(sectionId)
    setDeleteConfirmOpen(true)
  }

  const confirmDeleteSection = () => {
    if (!pendingDeleteSectionId) return

    updateItem((item) => ({
      ...item,
      sections: (item.sections ?? []).filter((entry) => entry.id !== pendingDeleteSectionId),
    }))

    setDeleteConfirmOpen(false)
    setPendingDeleteSectionId(null)
    toast({
      title: 'Section removed',
      description: 'Save navbar changes to publish this deletion.',
    })
  }

  const updateFeaturedImage = (updater: NonNullable<NavbarItem['featuredImage']> | ((current: NonNullable<NavbarItem['featuredImage']>) => NonNullable<NavbarItem['featuredImage']>)) => {
    updateItem((item) => {
      const currentFeatured = item.featuredImage ?? {
        enabled: false,
        imageUrl: '',
        buttonLabel: '',
        buttonUrl: '',
        imageAlt: item.label,
      }

      return {
        ...item,
        featuredImage: typeof updater === 'function'
          ? (updater as (current: NonNullable<NavbarItem['featuredImage']>) => NonNullable<NavbarItem['featuredImage']>)(currentFeatured)
          : updater,
      }
    })
  }

  return (
    <div className="p-8" {...edits.bind}>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/navbar-builder"
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={15} />
            Back to navbar items
          </Link>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">
            {selectedItem?.label ?? 'Navbar item not found'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage this mega menu’s sections and featured content only.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={saving || !selectedItem}
          className="inline-flex items-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save Sections
        </button>
      </div>

      {!selectedItem ? (
        <section className="rounded-lg border border-border bg-white p-6 shadow-xs">
          <p className="text-sm text-muted-foreground">This navbar item could not be found.</p>
        </section>
      ) : (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-6 rounded-lg border border-border bg-white p-6 shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                {selectedItem.type === 'mega' ? 'Mega Menu' : 'Direct Link'}
              </span>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                selectedItem.visible ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
              }`}>
                {selectedItem.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                {selectedItem.visible ? 'Visible in Navbar' : 'Hidden in Navbar'}
              </span>
              {selectedItem.type === 'direct' && ['hiphop', 'bespoke'].includes(selectedItem.slug) ? (
                <button
                  type="button"
                  onClick={() => updateItem((item) => ({ ...item, visible: !item.visible }))}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    selectedItem.visible
                      ? 'border-red-200 text-red-600 hover:bg-red-50'
                      : 'border-green-200 text-green-700 hover:bg-green-50'
                  }`}
                >
                  {selectedItem.visible ? <EyeOff size={14} /> : <Eye size={14} />}
                  {selectedItem.visible ? 'Hide from Navbar' : 'Show in Navbar'}
                </button>
              ) : null}
            </div>

            {selectedItem.type === 'mega' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-jakarta text-lg font-semibold text-foreground">Sections</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Only this item’s sections are shown here as cards.</p>
                  </div>
                  <button
                    type="button"
                    onClick={openAddSectionDialog}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                  >
                    <Plus size={14} />
                    Add Section
                  </button>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {(selectedItem.sections ?? []).map((section) => {
                    return (
                      <article key={section.id} className="flex h-full flex-col rounded-2xl border border-border bg-white p-5 shadow-xs">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {section.iconSvgPath ? (
                                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                  SVG Added
                                </span>
                              ) : null}
                              <p className="font-jakarta text-base font-semibold text-foreground">
                                {section.title || 'Untitled Section'}
                              </p>
                              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">
                                {section.type}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {sectionSummary(section)} · Column {section.column}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditSectionDialog(section)}
                              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
                            >
                              <Pencil size={14} />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => requestDeleteSection(section.id)}
                              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}

                  {(selectedItem.sections?.length ?? 0) === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-secondary/10 px-5 py-8 text-sm text-muted-foreground lg:col-span-2">
                      No sections added yet. Create the first one to start building this mega menu.
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-border bg-secondary/10 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="font-jakarta text-base font-semibold text-foreground">Featured Image</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Enable one mega menu image for the right-side promo area.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Enabled', value: true },
                        { label: 'Disabled', value: false },
                      ].map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() =>
                            updateFeaturedImage((current) => ({
                              ...current,
                              enabled: option.value,
                              imageAlt: current.imageAlt || selectedItem.label,
                            }))
                          }
                          className={`rounded-full px-4 py-2 text-sm font-semibold ${
                            Boolean(selectedItem.featuredImage?.enabled) === option.value
                              ? 'bg-primary text-white'
                              : 'border border-border text-foreground hover:bg-white'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
                        <Upload size={14} />
                        {featuredImageUploading ? 'Uploading...' : 'Upload Image'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={featuredImageUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setFeaturedImageUploading(true)
                            void uploadFeaturedImage(file)
                              .then((path) => {
                                updateFeaturedImage((current) => ({
                                  ...current,
                                  enabled: true,
                                  imageUrl: path,
                                  imageAlt: selectedItem.label,
                                }))
                                toast({
                                  title: 'Uploaded',
                                  description: 'Mega menu featured image uploaded successfully.',
                                })
                              })
                              .catch((error) =>
                                toast({
                                  title: 'Upload failed',
                                  description: error instanceof Error ? error.message : 'Unable to upload featured image.',
                                  variant: 'destructive',
                                })
                              )
                              .finally(() => {
                                setFeaturedImageUploading(false)
                              })
                          }}
                        />
                      </label>
                      {selectedItem.featuredImage?.imageUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            updateFeaturedImage((current) => ({
                              ...current,
                              imageUrl: '',
                            }))
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                          Remove Image
                        </button>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {featuredImageUploading
                        ? 'Uploading featured image...'
                        : selectedItem.featuredImage?.imageUrl || 'No featured image uploaded yet'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Direct Link URL</label>
                <input
                  value={selectedItem.url ?? ''}
                  onChange={(e) => updateItem((item) => ({ ...item, url: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
                />
              </div>
            )}

          </section>

          <aside className="space-y-6">
            <section className="rounded-lg border border-border bg-white p-6 shadow-xs">
              <h2 className="font-jakarta text-lg font-semibold text-foreground">Layout Preview</h2>
              <div className="mt-4 space-y-3 text-sm text-foreground">
                {selectedItem.type === 'mega' ? (
                  <>
                    {previewColumns.map((column) => (
                      <p key={column.column}>
                        Column {column.column}:{' '}
                        {column.sections.length > 0
                          ? column.sections.map((section) => section.title || 'Untitled Section').join(', ')
                          : 'Empty'}
                      </p>
                    ))}
                    <p>Featured image: {selectedItem.featuredImage?.enabled && selectedItem.featuredImage?.imageUrl ? 'Enabled' : 'Disabled'}</p>
                  </>
                ) : (
                  <p>Direct link item with no mega menu columns.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Save navbar changes?"
        description="This will update the live dynamic mega menu based on the saved catalog setup."
        confirmText="Save"
        cancelText="Cancel"
        type="confirm"
        isLoading={saving}
        onConfirm={() => void saveNavbar()}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete this section?"
        description="This removes the section from the draft item. Save navbar changes afterward to publish the deletion."
        confirmText="Delete"
        cancelText="Cancel"
        type="delete"
        onConfirm={confirmDeleteSection}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setPendingDeleteSectionId(null)
        }}
      />

      <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-jakarta text-lg font-semibold text-foreground">
              {editingSectionId ? 'Edit Section' : 'Add Section'}
            </DialogTitle>
            <DialogDescription>
              Configure how this navbar section should render and whether it should also appear as a collection-page filter.
            </DialogDescription>
          </DialogHeader>

          {sectionDraft ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Section Title</label>
                  <input
                    value={sectionDraft.title}
                    onChange={(e) => setSectionDraft((current) => (current ? { ...current, title: e.target.value } : current))}
                    className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Section SVG Icon</label>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
                        <Upload size={14} />
                        Upload SVG
                        <input
                          type="file"
                          accept=".svg,image/svg+xml"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            void uploadSectionIcon(file).catch((error) =>
                              toast({
                                title: 'Upload failed',
                                description: error instanceof Error ? error.message : 'Unable to upload section SVG.',
                                variant: 'destructive',
                              })
                            )
                          }}
                        />
                      </label>
                      {sectionDraft.iconSvgPath ? (
                        <button
                          type="button"
                          onClick={() => setSectionDraft((current) => (current ? { ...current, iconSvgPath: '' } : current))}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                          Remove SVG
                        </button>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{sectionDraft.iconSvgPath || 'No SVG uploaded yet'}</p>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Source Kind</label>
                  <Select
                    value={sectionDraft.type}
                    onValueChange={(value) =>
                      setSectionDraft((current) => {
                        if (!current) return current
                        const nextType = value as NavbarSectionType
                        const firstSubcategory = sectionCategoryOptions[0]
                        const firstCategory = catalog.categories[0]

                        return {
                          ...current,
                          type: nextType,
                          links: nextType === 'Manual Links' ? current.links : [],
                          sourceSubcategoryId: nextType === 'Subcategory Options' ? current.sourceSubcategoryId ?? firstSubcategory?.id ?? null : null,
                          sourceCategorySlug: nextType === 'Category Link' ? current.sourceCategorySlug ?? firstCategory?.slug ?? null : null,
                          sourceLabel:
                            nextType === 'Subcategory Options'
                              ? current.sourceLabel || firstSubcategory?.label || ''
                              : nextType === 'Category Link'
                                ? current.sourceLabel || firstCategory?.name || ''
                                : '',
                          selectedSourceItems:
                            nextType === current.type && nextType !== 'Manual Links' && nextType !== 'Category Link'
                              ? current.selectedSourceItems ?? []
                              : [],
                        }
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select source kind" />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTION_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {sectionDraft.type === 'Subcategory Options' || sectionDraft.type === 'Category Link' ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {sectionDraft.type === 'Category Link' ? 'Source Category' : 'Source Subcategory'}
                    </label>
                    <Select
                      value={sectionDraft.type === 'Category Link' ? sectionDraft.sourceCategorySlug ?? '' : sectionDraft.sourceSubcategoryId ?? ''}
                      onValueChange={(value) => {
                        const option = sectionCategoryOptions.find((entry) => entry.id === value)
                        const category = catalog.categories.find((entry) => entry.slug === value)
                        setSectionDraft((current) =>
                          current
                            ? {
                                ...current,
                                sourceLabel: option?.label ?? category?.name ?? '',
                                sourceSubcategoryId: current.type === 'Category Link' ? null : option?.id ?? null,
                                sourceCategorySlug: current.type === 'Category Link' ? category?.slug ?? null : null,
                              }
                            : current
                        )
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={sectionDraft.type === 'Category Link' ? 'Select category' : 'Select subcategory'} />
                      </SelectTrigger>
                      <SelectContent>
                        {sectionDraft.type === 'Category Link'
                          ? catalog.categories.map((category) => (
                              <SelectItem key={category.id} value={category.slug}>
                                {category.name}
                              </SelectItem>
                            ))
                          : sectionCategoryOptions.map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {option.label}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-secondary/20 px-4 py-3 text-sm text-muted-foreground md:col-span-2">
                    {sectionSourceHint(sectionDraft.type)}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Column Position</label>
                  <input
                    type="number"
                    min={1}
                    value={sectionDraft.column}
                    onChange={(e) =>
                      setSectionDraft((current) => (current ? { ...current, column: Number(e.target.value) || 1 } : current))
                    }
                    className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
                  />
                </div>
              </div>

              {sectionDraft.type === 'Subcategory Options' || sectionDraft.type === 'Category Link' ? (
                <p className="text-sm text-muted-foreground">{sectionSourceHint(sectionDraft.type)}</p>
              ) : null}

              {sectionDraft.type !== 'Manual Links' && sectionDraft.type !== 'Category Link' ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Select Items To Show</p>
                  <div className="grid gap-2 rounded-lg border border-border bg-secondary/10 p-4 md:grid-cols-2">
                    {dynamicSourceChoices.map((choice) => {
                      const isSelected = (sectionDraft.selectedSourceItems ?? []).some((entry) => entry.sourceItemId === choice.id)
                      return (
                        <label key={choice.id} className="inline-flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) =>
                              setSectionDraft((current) => {
                                if (!current) return current
                                const existing = current.selectedSourceItems ?? []

                                if (event.target.checked) {
                                  const nextItem: NavbarSectionSourceItem = {
                                    sourceKind: choice.kind,
                                    sourceItemId: choice.id,
                                    label: choice.label,
                                    sortOrder: existing.length + 1,
                                    isActive: true,
                                  }
                                  return { ...current, selectedSourceItems: [...existing, nextItem] }
                                }

                                return {
                                  ...current,
                                  selectedSourceItems: existing
                                    .filter((entry) => entry.sourceItemId !== choice.id)
                                    .map((entry, entryIndex) => ({ ...entry, sortOrder: entryIndex + 1 })),
                                }
                              })
                            }
                          />
                          <span>{choice.label}</span>
                        </label>
                      )
                    })}
                    {dynamicSourceChoices.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No source items available for this section yet.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {sectionDraft.type !== 'Manual Links' ? (
                <div className="space-y-3">
                  <label className="inline-flex items-center gap-3 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={Boolean(sectionDraft.enableCategoryLink)}
                      onChange={(event) =>
                        setSectionDraft((current) =>
                          current
                            ? {
                                ...current,
                                enableCategoryLink: event.target.checked,
                                linkedCategoryId: event.target.checked ? current.linkedCategoryId ?? catalog.categories[0]?.id ?? null : null,
                              }
                            : current
                        )
                      }
                    />
                    Add selected category as a section link
                  </label>

                  {sectionDraft.enableCategoryLink ? (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Top Category</label>
                      <Select
                        value={sectionDraft.linkedCategoryId ?? ''}
                        onValueChange={(value) =>
                          setSectionDraft((current) => (current ? { ...current, linkedCategoryId: value } : current))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select top category" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalog.categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Show As Filter On Collection Page</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'On', value: true },
                    { label: 'Off', value: false },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setSectionDraft((current) => (current ? { ...current, showAsFilter: option.value } : current))}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        Boolean(sectionDraft.showAsFilter) === option.value
                          ? 'bg-primary text-white'
                          : 'border border-border text-foreground hover:bg-secondary'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {sectionDraft.type === 'Manual Links' ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Manual Links</p>
                  {sectionDraft.links.map((link, index) => (
                    <div key={`${sectionDraft.id}-${index}`} className="grid gap-3 md:grid-cols-2">
                      <input
                        value={link.label}
                        onChange={(e) =>
                          setSectionDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  links: current.links.map((entry, entryIndex) =>
                                    entryIndex === index ? { ...entry, label: e.target.value } : entry
                                  ),
                                }
                              : current
                          )
                        }
                        placeholder="Label"
                        className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
                      />
                      <input
                        value={link.url}
                        onChange={(e) =>
                          setSectionDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  links: current.links.map((entry, entryIndex) =>
                                    entryIndex === index ? { ...entry, url: e.target.value } : entry
                                  ),
                                }
                              : current
                          )
                        }
                        placeholder="URL"
                        className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setSectionDraft((current) =>
                        current
                          ? {
                              ...current,
                              links: [...current.links, { label: '', url: '' }],
                            }
                          : current
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
                  >
                    <Plus size={14} />
                    Add Link
                  </button>
                </div>
              ) : null}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={saveSectionDraft}
                  disabled={sectionSaving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sectionSaving ? 'Saving Section...' : 'Save Section'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSectionDialogOpen(false)
                    setEditingSectionId(null)
                    setSectionDraft(null)
                  }}
                  disabled={sectionSaving}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
