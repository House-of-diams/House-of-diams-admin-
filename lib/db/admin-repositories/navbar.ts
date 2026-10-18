import 'server-only'
import type { NavbarSnapshot } from '../../navbar-data'
import type { DbExecutor } from '../query'
import type { AdminActor } from '../../auth/admin-identity-core'

// Fixed deployed signatures from Phase A metadata; no request-selected SQL identifiers.
export const navbarRoutines = {
  navbar_item_save_v1: { sql: "SELECT public.navbar_item_save_v1($1::uuid,$2::uuid,$3::text,$4::uuid,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::uuid[],$11::uuid[],$12::bigint[],$13::uuid[]) AS result", args: ["p_actor_id", "p_request_id", "p_expected_revision", "p_item_id", "p_item", "p_sections", "p_links", "p_source_items", "p_featured_card", "p_deleted_section_ids", "p_deleted_link_ids", "p_deleted_source_item_ids", "p_deleted_featured_card_ids"], types: ["uuid", "uuid", "text", "uuid", "jsonb", "jsonb", "jsonb", "jsonb", "jsonb", "uuid[]", "uuid[]", "bigint[]", "uuid[]"] },
  navbar_item_snapshot_v1: { sql: "SELECT public.navbar_item_snapshot_v1($1::uuid) AS result", args: ["p_item_id"], types: ["uuid"] },
  navbar_save_v1: { sql: "SELECT public.navbar_save_v1($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::uuid[],$10::uuid[],$11::bigint[],$12::uuid[]) AS result", args: ["p_actor_id", "p_request_id", "p_expected_revision", "p_items", "p_sections", "p_links", "p_source_items", "p_featured_cards", "p_deleted_section_ids", "p_deleted_link_ids", "p_deleted_source_item_ids", "p_deleted_featured_card_ids"], types: ["uuid", "uuid", "text", "jsonb", "jsonb", "jsonb", "jsonb", "jsonb", "uuid[]", "uuid[]", "bigint[]", "uuid[]"] },
  navbar_snapshot_v1: { sql: "SELECT public.navbar_snapshot_v1() AS result", args: [], types: [] },
} as const

export type NavbarArguments = {
  navbar_item_save_v1: { p_request_id: string; p_expected_revision: string; p_item_id: string; p_item: unknown; p_sections: unknown; p_links: unknown; p_source_items: unknown; p_featured_card: unknown; p_deleted_section_ids: readonly string[]; p_deleted_link_ids: readonly string[]; p_deleted_source_item_ids: readonly (string | number)[]; p_deleted_featured_card_ids: readonly string[] }
  navbar_item_snapshot_v1: { p_item_id: string }
  navbar_save_v1: { p_request_id: string; p_expected_revision: string; p_items: unknown; p_sections: unknown; p_links: unknown; p_source_items: unknown; p_featured_cards: unknown; p_deleted_section_ids: readonly string[]; p_deleted_link_ids: readonly string[]; p_deleted_source_item_ids: readonly (string | number)[]; p_deleted_featured_card_ids: readonly string[] }
  navbar_snapshot_v1: Record<string, never>
}
export type NavbarCommand = keyof NavbarArguments

export type NavbarResults = { [K in NavbarCommand]: K extends 'navbar_item_save_v1' | 'navbar_item_snapshot_v1' ? { revision: string } : NavbarSnapshot }

export function createNavbarRepository(db: DbExecutor, actor?: AdminActor) {
  async function execute<K extends NavbarCommand>(name: K, input: NavbarArguments[K]): Promise<NavbarResults[K]> {
    const routine = navbarRoutines[name]
    if (!routine) throw new Error('Unsupported command')
    const supplied = input as Record<string, unknown>
    const values = routine.args.map((key, index) => {
      const value = key === 'p_actor_id' ? actor?.profileId : supplied[key]
      if (value === undefined) throw new Error('Missing trusted actor or routine argument')
      return routine.types[index] === 'jsonb' ? JSON.stringify(value) : value
    })
    let sql: string = routine.sql
    if (name === 'navbar_snapshot_v1') sql = `WITH snapshot AS MATERIALIZED (${routine.sql}) SELECT jsonb_set(result,'{source_items}',coalesce((SELECT jsonb_agg(x.value || jsonb_build_object('id',x.value->>'id') ORDER BY x.ordinality) FROM jsonb_array_elements(result->'source_items') WITH ORDINALITY x),'[]'::jsonb)) AS result FROM snapshot`
    const { rows } = await db.query<{ result: unknown }>(sql, values)
    if (rows.length !== 1 || rows[0].result === null || typeof rows[0].result !== 'object') throw new Error('Invalid database result')
    const result = rows[0].result
    if (name.includes('_list_')) { if (!Array.isArray(result)) throw new Error('Invalid list result') }
    else if (Array.isArray(result)) throw new Error('Invalid snapshot result')
    const record = result as Record<string, unknown>
    if (typeof record.revision !== 'string' || !/^[a-f0-9]{32}$/.test(record.revision)) throw new Error('Invalid navbar revision')
    if (name === 'navbar_snapshot_v1' || name === 'navbar_save_v1') {
      for (const key of ['items', 'sections', 'links', 'source_items', 'featured_cards']) if (!Array.isArray(record[key])) throw new Error('Invalid navbar snapshot')
    }
    return result as NavbarResults[K]
  }
  return { execute }
}
