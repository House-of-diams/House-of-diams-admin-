import 'server-only'
import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/cms-auth'
import { loadCatalogMasterList } from '@/lib/catalog-master-save'
import { loadCatalogRingSnapshot } from '@/lib/catalog-ring-save'
import { loadCatalogHierarchyList } from '@/lib/catalog-hierarchy-save'
import { loadCatalogMetalList } from '@/lib/catalog-metal-save'

type CatalogClient = { from: (table: string) => { select: (columns: string) => { order: (column: string, options: { ascending: boolean }) => PromiseLike<{ data: unknown[] | null; error: unknown }> } } }

async function loadOptionalTable(adminClient: CatalogClient, table: string, columns = '*') {
  const result = await adminClient.from(table).select(columns).order('display_order', { ascending: true })
  if (result.error) return []
  return result.data ?? []
}

export async function loadLegacyCatalogBootstrap(request: Request) {

  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const { adminClient } = access
  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') ?? 'all'
  const includeBasics = scope === 'all' || scope === 'basics'
  const includePricing = scope === 'all' || scope === 'pricing'
  const includeAttributes = scope === 'all' || scope === 'attributes'
  const includeContent = scope === 'all' || scope === 'content'

  const [categories, subcategories, options, metalsResult, materialValues, stoneShapesResult, ringSizes, ringCategories, certificates, styles, productContentRules, gstSlabs, navbarItemsResult] = await Promise.all([
    includeBasics ? loadCatalogHierarchyList(adminClient, 'category') : Promise.resolve([]),
    includeBasics ? loadCatalogHierarchyList(adminClient, 'subcategory') : Promise.resolve([]),
    includeBasics ? loadCatalogHierarchyList(adminClient, 'option') : Promise.resolve([]),
    (includePricing || includeAttributes) ? loadCatalogMetalList(adminClient) : Promise.resolve([]),
    includeAttributes ? loadOptionalTable(adminClient, 'catalog_material_values', 'id, name, slug, display_order, status') : Promise.resolve([]),
    includeAttributes ? adminClient.from('catalog_stone_shapes').select('id, name, slug, svg_asset_url, display_order, status').order('display_order', { ascending: true }) : Promise.resolve({ data: [], error: null }),
    includeAttributes ? loadOptionalTable(adminClient, 'catalog_ring_sizes', 'id, name, slug, display_order, status') : Promise.resolve([]),
    includeAttributes ? loadCatalogRingSnapshot(adminClient) : Promise.resolve({ categories: [], sizes: [], revision: '' }),
    (includePricing || includeAttributes) ? loadOptionalTable(adminClient, 'catalog_certificates', 'id, name, code, slug, display_order, status') : Promise.resolve([]),
    includeBasics ? loadOptionalTable(adminClient, 'catalog_styles', 'id, name, icon_svg_path, display_order, status') : Promise.resolve([]),
    includeContent ? loadCatalogMasterList(adminClient, 'content_rule') : Promise.resolve([]),
    includePricing ? loadOptionalTable(adminClient, 'catalog_gst_slabs', 'id, name, code, percentage, description, display_order, status') : Promise.resolve([]),
    scope === 'all' ? adminClient.from('navbar_items').select('id, label, slug, item_type, linked_category_id, direct_link_url, status').order('display_order', { ascending: true }) : Promise.resolve({ data: [], error: null }),
  ])

  const error =
    stoneShapesResult.error

  if (error) {
    return NextResponse.json({ error: 'Unable to load the catalog editor data.' }, { status: 503 })
  }

  return NextResponse.json({
    ...(includeBasics
      ? {
          categories,
          subcategories,
          options,
          styles,
        }
      : {}),
    ...(includePricing
      ? {
          metals: metalsResult,
          certificates,
          gstSlabs,
        }
      : {}),
    ...(includeAttributes
      ? {
          metals: metalsResult,
          materialValues,
          stoneShapes: stoneShapesResult.data ?? [],
          ringSizes,
          ringCategories: ringCategories.categories,
          ringCategorySizes: ringCategories.sizes,
          certificates,
        }
      : {}),
    ...(includeContent
      ? {
          productContentRules,
        }
      : {}),
    ...(scope === 'all'
      ? {
          navbarItems: navbarItemsResult.error ? [] : navbarItemsResult.data ?? [],
        }
      : {}),
  })
}
