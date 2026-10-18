// In-memory PostgreSQL only. Never loads env files or contacts Supabase.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const actor = '00000000-0000-4000-8000-000000000006'
const snapshot = async () => (await db.query('select public.catalog_ring_snapshot_v1() result')).rows[0].result
const save = async (before, categories, sizes, deletedCategories = [], deletedSizes = [], requestId = randomUUID()) =>
  (await db.query('select public.catalog_ring_save_v1($1,$2,$3,$4,$5,$6,$7) result', [actor, requestId, before.revision, JSON.stringify(categories), JSON.stringify(sizes), deletedCategories, deletedSizes])).rows[0].result

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table profiles(id uuid primary key, role text not null); insert into profiles values('${actor}','admin');
    create table cms_save_receipts(actor_id uuid not null,request_id uuid not null,operation text not null,payload_hash text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor_id,request_id));
    create table catalog_ring_categories(id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique,description text,display_order int not null default 0,status text not null default 'active',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
    create table catalog_ring_category_sizes(id uuid primary key default gen_random_uuid(),ring_category_id uuid not null references catalog_ring_categories,size_label text not null,size_value text,display_order int not null default 0,status text not null default 'active',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
    create table products(id uuid primary key default gen_random_uuid(),ring_category_id uuid references catalog_ring_categories);
  `)
  const migration = await readFile(new URL('../sql/202609250011_catalog_group5b_ring_atomic_save.sql', import.meta.url), 'utf8')
  await db.exec(migration); await db.exec(migration)
})
beforeEach(async () => db.exec('truncate catalog_ring_category_sizes,catalog_ring_categories,products,cms_save_receipts cascade'))
after(async () => db.close())

test('mixed category and size saves preserve every existing ID', async () => {
  let state = await snapshot()
  state = await save(state, [{ name: 'Wedding', slug: 'wedding', description: null, display_order: 1, status: 'active' }], [])
  const categoryId = state.categories[0].id
  state = await save(state, [{ ...state.categories[0], description: 'Updated' }], [{ ring_category_id: categoryId, size_label: 'US 6', size_value: '6', display_order: 1, status: 'active' }])
  const sizeId = state.sizes[0].id
  state = await save(state, [{ ...state.categories[0], description: 'Changed again' }], [{ ...state.sizes[0], size_value: '6.0' }])
  assert.equal(state.categories[0].id, categoryId); assert.equal(state.sizes[0].id, sizeId); assert.equal(state.sizes[0].size_value, '6.0')
})

test('retries of one ring save return the same canonical result', async () => {
  const before = await snapshot()
  const requestId = randomUUID()
  const categories = [{ name: 'Solitaire', slug: 'solitaire', description: null, display_order: 1, status: 'active' }]
  const first = await save(before, categories, [], [], [], requestId)
  const retry = await save(before, categories, [], [], [], requestId)
  assert.deepEqual(retry, first)
})

test('implicit deletion, stale revisions, duplicate labels, and foreign categories are rejected', async () => {
  let state = await snapshot()
  state = await save(state, [{ name: 'Wedding', slug: 'wedding', description: null, display_order: 1, status: 'active' }], [])
  const category = state.categories[0]
  state = await save(state, [category], [{ ring_category_id: category.id, size_label: 'US 6', size_value: null, display_order: 1, status: 'active' }])
  await assert.rejects(save(state, [], state.sizes), /categories may only be removed explicitly/)
  await assert.rejects(save({ ...state, revision: '00000000000000000000000000000000' }, state.categories, state.sizes), /changed since/)
  await assert.rejects(save(state, state.categories, [{ ...state.sizes[0], size_label: 'US 6' }, { ...state.sizes[0], id: undefined }]), /already exists/)
  await assert.rejects(save(state, state.categories, [{ ...state.sizes[0], ring_category_id: randomUUID() }]), /existing category/)
})

test('category deletion requires explicit children and blocks product references', async () => {
  let state = await snapshot()
  state = await save(state, [{ name: 'Wedding', slug: 'wedding', description: null, display_order: 1, status: 'active' }], [])
  const category = state.categories[0]
  state = await save(state, [category], [{ ring_category_id: category.id, size_label: 'US 6', size_value: null, display_order: 1, status: 'active' }])
  const size = state.sizes[0]
  await assert.rejects(save(state, [], [], [category.id], []), /sizes may only be removed explicitly/)
  state = await save(state, [], [], [category.id], [size.id])
  assert.equal(state.categories.length, 0); assert.equal(state.sizes.length, 0)
  state = await save(state, [{ name: 'Halo', slug: 'halo', description: null, display_order: 1, status: 'active' }], [])
  await db.query('insert into products(ring_category_id) values($1)', [state.categories[0].id])
  await assert.rejects(save(state, [], [], [state.categories[0].id], []), /used by products/)
})

test('late failures roll back the complete parent-child save and public roles are denied', async () => {
  let state = await snapshot(); state = await save(state, [{ name: 'Wedding', slug: 'wedding', description: null, display_order: 1, status: 'active' }], [])
  await db.exec("alter table catalog_ring_category_sizes add constraint reject_failure check(size_label <> 'FAIL')")
  try {
    await assert.rejects(save(state, [{ ...state.categories[0], description: 'Should roll back' }], [{ ring_category_id: state.categories[0].id, size_label: 'FAIL', size_value: null, display_order: 1, status: 'active' }]))
    assert.deepEqual(await snapshot(), state)
  } finally { await db.exec('alter table catalog_ring_category_sizes drop constraint reject_failure') }
  await db.exec('set role anon'); await assert.rejects(snapshot(), /permission denied/); await db.exec('reset role')
})
