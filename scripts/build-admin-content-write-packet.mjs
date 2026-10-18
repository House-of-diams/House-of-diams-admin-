// Produces SQL only. Never connects or installs privileges.
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {contentSnapshotSql,contentSequenceAclSql,contentSchemaAclSql} from './admin-content-permission-snapshot.mjs'
import {contentWriteRequirements} from './admin-content-write-requirements.mjs'
const q=s=>"'"+s.replaceAll("'","''")+"'"
const qi=s=>'"'+s.replaceAll('"','""')+'"'
const prefix='hod_admin_content10_'
export function buildContentPacket(manifest,current){
 manifest=contentWriteRequirements(manifest)
 const scope=current.tables.map(t=>{
  const r=manifest.relations.find(r=>r.relation===t.name)
  if(!r||!/^public\.[a-z_]+$/.test(t.name)||t.snapshot.owner!=='hod_migration'||!t.snapshot.rls||t.snapshot.force
   ||t.writes||t.column_writes)throw new Error('Unreviewed content table')
  const addedRead=t.name==='public.profiles'?['id','role']:[]
  return {name:t.name,fingerprint:t.fingerprint,preserved:t.preserved_fingerprint,
   insert:r.insert,update:r.update,delete:r.delete,lock_delete:r.lock_delete===true,
   added_read:addedRead,added_all:t.name==='public.cms_save_receipts',
   read_all:t.select_all||t.name==='public.cms_save_receipts',
   read_columns:[...new Set([...(t.select_columns??[]),...addedRead])],
   before_read_all:t.select_all,before_read_columns:t.select_columns??[]}
 })
 if(scope.length!==66||current.routines.length!==27||current.sequences.length!==1)throw new Error('Unexpected scope size')
 const seq=current.sequences[0]
 const auth=current.auth_schema
 if(!auth||auth.owner!=='hod_migration'||auth.usage||auth.create||!current.auth_helpers.length
  ||current.auth_helpers.some(h=>h.definer||h.owner!=='hod_migration'||!h.executable))throw new Error('Legacy policy helper prestate differs')
 if(seq.name!=='public.blog_post_products_id_seq'||seq.owner!=='hod_migration'||seq.accessible)throw new Error('Sequence prestate differs')
 const scopeSql=`CREATE TEMP TABLE admin_content10_scope ON COMMIT DROP AS
 SELECT * FROM jsonb_to_recordset(${q(JSON.stringify(scope))}::jsonb)
 AS s(name text,fingerprint text,preserved text,insert jsonb,update jsonb,delete boolean,lock_delete boolean,
 added_read jsonb,added_all boolean,read_all boolean,read_columns jsonb,before_read_all boolean,before_read_columns jsonb);
`
 // JSON field names INSERT/UPDATE/DELETE are quoted in declarations/references.
 const declarations=scopeSql.replace('insert jsonb,update jsonb,delete boolean','"insert" jsonb,"update" jsonb,"delete" boolean')
 const header=`-- ADMIN-RDS-10: scoped content writes, profile ID/role check and save receipts.
-- Run the entire FORWARD file once: HOD Staging / hod_staging / hod_dev_migration.
-- No business rows, role memberships, function bodies or storefront rights change.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
SET LOCAL ROLE hod_migration;
DO $target$ BEGIN
 IF current_database()<>'hod_staging' OR session_user<>'hod_dev_migration' OR current_user<>'hod_migration'
 THEN RAISE EXCEPTION 'Use HOD Staging / hod_staging / hod_dev_migration'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hod_admin_app' AND NOT rolcanlogin AND NOT rolinherit
  AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
 OR EXISTS(SELECT FROM pg_roles WHERE rolname<>'hod_admin_app' AND pg_has_role('hod_admin_app',oid,'MEMBER'))
 THEN RAISE EXCEPTION 'Unsafe admin capability'; END IF;
END $target$;
${declarations}`
 const routineGuard=`DO $routines$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM jsonb_to_recordset(${q(JSON.stringify([...current.routines,...current.auth_helpers]))}::jsonb)
 AS x(signature text,definer boolean,owner text,sha256 text,executable boolean) LOOP
  IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(r.signature) AND p.proowner::regrole::text=r.owner
    AND p.prosecdef=r.definer AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.sha256
    AND has_function_privilege('hod_admin_app',p.oid,'EXECUTE'))
  THEN RAISE EXCEPTION 'Saved content routine differs: %',r.signature; END IF;
 END LOOP;
END $routines$;
`
 const preserved=contentSnapshotSql({preservedOnly:true})
 const full=contentSnapshotSql()
 const preservationCheck=`IF (SELECT md5((${preserved})::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.preserved
 THEN RAISE EXCEPTION 'Existing policies/schema/other-role ACL changed: %',r.name; END IF;`
 const policyExpected=[]
 const policy=(r,name,command,permissive,using,check)=>policyExpected.push({table:r.name,name:prefix+name,command,permissive,using,check})
 for(const r of scope){
  if(r.added_all||r.added_read.length)policy(r,'select','r',true,'true',null)
  if(r.insert.length)policy(r,'insert','a',true,null,'true')
  if(r.update.length)policy(r,'update','w',true,'true','true')
  if(r.delete)policy(r,'delete','d',true,'true',null)
  if(r.lock_delete)policy(r,'lock_guard','d',false,'false',null)
 }
 const rightsCheck=`IF has_table_privilege('hod_admin_app',r.name,'SELECT')<>r.read_all
 OR has_table_privilege('hod_admin_app',r.name,'DELETE')<>(r."delete" OR r.lock_delete)
 OR has_table_privilege('hod_admin_app',r.name,'INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
 OR EXISTS(SELECT FROM pg_class c,LATERAL aclexplode(c.relacl) x WHERE c.oid=to_regclass(r.name)
  AND x.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND x.is_grantable)
 OR EXISTS(SELECT FROM pg_attribute a,LATERAL aclexplode(a.attacl) x WHERE a.attrelid=to_regclass(r.name)
  AND x.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND x.is_grantable)
 OR EXISTS(SELECT FROM pg_attribute a WHERE a.attrelid=to_regclass(r.name) AND a.attnum>0 AND NOT a.attisdropped AND (
  has_column_privilege('hod_admin_app',a.attrelid,a.attnum,'SELECT')<>(r.read_all OR r.read_columns ? a.attname::text)
  OR has_column_privilege('hod_admin_app',a.attrelid,a.attnum,'INSERT')<>(r."insert" ? a.attname::text)
  OR has_column_privilege('hod_admin_app',a.attrelid,a.attnum,'UPDATE')<>(r."update" ? a.attname::text)
  OR has_column_privilege('hod_admin_app',a.attrelid,a.attnum,'REFERENCES')))
 THEN RAISE EXCEPTION 'Admin rights differ from exact reviewed scope: %',r.name; END IF;`
 const policyProjection=`SELECT jsonb_build_object('table',s.name,'name',p.polname,'command',p.polcmd::text,
   'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) AS item
  FROM admin_content10_scope s JOIN pg_policy p ON p.polrelid=to_regclass(s.name)
  WHERE left(p.polname,20)='${prefix}'
   AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app')]`
 const policyCheck=`IF EXISTS(
 (${policyProjection} EXCEPT SELECT value FROM jsonb_array_elements(${q(JSON.stringify(policyExpected))}::jsonb))
 UNION ALL
 (SELECT value FROM jsonb_array_elements(${q(JSON.stringify(policyExpected))}::jsonb)
  EXCEPT ${policyProjection})
 ) OR (SELECT count(*) FROM admin_content10_scope s JOIN pg_policy p ON p.polrelid=to_regclass(s.name)
 WHERE left(p.polname,20)='${prefix}')<>${policyExpected.length}
 THEN RAISE EXCEPTION 'Content policy scope differs'; END IF;`
 const seqGuard=`IF NOT EXISTS(SELECT FROM pg_class c WHERE c.oid=to_regclass(${q(seq.name)}) AND c.relkind='S'
 AND c.relowner::regrole::text='hod_migration' AND ${contentSequenceAclSql}=${q(seq.acl_hash)})
 THEN RAISE EXCEPTION 'Serial sequence prestate differs'; END IF;`
 const authBefore=`IF NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspname='auth' AND n.nspowner::regrole::text='hod_migration'
 AND ${contentSchemaAclSql()}=${q(auth.acl_hash)}) THEN RAISE EXCEPTION 'Legacy helper schema prestate differs'; END IF;`
 const authAfter=`IF NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspname='auth' AND n.nspowner::regrole::text='hod_migration'
 AND ${contentSchemaAclSql(true)}=${q(auth.preserved_hash)} AND has_schema_privilege('hod_admin_app',n.oid,'USAGE')
 AND NOT has_schema_privilege('hod_admin_app',n.oid,'CREATE')
 AND NOT EXISTS(SELECT FROM aclexplode(n.nspacl) x WHERE x.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND x.is_grantable))
 THEN RAISE EXCEPTION 'Legacy helper schema rights differ'; END IF;`
 let forward=header+routineGuard+`DO $guard$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_content10_scope ORDER BY name LOOP
  EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
  IF (SELECT md5((${full})::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.fingerprint
  THEN RAISE EXCEPTION 'Content prestate differs or packet already installed: %',r.name; END IF;
 END LOOP;
 ${seqGuard}
 ${authBefore}
END $guard$;
`
 for(const r of scope){
  for(const [command,columns] of [['INSERT',r.insert],['UPDATE',r.update]])if(columns.length){
   forward+=`GRANT ${command}(${columns.map(qi).join(',')}) ON ${r.name} TO hod_admin_app;\n`
   forward+=`CREATE POLICY ${prefix+command.toLowerCase()} ON ${r.name} FOR ${command} TO hod_admin_app ${command==='UPDATE'?'USING(true) ':''}WITH CHECK(true);\n`
  }
  if(r.delete)forward+=`GRANT DELETE ON ${r.name} TO hod_admin_app;\nCREATE POLICY ${prefix}delete ON ${r.name} FOR DELETE TO hod_admin_app USING(true);\n`
  if(r.lock_delete)forward+=`GRANT DELETE ON ${r.name} TO hod_admin_app;\nCREATE POLICY ${prefix}lock_guard ON ${r.name} AS RESTRICTIVE FOR DELETE TO hod_admin_app USING(false);\n`
  if(r.added_all||r.added_read.length)forward+=`GRANT SELECT${r.added_all?'':'('+r.added_read.map(qi).join(',')+')'} ON ${r.name} TO hod_admin_app;\nCREATE POLICY ${prefix}select ON ${r.name} FOR SELECT TO hod_admin_app USING(true);\n`
 }
 forward+=`GRANT USAGE ON SEQUENCE ${seq.name} TO hod_admin_app;
GRANT USAGE ON SCHEMA auth TO hod_admin_app;
DO $verify$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_content10_scope LOOP
  ${preservationCheck}
  ${rightsCheck}
 END LOOP;
 ${policyCheck}
 ${authAfter}
END $verify$;
RESET ROLE;
COMMIT;
SELECT jsonb_build_object('database',current_database(),'installed',true,'content_tables',65,
 'profile_columns','id,role','business_rows_changed',false,'providers_switched',false,
 'next','Agent verifies content writes with rollback; media and other gates remain pending.') AS admin_content_write_setup_result;
`
 // Inverse validates exact installed rights/policies and unchanged preserved state first.
 let inverse=header+routineGuard+`DO $guard$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_content10_scope ORDER BY name LOOP
  EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
  ${preservationCheck}
  ${rightsCheck}
 END LOOP;
 ${policyCheck}
 ${authAfter}
 IF NOT has_sequence_privilege('hod_admin_app',${q(seq.name)},'USAGE')
 OR has_sequence_privilege('hod_admin_app',${q(seq.name)},'SELECT,UPDATE')
 THEN RAISE EXCEPTION 'Sequence rights differ'; END IF;
END $guard$;
`
 for(const r of scope){
  for(const [command,columns] of [['INSERT',r.insert],['UPDATE',r.update]])if(columns.length)
   inverse+=`DROP POLICY ${prefix+command.toLowerCase()} ON ${r.name};\nREVOKE ${command}(${columns.map(qi).join(',')}) ON ${r.name} FROM hod_admin_app;\n`
  if(r.delete)inverse+=`DROP POLICY ${prefix}delete ON ${r.name};\nREVOKE DELETE ON ${r.name} FROM hod_admin_app;\n`
  if(r.lock_delete)inverse+=`DROP POLICY ${prefix}lock_guard ON ${r.name};\nREVOKE DELETE ON ${r.name} FROM hod_admin_app;\n`
  if(r.added_all||r.added_read.length)inverse+=`DROP POLICY ${prefix}select ON ${r.name};\nREVOKE SELECT${r.added_all?'':'('+r.added_read.map(qi).join(',')+')'} ON ${r.name} FROM hod_admin_app;\n`
 }
 inverse+=`REVOKE USAGE ON SEQUENCE ${seq.name} FROM hod_admin_app;
REVOKE USAGE ON SCHEMA auth FROM hod_admin_app;
DO $verify$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_content10_scope LOOP
  IF (SELECT md5((${full})::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.fingerprint
  THEN RAISE EXCEPTION 'Inverse did not restore prestate: %',r.name; END IF;
 END LOOP;
 ${seqGuard}
 ${authBefore}
END $verify$;
RESET ROLE;
COMMIT;
`
 return {forward,inverse,scope,policies:policyExpected,auth_schema:auth}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
 const result=buildContentPacket(read('docs/aws-phase-d/D1e-minimum-grant-manifest.json'),read('docs/aws-phase-d/ADMIN-RDS-10-content-write-preflight.json'))
 const hash=s=>createHash('sha256').update(s).digest('hex')
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-10-content-write-forward.sql',result.forward)
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-10-content-write-inverse.sql',result.inverse)
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-10-content-write-scope.json',JSON.stringify({scope:result.scope,policies:result.policies,auth_schema:result.auth_schema,
  sql_sha256:hash(result.forward),inverse_sha256:hash(result.inverse)},null,2)+'\n')
 console.log(JSON.stringify({tables:result.scope.length,policies:result.policies.length,sql_sha256:hash(result.forward)}))
}
