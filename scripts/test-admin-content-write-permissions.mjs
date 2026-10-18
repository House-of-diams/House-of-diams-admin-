import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {createHash,randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {contentSnapshotSql,contentSequenceAclSql,contentSchemaAclSql} from './admin-content-permission-snapshot.mjs'
import {inspectContentInstallation} from './admin-content-installation-check.mjs'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
import {buildContentPacket} from './build-admin-content-write-packet.mjs'
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const manifest=read('docs/aws-phase-d/D1e-minimum-grant-manifest.json')
const live=read('docs/aws-phase-d/ADMIN-RDS-10-content-write-preflight.json')
const qi=s=>'"'+s.replaceAll('"','""')+'"'
const local=sql=>sql.replace("current_database()<>'hod_staging'","current_database()<>'postgres'")
const actor='00000000-0000-4000-8000-000000000001'
async function fixture(){
 const db=new PGlite()
 try {
 await db.exec(`CREATE ROLE hod_migration LOGIN NOINHERIT;CREATE ROLE hod_dev_migration LOGIN NOINHERIT;
 CREATE ROLE hod_admin_app NOLOGIN NOINHERIT;CREATE ROLE hod_app NOLOGIN;CREATE ROLE audit_reader NOLOGIN;
 GRANT hod_migration TO hod_dev_migration WITH INHERIT FALSE,SET TRUE;
 GRANT CREATE,USAGE ON SCHEMA public TO hod_migration;
 GRANT USAGE ON SCHEMA public TO hod_admin_app,hod_app,audit_reader;
 CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';
 ALTER SCHEMA auth OWNER TO hod_migration;GRANT USAGE ON SCHEMA auth TO hod_app;
 CREATE SEQUENCE public.blog_post_products_id_seq;ALTER SEQUENCE public.blog_post_products_id_seq OWNER TO hod_migration;
 GRANT USAGE ON SEQUENCE public.blog_post_products_id_seq TO hod_app;`)
 const types=[...new Set(live.tables.flatMap(t=>t.snapshot.columns.map(c=>c.type)))]
 for(const type of types){
  if((await db.query('SELECT to_regtype($1) AS t',[type])).rows[0].t===null){
   assert.match(type,/^[a-z_]+$/)
   await db.exec(`CREATE TYPE ${qi(type)} AS ENUM('draft','active','hidden','image','video','admin','user')`)
  }
 }
 for(const t of live.tables){
  const columns=t.snapshot.columns.map(c=>{
   let extra=''
   if(c.name==='id')extra=c.identity?' GENERATED ALWAYS AS IDENTITY PRIMARY KEY':c.type==='uuid'?' DEFAULT gen_random_uuid() PRIMARY KEY':' PRIMARY KEY'
   if(c.type==='timestamp with time zone')extra+=' DEFAULT now()'
   return qi(c.name)+' '+c.type+extra
  })
  if(t.name==='public.cms_save_receipts')columns.push('PRIMARY KEY(actor_id,request_id)')
  if(['public.certifications_section','public.home_instagram_reels_section'].includes(t.name))columns.push('UNIQUE(section_key)')
  await db.exec(`CREATE TABLE ${t.name}(${columns.join(',')});
   ALTER TABLE ${t.name} ENABLE ROW LEVEL SECURITY;
   GRANT SELECT ON ${t.name} TO hod_app;
   GRANT SELECT(${qi(t.snapshot.columns[0].name)}) ON ${t.name} TO audit_reader;
   CREATE POLICY retained_storefront ON ${t.name} FOR ALL TO hod_app USING(false) WITH CHECK(false);
   ALTER TABLE ${t.name} OWNER TO hod_migration;`)
  if(t.select_all)await db.exec(`GRANT SELECT ON ${t.name} TO hod_admin_app;CREATE POLICY retained_admin_read ON ${t.name} FOR SELECT TO hod_admin_app USING(true)`)
  else if(t.select_columns?.length)await db.exec(`GRANT SELECT(${t.select_columns.map(qi).join(',')}) ON ${t.name} TO hod_admin_app;CREATE POLICY retained_admin_read ON ${t.name} FOR SELECT TO hod_admin_app USING(true)`)
 }
 await db.exec(`CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS
 $$SELECT EXISTS(SELECT FROM public.profiles WHERE id=auth.uid() AND role='admin')$$;
 CREATE POLICY legacy_profiles_public ON public.profiles TO PUBLIC USING(is_admin());
 INSERT INTO public.profiles(id,role) VALUES('${actor}','admin');`)
 // Use all 27 actual audited routine definitions, not test substitutes.
 for(const r of manifest.routines){
  const metadata=JSON.parse(fs.readFileSync(r.source,'utf8').replace(/^\uFEFF/,''))
  const definition=metadata.functions.find(f=>f.name===r.name&&f.arguments===r.arguments)?.definition
  assert.ok(definition)
  await db.exec(definition)
  const signature='public.'+r.name+'('+r.arguments.replace(/\bp_[a-z0-9_]+\s+/g,'')+')'
  await db.exec(`ALTER FUNCTION ${signature} OWNER TO hod_migration`)
 }
 const current=structuredClone(live)
 for(const t of current.tables){
  const {rows}=await db.query(`SELECT ${contentSnapshotSql()} AS snapshot,
   md5((${contentSnapshotSql()})::text) AS fingerprint,
   md5((${contentSnapshotSql({preservedOnly:true})})::text) AS preserved_fingerprint
   FROM pg_class c WHERE c.oid=to_regclass($1)`,[t.name])
  Object.assign(t,rows[0])
 }
 current.routines=(await db.query(`SELECT signature,p.prosecdef AS definer,p.proowner::regrole::text AS owner,
  encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS sha256,true AS executable
  FROM unnest($1::text[]) s(signature) JOIN pg_proc p ON p.oid=to_regprocedure(signature)`,[live.routines.map(r=>r.signature)])).rows
 current.sequences=(await db.query(`SELECT 'public.blog_post_products_id_seq' AS name,c.relowner::regrole::text AS owner,
 ${contentSequenceAclSql} AS acl_hash,false AS accessible FROM pg_class c WHERE c.oid='public.blog_post_products_id_seq'::regclass`)).rows
 await db.exec('ALTER FUNCTION auth.uid() OWNER TO hod_migration')
 current.auth_schema=(await db.query(`SELECT 'hod_migration' AS owner,false AS usage,false AS create,
  ${contentSchemaAclSql()} AS acl_hash,${contentSchemaAclSql(true)} AS preserved_hash FROM pg_namespace n WHERE nspname='auth'`)).rows[0]
 current.auth_helpers=(await db.query(`SELECT p.oid::regprocedure::text AS signature,'hod_migration' AS owner,false AS definer,true AS executable,
  encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS sha256 FROM pg_proc p WHERE p.oid='auth.uid()'::regprocedure`)).rows
 const packet=buildContentPacket(manifest,current)
 await db.exec('SET SESSION AUTHORIZATION hod_dev_migration')
 return {db,packet,current}
 }catch(error){await db.close();throw error}
}
async function rejectPacket(db,sql,pattern){
 await assert.rejects(()=>db.exec(sql),pattern)
 await db.exec('ROLLBACK;RESET ROLE')
}
test('content SQL hashes match the reviewed source scopes; no function/role/business changes',()=>{
 const saved=read('docs/aws-phase-d/ADMIN-RDS-10-content-write-scope.json')
 const packet=buildContentPacket(manifest,live)
 for(const [kind,key] of [['forward','sql_sha256'],['inverse','inverse_sha256']]){
  const source=fs.readFileSync(`docs/aws-phase-d/ADMIN-RDS-10-content-write-${kind}.sql`,'utf8')
  assert.equal(source,packet[kind]);assert.equal(createHash('sha256').update(source).digest('hex'),saved[key])
 }
 assert.equal(packet.scope.length,66);assert.equal(packet.policies.length,174)
 assert.ok(!/CREATE (?:OR REPLACE )?(?:FUNCTION|ROLE)|ALTER (?:FUNCTION|ROLE)|GRANT ALL|ALL SEQUENCES/i.test(packet.forward))
 assert.deepEqual(packet.scope.find(s=>s.name==='public.profiles').added_read,['id','role'])
 assert.ok(packet.scope.every(s=>!['public.products','public.orders','public.admin_identities'].includes(s.name)))
})
test('content installation supports actual receipt/idempotency/revision CMS saves while preserving storefront and profile privacy',async()=>{
 const {db,packet,current}=await fixture()
 try{
  assert.equal((await inspectContentInstallation(db,packet)).ok,false)
  await db.exec(local(packet.forward))
  assert.equal((await inspectContentInstallation(db,packet)).ok,true)
  await db.exec('SET SESSION AUTHORIZATION postgres;SET ROLE hod_admin_app')
  const snapshot=async()=> (await db.query("SELECT public.cms_content_list_snapshot_v1('about_founders') AS result")).rows[0].result
  const save=async(revision,items,deleted=[],request=randomUUID())=>(await db.query(
   'SELECT public.cms_save_content_list_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb,$6::text[]) AS result',
   [actor,request,revision,'about_founders',JSON.stringify(items),deleted])).rows[0].result
  assert.equal((await db.query('SELECT id,role FROM public.profiles')).rows.length,1)
  await assert.rejects(()=>db.query('SELECT email FROM public.profiles'),{code:'42501'})
  await assert.rejects(()=>db.query("UPDATE public.profiles SET role='user'"),{code:'42501'})
  const before=await snapshot(),request=randomUUID()
  const item={name:'AWS permission fixture',designation:'test',bio:'temporary',image_path:'fixture.webp'}
  const created=await save(before.revision,[item],[],request)
  assert.equal(created.items.length,1)
  assert.deepEqual(await save(before.revision,[item],[],request),created)
  await assert.rejects(()=>save(before.revision,[{...item,name:'stale'}]),{code:'40001'})
  await assert.rejects(()=>save(before.revision,[{...item,name:'changed request'}],[],request))
  const updated=await save(created.revision,[{...created.items[0],name:'Updated fixture'}])
  assert.equal(updated.items[0].name,'Updated fixture')
  const removed=await save(updated.revision,[],[String(updated.items[0].id)])
  assert.equal(removed.items.length,0)
  await assert.rejects(()=>db.query('DELETE FROM public.cms_save_receipts'),{code:'42501'})
  await assert.rejects(()=>db.query('UPDATE public.cms_save_receipts SET result=\'{}\''),{code:'42501'})
  await assert.rejects(()=>db.query('UPDATE public.about_founders SET created_at=now()'),{code:'42501'})
  const certBefore=(await db.query("SELECT public.cms_home_group1_snapshot_v1('certifications') AS result")).rows[0].result
  const certSaved=(await db.query('SELECT public.cms_save_home_group1_v1($1,$2,$3,$4,$5,$6,$7) AS result',
   [actor,randomUUID(),certBefore.revision,'certifications',JSON.stringify({eyebrow:'Fixture',heading:'Certifications'}),'[]',[]])).rows[0].result
  assert.equal(certSaved.section.heading,'Certifications')
  const reelsBefore=(await db.query('SELECT public.cms_reels_snapshot_v1() AS result')).rows[0].result
  const reelsSaved=(await db.query('SELECT public.cms_save_reels_v1($1,$2,$3,$4,$5,$6) AS result',
   [actor,randomUUID(),reelsBefore.revision,JSON.stringify({heading:'Fixture reels',subtitle:'',is_enabled:false,marquee_duration_seconds:30,pause_on_hover:true}),'[]',[]])).rows[0].result
  assert.equal(reelsSaved.section.heading,'Fixture reels')
  const load=createSourceLoader(process.cwd())
  const {createCmsRepository}=await import(await load('lib/db/admin-repositories/cms.ts'))
  const repo=createCmsRepository(db,{profileId:actor})
  const faqInput={p_request_id:randomUUID(),p_expected_revision:null,p_id:null,p_item:{name:'FAQ fixture',slug:'aws-faq-fixture',description:'',image_path:null,image_alt:'',sort_order:1000000,is_active:false}}
  const faq=await repo.execute('cms_save_support_faq_category_v1',faqInput)
  assert.deepEqual(await repo.execute('cms_save_support_faq_category_v1',faqInput),faq)
  const edited=await repo.execute('cms_save_support_faq_category_v1',{...faqInput,p_request_id:randomUUID(),p_id:faq.category.id,
   p_expected_revision:faq.category._revision,p_item:{...faqInput.p_item,name:'Updated FAQ fixture'}})
  assert.equal(edited.category.name,'Updated FAQ fixture')
  await assert.rejects(()=>repo.execute('cms_save_support_faq_category_v1',{...faqInput,p_request_id:randomUUID(),p_id:faq.category.id,p_expected_revision:faq.category._revision}),{code:'40001'})
  assert.equal((await repo.execute('cms_delete_support_faq_category_v1',{p_request_id:randomUUID(),p_id:faq.category.id,p_expected_revision:edited.category._revision})).ok,true)
  // A lock-only DELETE capability must never delete rows, even when an old
  // permissive PUBLIC policy would otherwise allow it.
  for(const r of packet.scope.filter(s=>s.lock_delete)){
   await db.exec(`RESET ROLE;SET ROLE hod_migration;INSERT INTO ${r.name} DEFAULT VALUES;
    CREATE POLICY shared_delete ON ${r.name} FOR DELETE TO PUBLIC USING(true);RESET ROLE;SET ROLE hod_admin_app`)
   await db.exec(`BEGIN;LOCK TABLE ${r.name} IN SHARE ROW EXCLUSIVE MODE;ROLLBACK`)
   assert.equal((await db.query(`DELETE FROM ${r.name} RETURNING *`)).rows.length,0)
   await db.exec(`RESET ROLE;SET ROLE hod_migration;DROP POLICY shared_delete ON ${r.name};RESET ROLE;SET ROLE hod_admin_app`)
  }
  await db.exec('RESET ROLE;SET ROLE hod_app')
  assert.equal((await db.query('SELECT * FROM public.about_founders')).rows.length,0)
  await db.exec('RESET ROLE;SET SESSION AUTHORIZATION hod_dev_migration')
  await rejectPacket(db,local(packet.forward),/already installed/)
  await db.exec(local(packet.inverse))
  for(const t of current.tables){
   const {rows}=await db.query(`SELECT md5((${contentSnapshotSql()})::text) AS fingerprint FROM pg_class c WHERE c.oid=to_regclass($1)`,[t.name])
   assert.equal(rows[0].fingerprint,t.fingerprint)
  }
 }finally{await db.close()}
})
test('wrong target, changed columns/policies/triggers and inverse drift abort atomically',async()=>{
 const {db,packet}=await fixture()
 try{
  await rejectPacket(db,packet.forward,/Use HOD Staging/)
  await db.exec('SET ROLE hod_migration;ALTER TABLE public.about_founders ADD COLUMN unreviewed text;RESET ROLE')
  await rejectPacket(db,local(packet.forward),/prestate differs/)
  await db.exec('SET ROLE hod_migration;ALTER TABLE public.about_founders DROP COLUMN unreviewed;RESET ROLE')
  // Dropping a column leaves its attnum gap: snapshots omit dropped columns, so exact live state is restored.
  await db.exec(local(packet.forward))
  await db.exec('SET ROLE hod_migration;ALTER POLICY hod_admin_content10_insert ON public.about_founders WITH CHECK(false);RESET ROLE')
  await rejectPacket(db,local(packet.inverse),/policy scope differs/)
  assert.equal((await db.query("SELECT has_column_privilege('hod_admin_app','public.about_founders','name','INSERT') AS allowed")).rows[0].allowed,true)
 }finally{await db.close()}
})
