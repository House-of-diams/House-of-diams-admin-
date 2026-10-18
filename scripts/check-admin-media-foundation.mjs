// Scoped existing TLS connection only. No S3 object, provider or server changes.
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {randomUUID,createHash} from 'node:crypto'
import {Pool} from 'pg'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
import {createRollbackPool} from './admin-rds-rollback-pool.mjs'
import {inspectMediaCatalog} from './admin-media-catalog.mjs'
import {mediaSources,mediaPolicy} from './admin-media-schema-sql.mjs'
const mode=process.argv[2]
if(!['--prepare','--verify-rollback'].includes(mode)){console.log('{"ok":false,"code":"EXPLICIT_MODE_REQUIRED"}');process.exit(1)}
const require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const scope=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-14-media-scope.json','utf8'))
let pool,stage='configuration',rolledBack=false
try{
 const load=createSourceLoader(process.cwd())
 const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
 const {withAdminTransaction}=await import(await load('lib/db/query.ts'))
 const {createAdmissionRepository}=await import(await load('lib/db/admin-repositories/video-admission.ts'))
 const config=readAdminDbConfig(process.env,p=>fs.readFileSync(p,'utf8'))
 if(config.pool.database!=='hod_staging'||config.loginRole!=='hod_admin_login_uat')throw Error('Wrong target')
 pool=new Pool(config.pool);pool.on('error',()=>{})
 const proof=await withAdminTransaction(pool,config.loginRole,async db=>{
  await db.query('SET LOCAL search_path=pg_catalog,public,pg_temp');return inspectMediaCatalog(db,scope.manifest)
 },{snapshot:true})
 if(mode==='--prepare'){
  fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-14-runtime-preparation.json',JSON.stringify({ok:true,foundation_test_ready:proof.ok&&proof.policy_disabled,
   checks:proof,read_only:true,providers_changed:false,server_started:false},null,2)+'\n')
  console.log(JSON.stringify({ok:true,foundation_test_ready:proof.ok&&proof.policy_disabled,schema_present:proof.schema_present,
   catalog_matches:proof.catalog_matches,policy_disabled:proof.policy_disabled,read_only:true}))
 }else{
  if(!proof.ok||!proof.policy_disabled)throw Error('Install inactive reviewed foundation first')
  const rollbackPool=createRollbackPool(pool,{onRollback(){rolledBack=true}}),id=randomUUID(),source=mediaSources[0]
  const actor={profileId:'133321f4-53bb-4ef1-a9d6-7d0031080b75',issuer:'https://auth-uat.houseofdiams.com/realms/houseofdiams',subject:'1167a5b6-9fcb-45d1-b7d8-53e95cd49704'}
  const record={id,operationId:randomUUID(),actorId:actor.profileId,actorIssuer:actor.issuer,actorSubject:actor.subject,
   bucket:source.bucket,key:source.prefix+id+'.mp4',url:source.baseUrl+'/'+source.prefix+id+'.mp4',
   sha256:createHash('sha256').update('database-metadata-only').digest('base64'),size:12,mime:'video/mp4',version:null,
   policy:mediaPolicy,verifier:'hod-container-head-v1',evidence:'new-upload-intent',status:'pending'}
  const result=await withAdminTransaction(rollbackPool,config.loginRole,async db=>{
   await db.query("SET LOCAL lock_timeout='2s'");await db.query("SET LOCAL statement_timeout='15s'")
   const enrolled=(await db.query('SELECT admin_media.enrolled_actor($1::uuid,$2::text,$3::text) AS enabled',[actor.profileId,actor.issuer,actor.subject])).rows[0]?.enabled
   const wrong=(await db.query('SELECT admin_media.enrolled_actor($1::uuid,$2::text,$3::text) AS enabled',[actor.profileId,actor.issuer,actor.subject+'-unmapped'])).rows[0]?.enabled
   if(enrolled!==true||wrong!==false)throw Error('Identity mismatch')
   async function denied(label,run){stage=label;await db.query('SAVEPOINT media14_denied');let rejected=false
    try{await run()}catch(error){if(error.code!=='42501')throw error;rejected=true}
    await db.query('ROLLBACK TO SAVEPOINT media14_denied');await db.query('RELEASE SAVEPOINT media14_denied')
    if(!rejected)throw Error('Expected permission denial absent')
   }
   await db.query('SELECT singleton FROM admin_media.policy WHERE singleton FOR SHARE')
   await denied('policy_write_denied',()=>db.query('UPDATE admin_media.policy SET singleton=singleton WHERE singleton'))
   await denied('audit_read_denied',()=>db.query('SELECT * FROM admin_media.audit'))
   await denied('disabled_policy_reservation_denied',()=>createAdmissionRepository(db).reserve(record))
   return {exact_identity_verified:true,unmapped_identity_denied:true,policy_row_lock_verified:true,policy_write_denied:true,audit_read_denied:true,disabled_policy_upload_denied:true}
  })
  const absent=await withAdminTransaction(pool,config.loginRole,async db=>(await db.query('SELECT NOT EXISTS(SELECT FROM admin_media.admissions WHERE admission_id=$1::uuid OR operation_id=$2::uuid) AS absent',[record.id,record.operationId])).rows[0]?.absent===true,{snapshot:true})
  const report={ok:rolledBack&&absent,...result,rolled_back:rolledBack,fresh_fixture_absent:absent,policy_enabled:false,
   objects_read_or_written:false,existing_business_rows_changed:false,providers_changed:false,server_started:false}
  fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-14-runtime-agent-result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
  if(!report.ok)process.exitCode=1
 }
}catch(error){console.log(JSON.stringify({ok:false,stage,sqlstate:/^[0-9A-Z]{5}$/.test(error.sqlState??error.code??'')?(error.sqlState??error.code):null,
 rolled_back:rolledBack,objects_read_or_written:false,providers_changed:false,server_started:false}));process.exitCode=1}
finally{if(pool)await pool.end()}
