import {contentSnapshotSql,contentSchemaAclSql} from './admin-content-permission-snapshot.mjs'
// All checks run inside the caller's existing READ ONLY transaction.
export async function inspectContentInstallation(db,packet){
 const rows=(await db.query(`SELECT s.name,
  md5((${contentSnapshotSql({preservedOnly:true})})::text)=s.preserved AS preserved,
  has_table_privilege('hod_admin_app',c.oid,'SELECT')=s.read_all
  AND has_table_privilege('hod_admin_app',c.oid,'DELETE')=(s."delete" OR s.lock_delete)
  AND NOT has_table_privilege('hod_admin_app',c.oid,'INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  AND NOT EXISTS(SELECT FROM aclexplode(c.relacl) x WHERE x.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND x.is_grantable)
  AND NOT EXISTS(SELECT FROM pg_attribute a,LATERAL aclexplode(a.attacl) x WHERE a.attrelid=c.oid
   AND x.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND x.is_grantable)
  AND NOT EXISTS(SELECT FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND (
   has_column_privilege('hod_admin_app',c.oid,a.attnum,'SELECT')<>(s.read_all OR s.read_columns ? a.attname::text)
   OR has_column_privilege('hod_admin_app',c.oid,a.attnum,'INSERT')<>(s."insert" ? a.attname::text)
   OR has_column_privilege('hod_admin_app',c.oid,a.attnum,'UPDATE')<>(s."update" ? a.attname::text)
   OR has_column_privilege('hod_admin_app',c.oid,a.attnum,'REFERENCES'))) AS rights,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('table',s.name,'name',p.polname,'command',p.polcmd::text,
   'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid),
   'role_correct',p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app')]) ORDER BY p.polname),'[]'::jsonb)
   FROM pg_policy p WHERE p.polrelid=c.oid AND left(p.polname,20)='hod_admin_content10_') AS policies
  FROM jsonb_to_recordset($1::jsonb) s(name text,preserved text,read_all boolean,read_columns jsonb,
   "delete" boolean,lock_delete boolean,"insert" jsonb,"update" jsonb)
  LEFT JOIN pg_class c ON c.oid=to_regclass(s.name) ORDER BY s.name`,[JSON.stringify(packet.scope)])).rows
 const results=rows.map(r=>{
  const wanted=packet.policies.filter(p=>p.table===r.name).sort((a,b)=>a.name.localeCompare(b.name))
  const actual=r.policies.map(p=>{const {role_correct,...policy}=p;return {policy,role_correct}})
  const policies=actual.length===wanted.length&&actual.every((p,i)=>p.role_correct===true
   &&Object.keys(wanted[i]).every(k=>p.policy[k]===wanted[i][k]))
  return {name:r.name,ok:r.preserved===true&&r.rights===true&&policies,
   preserved:r.preserved===true,rights:r.rights===true,policies}
 })
 const sequence=(await db.query("SELECT has_sequence_privilege('hod_admin_app','public.blog_post_products_id_seq','USAGE') AND NOT has_sequence_privilege('hod_admin_app','public.blog_post_products_id_seq','SELECT,UPDATE') AS ok")).rows[0]?.ok===true
 const auth=(await db.query(`SELECT ${contentSchemaAclSql(true)}=$1 AND n.nspowner::regrole::text='hod_migration'
  AND has_schema_privilege('hod_admin_app',n.oid,'USAGE') AND NOT has_schema_privilege('hod_admin_app',n.oid,'CREATE')
  AND NOT EXISTS(SELECT FROM aclexplode(n.nspacl) x WHERE x.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND x.is_grantable) AS ok
  FROM pg_namespace n WHERE n.nspname='auth'`,[packet.auth_schema.preserved_hash])).rows[0]?.ok===true
 return {ok:results.length===66&&results.every(r=>r.ok)&&sequence&&auth,tables:results,sequence,policy_helper_schema:auth}
}
