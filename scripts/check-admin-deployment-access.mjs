// Catalog-only readiness inventory using the approved isolated admin login.
// No business rows, installation, provider changes or cloud writes.
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {Pool} from 'pg'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
import {connectionFailure} from './admin-rds-connection-diagnostics.mjs'

const require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const load=createSourceLoader(process.cwd())
let pool
try {
 const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
 const {withAdminTransaction}=await import(await load('lib/db/query.ts'))
 const config=readAdminDbConfig(process.env,p=>fs.readFileSync(p,'utf8'))
 if(config.pool.database!=='hod_staging') throw new Error('Wrong target')
 pool=new Pool(config.pool)
 pool.on('error',()=>{})
 const manifest=JSON.parse(fs.readFileSync('docs/aws-phase-d/D1e-minimum-grant-manifest.json','utf8'))
 const metadata=JSON.parse(fs.readFileSync('docs/aws-phase-a/rds-admin-security-metadata.json','utf8').replace(/^\uFEFF/,''))
 const names=new Set(manifest.relations.map(r=>r.relation))
 names.add('admin_media.policy')
 for(const file of fs.readdirSync('lib/db/admin-repositories').filter(f=>f.endsWith('.ts'))) {
  const source=fs.readFileSync(path.join('lib/db/admin-repositories',file),'utf8')
  for(const match of source.matchAll(/(?:FROM|JOIN|UPDATE|INSERT INTO|DELETE FROM)\s+(public|admin_media)\.([a-z_][a-z0-9_]*)/g)) {
   if(!/^\s*\(/.test(source.slice(match.index+match[0].length))) names.add(match[1]+'.'+match[2])
  }
 }
 const signatures=metadata.functions.map(f=>'public.'+f.name+'('+f.arguments.replace(/\bp_[a-z0-9_]+\s+/g,'')+')')
 signatures.push('public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid,text,text)')
 const report=await withAdminTransaction(pool,config.loginRole,async db=>{
  const relations=await db.query(`SELECT name,to_regclass(name) IS NOT NULL AS present,
   c.relowner::regrole::text AS owner,c.relrowsecurity AS rls,
   has_table_privilege('hod_admin_app',c.oid,'SELECT') AS runtime_select,
   has_table_privilege('hod_admin_app',c.oid,'INSERT') AS runtime_insert,
   has_table_privilege('hod_admin_app',c.oid,'UPDATE') AS runtime_update,
   has_table_privilege('hod_admin_app',c.oid,'DELETE') AS runtime_delete,
   (SELECT coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'acl',a.attacl)),'[]'::jsonb)
    FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL) AS column_grants,
   (SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM pg_policies p
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE p.schemaname=n.nspname AND p.tablename=c.relname) AS policies
   FROM unnest($1::text[]) AS x(name) LEFT JOIN pg_class c ON c.oid=to_regclass(name) ORDER BY name`,[[...names].sort()])
  const routines=await db.query(`SELECT signature,p.oid IS NOT NULL AS present,
   p.proowner::regrole::text AS owner,p.prosecdef AS definer,p.proacl AS acl,
   has_function_privilege('hod_admin_app',p.oid,'EXECUTE') AS runtime_execute,
   CASE WHEN p.oid IS NOT NULL THEN encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') END AS sha256
   FROM unnest($1::text[]) AS x(signature) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`,[signatures])
  const installer=await db.query(`SELECT session_user AS login,
   pg_has_role(session_user,'hod_migration','SET') AS can_set_object_owner,
   (SELECT rolcreaterole FROM pg_roles WHERE rolname=session_user) AS can_create_roles,
   to_regnamespace('admin_media') IS NOT NULL AS media_schema_present`)
  return {database:'hod_staging',relations:relations.rows,routines:routines.rows,installation:installer.rows[0]}
 },{snapshot:true})
 fs.writeFileSync('docs/aws-phase-d/DEPLOY-READINESS-database-access.json',JSON.stringify(report,null,2)+'\n')
 process.stdout.write(JSON.stringify({ok:true,relations_checked:report.relations.length,
  relations_missing:report.relations.filter(r=>!r.present).map(r=>r.name),
  present_relations_without_direct_select:report.relations.filter(r=>r.present&&!r.runtime_select).length,
  routines_checked:report.routines.length,routines_missing:report.routines.filter(r=>!r.present).map(r=>r.signature),
  installation:report.installation,read_only:true})+'\n')
}catch(error){process.stdout.write(JSON.stringify(connectionFailure(error,{stage:'read_connection_metadata'}))+'\n');process.exitCode=1}
finally{if(pool)await pool.end()}
