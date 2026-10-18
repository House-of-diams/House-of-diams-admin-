// Real repository smoke checks, isolated admin principal, READ ONLY transactions.
// Does not print customer/content rows or activate application providers.
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {Pool} from 'pg'
import {createSourceLoader} from './admin-rds-source-loader.mjs'

const require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env')
  .loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const load=createSourceLoader(process.cwd())
let pool
const checks=[]
try {
  const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
  const {withAdminTransaction}=await import(await load('lib/db/query.ts'))
  const config=readAdminDbConfig(process.env,p=>fs.readFileSync(p,'utf8'))
  if(config.pool.database!=='hod_staging')throw new Error('Wrong target')
  pool=new Pool(config.pool)
  pool.on('error',()=>{})
  const {createAdminIdentityLookup}=await import(await load('lib/db/admin-repositories/identity-core.ts'))
  const identities=await withAdminTransaction(pool,config.loginRole,db=>
    createAdminIdentityLookup(db)('https://auth-uat.houseofdiams.com/realms/houseofdiams',
      '1167a5b6-9fcb-45d1-b7d8-53e95cd49704'),{snapshot:true})
  if(identities.length!==1||identities[0].enabled!==true||identities[0].revokedAt!==null
    ||identities[0].profileRole!=='admin'
    ||identities[0].profileId!=='133321f4-53bb-4ef1-a9d6-7d0031080b75')throw new Error('Identity not verified')
  const actor={profileId:identities[0].profileId}
  const cases=[
    ['inventory','inventory','createInventoryRepository',r=>r.list('')],
    ['catalog_categories','catalog','createCatalogRepository',r=>r.execute('catalog_hierarchy_list_v1',{p_kind:'category'})],
    ['catalog_metals','catalog','createCatalogRepository',r=>r.execute('catalog_metal_list_v1',{})],
    ['navbar','navbar','createNavbarRepository',r=>r.execute('navbar_snapshot_v1',{})],
    ['cms_about_hero','cms','createCmsRepository',r=>r.execute('cms_singleton_snapshot_v1',{p_kind:'about_hero'})],
    ['cms_reels','cms','createCmsRepository',r=>r.execute('cms_reels_snapshot_v1',{})],
    ['bespoke_form','cms','createCmsRepository',r=>r.execute('bespoke_form_snapshot_v1',{})],
    ['bespoke_portfolio_categories','bespoke','createBespokeRepository',r=>r.list('category')],
    ['orders','orders','createOrdersRepository',r=>r.list(1)],
    ['customer_metrics','customers','createCustomersRepository',r=>r.metrics()],
    ['coupons','coupons','createCouponsRepository',r=>r.list()],
    ['contact_enquiries','enquiries','createEnquiriesRepository',r=>r.contactPage(1,1)],
    ['settings','settings','createSettingsRepository',r=>r.read()],
    ['notifications','notifications','createNotificationsRepository',r=>r.read()],
  ]
  for(const [feature,module,factory,run] of cases) {
    try {
      const exports=await import(await load(`lib/db/admin-repositories/${module}.ts`))
      await withAdminTransaction(pool,config.loginRole,async db=>{
        await run(exports[factory](db,actor))
      },{snapshot:true})
      checks.push({feature,ok:true})
    }catch(error){checks.push({feature,ok:false,
      sqlstate:/^[0-9A-Z]{5}$/.test(error.sqlState??'')?error.sqlState:null,
      category:['permission','conflict','unavailable','invalid'].includes(error.kind)?error.kind:'repository_check_failed'})}
  }
  const report={ok:checks.every(c=>c.ok),scope:'representative actual repository reads; not every page or write',
    database:'hod_staging',read_only:true,business_rows_in_report:false,checks,
    providers_changed:false,server_started:false}
  fs.writeFileSync('docs/aws-phase-d/DEPLOY-READINESS-feature-reads.json',JSON.stringify(report,null,2)+'\n')
  process.stdout.write(JSON.stringify(report)+'\n')
  if(!report.ok)process.exitCode=1
}catch{process.stdout.write('{"ok":false,"stage":"read_only_setup","code":"FEATURE_READ_CHECK_NOT_STARTED"}\n');process.exitCode=1}
finally{if(pool)await pool.end()}
