import fs from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

// Phase 3: admin_product_delete_v2 deletes products and leaves a 301 for each old
// address, repointing redirects that ended at the deleted product.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const sql = fs.readFileSync(new URL('../sql/202610190029_product_delete_redirects.forward.sql', import.meta.url), 'utf8')
const fn = sql.slice(sql.indexOf('create function'), sql.indexOf('revoke all'))

// Installed seo_redirects constraints and validate_seo_redirect() trigger (UAT, 2026-10).
const schema = `
create table profiles (id uuid primary key, role text);
create table catalog_categories (id uuid primary key, slug text, status text);
create table products (id uuid primary key, name text, slug text unique, product_lane text, main_category_id uuid, status text);
create table order_items (id uuid primary key, product_id uuid references products(id));
create table cms_save_receipts (actor_id uuid, request_id uuid, operation text, payload_hash text, result jsonb);
create table seo_redirects (
  id uuid primary key default gen_random_uuid(), source_path text not null, target_path text not null,
  http_status smallint not null default 301, entity_type text not null, entity_id uuid, reason text,
  is_active boolean not null default true, created_at timestamptz not null default now(), created_by uuid,
  constraint seo_redirects_source_path_unique unique (source_path),
  constraint seo_redirects_http_status_301_only check (http_status = 301),
  constraint seo_redirects_entity_type_check check (entity_type in ('product','category','subcategory','option','manual')),
  constraint seo_redirects_not_self_redirect check (source_path <> target_path),
  constraint seo_redirects_product_owner_required check (entity_type <> 'product' or entity_id is not null));
create function validate_seo_redirect() returns trigger language plpgsql as $$
begin
  if not new.is_active then return new; end if;
  if exists (select 1 from seo_redirects e where e.is_active and e.source_path = new.target_path and e.id <> new.id) then
    raise exception 'Redirect target % is another active redirect source', new.target_path; end if;
  if exists (select 1 from seo_redirects e where e.is_active and e.target_path = new.source_path and e.id <> new.id) then
    raise exception 'Redirect source % is already the target of an active redirect', new.source_path; end if;
  if exists (select 1 from products p where '/shop/' || p.slug = split_part(new.source_path, '?', 1)
             and (new.entity_type <> 'product' or p.id <> new.entity_id)) then
    raise exception 'Redirect source % is a current product canonical path', new.source_path; end if;
  if new.entity_type = 'product' and not exists (select 1 from products p where p.id = new.entity_id and '/shop/' || p.slug = new.target_path) then
    raise exception 'Product redirect target % does not match product %', new.target_path, new.entity_id; end if;
  return new;
end $$;
create trigger validate_seo_redirect_before_write before insert or update on seo_redirects for each row execute function validate_seo_redirect();`

const A = '00000000-0000-0000-0000-00000000000a'
const C = { rings: '00000000-0000-0000-0000-0000000000c1', old: '00000000-0000-0000-0000-0000000000c2' }
const P = { ring: '00000000-0000-0000-0000-0000000000b1', band: '00000000-0000-0000-0000-0000000000b2', chain: '00000000-0000-0000-0000-0000000000b3', sold: '00000000-0000-0000-0000-0000000000b4', keep: '00000000-0000-0000-0000-0000000000b5' }
const req = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`

test('product delete v2 deletes and leaves valid 301s', async () => {
  const db = new PGlite()
  await db.exec(schema)
  await db.exec(fn.replace(/set search_path to 'pg_catalog', 'public'/, ''))
  await db.exec(`
insert into profiles values ('${A}','admin'),('00000000-0000-0000-0000-00000000000e','editor');
insert into catalog_categories values ('${C.rings}','engagement-rings','active'),('${C.old}','old-cat','hidden');
insert into products values
 ('${P.ring}','Ring','solitaire-ring','standard','${C.rings}','active'),
 ('${P.band}','Band','plain-band','standard','${C.old}','active'),
 ('${P.chain}','Chain','cuban-chain','hiphop',null,'active'),
 ('${P.sold}','Sold','sold-ring','standard','${C.rings}','active'),
 ('${P.keep}','Keep','keep-ring','standard','${C.rings}','active');
insert into order_items values ('00000000-0000-0000-0000-0000000000d1','${P.sold}');
insert into seo_redirects (source_path,target_path,entity_type,entity_id,reason) values
 ('/shop/solitaire-ring-old','/shop/solitaire-ring','product','${P.ring}','slug changed');`)
  const call = (r, lane, ids, actor = A) => db.query('select public.admin_product_delete_v2($1,$2,$3,$4::uuid[]) r', [actor, r, lane, ids]).then(x => x.rows[0].r)
  const redirect = async src => (await db.query('select target_path,entity_type,entity_id,is_active,http_status from seo_redirects where source_path=$1', [src])).rows[0]
  const exists = async id => (await db.query('select 1 from products where id=$1', [id])).rows.length === 1

  await assert.rejects(call(req(1), 'standard', [P.ring], '00000000-0000-0000-0000-00000000000e'), /Administrator access/)
  await assert.rejects(call(req(2), 'standard', [P.ring, P.ring]), /Invalid product deletion/)
  await assert.rejects(call(req(3), 'hiphop', [P.ring]), /outside this lane/)
  await assert.rejects(call(req(4), 'standard', [P.ring, '00000000-0000-0000-0000-0000000000ff']), /not found/)
  await assert.rejects(call(req(5), 'standard', [P.sold]), /foreign key/, 'ordered product stays protected')
  assert.ok(await exists(P.sold)); assert.equal(await redirect('/shop/sold-ring'), undefined, 'failed delete writes no redirect')

  const r = await call(req(6), 'standard', [P.ring, P.band])
  assert.equal(r.deletedCount, 2); assert.equal(r.redirectCount, 2)
  assert.ok(!(await exists(P.ring)) && !(await exists(P.band)))
  assert.deepEqual(await redirect('/shop/solitaire-ring'), { target_path: '/engagement-rings', entity_type: 'manual', entity_id: P.ring, is_active: true, http_status: 301 })
  assert.equal((await redirect('/shop/plain-band')).target_path, '/shop', 'hidden category falls back to the lane listing')
  const old = await redirect('/shop/solitaire-ring-old')
  assert.equal(old.target_path, '/engagement-rings', 'older redirect repointed, no chain to a missing page'); assert.equal(old.entity_type, 'manual')

  const again = await call(req(6), 'standard', [P.ring, P.band])
  assert.deepEqual(again, r, 'same request replays the receipt')
  await assert.rejects(call(req(6), 'standard', [P.keep]), /already used/)

  const single = await call(req(7), null, [P.chain, P.ring])
  assert.equal(single.deletedCount, 1, 'single delete ignores an already-deleted product')
  assert.equal((await redirect('/shop/cuban-chain')).target_path, '/hiphop')
  assert.ok(await exists(P.keep))
})
