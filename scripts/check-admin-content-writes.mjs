// --prepare: READ ONLY. --run-rollback: one fresh, disabled FAQ category only.
// No existing content edits, emails, uploads, provider changes or listener.
import fs from 'node:fs'
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {Pool} from 'pg'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
import {createRollbackPool} from './admin-rds-rollback-pool.mjs'
import {inspectContentInstallation} from './admin-content-installation-check.mjs'
const mode=process.argv[2]
if(!['--prepare','--run-rollback'].includes(mode)){
 console.log(JSON.stringify({ok:false,code:'EXPLICIT_MODE_REQUIRED'}));process.exit(1)
}
const require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const packet=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-10-content-write-scope.json','utf8'))
const expected=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-10-content-write-preflight.json','utf8'))
const marker='aws-probe-'+randomUUID(),requests=[randomUUID(),randomUUID(),randomUUID()]
let pool,verifyAbsent,creationAttempted=false,rolledBack=false,fixtureId=null,stage='configuration'
try{
 const load=createSourceLoader(process.cwd())
 const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
 const {withAdminTransaction}=await import(await load('lib/db/query.ts'))
 const {createAdminIdentityLookup}=await import(await load('lib/db/admin-repositories/identity-core.ts'))
 const {createCmsRepository}=await import(await load('lib/db/admin-repositories/cms.ts'))
 const config=readAdminDbConfig(process.env,p=>fs.readFileSync(p,'utf8'))
 if(config.pool.database!=='hod_staging'||config.loginRole!=='hod_admin_login_uat')throw new Error('Wrong target')
 pool=new Pool(config.pool);pool.on('error',()=>{})
 const rollbackPool=createRollbackPool(pool,{onRollback(){rolledBack=true}})
 stage='installation'
 const proof=await withAdminTransaction(pool,config.loginRole,async db=>{
  const installation=await inspectContentInstallation(db,packet)
  const identities=await createAdminIdentityLookup(db)('https://auth-uat.houseofdiams.com/realms/houseofdiams','1167a5b6-9fcb-45d1-b7d8-53e95cd49704')
  if(identities.length!==1||!identities[0].enabled||identities[0].revokedAt!==null||identities[0].profileRole!=='admin'
   ||identities[0].profileId!=='133321f4-53bb-4ef1-a9d6-7d0031080b75')throw new Error('Identity mismatch')
  const routines=(await db.query(`SELECT signature,p.prosecdef AS definer,p.proowner::regrole::text AS owner,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS sha256
   FROM unnest($1::text[]) s(signature)
   LEFT JOIN (SELECT p.*,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace) p
   ON replace(p.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')',' ','')=replace(signature,' ','')`,
   [[...expected.routines,...expected.auth_helpers].map(r=>r.signature)])).rows
  if(routines.some(r=>{const e=[...expected.routines,...expected.auth_helpers].find(x=>x.signature===r.signature);return !e||r.definer!==e.definer||r.owner!==e.owner||r.sha256!==e.sha256}))throw new Error('Routine drift')
  return {installation,actor:{profileId:identities[0].profileId}}
 },{snapshot:true})
 if(mode==='--prepare'){
  const report={ok:true,write_test_ready:proof.installation.ok,read_only:true,checks:proof.installation,
   business_rows_read:false,identity_data_read:true,providers_changed:false,server_started:false}
  fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-10-runtime-preparation.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({ok:true,write_test_ready:report.write_test_ready,tables_checked:66,
   tables_ready:report.checks.tables.filter(t=>t.ok).length,read_only:true,business_rows_read:false,identity_data_read:true}))
 }else{
  if(!proof.installation.ok)throw new Error('Install reviewed packet first')
  verifyAbsent=()=>withAdminTransaction(pool,config.loginRole,async db=>{
   const result=await db.query(`SELECT NOT EXISTS(SELECT FROM public.support_faq_categories WHERE slug=$1::text OR id=$2::bigint)
    AND NOT EXISTS(SELECT FROM public.cms_save_receipts WHERE actor_id=$3::uuid AND request_id=ANY($4::uuid[])) AS absent`,
    [marker,fixtureId,proof.actor.profileId,requests])
   return result.rows[0]?.absent===true
  },{snapshot:true})
  if(!await verifyAbsent())throw new Error('Fixture already exists')
  const result=await withAdminTransaction(rollbackPool,config.loginRole,async db=>{
   await db.query("SET LOCAL lock_timeout='2s'");await db.query("SET LOCAL statement_timeout='15s'")
   const repo=createCmsRepository(db,proof.actor)
   const item={name:'AWS-PROBE-'+marker.slice(10),slug:marker,description:'Temporary migration probe',
    image_path:null,image_alt:'',sort_order:1000000,is_active:false}
   const input={p_request_id:requests[0],p_expected_revision:null,p_id:null,p_item:item}
   stage='fixture_create';creationAttempted=true
   const created=await repo.execute('cms_save_support_faq_category_v1',input)
   fixtureId=String(created.category.id)
   if(created.category.slug!==marker||created.category.is_active!==false)throw new Error('Unexpected fixture')
   stage='fixture_replay'
   const replay=await repo.execute('cms_save_support_faq_category_v1',input)
   if(JSON.stringify(created)!==JSON.stringify(replay))throw new Error('Replay mismatch')
   stage='fixture_update'
   const updated=await repo.execute('cms_save_support_faq_category_v1',{p_request_id:requests[1],p_id:fixtureId,
    p_expected_revision:created.category._revision,p_item:{...item,name:item.name+' Updated'}})
   if(updated.category.name!==item.name+' Updated')throw new Error('Update mismatch')
   stage='fixture_conflict';await db.query('SAVEPOINT expected_stale_edit')
   let conflict=false
   try{await repo.execute('cms_save_support_faq_category_v1',{p_request_id:randomUUID(),p_id:fixtureId,
    p_expected_revision:created.category._revision,p_item:item})}catch(error){if(error.code!=='40001')throw error;conflict=true}
   await db.query('ROLLBACK TO SAVEPOINT expected_stale_edit');await db.query('RELEASE SAVEPOINT expected_stale_edit')
   if(!conflict)throw new Error('Stale edit accepted')
   stage='fixture_delete'
   const removed=await repo.execute('cms_delete_support_faq_category_v1',{p_request_id:requests[2],p_id:fixtureId,p_expected_revision:updated.category._revision})
   if(!removed.ok)throw new Error('Delete failed')
   return {create_verified:true,update_verified:true,replay_verified:true,stale_conflict_verified:true,delete_verified:true}
  })
  stage='cleanup';const absent=await verifyAbsent()
  const report={ok:rolledBack&&absent,...result,rolled_back:rolledBack,fixture_absent:absent,
   existing_content_edited:false,sequence_counters_may_advance:true,providers_changed:false,server_started:false}
  fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-10-content-write-agent-result.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1
 }
}catch(error){
 let absent=null
 if(creationAttempted&&verifyAbsent){try{absent=await verifyAbsent()}catch{}}
 const report={ok:false,stage,sqlstate:/^[0-9A-Z]{5}$/.test(error.sqlState??error.code??'')?(error.sqlState??error.code):null,
  creation_attempted:creationAttempted,fixture_absent:absent,providers_changed:false,server_started:false}
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-10-content-write-last-failure.json',JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify(report));process.exitCode=1
}finally{if(pool)await pool.end()}
