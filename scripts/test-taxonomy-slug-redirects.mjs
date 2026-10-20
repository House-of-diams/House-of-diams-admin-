import fs from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

// HOD-059: slug renames and moves keep old category/subcategory/option URLs working.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const sql = fs.readFileSync(new URL('../sql/202610190030_taxonomy_slug_redirects.forward.sql', import.meta.url), 'utf8')
const install = sql.slice(sql.indexOf('create function'), sql.lastIndexOf('commit;'))

// Installed seo_redirects constraints and validate_seo_redirect() trigger (UAT, 2026-10).
const schema = `
create table products (id uuid primary key, slug text unique);
create table catalog_categories (id uuid primary key, slug text unique, status text);
create table catalog_subcategories (id uuid primary key, category_id uuid, slug text, status text);
create table catalog_options (id uuid primary key, subcategory_id uuid, slug text, status text);
create table seo_redirects (
  id uuid primary key default gen_random_uuid(), source_path text not null, target_path text not null,
  http_status smallint not null default 301, entity_type text not null, entity_id uuid, reason text,
  is_active boolean not null default true, created_at timestamptz not null default now(), created_by uuid,
  constraint seo_redirects_source_path_unique unique (source_path),
  constraint seo_redirects_entity_type_check check (entity_type in ('product','category','subcategory','option','manual')),
  constraint seo_redirects_not_self_redirect check (source_path <> target_path));
create function validate_seo_redirect() returns trigger language plpgsql as $$
begin
  if not new.is_active then return new; end if;
  if exists (select 1 from seo_redirects e where e.is_active and e.source_path = new.target_path and e.id <> new.id) then
    raise exception 'Redirect target % is another active redirect source', new.target_path; end if;
  if exists (select 1 from seo_redirects e where e.is_active and e.target_path = new.source_path and e.id <> new.id) then
    raise exception 'Redirect source % is already the target of an active redirect', new.source_path; end if;
  if exists (select 1 from products p where '/shop/' || p.slug = split_part(new.source_path, '?', 1)) then
    raise exception 'Redirect source % is a current product canonical path', new.source_path; end if;
  return new;
end $$;
create trigger validate_seo_redirect_before_write before insert or update on seo_redirects for each row execute function validate_seo_redirect();`

const C = n => `00000000-0000-4000-8000-0000000000c${n}`, S = n => `00000000-0000-4000-8000-0000000000d${n}`, O = n => `00000000-0000-4000-8000-0000000000e${n}`

test('taxonomy slug changes write 301s for the row and everything below it', async () => {
  const db = new PGlite()
  await db.exec(schema)
  await db.exec(install)
  await db.exec(`
insert into catalog_categories values ('${C(1)}','rings','active'),('${C(2)}','earrings','active');
insert into catalog_subcategories values ('${S(1)}','${C(1)}','solitaire','active'),('${S(2)}','${C(1)}','halo','active');
insert into catalog_options values ('${O(1)}','${S(1)}','round','active'),('${O(2)}','${S(2)}','oval','active');`)
  const active = async () => Object.fromEntries((await db.query('select source_path, target_path from seo_redirects where is_active order by source_path')).rows.map(r => [r.source_path, r.target_path]))

  await db.query(`update catalog_categories set status='hidden' where id=$1`, [C(1)])
  assert.deepEqual(await active(), {}, 'non-slug updates write nothing')

  await db.query(`update catalog_categories set slug='bands' where id=$1`, [C(1)])
  assert.deepEqual(await active(), {
    '/rings': '/bands', '/rings/halo': '/bands/halo', '/rings/halo/oval': '/bands/halo/oval',
    '/rings/solitaire': '/bands/solitaire', '/rings/solitaire/round': '/bands/solitaire/round',
  })

  await db.query(`update catalog_categories set slug='jewels' where id=$1`, [C(1)])
  const second = await active()
  assert.equal(second['/rings'], '/jewels', 'older redirect repointed, no chain')
  assert.equal(second['/bands'], '/jewels')
  assert.equal(second['/rings/solitaire/round'], '/jewels/solitaire/round')

  await db.query(`update catalog_categories set slug='rings' where id=$1`, [C(1)])
  const back = await active()
  assert.equal(back['/rings'], undefined, 'a path that is live again stops redirecting')
  assert.equal(back['/jewels'], '/rings'); assert.equal(back['/bands'], '/rings')
  assert.equal(back['/bands/halo/oval'], '/rings/halo/oval')

  await db.query(`update catalog_subcategories set category_id=$2 where id=$1`, [S(1), C(2)])
  const moved = await active()
  assert.equal(moved['/rings/solitaire'], '/earrings/solitaire'); assert.equal(moved['/rings/solitaire/round'], '/earrings/solitaire/round')
  assert.equal(moved['/jewels/solitaire'], '/earrings/solitaire', 'descendant redirects from earlier renames are repointed too')

  await db.query(`update catalog_options set slug='oval-cut' where id=$1`, [O(2)])
  assert.equal((await active())['/rings/halo/oval'], '/rings/halo/oval-cut')
  const row = (await db.query(`select entity_type, entity_id, http_status from seo_redirects where source_path='/rings/halo/oval'`)).rows[0]
  assert.deepEqual(row, { entity_type: 'option', entity_id: O(2), http_status: 301 })

  // A redirect problem never blocks the rename: force a clash with a product path.
  await db.exec(`insert into products values ('00000000-0000-4000-8000-0000000000f1','x'); insert into catalog_options values ('${O(3)}','${S(2)}','gone','active');`)
  await db.exec(`drop trigger validate_seo_redirect_before_write on seo_redirects;
    create function fail_redirects() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
    create trigger fail_redirects before insert or update on seo_redirects for each row execute function fail_redirects();`)
  await db.query(`update catalog_options set slug='kept' where id=$1`, [O(3)])
  assert.equal((await db.query(`select slug from catalog_options where id=$1`, [O(3)])).rows[0].slug, 'kept', 'rename succeeded')
  assert.equal((await db.query(`select count(*)::int n from seo_redirects where source_path like '%/gone'`)).rows[0].n, 0)
  await db.close()
})
