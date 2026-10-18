// Explicit local configuration work. Reuses private inputs; never prints values.
// Only proven inert settings are applied to the current legacy profile. The
// complete AWS profile is staged, not activated with unverified policy flags.
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
if(process.argv[2]!=='--prepare'){console.log('{"ok":false,"code":"EXPLICIT_MODE_REQUIRED"}');process.exit(1)}
const require=createRequire(import.meta.url)
const root=process.cwd(),active=path.join(root,'.env.local'),pending=path.join(root,'.env.aws-local.pending')
const reportFile='docs/aws-phase-d/ADMIN-AWS-local-configuration-result.json'
let stage='preconditions',temporary
try{
 const ignored=name=>spawnSync('git',['check-ignore','--quiet','--',name],{windowsHide:true}).status===0
 if(!ignored('.env.local')||!ignored('.env.aws-local.pending'))throw Error()
 const original=fs.readFileSync(active,'utf8')
 require('@next/env').loadEnvConfig(root,true,{info(){},error(){}})
 const required=['ADMIN_DATABASE_URL','ADMIN_DB_LOGIN_ROLE','ADMIN_DB_TLS_CA_FILE','ADMIN_DB_TLS_EXPECTED_HOST',
  'ADMIN_OIDC_CLIENT_SECRET','ADMIN_SESSION_ENCRYPTION_KEY','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','ADMIN_SESSION_NAMESPACE']
 if(required.some(name=>!process.env[name]))throw Error()
 const auth=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-LOGIN-client-authentication-agent-result.json','utf8').replace(/^\uFEFF/,''))
 const sessions=JSON.parse(fs.readFileSync('docs/aws-phase-d/DEPLOY-READINESS-live-session-store.json','utf8').replace(/^\uFEFF/,''))
 const videos=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-14-s3-upload-diagnostic.json','utf8').replace(/^\uFEFF/,''))
 const images=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-AWS-image-routing-diagnostic.json','utf8').replace(/^\uFEFF/,''))
 const audienceFile='docs/aws-phase-d/ADMIN-AUTH-audience-preview.json'
 const audience=fs.existsSync(audienceFile)?JSON.parse(fs.readFileSync(audienceFile,'utf8').replace(/^\uFEFF/,'')):null
 const policyReviewed=audience?.audience_configuration_verified===true
  &&audience.issuer==='https://auth-uat.houseofdiams.com/realms/houseofdiams'
  &&audience.subject==='1167a5b6-9fcb-45d1-b7d8-53e95cd49704'
  &&audience.authorized_party==='hod-admin'&&audience.audiences?.includes('hod-admin')&&audience.required_realm_role_present===true
 if(!auth.ok||auth.token_auth_method!=='client_secret_basic'||!sessions.ok||!sessions.diagnostic_keys_cleanup_verified
  ||!videos.completed||videos.sources.length!==5||videos.sources.some(row=>!row.actual_repository_upload_verified||!row.cdn?.range_verified||!row.cleanup?.ok)
  ||!images.completed||images.sources.length!==2||images.sources.some(row=>!row.actual_repository_upload_verified||!row.s3_bytes_verified||!row.cdn?.range_verified||!row.cleanup?.ok))throw Error()
 const selectors={ADMIN_AUTH_PROVIDER:'keycloak',ADMIN_PRODUCT_DATA_PROVIDER:'rds',ADMIN_CATALOG_DATA_PROVIDER:'rds',
  ADMIN_CMS_DATA_PROVIDER:'rds',ADMIN_OPERATIONS_DATA_PROVIDER:'rds',ADMIN_IMAGE_PROVIDER:'aws',ADMIN_VIDEO_PROVIDER:'aws'}
 // Stop if a concurrent/operator activation already happened: do not downgrade it.
 if(Object.keys(selectors).some(name=>process.env[name]&&!['supabase','legacy'].includes(process.env[name])))throw Error()
 const proven={ADMIN_OIDC_ISSUER:'https://auth-uat.houseofdiams.com/realms/houseofdiams',ADMIN_OIDC_CLIENT_ID:'hod-admin',
  ...(policyReviewed?{ADMIN_AUTH_POLICY_VERIFIED:'true'}:{}),
  ADMIN_OIDC_TOKEN_AUTH_METHOD:'client_secret_basic',ADMIN_OIDC_ROLE_LOCATION:'realm',ADMIN_OIDC_REQUIRED_ROLE:'hod-admin',
  ADMIN_AUTH_ORIGIN:'https://manage-uat.houseofdiams.com',ADMIN_SESSION_MAX_SECONDS:'36000',ADMIN_SESSION_IDLE_SECONDS:'1800',
  ADMIN_SESSION_REVALIDATE_SECONDS:'300',ADMIN_SESSION_STORAGE_VERIFIED:'true',ADMIN_VIDEO_ROUTING_VERIFIED:'true',ADMIN_IMAGE_CONTENT_ROUTING_VERIFIED:'true',
  AWS_REGION:'us-east-1',AWS_MEDIA_BUCKET:'house-of-diams',NEXT_PUBLIC_MEDIA_CDN_BASE_URL:'https://media.houseofdiams.com',
  AWS_CONTENT_BUCKET:'house-of-diams-hod',AWS_CONTENT_CDN_BASE_URL:'https://content.houseofdiams.com'}
 const target={...process.env,...proven,...selectors,ADMIN_VIDEO_ADMISSION_PROVIDER:'rds',ADMIN_VIDEO_ADMISSION_POLICY:'hod-uat-video-v1',
  ADMIN_AUTH_POLICY_VERIFIED:policyReviewed?'true':'false',ADMIN_VIDEO_IMMUTABILITY_VERIFIED:'false'}
 stage='validate_saved_inputs'
 const load=createSourceLoader(root)
 const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
 const {readAuthConfig}=await import(await load('lib/auth/config.ts'))
 const {createSessionStore}=await import(await load('lib/auth/session-store.ts'))
 const {readAdminAuthProvider}=await import(await load('lib/auth/integration.ts'))
 const db=readAdminDbConfig(target,p=>fs.readFileSync(p,'utf8'))
 if(db.pool.database!=='hod_staging'||db.loginRole!=='hod_admin_login_uat'||readAdminAuthProvider(target)!=='keycloak')throw Error()
 // Shape validation only: the true override exists only in this function call.
 readAuthConfig({...target,ADMIN_AUTH_POLICY_VERIFIED:'true'})
 createSessionStore(target)
 const set=(text,values)=>{
  for(const [name,value] of Object.entries(values)){
   const line=name+"='"+value+"'",regex=new RegExp('^\\s*(?:export\\s+)?'+name+'\\s*=.*$','gm')
   text=regex.test(text)?text.replace(regex,line):text.replace(/\s*$/,'')+'\r\n'+line+'\r\n'
  }
  return text
 }
 const updated=set(original,proven)
 const staged=set(updated,{...selectors,ADMIN_VIDEO_ADMISSION_PROVIDER:'rds',ADMIN_VIDEO_ADMISSION_POLICY:'hod-uat-video-v1',
  ADMIN_AUTH_POLICY_VERIFIED:policyReviewed?'true':'false',ADMIN_VIDEO_IMMUTABILITY_VERIFIED:'false'})
 stage='private_save'
 temporary=active+'.aws-prepare-'+randomUUID()+'.tmp'
 if(!ignored(path.basename(temporary))||fs.readFileSync(active,'utf8')!==original)throw Error()
 fs.writeFileSync(temporary,updated,{flag:'wx',mode:0o600})
 fs.writeFileSync(pending,staged,{mode:0o600})
 fs.renameSync(temporary,active);temporary=undefined
 const report={ok:true,date:'2026-10-18',private_inputs_reused:true,verified_session_storage_configured:true,
  verified_local_video_routing_configured:true,client_authentication_method_configured:true,
  verified_local_image_routing_configured:true,
  complete_aws_profile_staged:true,staged_profile:'.env.aws-local.pending',configuration_shape_verified:true,
  auth_policy_configuration_reviewed:policyReviewed,auth_policy_live_verified:false,activation_ready:false,providers_changed:false,server_started:false,cloud_permissions_changed:false,
  remaining:[policyReviewed?'KEYCLOAK_REAL_LOGIN_CALLBACK_AND_REFRESH':'KEYCLOAK_USER_AUDIENCE_REFRESH_ACCEPTANCE','MEDIA_IMMUTABILITY_AND_DISABLED_DB_POLICY']}
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
}catch{console.log(JSON.stringify({ok:false,stage,code:'LOCAL_AWS_CONFIGURATION_STOPPED',providers_changed:false,server_started:false}));process.exitCode=1}
finally{if(temporary){try{fs.unlinkSync(temporary)}catch{}}}
