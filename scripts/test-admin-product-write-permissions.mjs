import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
const forward=fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-09-product-write-forward.sql','utf8')
const inverse=fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-09-product-write-inverse.sql','utf8')
const local=sql=>sql.replace("current_database()<>'hod_staging'","current_database()<>'postgres'")
const references=['catalog_categories','catalog_gst_slabs','catalog_options','catalog_subcategories','product_metal_variants']
const id='00000000-0000-4000-8000-000000000001'
async function fixture(){
 const db=new PGlite()
 await db.exec(`CREATE ROLE hod_migration LOGIN NOINHERIT;CREATE ROLE hod_dev_migration LOGIN NOINHERIT;
 CREATE ROLE hod_admin_app NOLOGIN NOINHERIT;CREATE ROLE hod_app NOLOGIN;
 GRANT hod_migration TO hod_dev_migration WITH INHERIT FALSE,SET TRUE;
 GRANT CREATE,USAGE ON SCHEMA public TO hod_migration;
 GRANT USAGE ON SCHEMA public TO hod_admin_app,hod_app;
 CREATE TYPE public.product_status AS ENUM('draft','active');
 CREATE TABLE public.products(id uuid PRIMARY KEY,status public.product_status,updated_at timestamptz,name text,stock_quantity integer,base_price numeric);
 INSERT INTO public.products VALUES('${id}','active',now(),'fixture',0,1);`)
 for(const table of references)await db.exec(`CREATE TABLE public.${table}(id uuid PRIMARY KEY,name text);
 INSERT INTO public.${table} VALUES('${id}','reference');`)
 for(const table of [...references,'products'])await db.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
 GRANT SELECT ON public.${table} TO hod_admin_app,hod_app;
 GRANT UPDATE(name) ON public.${table} TO hod_app;
 CREATE POLICY retained_read ON public.${table} FOR SELECT TO hod_admin_app,hod_app USING(true);
 CREATE POLICY existing_shared_update ON public.${table} FOR UPDATE TO PUBLIC USING(true) WITH CHECK(true);
 ALTER TABLE public.${table} OWNER TO hod_migration;`)
 await db.exec('SET SESSION AUTHORIZATION hod_dev_migration')
 return db
}
test('reviewed product grants permit actual draft/delete and row locks while denying direct stock/price/reference writes',async()=>{
 const db=await fixture()
 try{
  await db.exec(local(forward))
  await db.exec('SET SESSION AUTHORIZATION postgres;SET ROLE hod_admin_app')
  const load=createSourceLoader(process.cwd())
  const {createProductRepository}=await import(await load('lib/db/admin-repositories/products.ts'))
  const repo=createProductRepository(db)
  assert.equal((await repo.draft(id,'active')).status,'updated')
  assert.equal((await repo.draft(id,'active')).status,'conflict')
  await assert.rejects(()=>db.query('UPDATE public.products SET status=$1 WHERE id=$2',['active',id]),{code:'42501'})
  for(const column of ['stock_quantity','base_price'])await assert.rejects(()=>db.query(`UPDATE public.products SET ${column}=2 WHERE id=$1`,[id]),{code:'42501'})
  await assert.rejects(()=>db.query('INSERT INTO public.products DEFAULT VALUES'),{code:'42501'})
  for(const table of references){
   assert.equal((await db.query(`SELECT id FROM public.${table} FOR SHARE`)).rows.length,1)
   await assert.rejects(()=>db.query(`UPDATE public.${table} SET id=id`),{code:'42501'})
  }
  assert.equal((await db.query('DELETE FROM public.products WHERE id=$1 RETURNING id',[id])).rows.length,1)
  await db.exec(`RESET ROLE;SET ROLE hod_app;UPDATE public.catalog_categories SET name='storefront-still-works';RESET ROLE;
   SET SESSION AUTHORIZATION hod_dev_migration;`)
  await assert.rejects(()=>db.exec(local(forward)),/Prestate differs or already installed/)
  await db.exec('ROLLBACK;RESET ROLE')
  await db.exec(local(inverse))
  for(const table of [...references,'products']){
   const {rows}=await db.query(`SELECT has_table_privilege('hod_admin_app',$1,'SELECT') AS reads,
    has_any_column_privilege('hod_admin_app',$1,'UPDATE') AS writes,
    has_column_privilege('hod_app',$1,'name','UPDATE') AS storefront`,['public.'+table])
   assert.deepEqual(rows[0],{reads:true,writes:false,storefront:true})
  }
 }finally{await db.close()}
})
test('wrong target and extra pre-existing column writes stop product permission installation',async()=>{
 const db=await fixture()
 try{
  await assert.rejects(()=>db.exec(forward),/Use hod_staging/);await db.exec('ROLLBACK')
  await db.exec('SET ROLE hod_migration;GRANT UPDATE(name) ON public.catalog_categories TO hod_admin_app;RESET ROLE')
  await assert.rejects(()=>db.exec(local(forward)),/Prestate differs/);await db.exec('ROLLBACK')
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE left(policyname,18)='hod_admin_write09_' ")).rows[0].n,0)
 }finally{await db.close()}
})
