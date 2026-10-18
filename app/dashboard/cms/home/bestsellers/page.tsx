import { cmsPageReader } from '@/lib/cms-page-data'
import { readCmsReference } from '@/lib/cms-reference-data'

import { formatCategoryPath } from '@/lib/product-catalog'
import type {
  CatalogCategory,
  CatalogOption,
  CatalogSubcategory,
  ProductRecord,
} from '@/lib/product-catalog'
import { HomeBestSellersEditorClient, type HomeBestSellersInitialData, type ProductListItem } from './home-bestsellers-editor-client'
import { loadHomeGroup1Snapshot } from '@/lib/cms-home-group1-save'

async function getBestSellersInitialData(): Promise<HomeBestSellersInitialData> {
  const adminClient = await cmsPageReader()

  const [snapshot, { data: products, error: productsError }, { data: categories }, { data: subcategories }, { data: options }] = await Promise.all([
    loadHomeGroup1Snapshot(adminClient, 'bestsellers'),
    readCmsReference(adminClient, 'products'),
    readCmsReference(adminClient, 'categories'),
    readCmsReference(adminClient, 'subcategories'),
    readCmsReference(adminClient, 'options'),
  ])

  if (productsError) {
    throw new Error(productsError.message)
  }

  const section = snapshot.section
  const sectionLinks = snapshot.items
  const categoryRows = (categories ?? []) as CatalogCategory[]
  const subcategoryRows = (subcategories ?? []) as CatalogSubcategory[]
  const optionRows = (options ?? []) as CatalogOption[]

  const productRows = ((products ?? []) as ProductRecord[]).map((product) => {
    const category = categoryRows.find((item) => item.id === product.main_category_id)
    const subcategory = subcategoryRows.find((item) => item.id === product.subcategory_id)
    const option = optionRows.find((item) => item.id === product.option_id)

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      categoryPath: formatCategoryPath({ category, subcategory, option }),
      detailTemplate: product.detail_template ?? 'standard',
      status: product.status,
    } as ProductListItem
  })

  return {
    section: {
      eyebrow: String(section?.eyebrow ?? 'House of Diams'),
      heading: String(section?.heading ?? 'Our Best Sellers'),
      cta_label: String(section?.cta_label ?? 'View All Collection'),
      cta_href: String(section?.cta_href ?? '/shop'),
      selected_product_ids: sectionLinks.map((item) => String(item.product_id)),
      selected_products: sectionLinks.map((item) => ({
        id: String(item.id),
        product_id: String(item.product_id),
        display_title: String(item.display_title ?? ''),
        display_image_path: String(item.display_image_path ?? ''),
      })),
    },
    products: productRows,
    revision: snapshot.revision,
  }
}

export default async function HomeBestSellersEditorPage() {
  const initialData = await getBestSellersInitialData()
  return <HomeBestSellersEditorClient initialData={initialData} />
}
