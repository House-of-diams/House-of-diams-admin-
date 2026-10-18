import { runProductRdsRoute } from '@/lib/product-rds-handlers'
import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/cms-auth'
import type {
  CatalogCategory,
  CatalogCertificate,
  CatalogGstSlab,
  CatalogMetal,
  CatalogMaterialValue,
  CatalogOption,
  CatalogRingCategory,
  CatalogRingCategorySize,
  CatalogStoneShape,
  CatalogStyle,
  CatalogSubcategory,
  ProductRecord,
} from '@/lib/product-catalog'
import { formatCategoryPath } from '@/lib/product-catalog'
import { allocateProductSlug } from '@/lib/product-slugs'
import { validateProductCustomDropdowns } from '@/lib/product-custom-dropdowns'
import { validateProductMasterReferences } from '@/lib/product-master-validation'
import { productPayloadErrorMessage, productPayloadSchema, safeProductSaveError } from '@/lib/product-payload-validation'
import { prepareProductSavePayload, saveProductAtomically } from '@/lib/product-save'

function productSaveFailure(error: { code?: string | null } | null | undefined) {
  console.error('Product save failed.', { code: error?.code })
  const safe = safeProductSaveError(error)
  return NextResponse.json({ error: safe.message }, { status: safe.status })
}
function isMissingRelation(error: { message?: string | null } | null | undefined, table: string) {
  return (
    error?.message?.includes(`relation "${table}" does not exist`) ||
    error?.message?.includes(`Could not find the table 'public.${table}' in the schema cache`)
  ) ?? false
}

function isPositivePrice(value: unknown) {
  const price = Number(value)
  return Number.isFinite(price) && price > 0
}

async function fetchAllProductMetalSelectionSummaries(adminClient: any, productIds: string[]) {
  const pageSize = 1000
  const rows: Array<{ product_id: string; metal: RelatedNameRow }> = []

  for (let from = 0; ; from += pageSize) {
    const result = await adminClient
      .from('product_metal_selections')
      .select('product_id, metal:catalog_metals(name)')
      .in('product_id', productIds)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (result.error) return result

    const page = (result.data ?? []) as Array<{ product_id: string; metal: RelatedNameRow }>
    rows.push(...page)
    if (page.length < pageSize) return { data: rows, error: null }
  }
}

type RelatedNameRow = { name?: string | null } | Array<{ name?: string | null }> | null

function extractRelatedName(value: RelatedNameRow) {
  return Array.isArray(value) ? value[0]?.name ?? null : value?.name ?? null
}

async function loadCatalog(adminClient: any) {
  const [categoriesResult, subcategoriesResult, optionsResult, metalsResult, materialValuesResult, shapesResult, certificatesResult, ringCategoriesResult, ringCategorySizesResult, stylesResult, gstSlabsResult] = await Promise.all([
    adminClient.from('catalog_categories').select('*'),
    adminClient.from('catalog_subcategories').select('*'),
    adminClient.from('catalog_options').select('*'),
    adminClient.from('catalog_metals').select('*'),
    adminClient.from('catalog_material_values').select('*'),
    adminClient.from('catalog_stone_shapes').select('*'),
    adminClient.from('catalog_certificates').select('*'),
    adminClient.from('catalog_ring_categories').select('*'),
    adminClient.from('catalog_ring_category_sizes').select('*'),
    adminClient.from('catalog_styles').select('*'),
    adminClient.from('catalog_gst_slabs').select('*'),
  ])

  return {
    categories: (categoriesResult.data ?? []) as CatalogCategory[],
    subcategories: (subcategoriesResult.data ?? []) as CatalogSubcategory[],
    options: (optionsResult.data ?? []) as CatalogOption[],
    metals: (metalsResult.data ?? []) as CatalogMetal[],
    materialValues: materialValuesResult.error ? ([] as CatalogMaterialValue[]) : ((materialValuesResult.data ?? []) as CatalogMaterialValue[]),
    shapes: (shapesResult.data ?? []) as CatalogStoneShape[],
    certificates: certificatesResult.error ? ([] as CatalogCertificate[]) : ((certificatesResult.data ?? []) as CatalogCertificate[]),
    ringCategories: ringCategoriesResult.error ? ([] as CatalogRingCategory[]) : ((ringCategoriesResult.data ?? []) as CatalogRingCategory[]),
    ringCategorySizes: ringCategorySizesResult.error ? ([] as CatalogRingCategorySize[]) : ((ringCategorySizesResult.data ?? []) as CatalogRingCategorySize[]),
    styles: stylesResult.error ? ([] as CatalogStyle[]) : ((stylesResult.data ?? []) as CatalogStyle[]),
    gstSlabs: gstSlabsResult.error ? ([] as CatalogGstSlab[]) : ((gstSlabsResult.data ?? []) as CatalogGstSlab[]),
  }
}

function formatProductListItem(
  product: ProductRecord,
  catalog: Awaited<ReturnType<typeof loadCatalog>>,
  metalNames: string[]
) {
  const category = catalog.categories.find((item) => item.id === product.main_category_id)
  const subcategory = catalog.subcategories.find((item) => item.id === product.subcategory_id)
  const option = catalog.options.find((item) => item.id === product.option_id)
  const certificateNames = catalog.certificates
    .filter((item) => (product.certificate_ids ?? []).includes(item.id))
    .map((item) => item.name)
  const ringCategory = catalog.ringCategories.find((item) => item.id === product.ring_category_id)
  const gstSlab = catalog.gstSlabs.find((item) => item.id === product.gst_slab_id)

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    sku: product.sku,
    productLane: product.product_lane ?? 'standard',
    detailTemplate: product.detail_template ?? 'standard',
    mainCategorySlug: category?.slug ?? '',
    mainCategoryName: category?.name ?? '',
    categoryPath: formatCategoryPath({
      category,
      subcategory,
      option,
    }),
    type: option?.name || subcategory?.name || category?.name || '',
    price: product.base_price,
    stock: product.stock_quantity ?? 0,
    gstName: gstSlab?.name ?? '',
    gstPercentage: gstSlab?.percentage ?? 0,
    featured: product.featured,
    status: product.status,
    purities: product.purity_values ?? [],
    certificates: certificateNames,
    metals: metalNames,
    ringEnabled: Boolean(product.ring_enabled),
    ringCategoryName: ringCategory?.name ?? '',
  }
}

export async function GET(request: Request) {
  const rds = await runProductRdsRoute('product-all', request)
  if (rds) return rds

  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const { adminClient } = access
  const { data: products, error } = await adminClient.from('products').select('*').order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const productIds = (products ?? []).map((product) => product.id)
  const [metalSelections, materialValueSelections, shapeSelections, catalog] = await Promise.all([
    productIds.length
      ? fetchAllProductMetalSelectionSummaries(adminClient, productIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? adminClient.from('product_material_value_selections').select('product_id, material_value:catalog_material_values(name)').in('product_id', productIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? adminClient.from('product_stone_shapes').select('product_id, shape:catalog_stone_shapes(name, slug)').in('product_id', productIds)
      : Promise.resolve({ data: [], error: null }),
    loadCatalog(adminClient),
  ])

  const metalMap = new Map<string, string[]>()
  for (const row of metalSelections.data ?? []) {
    const name = extractRelatedName(row.metal as RelatedNameRow)
    if (!name) continue
    metalMap.set(row.product_id, [...(metalMap.get(row.product_id) ?? []), name])
  }

  const shapeMap = new Map<string, string[]>()
  if (!shapeSelections.error || !isMissingRelation(shapeSelections.error, 'product_stone_shapes')) {
    for (const row of shapeSelections.data ?? []) {
      const name = extractRelatedName(row.shape as RelatedNameRow)
      if (!name) continue
      shapeMap.set(row.product_id, [...(shapeMap.get(row.product_id) ?? []), name])
    }
  }

  const materialValueMap = new Map<string, string[]>()
  if (!materialValueSelections.error || !isMissingRelation(materialValueSelections.error, 'product_material_value_selections')) {
    for (const row of materialValueSelections.data ?? []) {
      const name = extractRelatedName(row.material_value as RelatedNameRow)
      if (!name) continue
      materialValueMap.set(row.product_id, [...(materialValueMap.get(row.product_id) ?? []), name])
    }
  }

  const items = ((products ?? []) as ProductRecord[]).map((product) =>
    ({
      ...formatProductListItem(
        product,
        catalog,
        metalMap.get(product.id) ?? []
      ),
      defaultPurityPriceId: product.default_purity_price_id ?? null,
      shapesEnabled: Boolean(product.shapes_enabled),
      shapes: shapeMap.get(product.id) ?? [],
      materialValues: materialValueMap.get(product.id) ?? [],
    })
  )

  return NextResponse.json({ items })
}

export async function POST(request: Request) {
  const rds = await runProductRdsRoute('create', request)
  if (rds) return rds

  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const { adminClient } = access
  const parsedBody = productPayloadSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) return NextResponse.json({ error: productPayloadErrorMessage(parsedBody.error) }, { status: 400 })
  const body = parsedBody.data
  const customDropdownError = body.custom_dropdowns_enabled ? validateProductCustomDropdowns(body.custom_dropdowns) : null
  if (customDropdownError) return NextResponse.json({ error: customDropdownError }, { status: 400 })

  const masterValidation = await validateProductMasterReferences(adminClient, body)
  if (!masterValidation.ok) {
    return NextResponse.json({ error: masterValidation.message }, { status: 400 })
  }

  const variantRows = body.metal_variants ?? []
  const resolvedMetalIds =
    variantRows.length > 0
      ? [...new Set(variantRows.map((entry) => entry.metal_id).filter(Boolean))]
      : (body.metal_ids ?? [])
  const defaultVariant =
    variantRows.find((entry) => entry.is_default) ??
    variantRows[0] ??
    null
  const resolvedBasePrice =
    defaultVariant && Number.isFinite(Number(defaultVariant.price))
      ? Number(defaultVariant.price)
      : body.base_price

  if (!isPositivePrice(resolvedBasePrice)) {
    return NextResponse.json({ error: 'Base price must be greater than 0. Add a price to the default metal option before saving.' }, { status: 400 })
  }

  let productSlug: string
  try {
    productSlug = await allocateProductSlug(adminClient, body.name)
  } catch (slugError) {
    return NextResponse.json(
      { error: 'Unable to allocate a product URL.' },
      { status: 500 }
    )
  }

  const atomicPayload = prepareProductSavePayload(body, Number(resolvedBasePrice), resolvedMetalIds)
  const atomicResult = await saveProductAtomically(adminClient, {
    actorId: access.user.id,
    slug: productSlug,
    payload: atomicPayload,
  })
  if (atomicResult.error) return productSaveFailure(atomicResult.error)
  return NextResponse.json(atomicResult.data, { headers: { 'Cache-Control': 'no-store' } })

}

export const runtime = 'nodejs'
