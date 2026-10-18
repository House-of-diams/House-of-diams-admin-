import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import ts from 'typescript'
import path from 'node:path'
import {createDuplicateFixture,duplicateMetadata,duplicateActor,duplicateSource} from './admin-duplicate-test-fixture.mjs'
import {duplicateBody,duplicateChildren,duplicateSignature} from './admin-duplicate-capability-sql.mjs'
import {buildDuplicatePacket} from './build-admin-duplicate-packet.mjs'
import {contentSnapshotSql} from './admin-content-permission-snapshot.mjs'
import {inspectDuplicateCapability} from './admin-duplicate-installation-check.mjs'
const request='00000000-0000-4000-8000-000000000004'
const prepare='SELECT public.admin_product_duplicate_prepare_v1($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text) AS result'
const copy='SELECT * FROM public.duplicate_product($1::uuid,$2::uuid,$3::uuid)'
const args=[duplicateSource,request,duplicateActor,'https://auth-uat.houseofdiams.com/realms/houseofdiams','1167a5b6-9fcb-45d1-b7d8-53e95cd49704']
const cache=new Map();let admission='denied',resolutions=0
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64')
async function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file)
 let code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 for(const name of new Set([...code.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]))){
  const url=name==='server-only'?data('export {}'):name.endsWith('video-admission-runtime')?data('export const resolveAdmittedVideo=url=>globalThis.__duplicate13Resolve(url)')
   :name.startsWith('.')?await load(path.resolve(path.dirname(file),name)+'.ts'):import.meta.resolve(name)
  code=code.replaceAll(`'${name}'`,JSON.stringify(url)).replaceAll(`"${name}"`,JSON.stringify(url))
 }
 const url=data(code);cache.set(file,url);return url
}
globalThis.__duplicate13Resolve=async url=>{resolutions++;if(admission!=='admitted')throw Error('Unadmitted video');return {url}}
const {createProductRepository}=await import(await load('lib/db/admin-repositories/products.ts'))
const actor={profileId:duplicateActor,issuer:'https://auth-uat.houseofdiams.com/realms/houseofdiams',subject:'1167a5b6-9fcb-45d1-b7d8-53e95cd49704'}
async function populate(db){
 const kind=duplicateMetadata.enums.find(e=>e.name==='public.catalog_sub_type').labels[0]
 await db.exec(`DO $seed$ DECLARE metal uuid:=gen_random_uuid();material uuid:=gen_random_uuid();shape uuid:=gen_random_uuid();
 sub uuid:=gen_random_uuid();opt uuid:=gen_random_uuid();variant uuid:=gen_random_uuid();purity uuid:=gen_random_uuid();BEGIN
 INSERT INTO public.catalog_metals(id,name,slug) VALUES(metal,'Fixture metal','fixture-metal');
 INSERT INTO public.catalog_material_values(id,name,slug) VALUES(material,'Fixture material','fixture-material');
 INSERT INTO public.catalog_stone_shapes(id,name,slug) VALUES(shape,'Fixture shape','fixture-shape');
 INSERT INTO public.catalog_subcategories(id,category_id,name,slug,sub_type) VALUES(sub,'00000000-0000-4000-8000-000000000002','Fixture sub','fixture-sub','${kind}');
 INSERT INTO public.catalog_options(id,subcategory_id,name,slug) VALUES(opt,sub,'Fixture option','fixture-option');
 INSERT INTO public.product_metal_selections(product_id,metal_id) VALUES('${duplicateSource}',metal);
 INSERT INTO public.product_material_value_selections(product_id,material_value_id) VALUES('${duplicateSource}',material);
 INSERT INTO public.product_stone_shapes(product_id,shape_id) VALUES('${duplicateSource}',shape);
 INSERT INTO public.product_subcategory_links(product_id,subcategory_id,is_primary) VALUES('${duplicateSource}',sub,true);
 INSERT INTO public.product_option_links(product_id,option_id,is_primary) VALUES('${duplicateSource}',opt,true);
 INSERT INTO public.product_metal_media(product_id,metal_id,image_1_path) VALUES('${duplicateSource}',metal,'/fixture.jpg');
 INSERT INTO public.product_metal_variants(id,product_id,metal_id,price) VALUES(variant,'${duplicateSource}',metal,1);
 INSERT INTO public.product_variant_media_items(product_id,variant_id,media_type,media_path,is_default_fallback) VALUES('${duplicateSource}',variant,'image','/variant.jpg',false),('${duplicateSource}',null,'image','/default.jpg',true);
 INSERT INTO public.product_purity_prices(id,product_id,purity_label,price) VALUES(purity,'${duplicateSource}','Fixture purity',1);
 UPDATE public.products SET default_purity_price_id=purity WHERE id='${duplicateSource}';
 INSERT INTO public.product_faq_items(product_id,question,answer) VALUES('${duplicateSource}','Fixture?','Yes.');
 END $seed$;`)
}
async function begin(db){await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE;SET LOCAL ROLE hod_admin_app')}
test('actual helper/repository clones every source relation, remaps children and replays one receipt',async()=>{
 const db=await createDuplicateFixture()
 try{
  await populate(db);await begin(db)
  const graph=(await db.query(prepare,args)).rows[0].result.graph
  for(const t of duplicateChildren){const k={product_metal_media:'metal_media',product_metal_variants:'variants',product_variant_media_items:'media_items'}[t]??t;assert.equal(graph[k].length,t==='product_variant_media_items'?2:1,t)}
  const repo=createProductRepository(db),result=await repo.duplicate(actor,duplicateSource,request)
  assert.notEqual(result.product_id,duplicateSource);assert.equal(result.lane,'standard')
  assert.deepEqual(await repo.duplicate(actor,duplicateSource,request),result)
  await db.exec('RESET ROLE')
  const product=(await db.query('SELECT * FROM public.products WHERE id=$1',[result.product_id])).rows[0]
  assert.equal(product.status,'draft');assert.equal(product.stock_quantity,0);assert.equal(product.allow_checkout,false)
  for(const t of duplicateChildren)assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.${t} WHERE product_id=$1`,[result.product_id])).rows[0].count,t==='product_variant_media_items'?2:1,t)
  assert.equal((await db.query('SELECT product_id FROM public.product_purity_prices WHERE id=$1',[product.default_purity_price_id])).rows[0].product_id,result.product_id)
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.product_duplicate_requests WHERE request_id=$1',[request])).rows[0].count,1)
  await db.exec('ROLLBACK')
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.products')).rows[0].count,1)
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.product_duplicate_requests')).rows[0].count,0)
 }finally{await db.close()}
})
test('wrong isolation, public callers, unmapped/revoked actor and changed/incomplete receipt fail closed',async()=>{
 const db=await createDuplicateFixture()
 try{
  await db.exec('BEGIN;SET LOCAL ROLE hod_admin_app');await assert.rejects(()=>db.query(prepare,args),{code:'25001'});await db.exec('ROLLBACK')
  await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL ROLE hod_admin_app');await assert.rejects(()=>db.query(prepare,args),{code:'25001'});await db.exec('ROLLBACK')
  await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL ROLE hod_app');await assert.rejects(()=>db.query(prepare,args),{code:'42501'});await db.exec('ROLLBACK')
  for(const change of ["UPDATE public.admin_identities SET enabled=false","UPDATE public.admin_identities SET revoked_at=now()","UPDATE public.profiles SET role='viewer'"]){
   await db.exec('BEGIN;'+change);await db.exec('COMMIT');await begin(db)
   await assert.rejects(()=>db.query(prepare,args),{code:'42501'});await db.exec('ROLLBACK')
   await db.exec("UPDATE public.admin_identities SET enabled=true,revoked_at=null;UPDATE public.profiles SET role='admin'")
  }
  await db.query('INSERT INTO public.product_duplicate_requests(request_id,source_product_id,requested_by) VALUES($1,$2,$3)',[request,duplicateSource,duplicateActor])
  await begin(db);await assert.rejects(()=>db.query(prepare,args),{code:'40001'});await db.exec('ROLLBACK')
  await db.query('DELETE FROM public.product_duplicate_requests WHERE request_id=$1',[request])
  await db.query(`INSERT INTO public.admin_identities(issuer,subject,profile_id,enabled) VALUES($1,'other-active-subject',$2,true)`,[actor.issuer,duplicateActor])
  await db.query('UPDATE public.admin_identities SET enabled=false WHERE subject=$1',[actor.subject])
  await begin(db);await assert.rejects(()=>db.query(prepare,args),{code:'42501'});await db.exec('ROLLBACK')
  await db.query('UPDATE public.admin_identities SET enabled=true WHERE subject=$1',[actor.subject])
  await begin(db);await assert.rejects(()=>db.query(prepare,[...args.slice(0,3),'https://wrong.example',actor.subject]),{code:'42501'});await db.exec('ROLLBACK')
  await begin(db);await db.query(prepare,args);await db.query(copy,args.slice(0,3))
  await assert.rejects(()=>db.query(prepare,['00000000-0000-4000-8000-000000000099',request,...args.slice(2)]),{code:'40001'});await db.exec('ROLLBACK')
  await begin(db);await assert.rejects(()=>db.query(prepare,['00000000-0000-4000-8000-000000000099',request,...args.slice(2)]),{code:'P0002'});await db.exec('ROLLBACK')
 }finally{await db.close()}
})
test('actual repository rejects unadmitted child video before copying; admitted copy and late failure remain atomic',async()=>{
 const db=await createDuplicateFixture()
 try{
  await db.query("INSERT INTO public.product_variant_media_items(product_id,media_type,media_path,is_default_fallback) VALUES($1,'video','https://media.houseofdiams.com/products/videos/fixture.mp4',true)",[duplicateSource])
  admission='denied';resolutions=0;await begin(db)
  await assert.rejects(()=>createProductRepository(db).duplicate(actor,duplicateSource,request),/Unadmitted video/);assert.equal(resolutions,1);await db.exec('ROLLBACK')
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.product_duplicate_requests')).rows[0].count,0)
  admission='admitted';await begin(db);const copyResult=await createProductRepository(db).duplicate(actor,duplicateSource,request);assert.ok(copyResult.product_id);await db.exec('ROLLBACK')
  await db.exec(`CREATE FUNCTION public.fail_duplicate13() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Late fixture failure';END$$;
   CREATE TRIGGER fail_duplicate13 BEFORE UPDATE ON public.product_duplicate_requests FOR EACH ROW EXECUTE FUNCTION public.fail_duplicate13();`)
  await begin(db);await assert.rejects(()=>createProductRepository(db).duplicate(actor,duplicateSource,request),/Late fixture failure/);await db.exec('ROLLBACK')
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.products')).rows[0].count,1)
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.product_duplicate_requests')).rows[0].count,0)
 }finally{await db.close()}
})
test('generated forward runs real owner probe, preserves graph rights and reverses; drift/replay rejected',async()=>{
 const db=await createDuplicateFixture({capability:false})
 try{
  const metadata=structuredClone(duplicateMetadata)
  for(const t of metadata.tables)Object.assign(t,(await db.query(`SELECT ${contentSnapshotSql()} AS snapshot,md5((${contentSnapshotSql()})::text) AS fingerprint FROM pg_class c WHERE c.oid=to_regclass($1)`,[t.name])).rows[0])
  const packet=buildDuplicatePacket(metadata),local=s=>s.replace("current_database()<>'hod_staging'","current_database()<>'postgres'")
  await db.exec('SET SESSION AUTHORIZATION hod_dev_migration')
  await assert.rejects(()=>db.exec(packet.forward),/Use HOD Staging/);await db.exec('ROLLBACK;RESET ROLE')
  await db.exec(local(packet.forward));assert.equal((await inspectDuplicateCapability(db,packet)).ok,true)
  await db.exec('SET ROLE hod_migration')
  assert.equal((await db.query("SELECT count(*)::int AS count FROM public.products WHERE sku LIKE 'AWS-PROBE-%'")).rows[0].count,0)
  await db.exec('RESET ROLE')
  const acl=(await db.query(`SELECT has_function_privilege('hod_app',$1,'EXECUTE') AS public,has_function_privilege('hod_admin_app',$1,'EXECUTE') AS admin,
   has_table_privilege('hod_admin_app','public.product_duplicate_requests','INSERT,UPDATE,DELETE') AS receipt_write`,[duplicateSignature])).rows[0]
  assert.deepEqual(acl,{public:false,admin:true,receipt_write:false})
  await assert.rejects(()=>db.exec(local(packet.forward)),/already exists/);await db.exec('ROLLBACK;RESET ROLE')
  await db.exec('SET ROLE hod_migration;ALTER TABLE public.products ADD COLUMN unreviewed13 text;RESET ROLE')
  await assert.rejects(()=>db.exec(local(packet.inverse)),/dependency.*differs/);await db.exec('ROLLBACK;RESET ROLE')
  await db.exec('SET ROLE hod_migration;ALTER TABLE public.products DROP COLUMN unreviewed13;RESET ROLE')
  await db.exec(`SET ROLE hod_migration;GRANT EXECUTE ON FUNCTION ${duplicateSignature} TO PUBLIC;RESET ROLE`)
  await assert.rejects(()=>db.exec(local(packet.inverse)),/capability.*differ/);await db.exec('ROLLBACK;RESET ROLE')
  assert.equal((await inspectDuplicateCapability(db,packet)).ok,false)
  await db.exec(`SET ROLE hod_migration;REVOKE EXECUTE ON FUNCTION ${duplicateSignature} FROM PUBLIC;RESET ROLE`)
  await db.exec(local(packet.inverse));assert.equal((await inspectDuplicateCapability(db,packet)).ok,false)
  assert.equal((await db.query('SELECT to_regprocedure($1) IS NULL AS absent',[duplicateSignature])).rows[0].absent,true)
 }finally{await db.close()}
})
test('saved packet bytes match generator; helper contains no broad table locks or source writes',()=>{
 const packet=buildDuplicatePacket(duplicateMetadata),saved=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-13-duplicate-scope.json','utf8'))
 for(const [mode,key] of [['forward','sql_sha256'],['inverse','inverse_sha256']]){const sql=fs.readFileSync(`docs/aws-phase-d/ADMIN-RDS-13-duplicate-${mode}.sql`,'utf8');assert.equal(packet[mode],sql);assert.equal(createHash('sha256').update(sql).digest('hex'),saved[key])}
 assert.ok(!/LOCK TABLE|\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/i.test(duplicateBody))
 assert.ok(!/GRANT\s+(?:UPDATE|INSERT|DELETE|ALL)|ALTER\s+(?:ROLE|FUNCTION)|CREATE\s+(?:ROLE|TRIGGER)/i.test(packet.forward))
 assert.match(packet.forward,/ROLLBACK TO SAVEPOINT admin_duplicate13_acceptance/)
})
