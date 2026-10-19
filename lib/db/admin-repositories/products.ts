import 'server-only'
import type { z } from 'zod'
import type { AdminActor } from '../../auth/admin-identity-core'
import type { ProductPayload } from '../../product-payload-validation'
import type { bulkPriceSchema, bulkDeleteSchema, activateDraftsSchema, bulkPricePreviewSchema, bulkPriceByMetalSchema } from '../../product-operations-validation'
import type { DbExecutor } from '../query'
import { enforceVideoSave, videoReferenceSlots, productVideoProjection } from '../../video-save-admission'
import { loadRdsProductEditor } from './product-editor'

export type DuplicateProduct = { product_id: string; slug: string; lane: 'standard' | 'hiphop' | 'collection' }
export type ProductOperationResult = Record<string, unknown>

/** Executor must be inside B2's authorized transaction; actor comes from B1 authorization. */
export function createProductRepository(db: DbExecutor) {
  async function scalar(sql: string, values: unknown[]): Promise<ProductOperationResult> {
    const { rows } = await db.query<{ result: ProductOperationResult }>(sql, values)
    if (rows.length !== 1 || !rows[0].result || typeof rows[0].result !== 'object' || Array.isArray(rows[0].result)) throw new Error('Invalid product result')
    return rows[0].result
  }
  return {
    async save(actor: AdminActor, input: { productId?: string | null; slug?: string | null; payload: ProductPayload }) {
      if (videoReferenceSlots(productVideoProjection(input.payload)).size) {
        if (input.productId) await db.query('SELECT id FROM public.products WHERE id=$1::uuid FOR UPDATE', [input.productId])
        const previous = input.productId ? await loadRdsProductEditor(db, input.productId) : null
        await enforceVideoSave(db, productVideoProjection(input.payload), productVideoProjection(previous))
      }
      return scalar('SELECT public.admin_product_save_v1($1::uuid,$2::uuid,$3::text,$4::jsonb) AS result',
        [actor.profileId, input.productId ?? null, input.slug ?? null, JSON.stringify(input.payload)])
    },
    bulkPrice(actor: AdminActor, input: z.infer<typeof bulkPriceSchema>) {
      return scalar('SELECT public.admin_product_bulk_price_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::numeric,$6::uuid[],$7::jsonb) AS result',
        [actor.profileId, input.requestId, input.lane, input.operation, input.value, input.ids, JSON.stringify(input.expectedPrices)])
    },
    /** Active metals offered in the bulk price dialog. */
    async bulkPriceMetals() {
      const { rows } = await db.query<{ id: string; name: string; label: string }>(`SELECT m.id::text AS id, m.name,
        coalesce(nullif(trim(m.display_label), ''), m.name) AS label FROM public.catalog_metals m
        WHERE m.status::text = 'active' ORDER BY m.display_order, m.name`)
      return rows
    },
    /** Current variant prices for the chosen products and metals; their prices become the apply guard. */
    async bulkPricePreview(input: z.infer<typeof bulkPricePreviewSchema>) {
      const { rows } = await db.query<{ variant_id: string; product_id: string; product_name: string; metal_id: string; metal_label: string; price: string; is_default: boolean }>(
        `SELECT v.id::text AS variant_id, v.product_id::text AS product_id, p.name AS product_name, v.metal_id::text AS metal_id,
          coalesce(nullif(trim(m.display_label), ''), m.name) AS metal_label, v.price::text AS price, v.is_default
        FROM public.product_metal_variants v JOIN public.products p ON p.id = v.product_id JOIN public.catalog_metals m ON m.id = v.metal_id
        WHERE v.product_id = ANY($1::uuid[]) AND v.metal_id = ANY($2::uuid[]) AND coalesce(p.product_lane, 'standard') = $3::text
        ORDER BY p.name, m.display_order, v.id`, [input.ids, input.metalIds, input.lane])
      return rows.map((row) => ({ ...row, price: Number(row.price) }))
    },
    bulkPriceByMetal(actor: AdminActor, input: z.infer<typeof bulkPriceByMetalSchema>) {
      return scalar('SELECT public.admin_product_bulk_price_v2($1::uuid,$2::uuid,$3::text,$4::text,$5::numeric,$6::uuid[],$7::uuid[],$8::jsonb) AS result',
        [actor.profileId, input.requestId, input.lane, input.operation, input.value, input.ids, input.metalIds, JSON.stringify(input.expectedPrices)])
    },
    bulkDelete(actor: AdminActor, input: z.infer<typeof bulkDeleteSchema>) {
      return scalar('SELECT public.admin_product_bulk_delete_v1($1::uuid,$2::uuid,$3::text,$4::uuid[]) AS result',
        [actor.profileId, input.requestId, input.lane, input.ids])
    },
    activateDrafts(actor: AdminActor, input: z.infer<typeof activateDraftsSchema>) {
      return scalar('SELECT public.admin_product_activate_drafts_v1($1::uuid,$2::uuid,$3::text,$4::uuid[]) AS result',
        [actor.profileId, input.requestId, input.lane, input.ids])
    },
    async duplicate(actor: AdminActor, sourceId: string, requestId: string): Promise<DuplicateProduct> {
      if (!actor.issuer || !actor.subject) throw Object.assign(new Error('Administrator access is required.'), { code: '42501' })
      // Preparation and copying must share a repeatable-write snapshot. The DB
      // helper enforces this; unrelated product writers need no broad table lock.
      const prepared = await db.query<{ result: { replay?: DuplicateProduct; graph?: unknown } }>(
        'SELECT public.admin_product_duplicate_prepare_v1($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text) AS result',
        [sourceId, requestId, actor.profileId, actor.issuer, actor.subject])
      if (prepared.rows.length !== 1 || !prepared.rows[0].result) throw new Error('Duplication requires the reviewed database capability.')
      const preparation = prepared.rows[0].result
      if (preparation.replay) {
        const replay = preparation.replay
        if (!replay.product_id || !replay.slug || !['standard', 'hiphop', 'collection'].includes(replay.lane)) throw new Error('Invalid duplicate replay')
        return replay
      }
      if (!preparation.graph || typeof preparation.graph !== 'object' || Array.isArray(preparation.graph)) throw new Error('Invalid duplicate graph')
      const graph = preparation.graph as Record<string, unknown>
      if (!graph.product || typeof graph.product !== 'object' || Array.isArray(graph.product)
        || String((graph.product as Record<string, unknown>).id).toLowerCase() !== sourceId.toLowerCase()
        || !['metal_media','variants','media_items','product_metal_selections','product_material_value_selections',
          'product_stone_shapes','product_subcategory_links','product_option_links','product_purity_prices','product_faq_items'].every(key => Array.isArray(graph[key]))) throw new Error('Incomplete duplicate graph')
      await enforceVideoSave(db, preparation.graph, null)
      // Audited order is source, request, admin (unlike the actor-first v1 routines).
      const { rows } = await db.query<DuplicateProduct>('SELECT * FROM public.duplicate_product($1::uuid,$2::uuid,$3::uuid)', [sourceId, requestId, actor.profileId])
      if (rows.length !== 1 || !rows[0].product_id || !rows[0].slug || !['standard', 'hiphop', 'collection'].includes(rows[0].lane)) throw new Error('Invalid duplicate result')
      return rows[0]
    },
    async source(id: string) {
      const { rows } = await db.query<{ id: string; product_lane: string | null }>('SELECT id, product_lane FROM public.products WHERE id=$1::uuid', [id])
      return rows[0] ?? null
    },
    async draft(id: string, expectedStatus: string) {
      const { rows } = await db.query<{ id: string; status: string }>("UPDATE public.products SET status='draft',updated_at=$3::timestamptz WHERE id=$1::uuid AND status::text=$2::text RETURNING id,status", [id, expectedStatus, new Date().toISOString()])
      if (rows[0]) return { status: 'updated' as const, item: rows[0] }
      const current = await db.query<{ id: string }>('SELECT id FROM public.products WHERE id=$1::uuid', [id])
      return { status: current.rows.length ? 'conflict' as const : 'not_found' as const }
    },
  }
}
