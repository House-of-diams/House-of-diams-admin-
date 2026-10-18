import { catalogPageReader, loadCatalogNavbarItems } from '@/lib/catalog-page-data'
import type { CatalogCategory, CatalogNavbarItem, CatalogOption, CatalogSubcategory } from '@/lib/product-catalog'
import { CategoryDetailClient } from './page-client'
import { loadCatalogHierarchyList } from '@/lib/catalog-hierarchy-save'

type CategoryDetailPageProps = {
  params: Promise<{
    slug: string
  }>
}

async function getCategoryDetailData(slug: string): Promise<{
  category: CatalogCategory | null
  navbarItems: CatalogNavbarItem[]
  subcategories: CatalogSubcategory[]
  options: CatalogOption[]
}> {
  const adminClient = await catalogPageReader()
  const [categories, navbarItemsResult, allSubcategories, allOptions] = await Promise.all([
    loadCatalogHierarchyList(adminClient, 'category'),
    loadCatalogNavbarItems(adminClient),
    loadCatalogHierarchyList(adminClient, 'subcategory'),
    loadCatalogHierarchyList(adminClient, 'option'),
  ])
  const category = (categories as CatalogCategory[]).find((item) => item.slug === slug) ?? null
  const subcategories = (allSubcategories as CatalogSubcategory[]).filter(
    (item) => item.category_id === category?.id
  )
  const subcategoryIds = new Set(subcategories.map((item) => item.id))
  const options = (allOptions as CatalogOption[]).filter((item) =>
    subcategoryIds.has(item.subcategory_id)
  )

  return {
    category,
    navbarItems: navbarItemsResult as CatalogNavbarItem[],
    subcategories,
    options,
  }
}

export default async function CategoryDetailPage({ params }: CategoryDetailPageProps) {
  const { slug } = await params
  const initialData = await getCategoryDetailData(slug)

  return <CategoryDetailClient categorySlug={slug} initialData={initialData} />
}
