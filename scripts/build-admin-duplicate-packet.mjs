import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {contentSnapshotSql} from './admin-content-permission-snapshot.mjs'
import {duplicateBody,duplicateFunctionSql,duplicateSignature,duplicateChildren} from './admin-duplicate-capability-sql.mjs'
import {duplicateOwnerProbeSql} from './admin-duplicate-owner-probe-sql.mjs'
const q=s=>"'"+s.replaceAll("'","''")+"'"
const hash=s=>createHash('sha256').update(s).digest('hex')
export function buildDuplicatePacket(metadata){
 const expected=[...duplicateChildren,'products','profiles','admin_identities','product_duplicate_requests',
  'catalog_categories','catalog_subcategories','catalog_options','product_content_rules','catalog_metals',
  'catalog_material_values','catalog_stone_shapes','catalog_gst_slabs','catalog_ring_categories','catalog_styles'].map(n=>'public.'+n).sort()
 if(metadata.helper_present||metadata.tables.map(t=>t.name).sort().join('|')!==expected.join('|')
  ||metadata.tables.some(t=>t.snapshot.owner!=='hod_migration'||t.snapshot.force)
  ||metadata.legacy.sha256!=='6399ed7f5ef20c613fa12f50f7c3bc3161c43d48a5a668ece29f19d3761ec337'
  ||metadata.legacy.owner!=='hod_migration'||!metadata.legacy.definer||!metadata.legacy.runtime_execute)throw Error('Unreviewed duplicate prestate')
 const scope=metadata.tables.map(t=>({name:t.name,fingerprint:t.fingerprint}))
 const routines=[...new Map(metadata.triggers.map(t=>['public.'+t.routine,{signature:'public.'+t.routine,owner:t.owner,definer:t.definer,sha256:t.sha256}])).values(),
  {signature:'public.duplicate_product(uuid,uuid,uuid)',owner:metadata.legacy.owner,definer:metadata.legacy.definer,sha256:metadata.legacy.sha256}]
 const header=`-- ADMIN-RDS-13: new restricted preparation helper; existing copier stays unchanged.
-- Run the ENTIRE file once: HOD Staging / hod_staging / hod_dev_migration.
-- Fresh test product/copy/receipt rows are rolled back. No existing rows edited.
BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='90s';
SET LOCAL search_path=pg_catalog,public,pg_temp;
SET LOCAL ROLE hod_migration;
DO $target$ BEGIN
 IF current_database()<>'hod_staging' OR session_user<>'hod_dev_migration' OR current_user<>'hod_migration'
 THEN RAISE EXCEPTION 'Use HOD Staging / hod_staging / hod_dev_migration'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hod_admin_app' AND NOT rolcanlogin AND NOT rolinherit
 AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
 OR EXISTS(SELECT FROM pg_roles WHERE rolname<>'hod_admin_app' AND pg_has_role('hod_admin_app',oid,'MEMBER'))
 THEN RAISE EXCEPTION 'Unsafe admin capability'; END IF;
END $target$;
CREATE TEMP TABLE admin_duplicate13_scope ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset(${q(JSON.stringify(scope))}::jsonb) AS s(name text,fingerprint text);
`
 const dependencies=`DO $dependencies$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_duplicate13_scope ORDER BY name LOOP
  EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
  IF (SELECT md5((${contentSnapshotSql()})::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.fingerprint
  THEN RAISE EXCEPTION 'Duplicate dependency schema/ACL/policy/trigger differs: %',r.name; END IF;
 END LOOP;
 FOR r IN SELECT * FROM jsonb_to_recordset(${q(JSON.stringify(routines))}::jsonb) AS x(signature text,owner text,definer boolean,sha256 text) LOOP
  IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(r.signature) AND p.proowner::regrole::text=r.owner
   AND p.prosecdef=r.definer AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.sha256)
  THEN RAISE EXCEPTION 'Shared duplicate routine differs: %',r.signature; END IF;
 END LOOP;
 IF NOT has_function_privilege('hod_admin_app','public.duplicate_product(uuid,uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Original copy execution missing'; END IF;
END $dependencies$;
`
 const capability=`DO $capability$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure(${q(duplicateSignature)})
  AND p.proowner::regrole::text='hod_migration' AND p.prosecdef AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof
  AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND p.prokind='f' AND p.provolatile='v' AND p.proparallel='u'
  AND p.pronargdefaults=0 AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=${q(hash(duplicateBody))}
  AND has_function_privilege('hod_admin_app',p.oid,'EXECUTE')
  AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.privilege_type='EXECUTE' AND (a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))
    OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND a.is_grantable))))
 THEN RAISE EXCEPTION 'Duplicate capability owner/body/settings/ACL differ'; END IF;
END $capability$;
`
 const forward=header+dependencies+`DO $absent$ BEGIN IF to_regprocedure(${q(duplicateSignature)}) IS NOT NULL
 OR to_regprocedure('public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid)') IS NOT NULL THEN
 RAISE EXCEPTION 'Duplicate capability already exists; do not replay'; END IF; END $absent$;
`+duplicateFunctionSql+capability+duplicateOwnerProbeSql+dependencies+capability+`RESET ROLE;
COMMIT;
SELECT jsonb_build_object('database',current_database(),'installed',true,'capability','admin_product_duplicate_prepare_v1',
 'owner_rollback_probe_passed',true,'fixture_rows_absent',true,'existing_business_rows_changed',false,
 'sequence_counters_may_advance',true,'providers_switched',false,'legacy_copier_changed',false,
 'next','Agent verifies installed helper and runtime isolation. Concurrent-session, video/media and wider acceptance remain pending.') AS admin_duplicate_capability_setup_result;
`
 const inverse=header+dependencies+capability+`DROP FUNCTION ${duplicateSignature};
`+dependencies+`RESET ROLE;
COMMIT;
`
 return {forward,inverse,scope,routines,body_sha256:hash(duplicateBody)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const metadata=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-13-duplicate-preflight.json','utf8'))
 const packet=buildDuplicatePacket(metadata)
 for(const mode of ['forward','inverse'])fs.writeFileSync(`docs/aws-phase-d/ADMIN-RDS-13-duplicate-${mode}.sql`,packet[mode])
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-13-duplicate-scope.json',JSON.stringify({scope:packet.scope,routines:packet.routines,body_sha256:packet.body_sha256,
  sql_sha256:hash(packet.forward),inverse_sha256:hash(packet.inverse)},null,2)+'\n')
 console.log(JSON.stringify({tables:packet.scope.length,capabilities:1,sql_sha256:hash(packet.forward)}))
}
