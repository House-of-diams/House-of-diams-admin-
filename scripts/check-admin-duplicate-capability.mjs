// Explicit modes only; existing TLS connection. No server, media or provider activation.
import fs from 'node:fs'
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {Pool} from 'pg'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
import {createRollbackPool} from './admin-rds-rollback-pool.mjs'
import {productWriteFixture} from './admin-rds-product-write-fixture.mjs'
import {inspectDuplicateCapability} from './admin-duplicate-installation-check.mjs'
const mode=process.argv[2]
if(!['--prepare','--run-rollback'].includes(mode)){console.log('{"ok":false,"code":"EXPLICIT_MODE_REQUIRED"}');process.exit(1)}
const require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const scope=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-13-duplicate-scope.json','utf8'))
let pool,stage='configuration',rolledBack=false,fixtureAttempted=false,cleanupVerified=false,verifyAbsence
const marker=randomUUID(),requestId=randomUUID(),ids=[]
try{
 const load=createSourceLoader(process.cwd())
 const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
 const {withAdminTransaction}=await import(await load('lib/db/query.ts'))
 const {createAdminIdentityLookup}=await import(await load('lib/db/admin-repositories/identity-core.ts'))
 const {createProductRepository}=await import(await load('lib/db/admin-repositories/products.ts'))
 const {saveRdsProduct}=await import(await load('lib/db/admin-repositories/product-save.ts'))
 const {productPayloadSchema}=await import(await load('lib/product-payload-validation.ts'))
 const config=readAdminDbConfig(process.env,p=>fs.readFileSync(p,'utf8'))
 if(config.pool.database!=='hod_staging'||config.loginRole!=='hod_admin_login_uat')throw Error('Wrong target')
 pool=new Pool(config.pool);pool.on('error',()=>{})
 stage='installation'
 const proof=await withAdminTransaction(pool,config.loginRole,async db=>{
  await db.query('SET LOCAL search_path=pg_catalog,public,pg_temp');return inspectDuplicateCapability(db,scope)
 },{snapshot:true})
 if(mode==='--prepare'){
  fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-13-runtime-preparation.json',JSON.stringify({ok:true,runtime_test_ready:proof.ok,read_only:true,
   business_rows_read:false,checks:proof,providers_changed:false,server_started:false},null,2)+'\n')
  console.log(JSON.stringify({ok:true,runtime_test_ready:proof.ok,capability_present:proof.capability_present,
   dependency_tables_verified:proof.tables.filter(t=>t.ok).length,receipt_writes_denied:proof.receipt_writes_denied,read_only:true}))
 }else{
  if(!proof.ok)throw Error('Install reviewed packet first')
  const rollbackPool=createRollbackPool(pool,{onRollback(){rolledBack=true}})
  const actor={profileId:'133321f4-53bb-4ef1-a9d6-7d0031080b75',issuer:'https://auth-uat.houseofdiams.com/realms/houseofdiams',subject:'1167a5b6-9fcb-45d1-b7d8-53e95cd49704'}
  verifyAbsence=async()=>{
   const productsAbsent=await withAdminTransaction(pool,config.loginRole,async db=>(await db.query(`SELECT NOT EXISTS(SELECT FROM public.products
    WHERE sku=$1::text OR id=ANY($2::uuid[]) OR duplicated_from_product_id=$3::uuid) AS absent`,['AWS-PROBE-'+marker,ids,ids[0]??null])).rows[0]?.absent===true,{snapshot:true})
   if(!productsAbsent)return false
   if(!ids.length)return true
   return withAdminTransaction(rollbackPool,config.loginRole,async db=>{
    await db.query('SAVEPOINT absent_receipt');let absent=false
    try{await db.query('SELECT public.admin_product_duplicate_prepare_v1($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text)',[ids[0],requestId,actor.profileId,actor.issuer,actor.subject])}
    catch(error){if(error.code!=='P0002')throw error;absent=true}
    await db.query('ROLLBACK TO SAVEPOINT absent_receipt');await db.query('RELEASE SAVEPOINT absent_receipt');return absent
   },{repeatableWrite:true})
  }
  const result=await withAdminTransaction(rollbackPool,config.loginRole,async db=>{
   await db.query("SET LOCAL lock_timeout='2s'");await db.query("SET LOCAL statement_timeout='30s'")
   stage='identity';const identities=await createAdminIdentityLookup(db)(actor.issuer,actor.subject)
   if(identities.length!==1||identities[0].profileId!==actor.profileId||!identities[0].enabled||identities[0].revokedAt!==null||identities[0].profileRole!=='admin')throw Error('Identity mismatch')
   const category=(await db.query("SELECT id FROM public.catalog_categories WHERE status::text='active' AND coalesce(category_lane,'standard')='standard' ORDER BY id LIMIT 1")).rows[0]
   if(!category)throw Error('No standard category')
   const payload=productPayloadSchema.parse({...productWriteFixture(category.id,marker),faq_items:[{question:'Migration fixture?',answer:'Rollback only.',sort_order:0,is_active:true}]})
   stage='fixture_create';fixtureAttempted=true
   const created=await saveRdsProduct(db,actor,payload,null)
   if(created.error||!created.data?.item?.id||created.data.item.status!=='draft')throw Error('Fixture creation failed')
   ids.push(created.data.item.id)
   const repo=createProductRepository(db)
   stage='fixture_duplicate';const copied=await repo.duplicate(actor,ids[0],requestId);ids.push(copied.product_id)
   if(copied.product_id===ids[0]||copied.lane!=='standard')throw Error('Copy differs')
   stage='fixture_replay';const replay=await repo.duplicate(actor,ids[0],requestId)
   if(replay.product_id!==copied.product_id||replay.slug!==copied.slug||replay.lane!==copied.lane)throw Error('Replay differs')
   const product=(await db.query('SELECT status,stock_quantity,allow_checkout,duplicated_from_product_id FROM public.products WHERE id=$1::uuid',[copied.product_id])).rows[0]
   if(!product||product.status!=='draft'||Number(product.stock_quantity)!==0||product.allow_checkout!==false||product.duplicated_from_product_id!==ids[0])throw Error('Draft contract differs')
   const faq=(await db.query('SELECT count(*)::int AS count FROM public.product_faq_items WHERE product_id=$1::uuid',[copied.product_id])).rows[0]
   if(faq?.count!==1)throw Error('Child clone differs')
   stage='mismatched_request';await db.query('SAVEPOINT mismatched_request');let denied=false
   try{await repo.duplicate(actor,randomUUID(),requestId)}catch(error){if(error.code!=='40001'&&error.sqlState!=='40001')throw error;denied=true}
   await db.query('ROLLBACK TO SAVEPOINT mismatched_request');await db.query('RELEASE SAVEPOINT mismatched_request')
   if(!denied)throw Error('Mismatched request accepted')
   return {fixture_create_verified:true,duplicate_verified:true,replay_verified:true,draft_safety_verified:true,faq_clone_verified:true,request_mismatch_denied:true}
  },{repeatableWrite:true})
  stage='cleanup';cleanupVerified=await verifyAbsence()
  const report={ok:rolledBack&&cleanupVerified,...result,rolled_back:rolledBack,fresh_fixture_and_receipt_absent:cleanupVerified,
   existing_products_edited:false,fixture_had_aws_video:false,sequence_counters_may_advance:true,providers_changed:false,server_started:false}
  fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-13-runtime-agent-result.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1
 }
}catch(error){
 if(fixtureAttempted&&verifyAbsence)try{cleanupVerified=await verifyAbsence()}catch{/* Preserve failure category only. */}
 const report={ok:false,stage,sqlstate:/^[0-9A-Z]{5}$/.test(error.sqlState??error.code??'')?(error.sqlState??error.code):null,
  rolled_back:rolledBack,fixture_attempted:fixtureAttempted,cleanup_verified:cleanupVerified,existing_products_edited:false,providers_changed:false,server_started:false}
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-13-runtime-agent-error.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exitCode=1
}finally{if(pool)await pool.end()}
