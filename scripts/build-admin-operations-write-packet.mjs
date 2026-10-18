// Builds a bounded three-table SQL packet; never connects or executes SQL.
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {contentSnapshotSql} from './admin-content-permission-snapshot.mjs'
const prefix='hod_admin_ops11_'
const q=s=>"'"+s.replaceAll("'","''")+"'"
const qi=s=>'"'+s.replaceAll('"','""')+'"'
const digest=s=>createHash('sha256').update(s).digest('hex')
export function operationsRequirements(){
 const fields=name=>{
  const source=fs.readFileSync(`lib/db/admin-repositories/${name}.ts`,'utf8')
  const literal=source.match(/const fields=\[([^\]]+)\] as const/)
  if(!literal)throw new Error('Repository field list changed')
  return [...literal[1].matchAll(/'([a-z_]+)'/g)].map(m=>m[1])
 }
 const coupon=fields('coupons'),settings=fields('settings')
 if(coupon.length!==17||settings.length!==5||coupon.includes('usage_count'))throw new Error('Unreviewed editable fields')
 return [
  {name:'public.coupons',insert:coupon,update:coupon,delete:true,predicate:'true'},
  {name:'public.site_settings',insert:['settings_key',...settings],update:settings,delete:false,predicate:"settings_key = 'global_site_settings'::text"},
  {name:'public.admin_notification_reads',insert:['admin_user_id','notification_key','read_at'],update:[],delete:false,
   predicate:"EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = admin_user_id AND p.role = 'admin')"},
 ]
}
export function buildOperationsPacket(current){
 for(const file of ['lib/db/admin-repositories/coupons.ts','lib/db/admin-repositories/settings.ts','lib/db/admin-repositories/notifications.ts'])
  if(digest(fs.readFileSync(file))!==current.source_hashes[file])throw new Error('Repository source drift')
 const scope=operationsRequirements().map(r=>{
  const t=current.tables.find(t=>t.name===r.name)
  if(!t||t.snapshot.owner!=='hod_migration'||!t.snapshot.rls||t.snapshot.force||t.writes||t.column_writes
   ||t.snapshot.policies.some(p=>!p.permissive||p.name.startsWith(prefix))
   ||t.sequences.some(s=>!s.identity))throw new Error('Operations prestate differs')
  return {...r,fingerprint:t.fingerprint,preserved:t.preserved,read_all:t.select_all,read_columns:t.select_columns??[]}
 })
 const allowedTriggers=current.triggers.filter(t=>scope.some(s=>s.name===t.relation))
 if(allowedTriggers.some(t=>t.routine!=='set_updated_at()'||t.owner!=='hod_migration'||t.definer
  ||t.sha256!=='199f5c02bd7c5ee76f3d2ba98482eddd62afcaa2b4915baed2a47fe3383b428e'))throw new Error('Unreviewed operations trigger')
 const declarations=`CREATE TEMP TABLE admin_ops11_scope ON COMMIT DROP AS
 SELECT * FROM jsonb_to_recordset(${q(JSON.stringify(scope))}::jsonb)
 AS s(name text,"insert" jsonb,"update" jsonb,"delete" boolean,predicate text,
 fingerprint text,preserved text,read_all boolean,read_columns jsonb);
`
 const header=`-- ADMIN-RDS-11: coupon edits, global settings and notification read-marking only.
-- Run once on HOD Staging / hod_staging as hod_dev_migration. No order/stock grants.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL ROLE hod_migration;
DO $target$ BEGIN
 IF current_database()<>'hod_staging' OR session_user<>'hod_dev_migration' OR current_user<>'hod_migration'
 THEN RAISE EXCEPTION 'Use HOD Staging / hod_staging / hod_dev_migration'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hod_admin_app' AND NOT rolcanlogin AND NOT rolinherit
 AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
 OR EXISTS(SELECT FROM pg_roles WHERE rolname<>'hod_admin_app' AND pg_has_role('hod_admin_app',oid,'MEMBER'))
 THEN RAISE EXCEPTION 'Unsafe admin capability'; END IF;
 IF NOT has_column_privilege('hod_admin_app','public.profiles','id','SELECT')
 OR NOT has_column_privilege('hod_admin_app','public.profiles','role','SELECT')
 THEN RAISE EXCEPTION 'Install and verify ADMIN-RDS-10 first'; END IF;
END $target$;
${declarations}`
 const full=contentSnapshotSql(),preserved=contentSnapshotSql({preservedOnly:true,policyPrefix:prefix})
 const rights=`IF has_table_privilege('hod_admin_app',r.name,'SELECT')<>r.read_all
 OR has_table_privilege('hod_admin_app',r.name,'DELETE')<>r."delete"
 OR has_table_privilege('hod_admin_app',r.name,'INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
 OR EXISTS(SELECT FROM pg_attribute a WHERE a.attrelid=to_regclass(r.name) AND a.attnum>0 AND NOT a.attisdropped AND (
 has_column_privilege('hod_admin_app',a.attrelid,a.attnum,'SELECT')<>(r.read_all OR r.read_columns ? a.attname::text)
 OR has_column_privilege('hod_admin_app',a.attrelid,a.attnum,'INSERT')<>(r."insert" ? a.attname::text)
 OR has_column_privilege('hod_admin_app',a.attrelid,a.attnum,'UPDATE')<>(r."update" ? a.attname::text)
 OR has_column_privilege('hod_admin_app',a.attrelid,a.attnum,'REFERENCES')))
 OR EXISTS(SELECT FROM pg_class c,LATERAL aclexplode(c.relacl) x WHERE c.oid=to_regclass(r.name)
 AND x.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND x.is_grantable)
 OR EXISTS(SELECT FROM pg_attribute a,LATERAL aclexplode(a.attacl) x WHERE a.attrelid=to_regclass(r.name)
 AND x.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND x.is_grantable)
 THEN RAISE EXCEPTION 'Operations privilege scope differs: %',r.name; END IF;`
 const preserve=`IF (SELECT md5((${preserved})::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.preserved
 THEN RAISE EXCEPTION 'Preserved operations schema/policies/ACL differ: %',r.name; END IF;`
 let forward=header+`DO $guard$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_ops11_scope ORDER BY name LOOP
 EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
 IF (SELECT md5((${full})::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.fingerprint
 THEN RAISE EXCEPTION 'Operations prestate differs or packet already installed: %',r.name; END IF;
 END LOOP; END $guard$;
`
 const policies=[]
 for(const r of scope){
  for(const [command,cols] of [['INSERT',r.insert],['UPDATE',r.update],['DELETE',r.delete?null:[]]]){
   if(cols?.length===0)continue
   const mode=command.toLowerCase()
   forward+=`GRANT ${command}${cols?'('+cols.map(qi).join(',')+')':''} ON ${r.name} TO hod_admin_app;\n`
   for(const restrictive of r.predicate==='true'?[false]:[false,true]){
    const name=prefix+mode+(restrictive?'_guard':'')
    forward+=`CREATE POLICY ${name} ON ${r.name}${restrictive?' AS RESTRICTIVE':''} FOR ${command} TO hod_admin_app`
     +(command!=='INSERT'?` USING(${r.predicate})`:'')+(command!=='DELETE'?` WITH CHECK(${r.predicate})`:'')+';\n'
    const predicate=r.name==='public.coupons'?'true':r.name==='public.site_settings'?"(settings_key = 'global_site_settings'::text)":
     "(EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = admin_notification_reads.admin_user_id) AND (p.role = 'admin'::text))))"
    policies.push({table:r.name,name,command:mode,restrictive,using:command==='INSERT'?null:predicate,check:command==='DELETE'?null:predicate})
   }
  }
 }
 // Pin the actual new policy definitions after CREATE, then verify role/command/
 // permissiveness/predicate during reversal. Source-generated expressions stay fixed.
 const policyGuard=`IF (SELECT count(*) FROM admin_ops11_scope s JOIN pg_policy p ON p.polrelid=to_regclass(s.name)
 WHERE left(p.polname,16)='${prefix}')<>${policies.length}
 THEN RAISE EXCEPTION 'Operations policy count differs'; END IF;
 FOR r IN SELECT * FROM admin_ops11_scope LOOP
  IF EXISTS(SELECT FROM pg_policy p WHERE p.polrelid=to_regclass(r.name) AND left(p.polname,16)='${prefix}' AND (
   p.polroles<>ARRAY[(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app')]
   OR (p.polpermissive = (right(p.polname,6)='_guard'))
   OR p.polcmd<>CASE split_part(p.polname,'_',4) WHEN 'insert' THEN 'a' WHEN 'update' THEN 'w' WHEN 'delete' THEN 'd' ELSE '?' END::"char"
   OR (p.polcmd='a' AND p.polqual IS NOT NULL) OR (p.polcmd='d' AND p.polwithcheck IS NOT NULL)
   OR (p.polcmd IN ('w','d') AND pg_get_expr(p.polqual,p.polrelid) IS DISTINCT FROM
    (SELECT pg_get_expr(x.polqual,x.polrelid) FROM pg_policy x WHERE x.polrelid=p.polrelid AND x.polname=replace(p.polname,'_guard','')))
   OR (p.polcmd IN ('a','w') AND pg_get_expr(p.polwithcheck,p.polrelid) IS DISTINCT FROM
    (SELECT pg_get_expr(x.polwithcheck,x.polrelid) FROM pg_policy x WHERE x.polrelid=p.polrelid AND x.polname=replace(p.polname,'_guard','')))))
  THEN RAISE EXCEPTION 'Operations policy shape differs: %',r.name; END IF;
 END LOOP;`
 // Exact inverse expressions are checked against a SQL parser-normalized temporary
 // policy on the same table, inside the transaction; no business changes involved.
 const exactPolicyGuard=policies.map(p=>{
  const r=scope.find(r=>r.name===p.table),cmd=p.command.toUpperCase()
  return `CREATE POLICY admin_ops11_compare ON ${p.table} FOR ${cmd} TO hod_admin_app${cmd!=='INSERT'?` USING(${r.predicate})`:''}${cmd!=='DELETE'?` WITH CHECK(${r.predicate})`:''};
DO $compare$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy p JOIN pg_policy x ON x.polrelid=p.polrelid AND x.polname='admin_ops11_compare'
 WHERE p.polrelid=${q(p.table)}::regclass AND p.polname=${q(p.name)} AND p.polcmd=x.polcmd
 AND p.polpermissive=${!p.restrictive} AND p.polroles=x.polroles
 AND pg_get_expr(p.polqual,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polqual,x.polrelid)
 AND pg_get_expr(p.polwithcheck,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polwithcheck,x.polrelid))
 THEN RAISE EXCEPTION 'Operations policy definition drift'; END IF;
END $compare$;
DROP POLICY admin_ops11_compare ON ${p.table};
`
 }).join('')
 forward+=exactPolicyGuard+`DO $verify$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_ops11_scope LOOP ${preserve} ${rights} END LOOP;
 ${policyGuard}
END $verify$;
RESET ROLE;
COMMIT;
SELECT jsonb_build_object('database',current_database(),'installed',true,'operation_tables',3,
 'orders_changed',false,'business_rows_changed',false,'providers_switched',false,
 'next','Agent verifies bounded coupon/notification writes; global settings and order cancellation need separate acceptance.') AS admin_operations_write_setup_result;
`
 let inverse=header+`DO $guard$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_ops11_scope ORDER BY name LOOP
 EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
 ${preserve} ${rights}
 END LOOP;
 ${policyGuard}
END $guard$;
`+exactPolicyGuard
 for(const p of policies)inverse+=`DROP POLICY ${p.name} ON ${p.table};\n`
 for(const r of scope){
  for(const [command,cols] of [['INSERT',r.insert],['UPDATE',r.update]])if(cols.length)inverse+=`REVOKE ${command}(${cols.map(qi).join(',')}) ON ${r.name} FROM hod_admin_app;\n`
  if(r.delete)inverse+=`REVOKE DELETE ON ${r.name} FROM hod_admin_app;\n`
 }
 inverse+=`DO $restore$ DECLARE r record; BEGIN FOR r IN SELECT * FROM admin_ops11_scope LOOP
 IF (SELECT md5((${full})::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.fingerprint
 THEN RAISE EXCEPTION 'Operations inverse did not restore prestate'; END IF;
 END LOOP; END $restore$;
RESET ROLE;
COMMIT;
`
 return {forward,inverse,scope,policies}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const current=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-11-operations-preflight.json','utf8'))
 const result=buildOperationsPacket(current)
 for(const mode of ['forward','inverse'])fs.writeFileSync(`docs/aws-phase-d/ADMIN-RDS-11-operations-write-${mode}.sql`,result[mode])
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-11-operations-write-scope.json',JSON.stringify({scope:result.scope,policies:result.policies,
  sql_sha256:digest(result.forward),inverse_sha256:digest(result.inverse)},null,2)+'\n')
 console.log(JSON.stringify({tables:result.scope.length,policies:result.policies.length,sql_sha256:digest(result.forward)}))
}
