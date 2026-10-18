import 'server-only'
import type { AdminActor } from '../../auth/admin-identity-core'
import type { InventoryDataItem } from '../../inventory-data'
import type { DbExecutor } from '../query'

type InventoryRow = { id: string; name: string; slug: string; sku: string | null; stock_quantity: number | null; updated_at: Date | string; category_path: string; linked_subcategories: string[]; linked_options: string[] }
export function createInventoryRepository(db: DbExecutor) {
  return {
    async list(query = ''): Promise<InventoryDataItem[]> {
      // Link labels intentionally use only the same primary-reference sets as the legacy loader.
      const { rows } = await db.query<InventoryRow>(`SELECT p.id,p.name,p.slug,p.sku,p.stock_quantity,p.updated_at,
        concat_ws(' > ',c.name,s.name,o.name) AS category_path,
        ARRAY(SELECT sc.name FROM public.product_subcategory_links l JOIN public.catalog_subcategories sc ON sc.id=l.subcategory_id
          WHERE l.product_id=p.id AND l.is_primary IS NOT TRUE AND sc.id IN (SELECT subcategory_id FROM public.products)) AS linked_subcategories,
        ARRAY(SELECT op.name FROM public.product_option_links l JOIN public.catalog_options op ON op.id=l.option_id
          WHERE l.product_id=p.id AND l.is_primary IS NOT TRUE AND op.id IN (SELECT option_id FROM public.products)) AS linked_options
        FROM public.products p LEFT JOIN public.catalog_categories c ON c.id=p.main_category_id
        LEFT JOIN public.catalog_subcategories s ON s.id=p.subcategory_id LEFT JOIN public.catalog_options o ON o.id=p.option_id
        ORDER BY p.updated_at DESC`)
      const normalized = query.trim().toLowerCase()
      return rows.map(row => {
        const stock = Number(row.stock_quantity ?? 0)
        const links = [...row.linked_subcategories, ...row.linked_options].filter(Boolean)
        return { id: row.id, name: row.name, slug: row.slug, sku: row.sku ?? '', stockQuantity: stock,
          status: stock <= 0 ? 'out-of-stock' as const : stock <= 5 ? 'low-stock' as const : 'in-stock' as const,
          categoryPath: links.length ? `${row.category_path} | Linked: ${links.join(', ')}` : row.category_path,
          updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at }
      }).filter(item => !normalized || `${item.name} ${item.sku} ${item.categoryPath}`.toLowerCase().includes(normalized))
    },
    async setStock(actor: AdminActor, id: string, input: { expected_stock: number; stock_quantity: number; notes?: string | null }) {
      const { rows } = await db.query<{ result: { product_id: string; stock_quantity: number; updated_at: string; unchanged: boolean } }>(
        'SELECT public.admin_inventory_set_stock_v1($1::uuid,$2::uuid,$3::integer,$4::integer,$5::text) AS result',
        [actor.profileId, id, input.expected_stock, input.stock_quantity, input.notes || null])
      if (rows.length !== 1 || !rows[0].result || typeof rows[0].result !== 'object'
        || typeof rows[0].result.product_id !== 'string' || rows[0].result.product_id.toLowerCase() !== id.toLowerCase() || !Number.isInteger(rows[0].result.stock_quantity)
        || typeof rows[0].result.updated_at !== 'string' || typeof rows[0].result.unchanged !== 'boolean') throw new Error('Invalid inventory result')
      return rows[0].result
    },
  }
}
