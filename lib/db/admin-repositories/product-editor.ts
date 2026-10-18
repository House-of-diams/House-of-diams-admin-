import 'server-only'
import type { DbExecutor } from '../query'
import type { ProductRecord, ProductFaqItem } from '../../product-catalog'
import type { ProductEditorItem } from '../../product-editor'
import type { ProductMetalVariant, ProductVariantMediaItem } from '../../product-metal-variants'
import type { ProductCustomDropdown, ProductCustomDropdownOption } from '../../product-custom-dropdowns'

export async function findRdsProductId(db: DbExecutor, lookup: string, byId = false): Promise<string | null> {
  if (!byId) {
    const result = await db.query<{ id: string }>('SELECT id FROM public.products WHERE slug=$1::text', [lookup.trim()])
    if (result.rows[0]) return result.rows[0].id
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lookup)) return null
  return (await db.query<{ id: string }>('SELECT id FROM public.products WHERE id=$1::uuid', [lookup])).rows[0]?.id ?? null
}

export async function loadRdsProductEditor(db: DbExecutor, id: string): Promise<ProductEditorItem | null> {
  const result = await db.query<{ item: ProductRecord }>('SELECT to_jsonb(p) AS item FROM public.products p WHERE p.id=$1::uuid', [id])
  if (!result.rows[0]) return null
  // Static statements, jsonb decoding preserves numeric/timestamp response contracts.
  const metals = await db.query<{ metal_id: string }>('SELECT metal_id FROM public.product_metal_selections WHERE product_id=$1::uuid ORDER BY sort_order', [id])
  const materials = await db.query<{ material_value_id: string }>('SELECT material_value_id FROM public.product_material_value_selections WHERE product_id=$1::uuid ORDER BY sort_order', [id])
  const shapes = await db.query<{ shape_id: string }>('SELECT shape_id FROM public.product_stone_shapes WHERE product_id=$1::uuid', [id])
  const subs = await db.query<{ subcategory_id: string }>('SELECT subcategory_id FROM public.product_subcategory_links WHERE product_id=$1::uuid AND is_primary IS NOT TRUE ORDER BY sort_order', [id])
  const options = await db.query<{ option_id: string }>('SELECT option_id FROM public.product_option_links WHERE product_id=$1::uuid AND is_primary IS NOT TRUE ORDER BY sort_order', [id])
  const prices = await db.query<{ item: NonNullable<ProductEditorItem['purity_prices']>[number] }>('SELECT to_jsonb(p) AS item FROM public.product_purity_prices p WHERE product_id=$1::uuid ORDER BY sort_order', [id])
  const metalMedia = await db.query<{ item: NonNullable<ProductEditorItem['metal_media']>[number] }>('SELECT to_jsonb(p) AS item FROM public.product_metal_media p WHERE product_id=$1::uuid', [id])
  const variants = await db.query<{ item: ProductMetalVariant }>('SELECT to_jsonb(p) AS item FROM public.product_metal_variants p WHERE product_id=$1::uuid ORDER BY sort_order', [id])
  const media = await db.query<{ item: ProductVariantMediaItem }>('SELECT to_jsonb(p) AS item FROM public.product_variant_media_items p WHERE product_id=$1::uuid ORDER BY sort_order', [id])
  const faq = await db.query<{ item: ProductFaqItem }>('SELECT to_jsonb(p) AS item FROM public.product_faq_items p WHERE product_id=$1::uuid ORDER BY sort_order', [id])
  const groups = await db.query<{ item: Omit<ProductCustomDropdown, 'options'> }>('SELECT to_jsonb(p) AS item FROM public.product_custom_dropdowns p WHERE product_id=$1::uuid ORDER BY display_order', [id])
  const dropdownOptions = groups.rows.length ? await db.query<{ item: ProductCustomDropdownOption & { dropdown_id: string } }>('SELECT to_jsonb(p) AS item FROM public.product_custom_dropdown_options p WHERE dropdown_id=ANY($1::uuid[]) ORDER BY display_order', [groups.rows.map(row => row.item.id)]) : { rows: [] }
  const mediaItems = media.rows.map(row => row.item)
  return { ...result.rows[0].item,
    metal_ids: metals.rows.map(row => row.metal_id), material_value_ids: materials.rows.map(row => row.material_value_id),
    shape_ids: shapes.rows.map(row => row.shape_id), linked_subcategory_ids: subs.rows.map(row => row.subcategory_id), linked_option_ids: options.rows.map(row => row.option_id),
    purity_prices: prices.rows.map(row => row.item), metal_media: metalMedia.rows.map(row => row.item),
    metal_variants: variants.rows.map(row => ({ ...row.item, media_items: mediaItems.filter(item => item.variant_id === row.item.id) })),
    default_variant_media_items: mediaItems.filter(item => item.variant_id == null && item.is_default_fallback),
    faq_items: faq.rows.map(row => row.item), custom_dropdowns: groups.rows.map(row => ({ ...row.item, options: dropdownOptions.rows.filter(option => option.item.dropdown_id === row.item.id).map(option => option.item) })),
  }
}
