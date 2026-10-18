import 'server-only'
import type { DbExecutor } from '../query'
import type { BootstrapPayload } from '../../../components/product-form'

export type ProductBootstrapScope = 'basics' | 'pricing' | 'attributes' | 'content' | 'all'
export async function loadRdsProductBootstrap(db: DbExecutor, scope: ProductBootstrapScope): Promise<BootstrapPayload & { ringSizes?: unknown[]; navbarItems?: unknown[] }> {
  async function scalar<T>(sql: string, values: unknown[] = []): Promise<T> {
    const result = await db.query<{ result: T }>(sql, values)
    if (result.rows.length !== 1 || result.rows[0].result == null) throw new Error('Invalid product reference result')
    return result.rows[0].result
  }
  const result: BootstrapPayload & { ringSizes?: unknown[]; navbarItems?: unknown[] } = {}
  if (scope === 'all' || scope === 'basics') {
    result.categories = await scalar('SELECT public.catalog_hierarchy_list_v1($1::text) AS result', ['category'])
    result.subcategories = await scalar('SELECT public.catalog_hierarchy_list_v1($1::text) AS result', ['subcategory'])
    result.options = await scalar('SELECT public.catalog_hierarchy_list_v1($1::text) AS result', ['option'])
    result.styles = await scalar("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY display_order),'[]'::jsonb) AS result FROM public.catalog_styles r")
  }
  if (scope === 'all' || scope === 'pricing' || scope === 'attributes') {
    result.metals = await scalar('SELECT public.catalog_metal_list_v1() AS result')
    result.certificates = await scalar("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY display_order),'[]'::jsonb) AS result FROM public.catalog_certificates r")
  }
  if (scope === 'all' || scope === 'pricing') result.gstSlabs = await scalar("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY display_order),'[]'::jsonb) AS result FROM public.catalog_gst_slabs r")
  if (scope === 'all' || scope === 'attributes') {
    result.materialValues = await scalar("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY display_order),'[]'::jsonb) AS result FROM public.catalog_material_values r")
    result.stoneShapes = await scalar("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY display_order),'[]'::jsonb) AS result FROM public.catalog_stone_shapes r")
    result.ringSizes = await scalar("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY display_order),'[]'::jsonb) AS result FROM public.catalog_ring_sizes r")
    const ring = await scalar<{ categories: BootstrapPayload['ringCategories']; sizes: BootstrapPayload['ringCategorySizes'] }>('SELECT public.catalog_ring_snapshot_v1() AS result')
    result.ringCategories = ring.categories
    result.ringCategorySizes = ring.sizes
  }
  if (scope === 'all' || scope === 'content') result.productContentRules = await scalar('SELECT public.catalog_master_list_v1($1::text) AS result', ['content_rule'])
  if (scope === 'all') result.navbarItems = await scalar("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY display_order),'[]'::jsonb) AS result FROM public.navbar_items r")
  return result
}
