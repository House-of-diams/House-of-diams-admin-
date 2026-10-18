// Catalog-only verification of the already applied packet; never installs/replays.
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {Pool} from 'pg'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
const require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const load=createSourceLoader(process.cwd())
let pool
try{
 const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
 const {withAdminTransaction}=await import(await load('lib/db/query.ts'))
 const config=readAdminDbConfig(process.env,p=>fs.readFileSync(p,'utf8'))
 if(config.pool.database!=='hod_staging')throw Error('Wrong target')
 pool=new Pool(config.pool);pool.on('error',()=>{})
 const scope=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-08-feature-read-scope.json','utf8')).scope
 const rows=await withAdminTransaction(pool,config.loginRole,async db=>(await db.query(`SELECT name,
 c.relowner::regrole::text AS owner,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
 has_table_privilege('hod_admin_app',c.oid,'SELECT') AS table_select,
 has_table_privilege('hod_admin_app',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS other_rights,
 has_any_column_privilege('hod_admin_app',c.oid,'INSERT,UPDATE,REFERENCES') AS column_write_or_reference,
 (SELECT coalesce(jsonb_agg(a.attname ORDER BY a.attnum),'[]'::jsonb) FROM pg_attribute a
 WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 AND has_column_privilege('hod_admin_app',c.oid,a.attname,'SELECT')) AS readable_columns,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.policyname,'roles',p.roles,'command',p.cmd,
 'mode',p.permissive,'using',p.qual,'check',p.with_check)),'[]'::jsonb)
 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=split_part(name,'.',2)
 AND p.policyname='hod_admin_feature_read_v1') AS packet_policies
 FROM unnest($1::text[]) x(name) LEFT JOIN pg_class c ON c.oid=to_regclass(name) ORDER BY name`,[scope.map(r=>r.name)])).rows,{snapshot:true})
 const checks=scope.map(expected=>{
  const row=rows.find(r=>r.name===expected.name),policy=row?.packet_policies[0]
  return {name:expected.name,
   owner_rls_matches:row?.owner===expected.owner&&row.rls===expected.rls&&row.force_rls===false,
   table_scope_matches:row?.table_select===expected.all,
   // Full-row requirements are proven by the table SELECT above. Their source
   // inventory can also contain expression aliases, which are not columns.
   columns_match:!!row&&(expected.all||(expected.columns.every(c=>row.readable_columns.includes(c))
    &&row.readable_columns.every(c=>expected.columns.includes(c)))),
   no_direct_writes:row?.other_rights===false&&row.column_write_or_reference===false,
   policy_matches:!expected.rls||(row?.packet_policies.length===1&&policy.command==='SELECT'
    &&policy.mode==='PERMISSIVE'&&JSON.stringify(policy.roles)==='["hod_admin_app"]'
    &&policy.using==='true'&&policy.check===null)}
 })
 const failed=checks.filter(r=>Object.entries(r).some(([key,value])=>key!=='name'&&value!==true))
 const report={ok:checks.length===75&&!failed.length,checked_at:new Date().toISOString(),read_only:true,
  tables_verified:checks.length,failed,checks,providers_changed:false,server_started:false}
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-08-installed-read-verification.json',JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({ok:report.ok,tables_verified:checks.length,failed,read_only:true}))
 if(!report.ok)process.exitCode=1
}catch(error){console.log(JSON.stringify({ok:false,code:error.sqlState??error.code??'VERIFICATION_UNAVAILABLE'}));process.exitCode=1}
finally{if(pool)await pool.end()}
