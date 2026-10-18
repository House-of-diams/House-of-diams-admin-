// In-memory PostgreSQL only. Never loads env files or contacts Supabase.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const actor = '00000000-0000-4000-8000-000000000007'
const list = async (kind) => (await db.query('select public.catalog_hierarchy_list_v1($1) result', [kind])).rows[0].result
const save = async (kind, item, existing = null, requestId = randomUUID()) => {
  const { id: _id, _revision: _rowRevision, ...payload } = item
  return (await db.query(
    'select public.catalog_hierarchy_save_v1($1,$2,$3,$4,$5,$6) result',
    [actor, requestId, existing?._revision ?? null, kind, existing?.id ?? null, JSON.stringify(payload)],
  )).rows[0].result
}
const remove = async (kind, item, requestId = randomUUID()) => (await db.query(
  'select public.catalog_hierarchy_delete_v1($1,$2,$3,$4,$5) result',
  [actor, requestId, item._revision, kind, item.id],
)).rows[0].result

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create type catalog_nav_type as enum('mega_menu','direct_link');
    create type catalog_status as enum('active','hidden');
    create type catalog_sub_type as enum('standard','auto_shape','manual_style','auto_metal','gender_split');
    create table profiles(id uuid primary key,role text not null); insert into profiles values('${actor}','admin');
    create table cms_save_receipts(actor_id uuid not null,request_id uuid not null,operation text not null,payload_hash text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor_id,request_id));
    create table catalog_categories(id uuid primary key default gen_random_uuid(),code text not null unique,name text not null,slug text not null unique,nav_type catalog_nav_type,direct_link_url text,display_order int not null default 0,status catalog_status not null default 'active',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),show_in_nav boolean not null default true,is_system_locked boolean not null default false,category_lane text,banner_desktop_image_path text,banner_mobile_image_path text,banner_title text,banner_subtitle text,banner_cta_label text,banner_cta_link text,banner_enabled boolean not null default false,banner_desktop_image_alt text,banner_mobile_image_alt text);
    create table catalog_subcategories(id uuid primary key default gen_random_uuid(),category_id uuid not null references catalog_categories,name text not null,slug text not null,sub_type catalog_sub_type not null default 'standard',display_order int not null default 0,status catalog_status not null default 'active',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),icon_svg_path text,image_path text,image_alt text,unique(category_id,slug));
    create table catalog_options(id uuid primary key default gen_random_uuid(),subcategory_id uuid not null references catalog_subcategories,name text not null,slug text not null,display_order int not null default 0,status catalog_status not null default 'active',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),icon_svg_path text,image_path text,image_alt text,unique(subcategory_id,slug));
    create table products(id uuid primary key default gen_random_uuid(),main_category_id uuid,subcategory_id uuid,option_id uuid);
    create table blog_posts(id uuid primary key default gen_random_uuid(),catalog_category_id uuid);
    create table support_faq_items(id uuid primary key default gen_random_uuid(),catalog_category_id uuid);
    create table category_grid_posters(id uuid primary key default gen_random_uuid(),category_id uuid);
    create table homepage_shop_by_category_items(id uuid primary key default gen_random_uuid(),category_id uuid,subcategory_id uuid,option_id uuid);
    create table navbar_sections(id uuid primary key default gen_random_uuid(),linked_category_id uuid,source_subcategory_id uuid);
    create table navbar_items(id uuid primary key default gen_random_uuid(),linked_category_id uuid);
    create table product_subcategory_links(id uuid primary key default gen_random_uuid(),subcategory_id uuid);
    create table product_option_links(id uuid primary key default gen_random_uuid(),option_id uuid);
    create table product_style_selections(id uuid primary key default gen_random_uuid(),option_id uuid);
  `)
  const migration = await readFile(new URL('../sql/202609250012_catalog_group5c_hierarchy_atomic_crud.sql', import.meta.url), 'utf8')
  await db.exec(migration); await db.exec(migration)
})
beforeEach(async () => db.exec('truncate catalog_options,catalog_subcategories,catalog_categories,products,blog_posts,support_faq_items,category_grid_posters,homepage_shop_by_category_items,navbar_sections,navbar_items,product_subcategory_links,product_option_links,product_style_selections,cms_save_receipts cascade'))
after(async () => db.close())

const categoryInput = (overrides = {}) => ({ code: 'FINE_JEWELLERY', name: 'Fine Jewellery', slug: 'fine-jewellery', show_in_nav: true, nav_type: 'direct_link', direct_link_url: '', display_order: 1, status: 'active', ...overrides })

test('creates and updates every hierarchy level without changing IDs', async () => {
  let category = (await save('category', categoryInput())).item
  assert.equal(category.direct_link_url, '/fine-jewellery')
  const categoryId = category.id
  category = (await save('category', categoryInput({ name: 'Fine Jewelry' }), category)).item
  assert.equal(category.id, categoryId)
  let subcategory = (await save('subcategory', { category_id: category.id, name: 'Rings', slug: 'rings', sub_type: 'auto_shape', icon_svg_path: '/ring.svg', image_path: null, image_alt: 'Ring', display_order: 1, status: 'active' })).item
  const subcategoryId = subcategory.id
  subcategory = (await save('subcategory', { ...subcategory, name: 'Diamond Rings' }, subcategory)).item
  assert.equal(subcategory.id, subcategoryId); assert.equal(subcategory.sub_type, 'auto_shape')
  let option = (await save('option', { subcategory_id: subcategory.id, name: 'Round', slug: 'round', icon_svg_path: null, image_path: '/round.webp', image_alt: 'Round', display_order: 1, status: 'active' })).item
  const optionId = option.id
  option = (await save('option', { ...option, name: 'Round Cut' }, option)).item
  assert.equal(option.id, optionId)
  assert.equal((await list('category')).length, 1); assert.equal((await list('subcategory')).length, 1); assert.equal((await list('option')).length, 1)
})

test('save retries are idempotent and stale writes are rejected', async () => {
  const requestId = randomUUID(); const input = categoryInput()
  const first = await save('category', input, null, requestId)
  assert.deepEqual(await save('category', input, null, requestId), first)
  await assert.rejects(save('category', categoryInput({ name: 'Stale' }), { ...first.item, _revision: '00000000000000000000000000000000' }), /changed since/)
})

test('system categories only allow banner edits and cannot be deleted', async () => {
  let category = (await save('category', categoryInput())).item
  await db.query('update catalog_categories set is_system_locked=true where id=$1', [category.id])
  category = (await list('category'))[0]
  await assert.rejects(save('category', categoryInput({ name: 'Changed' }), category), /only allows banner changes/)
  const banner = (await save('category', { ...categoryInput(), banner_enabled: true, banner_title: 'Hero' }, category)).item
  assert.equal(banner.banner_title, 'Hero')
  await assert.rejects(remove('category', banner), /cannot be deleted/)
})

test('referenced children cannot be moved and dependency-aware deletion is blocked', async () => {
  const category = (await save('category', categoryInput())).item
  const other = (await save('category', categoryInput({ code: 'OTHER', name: 'Other', slug: 'other', nav_type: 'mega_menu' }))).item
  const subcategory = (await save('subcategory', { category_id: category.id, name: 'Rings', slug: 'rings', sub_type: 'standard', display_order: 1, status: 'active' })).item
  const option = (await save('option', { subcategory_id: subcategory.id, name: 'Round', slug: 'round', display_order: 1, status: 'active' })).item
  await db.query('insert into products(main_category_id,subcategory_id,option_id) values($1,$2,$3)', [category.id, subcategory.id, option.id])
  await assert.rejects(save('subcategory', { ...subcategory, category_id: other.id }, subcategory), /cannot be moved/)
  await assert.rejects(remove('option', option), /used in/)
  await assert.rejects(remove('subcategory', subcategory), /used in/)
  await assert.rejects(remove('category', category), /used in/)
})

test('unreferenced deletes work, late failures roll back, and public roles are denied', async () => {
  let category = (await save('category', categoryInput())).item
  let subcategory = (await save('subcategory', { category_id: category.id, name: 'Rings', slug: 'rings', sub_type: 'standard', display_order: 1, status: 'active' })).item
  let option = (await save('option', { subcategory_id: subcategory.id, name: 'Round', slug: 'round', display_order: 1, status: 'active' })).item
  await remove('option', option); subcategory = (await list('subcategory'))[0]; await remove('subcategory', subcategory); category = (await list('category'))[0]; await remove('category', category)
  assert.equal((await list('category')).length, 0)
  await db.exec("alter table catalog_categories add constraint reject_failure check(name <> 'FAIL')")
  try { await assert.rejects(save('category', categoryInput({ name: 'FAIL' }))); assert.equal((await list('category')).length, 0) } finally { await db.exec('alter table catalog_categories drop constraint reject_failure') }
  await db.exec('set role anon'); await assert.rejects(list('category'), /permission denied/); await db.exec('reset role')
})
