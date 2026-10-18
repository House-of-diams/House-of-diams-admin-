import { catalogPageReader, loadCatalogNavbarItems } from '@/lib/catalog-page-data'
import { loadCatalogMasterList } from '@/lib/catalog-master-save'
import { loadCatalogHierarchyList } from '@/lib/catalog-hierarchy-save'
import type { CatalogCategory, CatalogNavbarItem, ProductContentRule } from '@/lib/product-catalog'
import { CatalogClient } from './catalog-client'

async function getCatalogOverviewData(): Promise<{
  categories: CatalogCategory[]
  navbarItems: CatalogNavbarItem[]
  productContentRules: ProductContentRule[]
}> {
  const adminClient = await catalogPageReader()
  const [categories, navbarItemsResult, productContentRulesResult] = await Promise.all([
    loadCatalogHierarchyList(adminClient, 'category'),
    loadCatalogNavbarItems(adminClient),
    loadCatalogMasterList(adminClient, 'content_rule'),
  ])

  return {
    categories: categories as CatalogCategory[],
    navbarItems: navbarItemsResult as CatalogNavbarItem[],
    productContentRules: productContentRulesResult as ProductContentRule[],
  }
}

export default async function CatalogSetupPage() {
  const { categories, navbarItems, productContentRules } = await getCatalogOverviewData()

  return (
    <CatalogClient
      initialCategories={categories}
      initialNavbarItems={navbarItems}
      initialProductContentRules={productContentRules}
    />
  )
}
