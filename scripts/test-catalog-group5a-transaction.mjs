// In-memory PostgreSQL only. Never loads env files or contacts Supabase.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const actor = '00000000-0000-4000-8000-000000000005'

const row = async (kind, id) => (await db.query('select public.catalog_master_row_v1($1,$2) result', [kind, id])).rows[0].result
const list = async (kind) => (await db.query('select public.catalog_master_list_v1($1) result', [kind])).rows[0].result
const save = async (kind, item, id = null, revision = null, requestId = randomUUID()) =>
  (await db.query('select public.catalog_save_master_v1($1,$2,$3,$4,$5,$6) result', [actor, requestId, revision, kind, id, JSON.stringify(item)])).rows[0].result
const remove = async (kind, id, revision, requestId = randomUUID()) =>
  (await db.query('select public.catalog_delete_master_v1($1,$2,$3,$4,$5) result', [actor, requestId, revision, kind, id])).rows[0].result

const examples = {
  gst_slab: { name: 'GST 3%', code: 'gst_3', percentage: 3, description: 'Jewellery', status: 'active', display_order: 1 },
  certificate: { name: 'IGI', code: 'igi', status: 'active', display_order: 1 },
  material_value: { name: 'Lab Diamond', slug: 'lab-diamond', cta_mode: 'checkout_only', cta_label: null, status: 'active', display_order: 1 },
  ring_size: { name: 'US 6', slug: 'us-6', status: 'active', display_order: 1 },
  stone_shape: { name: 'Round', slug: 'round', svg_asset_url: null, status: 'active', display_order: 1 },
  style: { name: 'Halo', icon_svg_path: null, status: 'active', display_order: 1 },
  content_rule: { kind: 'shipping', name: 'Standard Shipping', slug: 'standard-shipping', title: 'Shipping', body: 'Ships securely.', status: 'active', display_order: 1 },
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create type catalog_status as enum ('active','hidden');
    create type product_content_kind as enum ('shipping','care_warranty');
    create type product_content_status as enum ('active','hidden');
    create table profiles(id uuid primary key, role text not null);
    insert into profiles values('${actor}','admin');
    create table catalog_gst_slabs(id uuid primary key default gen_random_uuid(),name text not null,code text not null unique,percentage numeric not null,description text,status text not null default 'active',display_order int not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
    create table catalog_certificates(id uuid primary key default gen_random_uuid(),name text not null,code text,slug text not null unique,display_order int not null default 0,status catalog_status not null default 'active',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
    create table catalog_material_values(id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique,display_order int not null default 0,status text not null default 'active',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),cta_mode text not null default 'both',cta_label text);
    create table catalog_ring_sizes(id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique,display_order int not null default 0,status catalog_status not null default 'active',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
    create table catalog_stone_shapes(id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique,svg_asset_url text,display_order int not null default 0,status catalog_status not null default 'active',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
    create table catalog_styles(id uuid primary key default gen_random_uuid(),name text not null,display_order int not null default 0,status catalog_status not null default 'active',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),icon_svg_path text,slug text not null unique);
    create table product_content_rules(id uuid primary key default gen_random_uuid(),kind product_content_kind not null,name text not null,slug text not null unique,title text not null,body text not null,display_order int not null default 0,status product_content_status not null default 'active',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
    create table products(id uuid primary key default gen_random_uuid(),certificate_ids jsonb,ring_size_ids jsonb,gst_slab_id uuid references catalog_gst_slabs,style_id uuid references catalog_styles,shipping_rule_id uuid references product_content_rules,care_warranty_rule_id uuid references product_content_rules);
    create table order_items(id uuid primary key default gen_random_uuid(),gst_slab_id uuid references catalog_gst_slabs);
    create table site_settings(id bigint primary key,default_gst_slab_id uuid references catalog_gst_slabs);
    create table product_material_value_selections(id uuid primary key default gen_random_uuid(),material_value_id uuid references catalog_material_values);
    create table product_stone_shapes(id uuid primary key default gen_random_uuid(),shape_id uuid references catalog_stone_shapes);
    create table product_shape_selections(id uuid primary key default gen_random_uuid(),shape_id uuid references catalog_stone_shapes);
    create table discover_shapes_items(id uuid primary key default gen_random_uuid(),shape_id uuid references catalog_stone_shapes);
  `)
  const migration = await readFile(new URL('../sql/202609250010_catalog_group5a_atomic_crud.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration)
})

beforeEach(async () => db.exec(`truncate products,order_items,site_settings,product_material_value_selections,product_stone_shapes,product_shape_selections,discover_shapes_items,catalog_gst_slabs,catalog_certificates,catalog_material_values,catalog_ring_sizes,catalog_stone_shapes,catalog_styles,product_content_rules,cms_save_receipts cascade`))
after(async () => db.close())

test('all seven masters create and update without replacing IDs', async () => {
  for (const [kind, value] of Object.entries(examples)) {
    const created = await save(kind, value)
    assert.match(created.revision, /^[a-f0-9]{32}$/)
    const id = created.item.id
    const createdAt = created.item.created_at
    const updated = await save(kind, { ...value, name: `${value.name} Updated` }, id, created.revision)
    assert.equal(updated.item.id, id)
    assert.equal(updated.item.created_at, createdAt)
    assert.equal((await list(kind))[0]._revision, updated.revision)
  }
})

test('stale revisions, request reuse, and unchanged saves are safe', async () => {
  const created = await save('material_value', examples.material_value)
  const unchanged = await save('material_value', examples.material_value, created.item.id, created.revision)
  assert.equal(unchanged.revision, created.revision)
  const changed = await save('material_value', { ...examples.material_value, name: 'Natural Diamond' }, created.item.id, created.revision)
  await assert.rejects(save('material_value', examples.material_value, created.item.id, created.revision), /changed since/)
  const requestId = randomUUID()
  const first = await save('material_value', { ...examples.material_value, name: 'Retry Safe', slug: 'retry-safe' }, null, null, requestId)
  assert.deepEqual(await save('material_value', { ...examples.material_value, name: 'Retry Safe', slug: 'retry-safe' }, null, null, requestId), first)
  await assert.rejects(save('material_value', { ...examples.material_value, name: 'Different', slug: 'different' }, null, null, requestId), /different save/)
  assert.notEqual(changed.revision, created.revision)
})

test('duplicate names and slugs are rejected cleanly', async () => {
  await save('stone_shape', examples.stone_shape)
  await assert.rejects(save('stone_shape', { ...examples.stone_shape, slug: 'round-copy' }), /already exists/)
  await assert.rejects(save('stone_shape', { ...examples.stone_shape, name: 'Oval' }), /already exists/)
})

test('every supported reference blocks deletion, including JSON arrays', async () => {
  const gst = await save('gst_slab', examples.gst_slab); await db.query('insert into order_items(gst_slab_id) values($1)', [gst.item.id]); await assert.rejects(remove('gst_slab', gst.item.id, gst.revision), /Hide it instead/)
  const cert = await save('certificate', examples.certificate); await db.query('insert into products(certificate_ids,ring_size_ids) values($1,$2)', [JSON.stringify([cert.item.id]), '[]']); await assert.rejects(remove('certificate', cert.item.id, cert.revision), /Hide it instead/)
  const material = await save('material_value', examples.material_value); await db.query('insert into product_material_value_selections(material_value_id) values($1)', [material.item.id]); await assert.rejects(remove('material_value', material.item.id, material.revision), /Hide it instead/)
  const size = await save('ring_size', examples.ring_size); await db.query('insert into products(certificate_ids,ring_size_ids) values($1,$2)', ['[]', JSON.stringify([size.item.id])]); await assert.rejects(remove('ring_size', size.item.id, size.revision), /Hide it instead/)
  const shape = await save('stone_shape', examples.stone_shape); await db.query('insert into discover_shapes_items(shape_id) values($1)', [shape.item.id]); await assert.rejects(remove('stone_shape', shape.item.id, shape.revision), /Hide it instead/)
  const style = await save('style', examples.style); await db.query('insert into products(certificate_ids,ring_size_ids,style_id) values($1,$2,$3)', ['[]','[]',style.item.id]); await assert.rejects(remove('style', style.item.id, style.revision), /Hide it instead/)
  const rule = await save('content_rule', examples.content_rule); await db.query('insert into products(certificate_ids,ring_size_ids,shipping_rule_id) values($1,$2,$3)', ['[]','[]',rule.item.id]); await assert.rejects(remove('content_rule', rule.item.id, rule.revision), /Hide it instead/)
})

test('unreferenced deletion is explicit and idempotent', async () => {
  const created = await save('ring_size', examples.ring_size)
  const requestId = randomUUID()
  const result = await remove('ring_size', created.item.id, created.revision, requestId)
  assert.equal(result.ok, true)
  assert.deepEqual(await remove('ring_size', created.item.id, created.revision, requestId), result)
  assert.equal((await row('ring_size', created.item.id)).item, null)
})

test('late database failures roll back the update and receipt', async () => {
  const created = await save('gst_slab', examples.gst_slab)
  await db.exec("alter table catalog_gst_slabs add constraint reject_failure check(name <> 'FAIL')")
  const requestId = randomUUID()
  try {
    await assert.rejects(save('gst_slab', { ...examples.gst_slab, name: 'FAIL' }, created.item.id, created.revision, requestId))
    assert.deepEqual(await row('gst_slab', created.item.id), created)
    assert.equal((await db.query('select count(*)::int count from cms_save_receipts where request_id=$1', [requestId])).rows[0].count, 0)
  } finally { await db.exec('alter table catalog_gst_slabs drop constraint reject_failure') }
})

test('public roles cannot execute catalog functions', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    await assert.rejects(list('style'), /permission denied/)
    await db.exec('reset role')
  }
})
