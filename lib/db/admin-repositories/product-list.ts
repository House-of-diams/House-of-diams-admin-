import 'server-only'
import type { DbExecutor } from '../query'
import type { ProductLane, ProductListPage } from '../../../app/dashboard/products/product-list'
import type { ProductRow } from '../../../app/dashboard/products/products-client'

type ListRow = { item: ProductRow; metals: string[]; linked_subcategories: string[]; linked_options: string[] }
export async function loadRdsProductList(db: DbExecutor, lane: ProductLane | undefined, page = 1, search = ''): Promise<ProductListPage> {
  const safePage = Math.max(1, page)
  const values = [lane ?? null, search ? `%${search}%` : null]
  const where = '($1::text IS NULL OR p.product_lane=$1::text) AND ($2::text IS NULL OR p.name ILIKE $2::text OR p.sku ILIKE $2::text)'
  // Callers use a product read snapshot; count includes pages beyond the end.
  const count = await db.query<{ total: string }>(`SELECT count(*)::text AS total FROM public.products p WHERE ${where}`, values)
  const { rows } = await db.query<ListRow>(`SELECT jsonb_build_object(
    'id',p.id,'slug',p.slug,'name',p.name,'sku',p.sku,'productLane',coalesce(p.product_lane,'standard'),
    'detailTemplate',coalesce(p.detail_template,'standard'),'mainCategorySlug',coalesce(c.slug,''),
    'mainCategoryName',coalesce(c.name,''),'categoryPath',CASE WHEN c.id IS NULL THEN '' ELSE concat_ws(' > ',nullif(c.name,''),nullif(s.name,''),nullif(o.name,'')) END,
    'type',coalesce(nullif(o.name,''),nullif(s.name,''),c.name,''),'price',p.base_price,
    'stock',coalesce(p.stock_quantity,0),'featured',p.featured,'status',p.status) AS item,
    ARRAY(SELECT m.name FROM public.product_metal_selections ms JOIN public.catalog_metals m ON m.id=ms.metal_id WHERE ms.product_id=p.id) AS metals,
    ARRAY(SELECT sc.name FROM public.product_subcategory_links l JOIN public.catalog_subcategories sc ON sc.id=l.subcategory_id WHERE l.product_id=p.id AND l.is_primary IS NOT TRUE) AS linked_subcategories,
    ARRAY(SELECT op.name FROM public.product_option_links l JOIN public.catalog_options op ON op.id=l.option_id WHERE l.product_id=p.id AND l.is_primary IS NOT TRUE) AS linked_options
    FROM public.products p LEFT JOIN public.catalog_categories c ON c.id=p.main_category_id
    LEFT JOIN public.catalog_subcategories s ON s.id=p.subcategory_id LEFT JOIN public.catalog_options o ON o.id=p.option_id
    WHERE ${where} ORDER BY p.created_at DESC,p.id DESC LIMIT $3::integer OFFSET $4::integer`, [...values, 20, (safePage - 1) * 20])
  const items = rows.map(row => {
    const linked = [...row.linked_subcategories, ...row.linked_options].filter(Boolean)
    return { ...row.item, metals: row.metals, categoryPath: linked.length ? `${row.item.categoryPath} | Linked: ${linked.join(', ')}` : row.item.categoryPath }
  })
  const total = Number(count.rows[0]?.total ?? 0)
  return { items, page: safePage, pageSize: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) }
}

/** Unpaginated legacy /api/products summary contract; relation labels remain arrays. */
export async function loadRdsProductSummaries(db: DbExecutor): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query<{ item: Record<string, unknown> }>(`SELECT jsonb_build_object(
    'id',p.id,'slug',p.slug,'name',p.name,'sku',p.sku,'productLane',coalesce(p.product_lane,'standard'),
    'detailTemplate',coalesce(p.detail_template,'standard'),'mainCategorySlug',coalesce(c.slug,''),
    'mainCategoryName',coalesce(c.name,''),'categoryPath',CASE WHEN c.id IS NULL THEN '' ELSE concat_ws(' > ',nullif(c.name,''),nullif(s.name,''),nullif(o.name,'')) END,
    'type',coalesce(nullif(o.name,''),nullif(s.name,''),c.name,''),'price',p.base_price,'stock',coalesce(p.stock_quantity,0),
    'gstName',coalesce(g.name,''),'gstPercentage',coalesce(g.percentage,0),'featured',p.featured,'status',p.status,
    'purities',coalesce(to_jsonb(p.purity_values),'[]'::jsonb),'certificates',
    ARRAY(SELECT ce.name FROM public.catalog_certificates ce WHERE coalesce(p.certificate_ids,'[]'::jsonb) @> jsonb_build_array(ce.id::text) ORDER BY ce.id),
    'metals',ARRAY(SELECT m.name FROM public.product_metal_selections ms JOIN public.catalog_metals m ON m.id=ms.metal_id WHERE ms.product_id=p.id ORDER BY ms.id),
    'ringEnabled',coalesce(p.ring_enabled,false),'ringCategoryName',coalesce(r.name,''),'defaultPurityPriceId',p.default_purity_price_id,
    'shapesEnabled',coalesce(p.shapes_enabled,false),'shapes',ARRAY(SELECT sh.name FROM public.product_stone_shapes ps JOIN public.catalog_stone_shapes sh ON sh.id=ps.shape_id WHERE ps.product_id=p.id),
    'materialValues',ARRAY(SELECT mv.name FROM public.product_material_value_selections ps JOIN public.catalog_material_values mv ON mv.id=ps.material_value_id WHERE ps.product_id=p.id)
    ) AS item FROM public.products p LEFT JOIN public.catalog_categories c ON c.id=p.main_category_id
    LEFT JOIN public.catalog_subcategories s ON s.id=p.subcategory_id LEFT JOIN public.catalog_options o ON o.id=p.option_id
    LEFT JOIN public.catalog_gst_slabs g ON g.id=p.gst_slab_id LEFT JOIN public.catalog_ring_categories r ON r.id=p.ring_category_id
    ORDER BY p.created_at DESC`)
  return rows.map(row => row.item)
}
