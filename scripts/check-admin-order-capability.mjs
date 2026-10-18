// Existing private RDS connection only. No fixture creation, real-order writes,
// mail, uploads, provider switches or listeners. Expected errors roll back.
import fs from 'node:fs'
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {Pool} from 'pg'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
import {createRollbackPool} from './admin-rds-rollback-pool.mjs'
import {orderSignature} from './admin-order-capability-sql.mjs'
import {inspectOrderCapability} from './admin-order-installation-check.mjs'
const mode=process.argv[2]
if(!['--prepare','--verify-rollback'].includes(mode)){console.log('{"ok":false,"code":"EXPLICIT_MODE_REQUIRED"}');process.exit(1)}
const require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const metadata=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-12-order-preflight.json','utf8'))
const scope=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-12-order-scope.json','utf8'))
let pool,stage='configuration',rolledBack=false
try{
 const load=createSourceLoader(process.cwd())
 const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
 const {withAdminTransaction}=await import(await load('lib/db/query.ts'))
 const {createAdminIdentityLookup}=await import(await load('lib/db/admin-repositories/identity-core.ts'))
 const {createOrdersRepository}=await import(await load('lib/db/admin-repositories/orders.ts'))
 const config=readAdminDbConfig(process.env,p=>fs.readFileSync(p,'utf8'))
 if(config.pool.database!=='hod_staging'||config.loginRole!=='hod_admin_login_uat')throw new Error('Wrong target')
 pool=new Pool(config.pool);pool.on('error',()=>{})
 stage='installation'
 const proof=await withAdminTransaction(pool,config.loginRole,async db=>{
  await db.query('SET LOCAL search_path=pg_catalog,public,pg_temp')
  return inspectOrderCapability(db,metadata,scope)
 },{snapshot:true})
 if(mode==='--prepare'){
  const report={ok:true,runtime_test_ready:proof.ok,read_only:true,business_rows_read:false,checks:proof,providers_changed:false,server_started:false}
  fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-12-runtime-preparation.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({ok:true,runtime_test_ready:proof.ok,capability_present:proof.capability_present,
   dependency_tables_verified:proof.tables.filter(t=>t.ok).length,direct_writes_denied:proof.direct_writes_denied,read_only:true}))
 }else{
  if(!proof.ok)throw new Error('Install reviewed order packet first')
  const missingId=randomUUID(),rollbackPool=createRollbackPool(pool,{onRollback(){rolledBack=true}})
  const result=await withAdminTransaction(rollbackPool,config.loginRole,async db=>{
   await db.query("SET LOCAL lock_timeout='2s'");await db.query("SET LOCAL statement_timeout='15s'")
   const issuer='https://auth-uat.houseofdiams.com/realms/houseofdiams',subject='1167a5b6-9fcb-45d1-b7d8-53e95cd49704'
   const identities=await createAdminIdentityLookup(db)(issuer,subject)
   if(identities.length!==1||!identities[0].enabled||identities[0].revokedAt!==null||identities[0].profileRole!=='admin'
    ||identities[0].profileId!=='133321f4-53bb-4ef1-a9d6-7d0031080b75')throw new Error('Identity mismatch')
   const actor={profileId:identities[0].profileId,issuer,subject},repo=createOrdersRepository(db,actor)
   if((await db.query('SELECT EXISTS(SELECT FROM public.orders WHERE id=$1::uuid) AS present',[missingId])).rows[0].present)throw new Error('Probe collision')
   const input={status:'cancelled',expected_status:'pending',courier_name:null,courier_awb_number:null,expected_courier_name:null,expected_courier_awb_number:null}
   async function expectError(label,run,expected){
    stage=label;await db.query('SAVEPOINT expected_order_probe');let matched=false
    try{await run()}catch(error){matched=expected(error);if(!matched)throw error}
    await db.query('ROLLBACK TO SAVEPOINT expected_order_probe');await db.query('RELEASE SAVEPOINT expected_order_probe')
    if(!matched)throw new Error('Expected rejection was not observed')
   }
   await expectError('runtime_missing_order',()=>repo.update(missingId,input),e=>e.status===404)
   const sql=`SELECT public.admin_order_status_update_v1($1::uuid,$2::text,$3::text,$4::uuid,$5::jsonb,$6::timestamptz)`
   await expectError('unmapped_actor',()=>db.query(sql,[actor.profileId,issuer,subject+'-unmapped',missingId,JSON.stringify(input),new Date().toISOString()]),e=>e.code==='42501')
   await expectError('direct_order_write_denied',()=>db.query('UPDATE public.orders SET status=status WHERE id=$1::uuid',[missingId]),e=>e.code==='42501')
   await expectError('direct_stock_write_denied',()=>db.query('UPDATE public.products SET stock_quantity=stock_quantity WHERE id=$1::uuid',[missingId]),e=>e.code==='42501')
   return {runtime_function_executed:true,missing_order_contract_verified:true,unmapped_actor_denied:true,direct_order_write_denied:true,direct_stock_write_denied:true}
  })
  const report={ok:rolledBack,...result,rolled_back:rolledBack,existing_orders_edited:false,business_rows_written:false,
   owner_sql_fixture_acceptance_required:true,providers_changed:false,server_started:false}
  fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-12-runtime-agent-result.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1
 }
}catch(error){
 console.log(JSON.stringify({ok:false,stage,sqlstate:/^[0-9A-Z]{5}$/.test(error.sqlState??error.code??'')?(error.sqlState??error.code):null,
  capability:orderSignature,business_rows_written:false,providers_changed:false,server_started:false}));process.exitCode=1
}finally{if(pool)await pool.end()}
