import fs from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

// HOD-006: admin_product_bulk_price_v2 changes the chosen metals' variant prices,
// rounds to whole units and keeps base_price equal to the default variant.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const sql = fs.readFileSync(new URL('../sql/202610190027_bulk_price_by_metal.forward.sql', import.meta.url), 'utf8')
const fn = sql.slice(sql.indexOf('create function'), sql.indexOf('revoke all'))

test('bulk price by metal updates variant prices with preview, rounding, default sync and replay safety', async () => {
const db = new PGlite()
await db.exec(`
create table profiles (id uuid primary key, role text);
create table catalog_metals (id uuid primary key, name text);
create table products (id uuid primary key, name text, base_price numeric(12,2), product_lane text, updated_at timestamptz);
create table product_metal_variants (id uuid primary key, product_id uuid, metal_id uuid, price numeric(12,2), is_default boolean, updated_at timestamptz);
create table cms_save_receipts (actor_id uuid, request_id uuid, operation text, payload_hash text, result jsonb);
insert into profiles values ('00000000-0000-0000-0000-00000000000a','admin');
insert into catalog_metals values ('00000000-0000-0000-0000-0000000000a1','14K Yellow'),('00000000-0000-0000-0000-0000000000a2','10K Yellow'),('00000000-0000-0000-0000-0000000000a3','14K Rose');
insert into products values ('00000000-0000-0000-0000-0000000000b1','Ring',590,'standard',null),('00000000-0000-0000-0000-0000000000b2','Band',335,'standard',null),('00000000-0000-0000-0000-0000000000b3','Hoop',800,'standard',null);
insert into product_metal_variants values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',750,false,null),
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a2',590,true,null),
 ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a1',1315,true,null),
 ('00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a3',800,true,null);`)
await db.exec(fn.replace(/set search_path to 'pg_catalog', 'public'/, ''))
const A='00000000-0000-0000-0000-00000000000a', M14='00000000-0000-0000-0000-0000000000a1', M10='00000000-0000-0000-0000-0000000000a2'
const P=['00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b3']
const call = (req, op, val, ids, metals, expected, lane = 'standard') => db.query(`select public.admin_product_bulk_price_v2($1,$2,$3,$4,$5,$6::uuid[],$7::uuid[],$8::jsonb) r`, [A, req, lane, op, val, ids, metals, JSON.stringify(expected)]).then(x => x.rows[0].r)
const price = async (id) => Number((await db.query('select price from product_metal_variants where id=$1', [id])).rows[0].price)
const base = async (id) => Number((await db.query('select base_price from products where id=$1', [id])).rows[0].base_price)
const exp14 = [{ variant_id: '00000000-0000-0000-0000-0000000000c1', price: 750 }, { variant_id: '00000000-0000-0000-0000-0000000000c3', price: 1315 }]
await assert.rejects(call('10000000-0000-0000-0000-000000000001', 'increase_percent', 10, P, [M14], [exp14[0]]), /changed since the preview/, 'missing expected variant')
await assert.rejects(call('10000000-0000-0000-0000-000000000002', 'increase_percent', 10, P, [M14], [{ ...exp14[0], price: 700 }, exp14[1]]), /changed since the preview/, 'stale price')
const r = await call('10000000-0000-0000-0000-000000000003', 'increase_percent', 10, P, [M14], exp14)
assert.equal(r.updatedCount, 2); assert.deepEqual(r.skippedProductIds, [P[2]])
assert.equal(await price('00000000-0000-0000-0000-0000000000c1'), 825, '750 +10% = 825')
assert.equal(await price('00000000-0000-0000-0000-0000000000c3'), 1447, '1315 +10% = 1446.5 rounds to 1447')
assert.equal(await price('00000000-0000-0000-0000-0000000000c2'), 590, '10K untouched')
assert.equal(await base(P[0]), 590, 'Ring base follows its default 10K, unchanged')
assert.equal(await base(P[1]), 1447, 'Band base follows its default 14K')
assert.equal(await base(P[2]), 800, 'skipped product unchanged')
const again = await call('10000000-0000-0000-0000-000000000003', 'increase_percent', 10, P, [M14], exp14)
assert.equal(again.updatedCount, 2); assert.equal(await price('00000000-0000-0000-0000-0000000000c1'), 825, 'same request replays receipt, no double change')
await assert.rejects(call('10000000-0000-0000-0000-000000000003', 'increase_percent', 20, P, [M14], exp14), /already used/)
const two = await call('10000000-0000-0000-0000-000000000004', 'decrease_amount', 25, [P[0]], [M14, M10],
  [{ variant_id: '00000000-0000-0000-0000-0000000000c1', price: 825 }, { variant_id: '00000000-0000-0000-0000-0000000000c2', price: 590 }])
assert.equal(two.updatedCount, 2); assert.equal(await price('00000000-0000-0000-0000-0000000000c2'), 565); assert.equal(await base(P[0]), 565, 'two metals in one run; default synced')
await assert.rejects(call('10000000-0000-0000-0000-000000000005', 'decrease_amount', 5000, [P[0]], [M14], [{ variant_id: '00000000-0000-0000-0000-0000000000c1', price: 800 }]), /invalid price/)
await assert.rejects(call('10000000-0000-0000-0000-000000000006', 'increase_percent', 10, [P[0]], [M14], [{ variant_id: '00000000-0000-0000-0000-0000000000c1', price: 800 }], 'hiphop'), /outside this lane/)
await assert.rejects(call('10000000-0000-0000-0000-000000000007', 'increase_percent', 10, [P[2]], [M14], []), /None of the selected products/)
await assert.rejects(call('10000000-0000-0000-0000-000000000008', 'decrease_percent', 100, [P[0]], [M14], []), /Invalid bulk price request/)
})
