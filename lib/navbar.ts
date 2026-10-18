import {
  slugify,
  type CatalogCategory,
  type CatalogCertificate,
  type CatalogMetal,
  type CatalogOption,
  type CatalogRingSize,
  type CatalogStoneShape,
  type CatalogStyle,
  type CatalogSubcategory,
} from '@/lib/product-catalog'
import { filterNavbarSectionSourceItems } from './navbar-source-items'

export type NavbarItemType = 'mega' | 'direct'
export type NavbarSectionType =
  | 'Subcategory Options'
  | 'Manual Links'
  | 'Metal Swatches'
  | 'Stone Shapes'
  | 'Ring Sizes'
  | 'Certificates'
  | 'Styles'
  | 'Category Link'

export type NavbarManualLink = {
  id?: string
  label: string
  url: string
}

export type NavbarSectionSourceKind = 'subcategory_option' | 'metal' | 'stone_shape' | 'ring_size' | 'certificate' | 'style'

export type NavbarSectionSourceItem = {
  id?: string
  sourceKind: NavbarSectionSourceKind
  sourceItemId: string
  label: string
  sortOrder: number
  isActive: boolean
}

export type NavbarSection = {
  id: string
  title: string
  iconSvgPath?: string | null
  type: NavbarSectionType
  sourceLabel: string
  sourceSubcategoryId: string | null
  sourceCategorySlug?: string | null
  column: number
  showAsFilter?: boolean
  enableCategoryLink?: boolean
  linkedCategoryId?: string | null
  selectedSourceItems?: NavbarSectionSourceItem[]
  links: NavbarManualLink[]
}

export type NavbarItem = {
  id: string
  label: string
  slug: string
  type: NavbarItemType
  linkedCategoryId?: string | null
  visible: boolean
  url?: string
  columns?: number
  sections?: NavbarSection[]
  featuredImage?: {
    id?: string
    enabled: boolean
    imageUrl: string
    buttonLabel: string
    buttonUrl: string
    imageAlt: string
  }
}

export type NavbarBuilderPayload = {
  revision: string
  itemRevisions: Record<string, string>
  items: NavbarItem[]
  categories: CatalogCategory[]
  subcategories: CatalogSubcategory[]
  options: CatalogOption[]
  metals: CatalogMetal[]
  stoneShapes: CatalogStoneShape[]
  ringSizes: CatalogRingSize[]
  certificates: CatalogCertificate[]
  styles: CatalogStyle[]
}

const DEFAULT_DIRECT_NAV_ITEMS: NavbarItem[] = [
  {
    id: 'default-direct-hiphop',
    label: 'Hip Hop',
    slug: 'hiphop',
    type: 'direct',
    linkedCategoryId: null,
    visible: true,
    url: '/hiphop',
    sections: [],
  },
  {
    id: 'default-direct-bespoke',
    label: 'Bespoke',
    slug: 'bespoke',
    type: 'direct',
    linkedCategoryId: null,
    visible: true,
    url: '/bespoke',
    sections: [],
  },
]

type RawNavbarItem = {
  id: string
  label: string
  slug: string
  item_type: 'mega_menu' | 'direct_link'
  linked_category_id: string | null
  direct_link_url: string | null
  display_order: number
  status: 'active' | 'hidden'
}

type RawNavbarSection = {
  id: string
  navbar_item_id: string
  title: string
  icon_svg_path?: string | null
  section_type: 'category_list' | 'manual_links' | 'metal_swatches' | 'stone_shapes' | 'ring_sizes' | 'certificates' | 'styles' | 'category_link'
  source_subcategory_id: string | null
  source_category_slug?: string | null
  enable_category_link?: boolean | null
  linked_category_id?: string | null
  column_number: number
  show_as_filter?: boolean | null
  display_order: number
  status: 'active' | 'hidden'
}

type RawNavbarSectionSourceItem = {
  id: number | string
  section_id: string
  source_kind: NavbarSectionSourceKind
  source_item_id: string
  sort_order: number
  is_active: boolean
}

type RawNavbarSectionLink = {
  id: string
  section_id: string
  label: string
  url: string
  display_order: number
  status: 'active' | 'hidden'
}

type RawNavbarFeaturedCard = {
  id: string
  navbar_item_id: string
  image_path: string | null
  image_alt: string | null
  button_label: string | null
  button_url: string | null
  enabled: boolean
}

export function mapSectionTypeFromDb(type: RawNavbarSection['section_type']): NavbarSectionType {
  if (type === 'category_list') return 'Subcategory Options'
  if (type === 'manual_links') return 'Manual Links'
  if (type === 'metal_swatches') return 'Metal Swatches'
  if (type === 'ring_sizes') return 'Ring Sizes'
  if (type === 'certificates') return 'Certificates'
  if (type === 'styles') return 'Styles'
  if (type === 'category_link') return 'Category Link'
  return 'Stone Shapes'
}

export function mapSectionTypeToDb(type: NavbarSectionType): RawNavbarSection['section_type'] {
  if (type === 'Subcategory Options') return 'category_list'
  if (type === 'Manual Links') return 'manual_links'
  if (type === 'Metal Swatches') return 'metal_swatches'
  if (type === 'Ring Sizes') return 'ring_sizes'
  if (type === 'Certificates') return 'certificates'
  if (type === 'Styles') return 'styles'
  if (type === 'Category Link') return 'category_link'
  return 'stone_shapes'
}

export function buildFallbackNavbarItems(categories: CatalogCategory[], subcategories: CatalogSubcategory[], options: CatalogOption[] = []): NavbarItem[] {
  return categories
    .filter((category) => category.status === 'active' && category.show_in_nav !== false)
    .sort((left, right) => left.display_order - right.display_order)
    .map((category) => {
      const categorySubcategories = subcategories
        .filter((entry) => entry.category_id === category.id && entry.status === 'active')
        .sort((left, right) => left.display_order - right.display_order)

      const sections = categorySubcategories.map((entry, index) => {
        const selectedSourceItems = options
          .filter((option) => option.subcategory_id === entry.id && option.status === 'active')
          .sort((left, right) => left.display_order - right.display_order)
          .map((option, optionIndex) => ({
            sourceKind: 'subcategory_option' as const,
            sourceItemId: option.id,
            label: option.name,
            sortOrder: optionIndex + 1,
            isActive: true,
          }))

        return {
          id: `fallback-${category.id}-${entry.id}`,
          title: entry.name,
          iconSvgPath: entry.icon_svg_path ?? null,
          type: 'Subcategory Options' as const,
          sourceLabel: entry.name,
          sourceSubcategoryId: entry.id,
          column: index + 1,
          selectedSourceItems,
          links: [],
        }
      })

      return {
        id: `fallback-${category.id}`,
        label: category.name,
        slug: category.slug,
        linkedCategoryId: category.id,
        type: category.nav_type === 'direct_link' ? 'direct' : 'mega',
        visible: true,
        url: category.direct_link_url ?? undefined,
        columns: Math.max(1, sections.length),
        sections,
        featuredImage: {
          enabled: false,
          imageUrl: '',
          buttonLabel: '',
          buttonUrl: '',
          imageAlt: category.name,
        },
      }
    })
}

export function buildNavbarItemsFromRows(args: {
  items: RawNavbarItem[]
  sections: RawNavbarSection[]
  sectionLinks: RawNavbarSectionLink[]
  sectionSourceItems: RawNavbarSectionSourceItem[]
  featuredCards: RawNavbarFeaturedCard[]
  categories: CatalogCategory[]
  subcategories: CatalogSubcategory[]
  metals: CatalogMetal[]
  stoneShapes: CatalogStoneShape[]
  ringSizes?: CatalogRingSize[]
  certificates?: CatalogCertificate[]
  styles?: CatalogStyle[]
  options?: CatalogOption[]
}): NavbarItem[] {
  const {
    items,
    sections,
    sectionLinks,
    sectionSourceItems,
    featuredCards,
    subcategories,
    metals,
    stoneShapes,
    ringSizes = [],
    certificates = [],
    styles = [],
    options = [],
  } = args

  const labelMaps = {
    subcategory_option: new Map(options.map((entry) => [entry.id, entry.name])),
    metal: new Map(metals.map((entry) => [entry.id, entry.name])),
    stone_shape: new Map(stoneShapes.map((entry) => [entry.id, entry.name])),
    ring_size: new Map(ringSizes.map((entry) => [entry.id, entry.name])),
    certificate: new Map(certificates.map((entry) => [entry.id, entry.name])),
    style: new Map(styles.map((entry) => [entry.id, entry.name])),
  } as const

  return items
    .sort((left, right) => left.display_order - right.display_order)
    .map((item) => {
      const itemSections = sections
        .filter((section) => section.navbar_item_id === item.id)
        .sort((left, right) => left.display_order - right.display_order)
        .map((section) => {
          const sourceSubcategory = subcategories.find((entry) => entry.id === section.source_subcategory_id)
          return {
            id: section.id,
            title: section.title,
            iconSvgPath: section.icon_svg_path ?? null,
            type: mapSectionTypeFromDb(section.section_type),
            sourceLabel: sourceSubcategory?.name ?? section.source_category_slug ?? '',
            sourceSubcategoryId: sourceSubcategory?.id ?? null,
            sourceCategorySlug: section.source_category_slug ?? null,
            column: section.column_number,
            showAsFilter: section.show_as_filter ?? false,
            enableCategoryLink: Boolean(section.enable_category_link),
            linkedCategoryId: section.linked_category_id ?? null,
            selectedSourceItems: sectionSourceItems
              .filter((entry) => entry.section_id === section.id)
              .sort((left, right) => left.sort_order - right.sort_order)
              .map((entry) => ({
                id: String(entry.id),
                sourceKind: entry.source_kind,
                sourceItemId: entry.source_item_id,
                label: labelMaps[entry.source_kind].get(entry.source_item_id) ?? entry.source_item_id,
                sortOrder: entry.sort_order,
                isActive: entry.is_active,
              })),
            links: sectionLinks
              .filter((entry) => entry.section_id === section.id)
              .sort((left, right) => left.display_order - right.display_order)
              .map((entry) => ({
                id: entry.id,
                label: entry.label,
                url: entry.url,
              })),
          }
        })

      const featuredCard = featuredCards.find((entry) => entry.navbar_item_id === item.id)

      return {
        id: item.id,
        label: item.label,
        slug: item.slug,
        linkedCategoryId: item.linked_category_id,
        type: item.item_type === 'mega_menu' ? 'mega' : 'direct',
        visible: item.status === 'active',
        url: item.direct_link_url ?? undefined,
        columns: itemSections.reduce((max, section) => Math.max(max, section.column), 1),
        sections: itemSections,
        featuredImage: {
          id: featuredCard?.id,
          enabled: featuredCard?.enabled ?? false,
          imageUrl: featuredCard?.image_path ?? '',
          buttonLabel: featuredCard?.button_label ?? '',
          buttonUrl: featuredCard?.button_url ?? '',
          imageAlt: featuredCard?.image_alt ?? item.label,
        },
      }
    })
}

export function buildSectionPreviewItems(args: {
  section: Pick<NavbarSection, 'type' | 'sourceSubcategoryId' | 'selectedSourceItems' | 'enableCategoryLink' | 'linkedCategoryId'>
  categories: CatalogCategory[]
  subcategories: CatalogSubcategory[]
  options: CatalogOption[]
  metals: CatalogMetal[]
  stoneShapes: CatalogStoneShape[]
  ringSizes?: CatalogRingSize[]
  certificates?: CatalogCertificate[]
  styles?: CatalogStyle[]
}): string[] {
  const { section, categories, options, metals, stoneShapes, ringSizes = [], certificates = [], styles = [] } = args

  const selectedIds = new Set((section.selectedSourceItems ?? []).filter((entry) => entry.isActive).map((entry) => entry.sourceItemId))

  if (section.type === 'Metal Swatches') {
    const metalItems = metals
      .filter((entry) => selectedIds.size === 0 || selectedIds.has(entry.id))
      .sort((left, right) => left.display_order - right.display_order)
      .map((entry) => entry.name)

    if (section.enableCategoryLink && section.linkedCategoryId) {
      const category = categories.find((entry) => entry.id === section.linkedCategoryId)
      if (category) metalItems.push(category.name)
    }

    return metalItems
  }

  if (section.type === 'Stone Shapes') {
    const shapeItems = stoneShapes
      .filter((entry) => selectedIds.size === 0 || selectedIds.has(entry.id))
      .sort((left, right) => left.display_order - right.display_order)
      .map((entry) => entry.name)

    if (section.enableCategoryLink && section.linkedCategoryId) {
      const category = categories.find((entry) => entry.id === section.linkedCategoryId)
      if (category) shapeItems.push(category.name)
    }

    return shapeItems
  }

  if (section.type === 'Ring Sizes') {
    return ringSizes
      .filter((entry) => selectedIds.size === 0 || selectedIds.has(entry.id))
      .sort((left, right) => left.display_order - right.display_order)
      .map((entry) => entry.name)
  }

  if (section.type === 'Certificates') {
    const certificateItems = certificates
      .filter((entry) => selectedIds.size === 0 || selectedIds.has(entry.id))
      .sort((left, right) => (left.display_order ?? 0) - (right.display_order ?? 0))
      .map((entry) => entry.name)

    if (section.enableCategoryLink && section.linkedCategoryId) {
      const category = categories.find((entry) => entry.id === section.linkedCategoryId)
      if (category) certificateItems.push(category.name)
    }

    return certificateItems
  }

  if (section.type === 'Styles') {
    const styleItems = styles
      .filter((entry) => selectedIds.size === 0 || selectedIds.has(entry.id))
      .sort((left, right) => left.display_order - right.display_order)
      .map((entry) => entry.name)

    if (section.enableCategoryLink && section.linkedCategoryId) {
      const category = categories.find((entry) => entry.id === section.linkedCategoryId)
      if (category) styleItems.push(category.name)
    }

    return styleItems
  }

  if (section.type === 'Subcategory Options' && section.sourceSubcategoryId) {
    const optionItems = options
      .filter((entry) => entry.subcategory_id === section.sourceSubcategoryId)
      .filter((entry) => selectedIds.size === 0 || selectedIds.has(entry.id))
      .sort((left, right) => left.display_order - right.display_order)
      .map((entry) => entry.name)

    if (section.enableCategoryLink && section.linkedCategoryId) {
      const category = categories.find((entry) => entry.id === section.linkedCategoryId)
      if (category) optionItems.push(category.name)
    }

    return optionItems
  }

  return []
}

export function getSectionCategoryOptions(subcategories: CatalogSubcategory[]) {
  return subcategories
    .sort((left, right) => left.display_order - right.display_order)
    .map((entry) => ({
      id: entry.id,
      label: entry.name,
      slug: entry.slug,
    }))
}

export function normalizeNavbarItemForSave(item: NavbarItem): NavbarItem {
  return {
    ...item,
    slug: item.slug || slugify(item.label),
    sections: (item.sections ?? []).map((section, index) => ({
      ...section,
      title: section.title.trim(),
      iconSvgPath: section.iconSvgPath ?? null,
      column: Math.max(1, section.column || 1),
      links:
        section.type === 'Manual Links'
          ? section.links.filter((entry) => entry.label.trim() && entry.url.trim())
          : [],
      sourceLabel: section.sourceLabel.trim(),
      showAsFilter: Boolean(section.showAsFilter),
      enableCategoryLink: Boolean(section.enableCategoryLink),
      linkedCategoryId: section.linkedCategoryId ?? null,
      selectedSourceItems: filterNavbarSectionSourceItems(section.type, section.selectedSourceItems ?? [])
        .sort((left, right) => left.sortOrder - right.sortOrder),
      id: section.id || `section-${index + 1}`,
    })),
  }
}

export function syncNavbarItemsWithCatalog(items: NavbarItem[], categories: CatalogCategory[], subcategories: CatalogSubcategory[], options: CatalogOption[] = []): NavbarItem[] {
  const visibleCategories = categories
    .filter((category) => category.status === 'active' && category.show_in_nav !== false)
    .sort((left, right) => left.display_order - right.display_order)

  const itemsByCategoryId = new Map(items.filter((item) => item.linkedCategoryId).map((item) => [item.linkedCategoryId as string, item]))
  const itemsBySlug = new Map(items.map((item) => [item.slug, item]))

  const syncedCategoryItems = visibleCategories.map((category) => {
    const existingItem = itemsByCategoryId.get(category.id) ?? itemsBySlug.get(category.slug)
    const fallbackItem = buildFallbackNavbarItems([category], subcategories, options)[0]
    const isMegaCategory = category.nav_type !== 'direct_link'

    if (!existingItem) {
      return fallbackItem
    }

    return {
      ...existingItem,
      label: category.name,
      slug: category.slug,
      linkedCategoryId: category.id,
      type: (isMegaCategory ? 'mega' : 'direct') as NavbarItemType,
      url: category.nav_type === 'direct_link' ? category.direct_link_url ?? existingItem.url : undefined,
      visible: category.status === 'active' && category.show_in_nav !== false ? existingItem.visible : false,
      sections:
        isMegaCategory
          ? (existingItem.sections?.length ?? 0) > 0
            ? existingItem.sections
            : fallbackItem.sections
          : [],
      featuredImage:
        isMegaCategory
          ? existingItem.featuredImage ?? fallbackItem.featuredImage
      : undefined,
    } satisfies NavbarItem
  })

  const categoryIds = new Set(visibleCategories.map((category) => category.id))
  const categorySlugs = new Set(visibleCategories.map((category) => category.slug))
  const customItems = items.filter((item) => {
    if (item.linkedCategoryId && categoryIds.has(item.linkedCategoryId)) return false
    return !categorySlugs.has(item.slug)
  })
  const customSlugs = new Set(customItems.map((item) => item.slug))
  const missingDefaultDirectItems = DEFAULT_DIRECT_NAV_ITEMS.filter((item) => !customSlugs.has(item.slug))

  return [...syncedCategoryItems, ...customItems, ...missingDefaultDirectItems]
}
