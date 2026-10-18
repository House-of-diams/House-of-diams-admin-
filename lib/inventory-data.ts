import type { SupabaseClient } from '@supabase/supabase-js'

export type InventoryDataItem = {
  id: string
  name: string
  slug: string
  sku: string
  stockQuantity: number
  status: 'in-stock' | 'low-stock' | 'out-of-stock'
  categoryPath: string
  updatedAt: string
}

type InventoryProductRow = {
  id: string
  name: string
  slug: string
  sku: string | null
  stock_quantity: number | null
  updated_at: string
  main_category_id: string | null
  subcategory_id: string | null
  option_id: string | null
}

type NamedRow = { id: string; name: string }
type SubcategoryLinkRow = { product_id: string; subcategory_id: string; is_primary: boolean | null }
type OptionLinkRow = { product_id: string; option_id: string; is_primary: boolean | null }

function buildDisplayCategoryPath(primaryPath: string, linkedSubcategoryNames: string[], linkedOptionNames: string[]) {
  const linkedParts = [...linkedSubcategoryNames, ...linkedOptionNames].filter(Boolean)
  return linkedParts.length ? `${primaryPath} | Linked: ${linkedParts.join(', ')}` : primaryPath
}

export async function loadInventoryItems(client: SupabaseClient, query = ''): Promise<InventoryDataItem[]> {
  const { data, error } = await client
    .from('products')
    .select('id, name, slug, sku, stock_quantity, updated_at, main_category_id, subcategory_id, option_id')
    .order('updated_at', { ascending: false })

  if (error) throw new Error('Unable to load inventory products.')
  const products = (data ?? []) as InventoryProductRow[]
  const categoryIds = [...new Set(products.flatMap((item) => item.main_category_id ? [item.main_category_id] : []))]
  const subcategoryIds = [...new Set(products.flatMap((item) => item.subcategory_id ? [item.subcategory_id] : []))]
  const optionIds = [...new Set(products.flatMap((item) => item.option_id ? [item.option_id] : []))]
  const productIds = products.map((item) => item.id)

  const [categoriesResult, subcategoriesResult, optionsResult, subcategoryLinksResult, optionLinksResult] = await Promise.all([
    categoryIds.length ? client.from('catalog_categories').select('id, name').in('id', categoryIds) : Promise.resolve({ data: [] as NamedRow[], error: null }),
    subcategoryIds.length ? client.from('catalog_subcategories').select('id, name').in('id', subcategoryIds) : Promise.resolve({ data: [] as NamedRow[], error: null }),
    optionIds.length ? client.from('catalog_options').select('id, name').in('id', optionIds) : Promise.resolve({ data: [] as NamedRow[], error: null }),
    productIds.length ? client.from('product_subcategory_links').select('product_id, subcategory_id, is_primary').in('product_id', productIds) : Promise.resolve({ data: [] as SubcategoryLinkRow[], error: null }),
    productIds.length ? client.from('product_option_links').select('product_id, option_id, is_primary').in('product_id', productIds) : Promise.resolve({ data: [] as OptionLinkRow[], error: null }),
  ])

  if ([categoriesResult, subcategoriesResult, optionsResult, subcategoryLinksResult, optionLinksResult].some((result) => result.error)) {
    throw new Error('Unable to load inventory catalog details.')
  }

  const categoryMap = new Map(((categoriesResult.data ?? []) as NamedRow[]).map((item) => [item.id, item.name]))
  const subcategoryMap = new Map(((subcategoriesResult.data ?? []) as NamedRow[]).map((item) => [item.id, item.name]))
  const optionMap = new Map(((optionsResult.data ?? []) as NamedRow[]).map((item) => [item.id, item.name]))
  const linkedSubcategoryMap = new Map<string, string[]>()
  for (const row of (subcategoryLinksResult.data ?? []) as SubcategoryLinkRow[]) {
    if (row.is_primary) continue
    const name = subcategoryMap.get(row.subcategory_id)
    if (name) linkedSubcategoryMap.set(row.product_id, [...(linkedSubcategoryMap.get(row.product_id) ?? []), name])
  }
  const linkedOptionMap = new Map<string, string[]>()
  for (const row of (optionLinksResult.data ?? []) as OptionLinkRow[]) {
    if (row.is_primary) continue
    const name = optionMap.get(row.option_id)
    if (name) linkedOptionMap.set(row.product_id, [...(linkedOptionMap.get(row.product_id) ?? []), name])
  }

  const normalizedQuery = query.trim().toLowerCase()
  return products.map((product) => {
    const stock = Number(product.stock_quantity ?? 0)
    const primaryPath = [categoryMap.get(product.main_category_id ?? ''), subcategoryMap.get(product.subcategory_id ?? ''), optionMap.get(product.option_id ?? '')].filter(Boolean).join(' > ')
    return {
      id: product.id, name: product.name, slug: product.slug, sku: product.sku ?? '', stockQuantity: stock,
      status: stock <= 0 ? 'out-of-stock' as const : stock <= 5 ? 'low-stock' as const : 'in-stock' as const,
      categoryPath: buildDisplayCategoryPath(primaryPath, linkedSubcategoryMap.get(product.id) ?? [], linkedOptionMap.get(product.id) ?? []),
      updatedAt: product.updated_at,
    }
  }).filter((item) => !normalizedQuery || `${item.name} ${item.sku} ${item.categoryPath}`.toLowerCase().includes(normalizedQuery))
}
