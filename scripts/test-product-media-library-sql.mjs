// Offline test (PGlite, no real database) for sql/202610220031_product_media_library.*.sql.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sql')
const read = suffix => fs.readFileSync(path.join(dir, `202610220031_product_media_library.${suffix}.sql`), 'utf8')

const ADMIN = '11111111-1111-4111-8111-111111111111'
const STAFF = '22222222-2222-4222-8222-222222222222'
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const M1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const M2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const L1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const L2 = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role hod_migration superuser; create role hod_admin_app; create role hod_app;
    create table public.profiles (id uuid primary key, role text not null);
    create table public.products (id uuid primary key);
    create table public.product_metal_variants (id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade, metal_id uuid not null);
    insert into public.profiles values ('${ADMIN}', 'admin'), ('${STAFF}', 'customer');
    insert into public.products values ('${P1}'), ('${P2}');
    insert into public.product_metal_variants (product_id, metal_id) values ('${P1}', '${M1}'), ('${P1}', '${M2}'), ('${P2}', '${M1}');
    set role hod_migration;`)
  await db.exec(read('forward'))
  return db
}
const frames = (pid, v) => Array.from({ length: 24 }, (_, i) => `products/hover/${pid}/v${v}/${String(i).padStart(2, '0')}.webp`)
const save = (db, { actor = ADMIN, product = P1, library = [], links = [], hover = null, set = false } = {}) =>
  db.query('select public.admin_product_media_extras_save_v1($1::uuid,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb,$6::boolean) as r',
    [actor, product, JSON.stringify(library), JSON.stringify(links), hover ? JSON.stringify(hover) : null, set])
const lib = [{ id: L1, label: 'Yellow gold', media_path: 'products/videos/yellow.mp4' }, { id: L2, label: 'White gold', media_path: 'https://cdn.example.com/white.mp4' }]

test('verify file reports every check true', async () => {
  const db = await setup()
  const { rows } = await db.query(read('verify').replace(/;\s*$/, ''))
  assert.ok(rows.length >= 10)
  assert.deepEqual(rows.filter(row => row.ok !== true), [])
})

test('saves library, links and hover view, and returns the saved state', async () => {
  const db = await setup()
  const out = (await save(db, { library: lib, links: [{ metal_id: M1, library_id: L1 }, { metal_id: M2, library_id: L1 }], hover: { version: 1, frame_paths: frames(P1, 1) }, set: true })).rows[0].r
  assert.equal(out.library.length, 2)
  assert.equal(out.links.length, 2)
  assert.equal(out.hover.frame_paths.length, 24)
})

test('rejects non-administrators, unknown products and bad input', async () => {
  const db = await setup()
  await assert.rejects(save(db, { actor: STAFF, library: lib }), /Administrator access/)
  await assert.rejects(save(db, { product: 'aaaaaaaa-0000-4000-8000-000000000000', library: lib }), /Product not found/)
  await assert.rejects(save(db, { library: [lib[0], { ...lib[1], label: 'yellow GOLD' }] }), /different from each other/)
  await assert.rejects(save(db, { library: [{ ...lib[0], media_path: 'javascript:alert(1)' }] }), /invalid file address/)
  await assert.rejects(save(db, { library: [{ ...lib[0], media_path: '../secret.mp4' }] }), /invalid file address/)
  await assert.rejects(save(db, { library: [{ ...lib[0], label: '   ' }] }), /label/)
  await assert.rejects(save(db, { library: Array.from({ length: 13 }, (_, i) => ({ id: crypto.randomUUID(), label: `v${i}`, media_path: `a/${i}.mp4` })) }), /at most 12/)
})

test('links must point to this product\'s library and metal options', async () => {
  const db = await setup()
  await assert.rejects(save(db, { library: lib, links: [{ metal_id: M1, library_id: 'eeeeeeee-0000-4000-8000-000000000000' }] }), /not in the library/)
  await assert.rejects(save(db, { library: lib, links: [{ metal_id: 'cccccccc-0000-4000-8000-000000000000', library_id: L1 }] }), /does not have/)
  await assert.rejects(save(db, { library: lib, links: [{ metal_id: M1, library_id: L1 }, { metal_id: M1, library_id: L2 }] }), /Invalid video choice/)
})

test('a library video id cannot be taken over from another product', async () => {
  const db = await setup()
  await save(db, { library: lib })
  await assert.rejects(save(db, { product: P2, library: [lib[0]] }), /another product/)
})

test('hover view needs 24 correctly named frames and a newer version', async () => {
  const db = await setup()
  await assert.rejects(save(db, { hover: { version: 1, frame_paths: frames(P1, 1).slice(0, 23) }, set: true }), /24 frames/)
  await assert.rejects(save(db, { hover: { version: 1, frame_paths: frames(P2, 1) }, set: true }), /unexpected file address/)
  await assert.rejects(save(db, { hover: { version: 2, frame_paths: frames(P1, 1) }, set: true }), /unexpected file address/)
  await save(db, { hover: { version: 2, frame_paths: frames(P1, 2) }, set: true })
  await assert.rejects(save(db, { hover: { version: 2, frame_paths: frames(P1, 2) }, set: true }), /older than the saved/)
  await assert.rejects(save(db, { hover: { version: 1, frame_paths: frames(P1, 1) }, set: true }), /older than the saved/)
  const kept = (await save(db, { library: lib })).rows[0].r
  assert.equal(kept.hover.version, 2, 'a save that does not set the hover view leaves it alone')
  const removed = (await save(db, { hover: null, set: true })).rows[0].r
  assert.equal(removed.hover, null)
})

test('hover frames may be stored as CDN addresses ending with the object key', async () => {
  const db = await setup()
  const urls = frames(P1, 1).map(key => `https://cdn.example.com/${key}`)
  const out = (await save(db, { hover: { version: 1, frame_paths: urls }, set: true })).rows[0].r
  assert.equal(out.hover.frame_paths[23], urls[23])
  await assert.rejects(save(db, { hover: { version: 2, frame_paths: urls }, set: true }), /unexpected file address/)
  await assert.rejects(save(db, { hover: { version: 2, frame_paths: frames(P1, 2).map(key => `http://cdn.example.com/${key}`) }, set: true }), /unexpected file address/)
})

test('removing a library video removes the choices that used it; deleting the product removes everything', async () => {
  const db = await setup()
  await save(db, { library: lib, links: [{ metal_id: M1, library_id: L1 }] , hover: { version: 1, frame_paths: frames(P1, 1) }, set: true })
  const out = (await save(db, { library: [lib[1]], links: [{ metal_id: M1, library_id: L2 }] })).rows[0].r
  assert.deepEqual(out.library.map(row => row.id), [L2])
  await db.exec(`delete from public.products where id = '${P1}'`)
  for (const t of ['product_media_library', 'product_variant_library_links', 'product_hover_views']) {
    assert.equal((await db.query(`select count(*)::int n from public.${t}`)).rows[0].n, 0, t)
  }
})

test('rollback removes only the new objects', async () => {
  const db = await setup()
  await db.exec(read('rollback'))
  for (const t of ['product_media_library', 'product_variant_library_links', 'product_hover_views']) {
    assert.equal((await db.query(`select to_regclass('public.${t}') r`)).rows[0].r, null, t)
  }
  assert.equal((await db.query('select count(*)::int n from public.products')).rows[0].n, 2)
})

test('forward file refuses to run as another role or twice', async () => {
  const db = await setup()
  await assert.rejects(db.exec(read('forward')), /already exist/)
  const other = new PGlite()
  await other.exec(`create role hod_migration; create role hod_admin_app; create role hod_app; create table public.profiles(id uuid); create table public.products(id uuid primary key); create table public.product_metal_variants(id uuid);`)
  await assert.rejects(other.exec(read('forward')), /Run as hod_migration/)
})
