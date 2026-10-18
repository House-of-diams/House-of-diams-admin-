// Existing TLS route, scoped catalog only. No media rows, S3 calls or mutations.
import fs from 'node:fs'
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
 if(config.pool.database!=='hod_staging'||config.loginRole!=='hod_admin_login_uat')throw Error('Wrong target')
 pool=new Pool(config.pool);pool.on('error',()=>{})
 const report=await withAdminTransaction(pool,config.loginRole,async db=>{
  await db.query('SET LOCAL search_path=pg_catalog,public,pg_temp')
  const state=(await db.query(`SELECT current_database() AS database,to_regnamespace('admin_media') IS NOT NULL AS schema_present,
   to_regclass('admin_media.policy') IS NOT NULL AS policy_present,to_regclass('admin_media.admissions') IS NOT NULL AS admissions_present,
   to_regclass('admin_media.audit') IS NOT NULL AS audit_present,
   has_database_privilege('hod_migration',current_database(),'CREATE') AS owner_can_create_schema,
   pg_has_role('hod_admin_app','hod_migration','MEMBER') AS runtime_owner_membership,
   pg_has_role(session_user,'hod_migration','SET') AS runtime_can_set_owner,
   has_schema_privilege('hod_admin_app','public','USAGE') AS runtime_public_usage`)).rows[0]
  const roles=(await db.query(`SELECT rolname AS name,rolcanlogin AS login,rolinherit AS inherit,rolsuper AS superuser,
   rolcreatedb AS create_database,rolcreaterole AS create_role,rolreplication AS replication,rolbypassrls AS bypass_rls
   FROM pg_roles WHERE rolname=ANY(ARRAY['hod_migration','hod_admin_app','hod_admin_login_uat','hod_dev_migration']) ORDER BY rolname`)).rows
  const defaults=(await db.query(`SELECT d.defaclrole::regrole::text AS owner,n.nspname AS schema,d.defaclobjtype AS object_type,
   a.grantor::regrole::text AS grantor,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS grantee,
   a.privilege_type,a.is_grantable FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace,
   LATERAL aclexplode(d.defaclacl) a WHERE d.defaclrole='hod_migration'::regrole
   ORDER BY n.nspname NULLS FIRST,d.defaclobjtype,a.grantee,a.privilege_type`)).rows
  const tables=(await db.query(`SELECT name,${contentSnapshotSql()} AS snapshot,md5((${contentSnapshotSql()})::text) AS fingerprint
   FROM unnest(ARRAY['public.profiles','public.admin_identities']) x(name) JOIN pg_class c ON c.oid=to_regclass(name) ORDER BY name`)).rows
  return {...state,roles,defaults,tables,read_only:true,business_rows_read:false,providers_changed:false,server_started:false}
 },{snapshot:true})
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-14-media-preflight.json',JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({ok:true,read_only:true,schema_present:report.schema_present,owner_can_create_schema:report.owner_can_create_schema,
  runtime_owner_membership:report.runtime_owner_membership,runtime_can_set_owner:report.runtime_can_set_owner,
  dependency_tables:report.tables.length,default_acl_entries:report.defaults.length,business_rows_read:false}))
}catch(error){console.log(JSON.stringify({ok:false,code:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'MEDIA_PREFLIGHT_NOT_VERIFIED'}));process.exitCode=1}
finally{if(pool)await pool.end()}
