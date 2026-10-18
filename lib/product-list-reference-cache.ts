import { revalidateTag, unstable_cache } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/admin-supabase'
import type { CatalogCategory, CatalogOption, CatalogSubcategory } from '@/lib/product-catalog'

export const PRODUCT_LIST_REFERENCE_CACHE_TAG = 'admin-product-list-reference-data'

async function loadProductListReferenceData() {
  const adminClient = createSupabaseAdminClient()
  const [categoriesResult, subcategoriesResult, optionsResult] = await Promise.all([
    adminClient.from('catalog_categories').select('id, code, name, slug, nav_type, direct_link_url, display_order, status'),
    adminClient.from('catalog_subcategories').select('id, category_id, name, slug, sub_type, display_order, status'),
    adminClient.from('catalog_options').select('id, subcategory_id, name, slug, display_order, status'),
  ])

  const error = categoriesResult.error || subcategoriesResult.error || optionsResult.error
  if (error) throw new Error(error.message)

  return {
    categories: (categoriesResult.data ?? []) as CatalogCategory[],
    subcategories: (subcategoriesResult.data ?? []) as CatalogSubcategory[],
    options: (optionsResult.data ?? []) as CatalogOption[],
  }
}

const getCachedProductListReferenceData = unstable_cache(
  loadProductListReferenceData,
  ['admin-product-list-reference-data'],
  {
    revalidate: 300,
    tags: [PRODUCT_LIST_REFERENCE_CACHE_TAG],
  }
)

export async function getProductListReferenceData() {
  try {
    return await getCachedProductListReferenceData()
  } catch {
    return loadProductListReferenceData()
  }
}

export function invalidateProductListReferenceData() {
  revalidateTag(PRODUCT_LIST_REFERENCE_CACHE_TAG, { expire: 0 })
}
