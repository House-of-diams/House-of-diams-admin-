import {contentSnapshotSql} from './admin-content-permission-snapshot.mjs'
const normalized=s=>s===null?null:s.replace(/\s+/g,'')
export async function inspectOperationsInstallation(db,packet){
 const rows=(await db.query(`SELECT s.name,
  md5((${contentSnapshotSql({preservedOnly:true,policyPrefix:'hod_admin_ops11_'})})::text)=s.preserved AS preserved,
  has_table_privilege('hod_admin_app',c.oid,'SELECT')=s.read_all
  AND has_table_privilege('hod_admin_app',c.oid,'DELETE')=s."delete"
  AND NOT has_table_privilege('hod_admin_app',c.oid,'INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  AND NOT EXISTS(SELECT FROM aclexplode(c.relacl) x WHERE x.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND x.is_grantable)
  AND NOT EXISTS(SELECT FROM pg_attribute a,LATERAL aclexplode(a.attacl) x WHERE a.attrelid=c.oid
   AND x.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND x.is_grantable)
  AND NOT EXISTS(SELECT FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND (
   has_column_privilege('hod_admin_app',c.oid,a.attnum,'SELECT')<>(s.read_all OR s.read_columns ? a.attname::text)
   OR has_column_privilege('hod_admin_app',c.oid,a.attnum,'INSERT')<>(s."insert" ? a.attname::text)
   OR has_column_privilege('hod_admin_app',c.oid,a.attnum,'UPDATE')<>(s."update" ? a.attname::text)
   OR has_column_privilege('hod_admin_app',c.oid,a.attnum,'REFERENCES'))) AS rights,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd::text,'permissive',p.polpermissive,
   'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid),
   'role_correct',p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app')])),'[]'::jsonb)
   FROM pg_policy p WHERE p.polrelid=c.oid AND left(p.polname,16)='hod_admin_ops11_') AS policies
  FROM jsonb_to_recordset($1::jsonb) s(name text,preserved text,read_all boolean,read_columns jsonb,
   "delete" boolean,"insert" jsonb,"update" jsonb)
  LEFT JOIN pg_class c ON c.oid=to_regclass(s.name) ORDER BY s.name`,[JSON.stringify(packet.scope)])).rows
 const tables=rows.map(r=>{
  const wanted=packet.policies.filter(p=>p.table===r.name)
  const policies=r.policies.length===wanted.length&&wanted.every(e=>{
   const p=r.policies.find(p=>p.name===e.name)
   return p?.role_correct===true&&p.permissive===!e.restrictive&&p.cmd===({insert:'a',update:'w',delete:'d'}[e.command])
    &&normalized(p.using)===normalized(e.using)&&normalized(p.check)===normalized(e.check)
  })
  return {name:r.name,ok:r.preserved===true&&r.rights===true&&policies,preserved:r.preserved===true,rights:r.rights===true,policies}
 })
 return {ok:tables.length===3&&tables.every(t=>t.ok),tables}
}
