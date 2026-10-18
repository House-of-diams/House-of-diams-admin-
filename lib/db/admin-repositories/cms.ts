import 'server-only'
import { assertSafeCmsIds, parseCmsJson } from '../../cms-id-safety'
import { createCmsReferenceRepository } from './cms-references'
import type { DbExecutor } from '../query'
import type { AdminActor } from '../../auth/admin-identity-core'
import type { CmsSingletonKind } from '../../cms-singleton-schemas'
import type { CmsContentListKind } from '../../cms-content-list-save'
import type { HomeGroup1Kind } from '../../cms-home-group1-save'
import type { CmsRelationalKind } from '../../cms-relational-save'
import { enforceVideoSave, videoReferenceSlots } from '../../video-save-admission'

export type CmsRecord = Record<string, unknown>
export type CmsSnapshot = CmsRecord & { revision: string }
export const cmsRoutines = {
  bespoke_form_save_v1: {"sql": "SELECT public.bespoke_form_save_v1($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::jsonb,$6::jsonb) AS result", "args": ["p_actor_id", "p_request_id", "p_expected_revision", "p_settings", "p_lists", "p_deleted_ids"], "types": ["uuid", "uuid", "text", "jsonb", "jsonb", "jsonb"]},
  bespoke_form_snapshot_v1: {"sql": "SELECT public.bespoke_form_snapshot_v1() AS result", "args": [], "types": []},
  bespoke_hero_save_v1: {"sql": "SELECT public.bespoke_hero_save_v1($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::jsonb,$6::uuid[]) AS result", "args": ["p_actor_id", "p_request_id", "p_expected_revision", "p_item", "p_items", "p_deleted_ids"], "types": ["uuid", "uuid", "text", "jsonb", "jsonb", "uuid[]"]},
  bespoke_hero_snapshot_v1: {"sql": "SELECT public.bespoke_hero_snapshot_v1() AS result", "args": [], "types": []},
  cms_article_snapshot_v1: {"sql": "SELECT public.cms_article_snapshot_v1($1::text,$2::bigint) AS result", "args": ["p_kind", "p_post_id"], "types": ["text", "bigint"]},
  cms_content_list_snapshot_v1: {"sql": "SELECT public.cms_content_list_snapshot_v1($1::text) AS result", "args": ["p_kind"], "types": ["text"]},
  cms_delete_article_v1: {"sql": "SELECT public.cms_delete_article_v1($1::uuid,$2::uuid,$3::text,$4::bigint,$5::text) AS result", "args": ["p_actor_id", "p_request_id", "p_kind", "p_post_id", "p_expected_revision"], "types": ["uuid", "uuid", "text", "bigint", "text"]},
  cms_delete_support_faq_category_v1: {"sql": "SELECT public.cms_delete_support_faq_category_v1($1::uuid,$2::uuid,$3::text,$4::bigint) AS result", "args": ["p_actor_id", "p_request_id", "p_expected_revision", "p_id"], "types": ["uuid", "uuid", "text", "bigint"]},
  cms_docs_snapshot_v1: {"sql": "SELECT public.cms_docs_snapshot_v1($1::text) AS result", "args": ["p_slug"], "types": ["text"]},
  cms_home_group1_snapshot_v1: {"sql": "SELECT public.cms_home_group1_snapshot_v1($1::text) AS result", "args": ["p_kind"], "types": ["text"]},
  cms_reels_snapshot_v1: {"sql": "SELECT public.cms_reels_snapshot_v1() AS result", "args": [], "types": []},
  cms_relational_snapshot_v1: {"sql": "SELECT public.cms_relational_snapshot_v1($1::text) AS result", "args": ["p_kind"], "types": ["text"]},
  cms_save_article_v1: {"sql": "SELECT public.cms_save_article_v1($1::uuid,$2::uuid,$3::text,$4::bigint,$5::text,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::text[],$11::text[],$12::text[]) AS result", "args": ["p_actor_id", "p_request_id", "p_kind", "p_post_id", "p_expected_revision", "p_post", "p_tags", "p_products", "p_blocks", "p_deleted_tag_ids", "p_deleted_product_ids", "p_deleted_block_ids"], "types": ["uuid", "uuid", "text", "bigint", "text", "jsonb", "jsonb", "jsonb", "jsonb", "text[]", "text[]", "text[]"]},
  cms_save_content_list_v1: {"sql": "SELECT public.cms_save_content_list_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb,$6::text[]) AS result", "args": ["p_actor_id", "p_request_id", "p_expected_revision", "p_kind", "p_items", "p_deleted_ids"], "types": ["uuid", "uuid", "text", "text", "jsonb", "text[]"]},
  cms_save_docs_page_v1: {"sql": "SELECT public.cms_save_docs_page_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb,$6::jsonb,$7::text[]) AS result", "args": ["p_actor_id", "p_request_id", "p_slug", "p_expected_revision", "p_page", "p_blocks", "p_deleted_block_ids"], "types": ["uuid", "uuid", "text", "text", "jsonb", "jsonb", "text[]"]},
  cms_save_home_group1_v1: {"sql": "SELECT public.cms_save_home_group1_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb,$6::jsonb,$7::text[]) AS result", "args": ["p_actor_id", "p_request_id", "p_expected_revision", "p_kind", "p_section", "p_items", "p_deleted_ids"], "types": ["uuid", "uuid", "text", "text", "jsonb", "jsonb", "text[]"]},
  cms_save_reels_v1: {"sql": "SELECT public.cms_save_reels_v1($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::jsonb,$6::uuid[]) AS result", "args": ["p_actor_id", "p_request_id", "p_expected_revision", "p_section", "p_items", "p_deleted_ids"], "types": ["uuid", "uuid", "text", "jsonb", "jsonb", "uuid[]"]},
  cms_save_relational_v1: {"sql": "SELECT public.cms_save_relational_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb,$6::jsonb,$7::text[]) AS result", "args": ["p_actor_id", "p_request_id", "p_expected_revision", "p_kind", "p_parent", "p_items", "p_deleted_ids"], "types": ["uuid", "uuid", "text", "text", "jsonb", "jsonb", "text[]"]},
  cms_save_singleton_v1: {"sql": "SELECT public.cms_save_singleton_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb) AS result", "args": ["p_actor_id", "p_request_id", "p_expected_revision", "p_kind", "p_item"], "types": ["uuid", "uuid", "text", "text", "jsonb"]},
  cms_save_support_faq_category_v1: {"sql": "SELECT public.cms_save_support_faq_category_v1($1::uuid,$2::uuid,$3::text,$4::bigint,$5::jsonb) AS result", "args": ["p_actor_id", "p_request_id", "p_expected_revision", "p_id", "p_item"], "types": ["uuid", "uuid", "text", "bigint", "jsonb"]},
  cms_singleton_snapshot_v1: {"sql": "SELECT public.cms_singleton_snapshot_v1($1::text) AS result", "args": ["p_kind"], "types": ["text"]},
  cms_support_faq_categories_v1: {"sql": "SELECT public.cms_support_faq_categories_v1() AS result", "args": [], "types": []},
} as const
export type CmsArguments = {
  bespoke_form_save_v1: { p_request_id: string; p_expected_revision: string | null; p_settings: unknown; p_lists: unknown; p_deleted_ids: unknown }
  bespoke_form_snapshot_v1: Record<string, never>
  bespoke_hero_save_v1: { p_request_id: string; p_expected_revision: string | null; p_item: unknown; p_items: unknown; p_deleted_ids: readonly string[] }
  bespoke_hero_snapshot_v1: Record<string, never>
  cms_article_snapshot_v1: { p_kind: 'blog' | 'education'; p_post_id: string | number }
  cms_content_list_snapshot_v1: { p_kind: CmsContentListKind }
  cms_delete_article_v1: { p_request_id: string; p_kind: 'blog' | 'education'; p_post_id: string | number; p_expected_revision: string }
  cms_delete_support_faq_category_v1: { p_request_id: string; p_expected_revision: string; p_id: string | number }
  cms_docs_snapshot_v1: { p_slug: string }
  cms_home_group1_snapshot_v1: { p_kind: HomeGroup1Kind }
  cms_reels_snapshot_v1: Record<string, never>
  cms_relational_snapshot_v1: { p_kind: CmsRelationalKind }
  cms_save_article_v1: { p_request_id: string; p_kind: 'blog' | 'education'; p_post_id: string | number | null; p_expected_revision: string | null; p_post: unknown; p_tags: unknown; p_products: unknown; p_blocks: unknown; p_deleted_tag_ids: readonly string[]; p_deleted_product_ids: readonly string[]; p_deleted_block_ids: readonly string[] }
  cms_save_content_list_v1: { p_request_id: string; p_expected_revision: string | null; p_kind: CmsContentListKind; p_items: unknown; p_deleted_ids: readonly string[] }
  cms_save_docs_page_v1: { p_request_id: string; p_slug: string; p_expected_revision: string | null; p_page: unknown; p_blocks: unknown; p_deleted_block_ids: readonly string[] }
  cms_save_home_group1_v1: { p_request_id: string; p_expected_revision: string | null; p_kind: HomeGroup1Kind; p_section: unknown; p_items: unknown; p_deleted_ids: readonly string[] }
  cms_save_reels_v1: { p_request_id: string; p_expected_revision: string | null; p_section: unknown; p_items: unknown; p_deleted_ids: readonly string[] }
  cms_save_relational_v1: { p_request_id: string; p_expected_revision: string | null; p_kind: CmsRelationalKind; p_parent: unknown; p_items: unknown; p_deleted_ids: readonly string[] }
  cms_save_singleton_v1: { p_request_id: string; p_expected_revision: string | null; p_kind: CmsSingletonKind; p_item: unknown }
  cms_save_support_faq_category_v1: { p_request_id: string; p_expected_revision: string | null; p_id: string | number | null; p_item: unknown }
  cms_singleton_snapshot_v1: { p_kind: CmsSingletonKind }
  cms_support_faq_categories_v1: Record<string, never>
}
export type CmsCommand = keyof CmsArguments

export type CmsResults = {
  cms_support_faq_categories_v1: Array<CmsRecord & {_revision:string}>
  cms_save_support_faq_category_v1: {category:CmsRecord & {_revision:string}}
  cms_delete_support_faq_category_v1: {ok:true;id:string|number}
  cms_delete_article_v1: {ok:true;deleted_id:string|number}
  cms_singleton_snapshot_v1: CmsSnapshot & {item:CmsRecord|null}
  cms_save_singleton_v1: CmsSnapshot & {item:CmsRecord|null}
  cms_content_list_snapshot_v1: CmsSnapshot & {items:CmsRecord[]}
  cms_save_content_list_v1: CmsSnapshot & {items:CmsRecord[]}
  cms_home_group1_snapshot_v1: CmsSnapshot & {section:CmsRecord|null;items:CmsRecord[]}
  cms_save_home_group1_v1: CmsSnapshot & {section:CmsRecord|null;items:CmsRecord[]}
  cms_relational_snapshot_v1: CmsSnapshot & {parent:CmsRecord|null;items:CmsRecord[]}
  cms_save_relational_v1: CmsSnapshot & {parent:CmsRecord|null;items:CmsRecord[]}
  cms_article_snapshot_v1: import('../../cms-article-save').ArticleSnapshot
  cms_save_article_v1: import('../../cms-article-save').ArticleSnapshot
  cms_docs_snapshot_v1: CmsSnapshot & {page:CmsRecord;blocks:CmsRecord[]}
  cms_save_docs_page_v1: CmsSnapshot & {page:CmsRecord;blocks:CmsRecord[]}
  cms_reels_snapshot_v1: CmsSnapshot & {section:CmsRecord|null;items:CmsRecord[]}
  cms_save_reels_v1: CmsSnapshot & {section:CmsRecord|null;items:CmsRecord[]}
  bespoke_hero_snapshot_v1: import('../../bespoke-hero-save').BespokeHeroSnapshot
  bespoke_hero_save_v1: import('../../bespoke-hero-save').BespokeHeroSnapshot
  bespoke_form_snapshot_v1: import('../../bespoke-form-save').BespokeFormSnapshot
  bespoke_form_save_v1: import('../../bespoke-form-save').BespokeFormSnapshot
}

const kinds = {
  singleton: ['about_hero','about_wide_banner','blog_hero','education_hero','contact_hero','bespoke_showcase','collection_page','hiphop_showcase'],
  content_list: ['about_values','about_timeline','about_founders','contact_info','bespoke_process','bespoke_manufacturing'],
  home_group1: ['hero','collection','certifications','discover_shapes','bestsellers','shop_by_category'],
  relational: ['checkout_result','promotion','service_banner','summary','announcement','faq'],
  article: ['blog','education'],
} as const
/** Explicit wire/snapshot correspondence. Unmapped arguments remain scanned at
 * their original paths, so adding an argument cannot silently bypass admission. */
export function cmsVideoProjection(name: CmsCommand, supplied: Record<string, unknown>, previous: unknown) {
  const mappings: Partial<Record<CmsCommand, Record<string, string>>> = {
    cms_save_singleton_v1: { p_item: 'item' },
    cms_save_content_list_v1: { p_items: 'items' },
    cms_save_home_group1_v1: { p_section: 'section', p_items: 'items' },
    cms_save_relational_v1: { p_parent: 'parent', p_items: 'items' },
    cms_save_reels_v1: { p_section: 'section', p_items: 'items' },
    cms_save_article_v1: { p_post: 'post', p_tags: 'tags', p_products: 'products', p_blocks: 'content_blocks' },
    cms_save_docs_page_v1: { p_page: 'page', p_blocks: 'blocks' },
    bespoke_hero_save_v1: { p_item: 'item', p_items: 'items' },
    bespoke_form_save_v1: { p_settings: 'settings' },
    cms_save_support_faq_category_v1: { p_item: 'item' },
  }
  const mapping = mappings[name]
  if (!mapping) throw new Error('Unsupported video projection')
  const next = Object.fromEntries(Object.entries(supplied).map(([key, value]) => [mapping[key] ?? key, value]))
  if (name === 'bespoke_form_save_v1') {
    const lists = supplied.p_lists
    if (!lists || typeof lists !== 'object' || Array.isArray(lists)) throw new Error('Invalid form lists')
    delete next.p_lists
    for (const [key, value] of Object.entries(lists)) {
      if (['guarantees','pieceTypes','stoneOptions','caratOptions','metalOptions'].includes(key)) next[key] = value
      else next['p_lists/' + key] = value
    }
  }
  if (name === 'cms_save_support_faq_category_v1') {
    if (!Array.isArray(previous)) throw new Error('Invalid FAQ categories')
    const matches = previous.filter(row => String(row.id) === String(supplied.p_id))
    if (matches.length > 1) throw new Error('Ambiguous FAQ category')
    previous = { item: matches[0] ?? null }
  }
  if (name === 'cms_save_relational_v1' && supplied.p_kind === 'faq') {
    const qualify = (items: unknown) => Array.isArray(items) ? items.map(item => ({ ...item,
      id: JSON.stringify([item.id ?? null, item.category_id ?? null, item.catalog_category_id ?? null]) })) : items
    next.items = qualify(next.items)
    if (previous && typeof previous === 'object' && !Array.isArray(previous)) {
      const record = previous as Record<string, unknown>
      previous = { ...record, items: qualify(record.items) }
    }
  }
  return { next, previous }
}
export function createCmsRepository(db: DbExecutor, actor?: AdminActor) {
  async function execute<K extends CmsCommand>(name: K, input: CmsArguments[K]): Promise<CmsResults[K]> {
    const routine = cmsRoutines[name]
    if (!routine) throw new Error('Unsupported CMS command')
    const supplied = input as Record<string, unknown>
    if ('p_kind' in supplied) {
      const group = Object.keys(kinds).find(key => name.includes(key)) as keyof typeof kinds | undefined
      if (!group || !(kinds[group] as readonly unknown[]).includes(supplied.p_kind)) throw new Error('Unsupported CMS kind')
    }
    assertSafeCmsIds(input)
    if (name.includes('save') && videoReferenceSlots(input).size) {
      const snapshots: Record<string, string> = {
        cms_save_singleton_v1: 'cms_singleton_snapshot_v1', cms_save_content_list_v1: 'cms_content_list_snapshot_v1',
        cms_save_home_group1_v1: 'cms_home_group1_snapshot_v1', cms_save_relational_v1: 'cms_relational_snapshot_v1',
        cms_save_reels_v1: 'cms_reels_snapshot_v1', cms_save_article_v1: 'cms_article_snapshot_v1',
        cms_save_docs_page_v1: 'cms_docs_snapshot_v1', bespoke_hero_save_v1: 'bespoke_hero_snapshot_v1', bespoke_form_save_v1: 'bespoke_form_snapshot_v1',
        cms_save_support_faq_category_v1: 'cms_support_faq_categories_v1',
      }
      const snapshot = snapshots[name] as CmsCommand | undefined
      if (!snapshot) throw new Error('Unsupported video save')
      const spec = cmsRoutines[snapshot]
      const params = Object.fromEntries(spec.args.map(key => [key, supplied[key]]))
      const previous = await execute(snapshot, params as CmsArguments[typeof snapshot])
      const projection = cmsVideoProjection(name, supplied, previous)
      await enforceVideoSave(db, projection.next, projection.previous)
    }
    const values = routine.args.map((key, index) => {
      const value = key === 'p_actor_id' ? actor?.profileId : supplied[key]
      if (value === undefined) throw new Error('Missing trusted actor or CMS argument')
      if (routine.types[index] === 'bigint' && value !== null && !(typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && BigInt(value) <= BigInt('9223372036854775807')) && !(typeof value === 'number' && Number.isSafeInteger(value) && value > 0)) throw new Error('Invalid CMS identifier')
      return routine.types[index] === 'jsonb' ? JSON.stringify(value) : value
    })
    const { rows } = await db.query<{ result: unknown }>(`WITH snapshot AS MATERIALIZED (${routine.sql}) SELECT result::text AS result FROM snapshot`, values)
    const result = parseCmsJson(rows[0]?.result)
    if (rows.length !== 1 || !result || typeof result !== 'object') throw new Error('Invalid CMS result')
    if (name === 'cms_support_faq_categories_v1') {
      if (!Array.isArray(result)) throw new Error('Invalid FAQ categories')
    } else {
      if (Array.isArray(result)) throw new Error('Invalid CMS snapshot')
      const record = result as CmsRecord
      if (name === 'cms_save_support_faq_category_v1') {
        const category = record.category as CmsRecord | undefined
        if (!category || typeof category._revision !== 'string' || !/^[a-f0-9]{32}$/.test(category._revision)) throw new Error('Invalid FAQ category')
      } else if (!name.includes('delete_') && (typeof record.revision !== 'string' || !/^[a-f0-9]{32}$/.test(record.revision))) throw new Error('Invalid CMS revision')
      if (name.includes('delete_') && record.ok !== true) throw new Error('Invalid CMS deletion')
    }
    if (!Array.isArray(result)) {
      const record = result as CmsRecord
      const arrays = name.includes('article') && !name.includes('delete') ? ['tags','products','content_blocks']
        : name.includes('docs') ? ['blocks'] : name.includes('form_') ? ['guarantees','pieceTypes','stoneOptions','caratOptions','metalOptions']
        : name.includes('content_list') || name.includes('home_group1') || name.includes('relational') || name.includes('reels') || name.includes('hero_') ? ['items'] : []
      if (arrays.some(key => !Array.isArray(record[key]))) throw new Error('Invalid CMS content arrays')
      const objectKey = name.includes('singleton') || name.includes('hero_') ? 'item' : name.includes('home_group1') || name.includes('reels') ? 'section'
        : name.includes('relational') ? 'parent' : name.includes('article') && !name.includes('delete') ? 'post' : name.includes('docs') ? 'page' : name.includes('form_') ? 'settings' : null
      if (objectKey && (!(objectKey in record) || record[objectKey] !== null && (typeof record[objectKey] !== 'object' || Array.isArray(record[objectKey])))) throw new Error('Invalid CMS content object')
    }
    assertSafeCmsIds(result)
    return result as CmsResults[K]
  }
  return { execute, references: createCmsReferenceRepository(db) }
}

