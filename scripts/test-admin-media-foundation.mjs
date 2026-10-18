import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {randomUUID,createHash} from 'node:crypto'
import {createMediaFixture,mediaFixtureActor as actor} from './admin-media-test-fixture.mjs'
import {mediaSources,mediaPolicy,mediaCoreSql} from './admin-media-schema-sql.mjs'
import {mediaCatalogSql,inspectMediaCatalog} from './admin-media-catalog.mjs'
import {buildMediaPacket,expectedMediaManifest} from './build-admin-media-packet.mjs'
import {contentSnapshotSql} from './admin-content-permission-snapshot.mjs'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
const load=createSourceLoader(process.cwd())
const {createAdmissionRepository}=await import(await load('lib/db/admin-repositories/video-admission.ts'))
const {createVideoAdmission}=await import(await load('lib/video-admission.ts'))
const {withAdminTransaction}=await import(await load('lib/db/query.ts'))
const bytes=Buffer.from([0,0,0,12,0x66,0x74,0x79,0x70,0,0,0,0])
function record(extra={}){const id=randomUUID(),key='products/videos/'+id+'.mp4';return {id,operationId:randomUUID(),actorId:actor.profileId,
 actorIssuer:actor.issuer,actorSubject:actor.subject,...mediaSources[0],key,url:mediaSources[0].baseUrl+'/'+key,
 sha256:createHash('sha256').update(bytes).digest('base64'),size:bytes.length,mime:'video/mp4',version:null,policy:mediaPolicy,
 verifier:'hod-container-head-v1',evidence:'new-upload-intent',status:'pending',...extra}}
const pool=db=>({async connect(){return {query:(...a)=>db.query(...a),release(){}}}})
async function app(db){await db.exec('SET SESSION AUTHORIZATION hod_admin_login_uat')}
// PGlite RESET SESSION AUTHORIZATION retains its last configured role; restore
// the fixture's original superuser explicitly. This is never used on real RDS.
async function owner(db){await db.exec('SET SESSION AUTHORIZATION postgres;SET ROLE hod_migration')}
async function ready(db){await db.exec('SET ROLE hod_migration;UPDATE admin_media.policy SET enabled=true;RESET ROLE');await app(db)}
test('actual repository durable reserve/admit/replay and policy/status row locks work under isolated runtime RLS',async()=>{
 const db=await createMediaFixture()
 try{
  await db.exec(`INSERT INTO public.admin_identities(issuer,subject,profile_id,enabled) VALUES('${actor.issuer}','second-active-identity','${actor.profileId}',true)`)
  await ready(db);const objects=new Map(),calls=[]
  const dispatch=async c=>{calls.push(c.constructor.name);const p=c.input;if(c.constructor.name==='PutObjectCommand'){
   assert.equal(p.IfNoneMatch,'*');if(objects.has(p.Key))throw Error('No overwrite');objects.set(p.Key,{ChecksumSHA256:p.ChecksumSHA256,ContentLength:p.ContentLength,ContentType:p.ContentType,VersionId:'fixture-v1'});return {VersionId:'fixture-v1'}
  }return objects.get(p.Key)??{}}
  const run=fn=>withAdminTransaction(pool(db),'hod_admin_login_uat',fn)
  const repo={reserve:r=>run(d=>createAdmissionRepository(d).reserve(r)),admit:r=>run(d=>createAdmissionRepository(d).admit(r)),
   reject:id=>run(d=>createAdmissionRepository(d).reject(id)),find:url=>run(d=>createAdmissionRepository(d).find(url))}
  const op=randomUUID(),service=createVideoAdmission(repo,dispatch,mediaPolicy)
  const first=await service.upload(mediaSources[0],bytes,'video/mp4',actor,op)
  assert.equal(first.actorIssuer,actor.issuer);assert.equal(first.actorSubject,actor.subject);assert.equal(first.status,'admitted')
  const replay=await service.upload(mediaSources[0],bytes,'video/mp4',actor,op);assert.deepEqual(replay,first)
  await assert.rejects(()=>service.upload(mediaSources[0],bytes,'video/mp4',{...actor,subject:'second-active-identity'},op),/Admission operation conflict/)
  assert.equal(calls.filter(x=>x==='PutObjectCommand').length,1)
  assert.equal((await repo.find(first.url)).id,first.id)
  await run(d=>d.query('SELECT singleton FROM admin_media.policy WHERE singleton FOR SHARE'))
  await assert.rejects(()=>run(d=>d.query('UPDATE admin_media.policy SET singleton=singleton WHERE singleton')),{sqlState:'42501'})
  await assert.rejects(()=>run(d=>d.query('SELECT * FROM admin_media.audit')),{sqlState:'42501'})
  await assert.rejects(()=>run(d=>d.query('SET LOCAL ROLE hod_migration')),{sqlState:'42501'})
  await assert.rejects(()=>run(d=>d.query("UPDATE admin_media.admissions SET status='rejected' WHERE admission_id=$1",[first.id])),{sqlState:'42501'})
  await owner(db);assert.equal((await db.query("SELECT count(*)::int AS count FROM admin_media.audit WHERE relation_name='admissions'")).rows[0].count,2)
 }finally{await db.close()}
})
test('disabled policy and exact identity/source/checksum/size/MIME constraints fail closed without pending rows',async()=>{
 const db=await createMediaFixture()
 try{
  await app(db);const run=fn=>withAdminTransaction(pool(db),'hod_admin_login_uat',fn)
  await assert.rejects(()=>run(d=>createAdmissionRepository(d).reserve(record())),{sqlState:'42501'})
  await owner(db);await db.exec("UPDATE admin_media.policy SET enabled=true;INSERT INTO public.admin_identities(issuer,subject,profile_id,enabled) VALUES('https://fixture.other','other','133321f4-53bb-4ef1-a9d6-7d0031080b75',true)");await app(db)
  for(const [extra,code] of [[{actorSubject:'wrong'},'42501'],[{actorIssuer:'https://wrong.example'},'42501'],[{bucket:'wrong-bucket'},'42501'],
   [{url:'https://wrong.example/video.mp4'},'42501'],[{size:104857601},'23514'],[{sha256:'bad'},'23514'],[{mime:'video/webm'},'42501']]){
   await assert.rejects(()=>run(d=>createAdmissionRepository(d).reserve(record(extra))),{sqlState:code})
  }
  await owner(db);await db.query('UPDATE public.admin_identities SET enabled=false WHERE issuer=$1 AND subject=$2',[actor.issuer,actor.subject]);await app(db)
  await assert.rejects(()=>run(d=>createAdmissionRepository(d).reserve(record())),{sqlState:'42501'})
  await owner(db);assert.equal((await db.query('SELECT count(*)::int AS count FROM admin_media.admissions')).rows[0].count,0)
 }finally{await db.close()}
})
test('immutable tuple, historical enrollment, rejected replay and audit failure cannot bypass transitions',async()=>{
 const db=await createMediaFixture()
 try{
  await ready(db);const run=fn=>withAdminTransaction(pool(db),'hod_admin_login_uat',fn),r=record()
  await run(d=>createAdmissionRepository(d).reserve(r))
  await assert.rejects(()=>run(d=>d.query('UPDATE admin_media.admissions SET object_key=$1 WHERE admission_id=$2',['products/videos/changed.mp4',r.id])),{sqlState:'42501'})
  await assert.rejects(()=>run(d=>d.query('DELETE FROM admin_media.admissions WHERE admission_id=$1',[r.id])),{sqlState:'42501'})
  await assert.rejects(()=>run(d=>d.query('UPDATE admin_media.admissions SET actor_subject=$1 WHERE admission_id=$2',['changed',r.id])),{sqlState:'42501'})
  const historical=record()
  await assert.rejects(()=>run(d=>d.query(`INSERT INTO admin_media.admissions(admission_id,operation_id,actor_id,actor_issuer,actor_subject,bucket,object_key,canonical_url,sha256,byte_length,mime,policy,verifier,evidence)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'historical-current-object')`,[historical.id,historical.operationId,historical.actorId,historical.actorIssuer,historical.actorSubject,historical.bucket,historical.key,historical.url,historical.sha256,historical.size,historical.mime,historical.policy,historical.verifier])),{sqlState:'42501'})
  await owner(db);await db.query('UPDATE public.admin_identities SET enabled=false WHERE issuer=$1 AND subject=$2',[actor.issuer,actor.subject]);await app(db)
  await run(d=>createAdmissionRepository(d).reject(r.id))
  await assert.rejects(()=>run(d=>createAdmissionRepository(d).admit({...r,version:'v1',status:'admitted'})),/Admin database operation failed/)
  await owner(db);await db.exec("UPDATE public.admin_identities SET enabled=true;CREATE FUNCTION admin_media.fail_fixture14() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Audit fixture failure';END$$;CREATE TRIGGER fail_fixture14 BEFORE INSERT ON admin_media.audit FOR EACH ROW EXECUTE FUNCTION admin_media.fail_fixture14();");await app(db)
  const fail=record();await assert.rejects(()=>run(d=>createAdmissionRepository(d).reserve(fail)),/Admin database operation failed/)
  await owner(db);assert.equal((await db.query('SELECT count(*)::int AS count FROM admin_media.admissions WHERE admission_id=$1',[fail.id])).rows[0].count,0)
 }finally{await db.close()}
})
test('generated packet installs disabled foundation, owner DB-only probe cleans up, drift and populated inverse fail safely',async()=>{
 const db=await createMediaFixture({schema:false})
 try{
  const preflight=structuredClone(JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-14-media-preflight.json','utf8')))
  await db.exec('SET search_path=pg_catalog,public,pg_temp')
  for(const t of preflight.tables)Object.assign(t,(await db.query(`SELECT ${contentSnapshotSql()} AS snapshot,md5((${contentSnapshotSql()})::text) AS fingerprint FROM pg_class c WHERE c.oid=to_regclass($1)`,[t.name])).rows[0])
  const packet=buildMediaPacket(preflight,await expectedMediaManifest()),local=s=>s.replace("current_database()<>'hod_staging'","current_database()<>'postgres'")
  await db.exec('SET SESSION AUTHORIZATION hod_dev_migration')
  await assert.rejects(()=>db.exec(packet.forward),/Use HOD Staging/);await db.exec('ROLLBACK;RESET ROLE')
  await db.exec(local(packet.forward));await db.exec('SET ROLE hod_migration');const proof=await inspectMediaCatalog(db,packet.manifest);assert.equal(proof.ok,true);assert.equal(proof.policy_disabled,true);await db.exec('RESET ROLE')
  await assert.rejects(()=>db.exec(local(packet.forward)),/already exists/);await db.exec('ROLLBACK;RESET ROLE')
  await db.exec('SET ROLE hod_migration;GRANT SELECT ON admin_media.audit TO hod_admin_app;RESET ROLE')
  await assert.rejects(()=>db.exec(local(packet.inverse)),/manifest differs/);await db.exec('ROLLBACK;RESET ROLE')
  await db.exec('SET ROLE hod_migration;REVOKE SELECT ON admin_media.audit FROM hod_admin_app;UPDATE admin_media.policy SET enabled=true;RESET ROLE')
  await assert.rejects(()=>db.exec(local(packet.inverse)),/rows\/activation\/audit differ/);await db.exec('ROLLBACK;RESET ROLE')
  await db.exec("SET ROLE hod_migration;UPDATE admin_media.policy SET enabled=false;DELETE FROM admin_media.audit WHERE operation='UPDATE';RESET ROLE")
  await db.exec(local(packet.inverse));assert.equal((await db.query("SELECT to_regnamespace('admin_media') IS NULL AS absent")).rows[0].absent,true)
  for(const t of preflight.tables)assert.equal((await db.query(`SELECT md5((${contentSnapshotSql()})::text) AS fingerprint FROM pg_class c WHERE c.oid=to_regclass($1)`,[t.name])).rows[0].fingerprint,t.fingerprint)
 }finally{await db.close()}
})
test('packet bytes and OID-independent manifest reproduce without old review guards or shared object changes',async()=>{
 const scope=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-14-media-scope.json','utf8'))
 const preflight=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-14-media-preflight.json','utf8'))
 const packet=buildMediaPacket(preflight,scope.manifest)
 for(const [mode,key] of [['forward','sql_sha256'],['inverse','inverse_sha256']]){const sql=fs.readFileSync(`docs/aws-phase-d/ADMIN-RDS-14-media-${mode}.sql`,'utf8');assert.equal(packet[mode],sql);assert.equal(createHash('sha256').update(sql).digest('hex'),scope[key])}
 assert.ok(!/ALTER ROLE|CREATE ROLE|ALTER TABLE public\.|GRANT .+ ON public\.|CASCADE/.test(packet.forward+packet.inverse))
 assert.match(packet.forward,/ROLLBACK TO SAVEPOINT admin_media14_acceptance/)
 const db=await createMediaFixture();try{await db.exec('SET search_path=pg_catalog,public,pg_temp');assert.deepEqual((await db.query(`SELECT ${mediaCatalogSql} AS manifest`)).rows[0].manifest,scope.manifest)}finally{await db.close()}
 assert.equal(createHash('sha256').update(mediaCoreSql).digest('hex'),scope.core_sha256)
})
