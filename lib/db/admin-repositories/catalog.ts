import 'server-only'
import type { CatalogHierarchyRow } from '../../catalog-hierarchy-save'
import type { CatalogMasterRow } from '../../catalog-master-save'
import type { CatalogMetalRow } from '../../catalog-metal-save'
import type { CatalogRingSnapshot } from '../../catalog-ring-save'
import type { DbExecutor } from '../query'
import type { CatalogNavbarItem } from '../../product-catalog'
import type { AdminActor } from '../../auth/admin-identity-core'

// Fixed deployed signatures from Phase A metadata; no request-selected SQL identifiers.
export const catalogRoutines = {
  catalog_delete_master_v1: { sql: "SELECT public.catalog_delete_master_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::uuid) AS result", args: ["p_actor_id", "p_request_id", "p_expected_revision", "p_kind", "p_id"], types: ["uuid", "uuid", "text", "text", "uuid"] },
  catalog_hierarchy_delete_v1: { sql: "SELECT public.catalog_hierarchy_delete_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::uuid) AS result", args: ["p_actor_id", "p_request_id", "p_expected_revision", "p_kind", "p_id"], types: ["uuid", "uuid", "text", "text", "uuid"] },
  catalog_hierarchy_list_v1: { sql: "SELECT public.catalog_hierarchy_list_v1($1::text) AS result", args: ["p_kind"], types: ["text"] },
  catalog_hierarchy_row_v1: { sql: "SELECT public.catalog_hierarchy_row_v1($1::text,$2::uuid) AS result", args: ["p_kind", "p_id"], types: ["text", "uuid"] },
  catalog_hierarchy_save_v1: { sql: "SELECT public.catalog_hierarchy_save_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::uuid,$6::jsonb) AS result", args: ["p_actor_id", "p_request_id", "p_expected_revision", "p_kind", "p_id", "p_item"], types: ["uuid", "uuid", "text", "text", "uuid", "jsonb"] },
  catalog_master_list_v1: { sql: "SELECT public.catalog_master_list_v1($1::text) AS result", args: ["p_kind"], types: ["text"] },
  catalog_master_row_v1: { sql: "SELECT public.catalog_master_row_v1($1::text,$2::uuid) AS result", args: ["p_kind", "p_id"], types: ["text", "uuid"] },
  catalog_metal_delete_v1: { sql: "SELECT public.catalog_metal_delete_v1($1::uuid,$2::uuid,$3::text,$4::uuid) AS result", args: ["p_actor_id", "p_request_id", "p_expected_revision", "p_id"], types: ["uuid", "uuid", "text", "uuid"] },
  catalog_metal_list_v1: { sql: "SELECT public.catalog_metal_list_v1() AS result", args: [], types: [] },
  catalog_metal_row_v1: { sql: "SELECT public.catalog_metal_row_v1($1::uuid) AS result", args: ["p_id"], types: ["uuid"] },
  catalog_metal_save_v1: { sql: "SELECT public.catalog_metal_save_v1($1::uuid,$2::uuid,$3::text,$4::uuid,$5::jsonb,$6::jsonb,$7::bigint[]) AS result", args: ["p_actor_id", "p_request_id", "p_expected_revision", "p_id", "p_metal", "p_parts", "p_deleted_part_ids"], types: ["uuid", "uuid", "text", "uuid", "jsonb", "jsonb", "bigint[]"] },
  catalog_ring_save_v1: { sql: "SELECT public.catalog_ring_save_v1($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::jsonb,$6::text[],$7::text[]) AS result", args: ["p_actor_id", "p_request_id", "p_expected_revision", "p_categories", "p_sizes", "p_deleted_category_ids", "p_deleted_size_ids"], types: ["uuid", "uuid", "text", "jsonb", "jsonb", "text[]", "text[]"] },
  catalog_ring_snapshot_v1: { sql: "SELECT public.catalog_ring_snapshot_v1() AS result", args: [], types: [] },
  catalog_save_master_v1: { sql: "SELECT public.catalog_save_master_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::uuid,$6::jsonb) AS result", args: ["p_actor_id", "p_request_id", "p_expected_revision", "p_kind", "p_id", "p_item"], types: ["uuid", "uuid", "text", "text", "uuid", "jsonb"] },
} as const

export type CatalogArguments = {
  catalog_delete_master_v1: { p_request_id: string; p_expected_revision: string; p_kind: 'gst_slab' | 'certificate' | 'material_value' | 'ring_size' | 'stone_shape' | 'style' | 'content_rule'; p_id: string }
  catalog_hierarchy_delete_v1: { p_request_id: string; p_expected_revision: string; p_kind: 'category' | 'subcategory' | 'option'; p_id: string }
  catalog_hierarchy_list_v1: { p_kind: 'category' | 'subcategory' | 'option' }
  catalog_hierarchy_row_v1: { p_kind: 'category' | 'subcategory' | 'option'; p_id: string }
  catalog_hierarchy_save_v1: { p_request_id: string; p_expected_revision: string | null; p_kind: 'category' | 'subcategory' | 'option'; p_id: string | null; p_item: unknown }
  catalog_master_list_v1: { p_kind: 'gst_slab' | 'certificate' | 'material_value' | 'ring_size' | 'stone_shape' | 'style' | 'content_rule' }
  catalog_master_row_v1: { p_kind: 'gst_slab' | 'certificate' | 'material_value' | 'ring_size' | 'stone_shape' | 'style' | 'content_rule'; p_id: string }
  catalog_metal_delete_v1: { p_request_id: string; p_expected_revision: string; p_id: string }
  catalog_metal_list_v1: Record<string, never>
  catalog_metal_row_v1: { p_id: string }
  catalog_metal_save_v1: { p_request_id: string; p_expected_revision: string | null; p_id: string | null; p_metal: unknown; p_parts: unknown; p_deleted_part_ids: readonly (string | number)[] }
  catalog_ring_save_v1: { p_request_id: string; p_expected_revision: string; p_categories: unknown; p_sizes: unknown; p_deleted_category_ids: readonly string[]; p_deleted_size_ids: readonly string[] }
  catalog_ring_snapshot_v1: Record<string, never>
  catalog_save_master_v1: { p_request_id: string; p_expected_revision: string | null; p_kind: 'gst_slab' | 'certificate' | 'material_value' | 'ring_size' | 'stone_shape' | 'style' | 'content_rule'; p_id: string | null; p_item: unknown }
}
export type CatalogCommand = keyof CatalogArguments

type Snapshot<T> = { item: T | null; revision: string }
export type CatalogResults = { [K in CatalogCommand]: K extends `${string}_delete_${string}` ? { ok: true; id: string; usage?: unknown }
  : K extends `catalog_ring_${string}` ? CatalogRingSnapshot
  : K extends `catalog_metal_${string}` ? K extends `${string}_list_${string}` ? CatalogMetalRow[] : Snapshot<CatalogMetalRow>
  : K extends `catalog_hierarchy_${string}` ? K extends `${string}_list_${string}` ? CatalogHierarchyRow[] : Snapshot<CatalogHierarchyRow>
  : K extends `${string}_list_${string}` ? CatalogMasterRow[] : Snapshot<CatalogMasterRow> }

export type CatalogSeoKind = 'category' | 'subcategory' | 'option'
export type CatalogSeoWrite = {
  seo_title: string | null; seo_description: string | null; seo_h1: string | null
  seo_intro_html: string | null; seo_body_html: string | null; seo_guide_path: string | null; seo_indexable: boolean | null
}
const catalogSeoTables: Record<CatalogSeoKind, string> = { category: 'catalog_categories', subcategory: 'catalog_subcategories', option: 'catalog_options' }

export function createCatalogRepository(db: DbExecutor, actor?: AdminActor) {
  async function execute<K extends CatalogCommand>(name: K, input: CatalogArguments[K]): Promise<CatalogResults[K]> {
    const routine = catalogRoutines[name]
    if (!routine) throw new Error('Unsupported command')
    const supplied = input as Record<string, unknown>
    const values = routine.args.map((key, index) => {
      const value = key === 'p_actor_id' ? actor?.profileId : supplied[key]
      if (value === undefined) throw new Error('Missing trusted actor or routine argument')
      return routine.types[index] === 'jsonb' ? JSON.stringify(value) : value
    })
    let sql: string = routine.sql
    if (name === 'catalog_metal_list_v1') sql = `WITH snapshot AS MATERIALIZED (${routine.sql}) SELECT coalesce((SELECT jsonb_agg(jsonb_set(m.value,'{composition_parts}',coalesce((SELECT jsonb_agg(p.value || jsonb_build_object('id',p.value->>'id') ORDER BY p.ordinality) FROM jsonb_array_elements(m.value->'composition_parts') WITH ORDINALITY p),'[]'::jsonb)) ORDER BY m.ordinality) FROM jsonb_array_elements(snapshot.result) WITH ORDINALITY m),'[]'::jsonb) AS result FROM snapshot`
    if (name === 'catalog_metal_row_v1' || name === 'catalog_metal_save_v1') sql = `WITH snapshot AS MATERIALIZED (${routine.sql}) SELECT CASE WHEN result->'item' = 'null'::jsonb THEN result ELSE jsonb_set(result,'{item,composition_parts}',coalesce((SELECT jsonb_agg(p.value || jsonb_build_object('id',p.value->>'id') ORDER BY p.ordinality) FROM jsonb_array_elements(result#>'{item,composition_parts}') WITH ORDINALITY p),'[]'::jsonb)) END AS result FROM snapshot`
    const { rows } = await db.query<{ result: unknown }>(sql, values)
    if (rows.length !== 1 || rows[0].result === null || typeof rows[0].result !== 'object') throw new Error('Invalid database result')
    const result = rows[0].result
    if (name.includes('_list_')) { if (!Array.isArray(result)) throw new Error('Invalid list result') }
    else if (Array.isArray(result)) throw new Error('Invalid snapshot result')
    if (!name.includes('_list_')) {
      const record = result as Record<string, unknown>
      if (name.includes('_delete_')) {
        if (record.ok !== true || typeof record.id !== 'string') throw new Error('Invalid deletion result')
      } else {
        if (typeof record.revision !== 'string' || !/^[a-f0-9]{32}$/.test(record.revision)) throw new Error('Invalid catalog revision')
        if (name.startsWith('catalog_ring_')) {
          if (!Array.isArray(record.categories) || !Array.isArray(record.sizes)) throw new Error('Invalid ring snapshot')
        } else if (!('item' in record) || (record.item !== null && (typeof record.item !== 'object' || Array.isArray(record.item)))) throw new Error('Invalid catalog item')
      }
    }
    return result as CatalogResults[K]
  }
  return { execute, async saveSeo(kind: CatalogSeoKind, id: string, seo: CatalogSeoWrite): Promise<void> {
    // Table names come from this fixed map, never from the request. null = keep the stored value, '' = clear it.
    const table = catalogSeoTables[kind]
    if (!table) throw new Error('Unsupported catalog kind')
    await db.query(
      `UPDATE public.${table}
          SET seo_title = CASE WHEN $1::text IS NULL THEN seo_title ELSE NULLIF($1::text, '') END,
              seo_description = CASE WHEN $2::text IS NULL THEN seo_description ELSE NULLIF($2::text, '') END,
              seo_h1 = CASE WHEN $3::text IS NULL THEN seo_h1 ELSE NULLIF($3::text, '') END,
              seo_intro_html = CASE WHEN $4::text IS NULL THEN seo_intro_html ELSE NULLIF($4::text, '') END,
              seo_body_html = CASE WHEN $5::text IS NULL THEN seo_body_html ELSE NULLIF($5::text, '') END,
              seo_guide_path = CASE WHEN $6::text IS NULL THEN seo_guide_path ELSE NULLIF($6::text, '') END,
              seo_indexable = COALESCE($7::boolean, seo_indexable)
        WHERE id = $8::uuid`,
      [seo.seo_title, seo.seo_description, seo.seo_h1, seo.seo_intro_html, seo.seo_body_html, seo.seo_guide_path, seo.seo_indexable, id],
    )
  }, async navbarItems(): Promise<CatalogNavbarItem[]> {
    const { rows } = await db.query<{ result: CatalogNavbarItem[] }>("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY display_order),'[]'::jsonb) AS result FROM public.navbar_items r")
    if (rows.length !== 1 || !Array.isArray(rows[0].result)) throw new Error('Invalid navbar references')
    return rows[0].result
  } }
}
