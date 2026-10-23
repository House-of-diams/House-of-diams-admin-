// User-authorized LOCAL configuration selection for later hosted UAT testing.
// No deployment, listener, IAM change or database write. Video publishing stays off.
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
if(process.argv[2]!=='--select-keycloak-rds'){console.log('{"ok":false,"code":"EXPLICIT_MODE_REQUIRED"}');process.exit(1)}
const root=process.cwd(),active=path.join(root,'.env.local'),backup=path.join(root,'.env.local.before-keycloak-rds')
const require=createRequire(import.meta.url)
let pool,temporary,stage='preconditions'
try{
 const ignored=file=>spawnSync('git',['check-ignore','--quiet','--',file],{windowsHide:true}).status===0
 if(!ignored('.env.local')||!ignored('.env.local.before-keycloak-rds'))throw Error()
 const original=fs.readFileSync(active,'utf8')
 require('@next/env').loadEnvConfig(root,true,{info(){},error(){}})
 const preview=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-AUTH-audience-preview.json','utf8').replace(/^\uFEFF/,''))
 if(!preview.audience_configuration_verified||!preview.audiences.includes('hod-admin')||!preview.required_realm_role_present
  ||preview.authorized_party!=='hod-admin'||preview.subject!=='1167a5b6-9fcb-45d1-b7d8-53e95cd49704')throw Error()
 const changes={ADMIN_AUTH_PROVIDER:'keycloak',ADMIN_PRODUCT_DATA_PROVIDER:'rds',ADMIN_CATALOG_DATA_PROVIDER:'rds',
  ADMIN_CMS_DATA_PROVIDER:'rds',ADMIN_OPERATIONS_DATA_PROVIDER:'rds',ADMIN_IMAGE_PROVIDER:'aws',ADMIN_VIDEO_PROVIDER:'aws',
  ADMIN_VIDEO_ADMISSION_PROVIDER:'rds',ADMIN_VIDEO_ADMISSION_POLICY:'hod-uat-video-v1',ADMIN_VIDEO_IMMUTABILITY_VERIFIED:'false'}
 const target={...process.env,...changes}
 const load=createSourceLoader(root)
 const {readAdminAuthProvider}=await import(await load('lib/auth/integration.ts'))
 const {readAuthConfig}=await import(await load('lib/auth/config.ts'))
 const {createSessionStore}=await import(await load('lib/auth/session-store.ts'))
 const {imageTarget}=await import(await load('lib/image-provider.ts'))
 const {videoSources}=await import(await load('lib/video-provider.ts'))
 const {admissionPolicy}=await import(await load('lib/video-admission.ts'))
 const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
 const {withAdminTransaction}=await import(await load('lib/db/query.ts'))
 const {adminDataReadProbes}=await import(await load('lib/admin-data-source-status.ts'))
 const {createAdminIdentityLookup}=await import(await load('lib/db/admin-repositories/identity-core.ts'))
 stage='configuration_validation'
 if(readAdminAuthProvider(target)!=='keycloak')throw Error()
 const auth=readAuthConfig(target)
 if(auth.origin!=='https://manage.houseofdiams.com')throw Error()
 createSessionStore(target);imageTarget('product',target);imageTarget('content',target)
 if(videoSources(target).length!==5)throw Error()
 let publishingBlocked=false;try{admissionPolicy(target)}catch{publishingBlocked=true}
 if(!publishingBlocked)throw Error()
 const config=readAdminDbConfig(target,p=>fs.readFileSync(p,'utf8'))
 if(config.pool.database!=='hod_staging'||config.loginRole!=='hod_admin_login_uat')throw Error()
 pool=new Pool(config.pool);pool.on('error',()=>{})
 stage='read_only_database_validation'
 await withAdminTransaction(pool,config.loginRole,async db=>{
  const identity=await createAdminIdentityLookup(db)(auth.issuer,preview.subject)
  if(identity.length!==1||identity[0].profileId!=='133321f4-53bb-4ef1-a9d6-7d0031080b75'
   ||!identity[0].enabled||identity[0].revokedAt!==null||identity[0].profileRole!=='admin')throw Error()
  for(const sql of Object.values(adminDataReadProbes))await db.query(sql)
  const policy=await db.query('SELECT enabled FROM admin_media.policy WHERE singleton')
  if(policy.rows.length!==1||policy.rows[0].enabled!==false)throw Error()
 },{snapshot:true})
 let updated=original
 for(const [name,value]of Object.entries(changes)){
  const expression=new RegExp('^\\s*(?:export\\s+)?'+name+'\\s*=.*$','gm'),line=name+"='"+value+"'"
  updated=expression.test(updated)?updated.replace(expression,line):updated.replace(/\s*$/,'')+'\r\n'+line+'\r\n'
 }
 stage='atomic_private_save'
 temporary=active+'.uat-select-'+randomUUID()+'.tmp'
 if(!ignored(path.basename(temporary))||fs.readFileSync(active,'utf8')!==original)throw Error()
 if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{flag:'wx',mode:0o600})
 fs.writeFileSync(temporary,updated,{flag:'wx',mode:0o600});fs.renameSync(temporary,active);temporary=undefined
 const result={ok:true,date:'2026-10-18',local_configuration_selected:true,login_provider:'keycloak',
  data_providers:{products:'rds',catalog:'rds',cms:'rds',operations:'rds'},image_provider:'aws',video_provider:'aws',
  origin:auth.origin,callback:auth.origin+'/api/auth/callback',identity_mapping_read_verified:true,
  representative_read_groups_verified:Object.keys(adminDataReadProbes),video_publishing_enabled:false,
  database_policy_enabled:false,private_backup_saved:true,hosted_configuration_changed:false,
  browser_login_verified:false,refresh_verified:false,server_started:false,deployed:false,production_ready:false}
 fs.writeFileSync('docs/aws-phase-d/ADMIN-UAT-data-selection-result.json',JSON.stringify(result,null,2)+'\n')
 console.log(JSON.stringify(result))
}catch{console.log(JSON.stringify({ok:false,stage,code:'UAT_DATA_SELECTION_STOPPED',server_started:false,deployed:false}));process.exitCode=1}
finally{if(pool)await pool.end();if(temporary){try{fs.unlinkSync(temporary)}catch{}}}
