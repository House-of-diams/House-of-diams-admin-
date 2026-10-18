import 'server-only'
import type { DbExecutor } from '../query'
import type { AdminActor } from '../../auth/admin-identity-core'
import type { ProductPayload } from '../../product-payload-validation'
import { validateProductCustomDropdowns } from '../../product-custom-dropdowns'
import { validateProductMasterRows } from '../../product-master-validation'
import { prepareProductSavePayload } from '../../product-save'
import { buildProductSlugBase, getRetiredProductSlug, selectAvailableProductSlug } from '../../product-slug-core'
import { createProductRepository } from './products'

const masterStatements: Record<string, string> = {
  catalog_categories: 'SELECT id FROM public.catalog_categories WHERE id=ANY($1::uuid[])',
  catalog_subcategories: 'SELECT id,category_id FROM public.catalog_subcategories WHERE id=ANY($1::uuid[])',
  catalog_options: 'SELECT id,subcategory_id FROM public.catalog_options WHERE id=ANY($1::uuid[])',
  catalog_styles: 'SELECT id FROM public.catalog_styles WHERE id=ANY($1::uuid[])',
  catalog_gst_slabs: 'SELECT id FROM public.catalog_gst_slabs WHERE id=ANY($1::uuid[])',
  catalog_metals: 'SELECT id FROM public.catalog_metals WHERE id=ANY($1::uuid[])',
  catalog_certificates: 'SELECT id FROM public.catalog_certificates WHERE id=ANY($1::uuid[])',
  catalog_material_values: 'SELECT id FROM public.catalog_material_values WHERE id=ANY($1::uuid[])',
  catalog_stone_shapes: 'SELECT id FROM public.catalog_stone_shapes WHERE id=ANY($1::uuid[])',
  catalog_ring_categories: 'SELECT id FROM public.catalog_ring_categories WHERE id=ANY($1::uuid[])',
  product_content_rules: 'SELECT id,kind FROM public.product_content_rules WHERE id=ANY($1::uuid[])',
}
export async function saveRdsProduct(db: DbExecutor, actor: AdminActor, body: ProductPayload, productId: string | null) {
  const dropdownError = body.custom_dropdowns_enabled ? validateProductCustomDropdowns(body.custom_dropdowns) : null
  if (dropdownError) return { error: dropdownError }
  const validation = await validateProductMasterRows(async <T extends { id: string }>(table: string, ids: string[]) => {
    if (!Object.hasOwn(masterStatements, table)) throw new Error('Unsupported product reference')
    return { rows: ids.length ? (await db.query<T>(masterStatements[table], [ids])).rows : [], error: null }
  }, body)
  if (!validation.ok) return { error: validation.message }
  const variants = body.metal_variants ?? []
  const metalIds = variants.length ? [...new Set(variants.map(row => row.metal_id).filter(Boolean))] : body.metal_ids ?? []
  const variant = variants.find(row => row.is_default) ?? variants[0]
  const price = variant && Number.isFinite(Number(variant.price)) ? Number(variant.price) : body.base_price
  if (!Number.isFinite(price) || Number(price) <= 0) return { error: 'Base price must be greater than 0. Add a price to the default metal option before saving.' }
  let slug: string | null = null
  if (!productId) {
    const base = buildProductSlugBase(body.name)
    const products = await db.query<{ slug: string }>('SELECT slug FROM public.products WHERE slug LIKE $1::text', [`${base}%`])
    const redirects = await db.query<{ source_path: string }>('SELECT source_path FROM public.seo_redirects WHERE source_path LIKE $1::text', [`/shop/${base}%`])
    const unavailable = new Set(products.rows.map(row => row.slug))
    for (const row of redirects.rows) { const retired = getRetiredProductSlug(row.source_path); if (retired) unavailable.add(retired) }
    slug = selectAvailableProductSlug(base, unavailable)
  }
  return { data: await createProductRepository(db).save(actor, { productId, slug, payload: prepareProductSavePayload(body, Number(price), metalIds) }) }
}
