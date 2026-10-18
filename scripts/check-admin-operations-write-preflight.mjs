// Catalog-only operations reconciliation; no business rows or installation.
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {Pool} from 'pg'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
import {contentSnapshotSql} from './admin-content-permission-snapshot.mjs'
const require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}})
let pool
try{
 const load=createSourceLoader(process.cwd())
 const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
 const {withAdminTransaction}=await import(await load('lib/db/query.ts'))
 const config=readAdminDbConfig(process.env,p=>fs.readFileSync(p,'utf8'))
 if(config.pool.database!=='hod_staging')throw new Error('Wrong target')
 pool=new Pool(config.pool);pool.on('error',()=>{})
 const report=await withAdminTransaction(pool,config.loginRole,async db=>{
  const names=['public.coupons','public.site_settings','public.admin_notification_reads','public.orders']
  const tables=(await db.query(`SELECT name,${contentSnapshotSql()} AS snapshot,
   md5((${contentSnapshotSql()})::text) AS fingerprint,
   md5((${contentSnapshotSql({preservedOnly:true,policyPrefix:'hod_admin_ops11_'})})::text) AS preserved,
   has_table_privilege('hod_admin_app',c.oid,'SELECT') AS select_all,
   (SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    AND has_column_privilege('hod_admin_app',c.oid,a.attnum,'SELECT')) AS select_columns,
   has_table_privilege('hod_admin_app',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS writes,
   has_any_column_privilege('hod_admin_app',c.oid,'INSERT,UPDATE,REFERENCES') AS column_writes,
   (SELECT coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'identity',a.attidentity,
    'sequence',pg_get_serial_sequence(name,a.attname))),'[]'::jsonb)
    FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    AND pg_get_serial_sequence(name,a.attname) IS NOT NULL) AS sequences
   FROM unnest($1::text[]) x(name) LEFT JOIN pg_class c ON c.oid=to_regclass(name) ORDER BY name`,[names])).rows
  const triggers=(await db.query(`SELECT n.nspname||'.'||c.relname AS relation,t.tgname AS trigger,
   p.oid::regprocedure::text AS routine,p.proowner::regrole::text AS owner,p.prosecdef AS definer,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS sha256,
   pg_get_triggerdef(t.oid) AS event
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal
   AND c.oid=ANY(SELECT to_regclass(name) FROM unnest($1::text[]) x(name)) ORDER BY c.relname,t.tgname`,[names])).rows
  return {database:'hod_staging',read_only:true,business_rows_read:false,providers_changed:false,server_started:false,tables,triggers}
 },{snapshot:true})
 report.source_hashes=Object.fromEntries(['coupons','settings','notifications','orders'].map(name=>{
  const file=`lib/db/admin-repositories/${name}.ts`
  return [file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]
 }))
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-11-operations-preflight.json',JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({ok:true,tables:report.tables.map(t=>({name:t.name,owner:t.snapshot.owner,rls:t.snapshot.rls,
  existing_writes:t.writes||t.column_writes,sequences:t.sequences})),triggers:report.triggers,read_only:true,business_rows_read:false}))
}catch(error){console.log(JSON.stringify({ok:false,stage:'operations_catalog',code:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'OPERATIONS_PREFLIGHT_NOT_VERIFIED'}));process.exitCode=1}
finally{if(pool)await pool.end()}
