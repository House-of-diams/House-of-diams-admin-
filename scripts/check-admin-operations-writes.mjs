// Existing services only. --prepare reads metadata; --run-rollback touches only
// a fresh inactive coupon and one random notification key. No settings/order edits.
import fs from 'node:fs'
import {randomUUID,createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {Pool} from 'pg'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
import {createRollbackPool} from './admin-rds-rollback-pool.mjs'
import {inspectOperationsInstallation} from './admin-operations-installation-check.mjs'
const mode=process.argv[2]
if(!['--prepare','--run-rollback'].includes(mode)){console.log('{"ok":false,"code":"EXPLICIT_MODE_REQUIRED"}');process.exit(1)}
const require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const packet=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-11-operations-write-scope.json','utf8'))
const expected=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-11-operations-preflight.json','utf8'))
const profileId='133321f4-53bb-4ef1-a9d6-7d0031080b75',code='AWS-PROBE-'+randomUUID().toUpperCase(),key='order:'+randomUUID()
let pool,verifyAbsent,creationAttempted=false,rolledBack=false,stage='configuration',couponId=null
try{
 for(const file of ['lib/db/admin-repositories/coupons.ts','lib/db/admin-repositories/settings.ts','lib/db/admin-repositories/notifications.ts'])
  if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected.source_hashes[file])throw new Error('Repository drift')
 const load=createSourceLoader(process.cwd())
 const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
 const {withAdminTransaction}=await import(await load('lib/db/query.ts'))
 const {createAdminIdentityLookup}=await import(await load('lib/db/admin-repositories/identity-core.ts'))
 const {createCouponsRepository}=await import(await load('lib/db/admin-repositories/coupons.ts'))
 const {createNotificationsRepository}=await import(await load('lib/db/admin-repositories/notifications.ts'))
 const config=readAdminDbConfig(process.env,p=>fs.readFileSync(p,'utf8'))
 if(config.pool.database!=='hod_staging'||config.loginRole!=='hod_admin_login_uat')throw new Error('Wrong target')
 pool=new Pool(config.pool);pool.on('error',()=>{})
 const rollbackPool=createRollbackPool(pool,{onRollback(){rolledBack=true}})
 stage='installation'
 const proof=await withAdminTransaction(pool,config.loginRole,async db=>{
  const installation=await inspectOperationsInstallation(db,packet)
  const identities=await createAdminIdentityLookup(db)('https://auth-uat.houseofdiams.com/realms/houseofdiams','1167a5b6-9fcb-45d1-b7d8-53e95cd49704')
  if(identities.length!==1||identities[0].profileId!==profileId||!identities[0].enabled||identities[0].revokedAt!==null||identities[0].profileRole!=='admin')throw new Error('Identity mismatch')
  return installation
 },{snapshot:true})
 if(mode==='--prepare'){
  const report={ok:true,write_test_ready:proof.ok,read_only:true,identity_data_read:true,business_rows_read:false,checks:proof,providers_changed:false,server_started:false}
  fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-11-runtime-preparation.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({ok:true,write_test_ready:proof.ok,tables_checked:3,tables_ready:proof.tables.filter(t=>t.ok).length,read_only:true}))
 }else{
  if(!proof.ok)throw new Error('Install reviewed packet first')
  verifyAbsent=()=>withAdminTransaction(pool,config.loginRole,async db=>(await db.query(`SELECT
   NOT EXISTS(SELECT FROM public.coupons WHERE code=$1::text OR id=$2::bigint)
   AND NOT EXISTS(SELECT FROM public.admin_notification_reads WHERE admin_user_id=$3::uuid AND notification_key=$4::text) AS absent`,
   [code,couponId,profileId,key])).rows[0]?.absent===true,{snapshot:true})
  if(!await verifyAbsent())throw new Error('Fixture collision')
  const result=await withAdminTransaction(rollbackPool,config.loginRole,async db=>{
   await db.query("SET LOCAL lock_timeout='2s'");await db.query("SET LOCAL statement_timeout='15s'")
   const coupons=createCouponsRepository(db),notifications=createNotificationsRepository(db,{profileId})
   const input={code,title:'Temporary migration probe',reward_type:'percentage',discount_type:'percentage',discount_value:1,
    minimum_order_amount:0,gift_product_id:null,gift_variant_id:'',gift_variant_data:{},gift_banner_image_url:null,banner_enabled:false,
    banner_title:null,banner_description:null,starts_at:null,ends_at:null,featured_priority:0,usage_limit:null,is_active:false}
   stage='coupon_create';creationAttempted=true
   couponId=String((await coupons.save(input)).id)
   const created=await coupons.one(couponId)
   if(created?.code!==code||created?.is_active!==false)throw new Error('Coupon mismatch')
   stage='coupon_update';await coupons.save({...input,id:couponId,title:'Updated migration probe'})
   if((await coupons.one(couponId))?.title!=='Updated migration probe')throw new Error('Coupon update mismatch')
   stage='coupon_delete';await coupons.remove(couponId)
   if(await coupons.one(couponId)!==null)throw new Error('Coupon delete mismatch')
   stage='notification_mark';await notifications.mark({notificationKey:key});await notifications.mark({notificationKey:key})
   const count=(await db.query('SELECT count(*)::int AS n FROM public.admin_notification_reads WHERE admin_user_id=$1::uuid AND notification_key=$2::text',[profileId,key])).rows[0]?.n
   if(count!==1)throw new Error('Notification duplicate')
   return {coupon_create_verified:true,coupon_update_verified:true,coupon_delete_verified:true,notification_mark_verified:true,notification_replay_verified:true}
  })
  stage='cleanup';const absent=await verifyAbsent()
  const report={ok:rolledBack&&absent,...result,rolled_back:rolledBack,fixture_absent:absent,
   settings_written:false,orders_written:false,existing_coupons_edited:false,sequence_counters_may_advance:true,providers_changed:false,server_started:false}
  fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-11-operations-write-agent-result.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1
 }
}catch(error){
 let absent=null;if(creationAttempted&&verifyAbsent){try{absent=await verifyAbsent()}catch{}}
 const report={ok:false,stage,sqlstate:/^[0-9A-Z]{5}$/.test(error.sqlState??error.code??'')?(error.sqlState??error.code):null,
  creation_attempted:creationAttempted,fixture_absent:absent,providers_changed:false,server_started:false}
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-11-operations-write-last-failure.json',JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify(report));process.exitCode=1
}finally{if(pool)await pool.end()}
