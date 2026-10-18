import { createSupabaseAdminClient } from '@/lib/admin-supabase'
import { formatCategoryPath } from '@/lib/product-catalog'
import { getProductListReferenceData } from '@/lib/product-list-reference-cache'
import type {
  CatalogCategory,
  CatalogOption,
  CatalogSubcategory,
} from '@/lib/product-catalog'
import type { ProductRow } from './products-client'
import { readProductDataProvider } from '@/lib/product-provider'
import { authorizeProductPage } from '@/lib/product-server-request'
import { adminTransaction } from '@/lib/db/pool'
import { loadRdsProductList } from '@/lib/db/admin-repositories/product-list'

export type ProductLane = 'standard' | 'hiphop' | 'collection'

type ProductListRecord = {
  id: string
  slug: string | null
  name: string
  sku: string
  product_lane: ProductLane | null
  detail_template: 'standard' | 'hiphop' | null
  main_category_id: string
  subcategory_id: string | null
  option_id: string | null
  base_price: number | null
  stock_quantity: number | null
  featured: boolean
  status: string
}

type RelatedNameRow = { name?: string | null } | Array<{ name?: string | null }> | null

function extractRelatedName(value: RelatedNameRow) {
  return Array.isArray(value) ? value[0]?.name ?? null : value?.name ?? null
}

function buildDisplayCategoryPath(args: {
  primaryPath: string
  linkedSubcategoryNames?: string[]
  linkedOptionNames?: string[]
}) {
  const linkedParts = [
    ...(args.linkedSubcategoryNames ?? []),
    ...(args.linkedOptionNames ?? []),
  ].filter(Boolean)

  if (linkedParts.length < 1) return args.primaryPath
  return `${args.primaryPath} | Linked: ${linkedParts.join(', ')}`
}

export const PRODUCT_PAGE_SIZE = 20

export type ProductListPage = {
  items: ProductRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export async function getProductRows(lane: ProductLane | undefined, page = 1, search = ''): Promise<ProductListPage> {
  if (readProductDataProvider(process.env) === 'rds') {
    await authorizeProductPage()
    return adminTransaction(db => loadRdsProductList(db, lane, page, search), { snapshot: true })
  }
  const adminClient = createSupabaseAdminClient()
  let query = adminClient
    .from('products')
    .select('id, slug, name, sku, product_lane, detail_template, main_category_id, subcategory_id, option_id, base_price, stock_quantity, featured, status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (lane) {
    query = query.eq('product_lane', lane)
  }
  if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)

  const safePage = Math.max(1, page)
  const from = (safePage - 1) * PRODUCT_PAGE_SIZE
  const { data: products, error, count } = await query.range(from, from + PRODUCT_PAGE_SIZE - 1)

  if (error) {
    throw new Error(error.message)
  }

  const productIds = (products ?? []).map((product) => product.id)
  const [metalSelections, referenceData, subcategoryLinksResult, optionLinksResult] = await Promise.all([
    productIds.length
      ? adminClient.from('product_metal_selections').select('product_id, metal:catalog_metals(name)').in('product_id', productIds)
      : Promise.resolve({ data: [], error: null }),
    getProductListReferenceData(),
    productIds.length
      ? adminClient.from('product_subcategory_links').select('product_id, subcategory_id, is_primary').in('product_id', productIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? adminClient.from('product_option_links').select('product_id, option_id, is_primary').in('product_id', productIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const categories = referenceData.categories as CatalogCategory[]
  const subcategories = referenceData.subcategories as CatalogSubcategory[]
  const options = referenceData.options as CatalogOption[]

  const metalMap = new Map<string, string[]>()
  for (const row of metalSelections.data ?? []) {
    const name = extractRelatedName(row.metal as RelatedNameRow)
    if (!name) continue
    metalMap.set(row.product_id, [...(metalMap.get(row.product_id) ?? []), name])
  }

  const linkedSubcategoryMap = new Map<string, string[]>()
  for (const row of subcategoryLinksResult.data ?? []) {
    if (row.is_primary) continue
    const subcategoryName = subcategories.find((item) => item.id === row.subcategory_id)?.name
    if (!subcategoryName) continue
    linkedSubcategoryMap.set(row.product_id, [...(linkedSubcategoryMap.get(row.product_id) ?? []), subcategoryName])
  }

  const linkedOptionMap = new Map<string, string[]>()
  for (const row of optionLinksResult.data ?? []) {
    if (row.is_primary) continue
    const optionName = options.find((item) => item.id === row.option_id)?.name
    if (!optionName) continue
    linkedOptionMap.set(row.product_id, [...(linkedOptionMap.get(row.product_id) ?? []), optionName])
  }

  const items = ((products ?? []) as ProductListRecord[]).map((product) => {
    const category = categories.find((item) => item.id === product.main_category_id)
    const subcategory = subcategories.find((item) => item.id === product.subcategory_id)
    const option = options.find((item) => item.id === product.option_id)

    const primaryPath = formatCategoryPath({
      category,
      subcategory,
      option,
    })

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      sku: product.sku,
      productLane: product.product_lane ?? 'standard',
      detailTemplate: product.detail_template ?? 'standard',
      mainCategorySlug: category?.slug ?? '',
      mainCategoryName: category?.name ?? '',
      categoryPath: buildDisplayCategoryPath({
        primaryPath,
        linkedSubcategoryNames: linkedSubcategoryMap.get(product.id) ?? [],
        linkedOptionNames: linkedOptionMap.get(product.id) ?? [],
      }),
      type: option?.name || subcategory?.name || category?.name || '',
      price: product.base_price,
      stock: product.stock_quantity ?? 0,
      featured: product.featured,
      status: product.status,
      metals: metalMap.get(product.id) ?? [],
    } as ProductRow & { metals?: string[] }
  })
  const total = count ?? 0
  return { items, page: safePage, pageSize: PRODUCT_PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE)) }
}
