// SQL generation only. No service calls, business reads, installation or provider changes.
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {contentSnapshotSql} from './admin-content-permission-snapshot.mjs'
import {orderBody,orderFunctionSql,orderSignature} from './admin-order-capability-sql.mjs'
import {orderOwnerProbeSql} from './admin-order-owner-probe-sql.mjs'
const q=s=>"'"+s.replaceAll("'","''")+"'"
const hash=s=>createHash('sha256').update(s).digest('hex')
export function buildOrderPacket(metadata){
 const expected=['orders','order_items','products','inventory_adjustments','order_status_history','inventory_reservations',
  'profiles','admin_identities','catalog_categories','catalog_subcategories','catalog_options','product_content_rules'].map(n=>'public.'+n).sort()
 if(metadata.helper_present||metadata.tables.length!==12||metadata.tables.map(t=>t.name).sort().join('|')!==expected.join('|')
  ||metadata.tables.some(t=>t.snapshot.owner!=='hod_migration'||t.snapshot.force))throw new Error('Unexpected order prestate')
 const scope=metadata.tables.map(t=>({name:t.name,fingerprint:t.fingerprint}))
 const header=`-- ADMIN-RDS-12: one admin-only order update capability; no general write grants.
-- Run ENTIRE file once: HOD Staging / hod_staging / hod_dev_migration.
-- Includes fresh inactive test product/orders ONLY inside a rolled-back savepoint.
-- Existing storefront functions, triggers, ACLs and business rows stay unchanged.
BEGIN;
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
CREATE TEMP TABLE admin_order12_scope ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset(${q(JSON.stringify(scope))}::jsonb) AS s(name text,fingerprint text);
`
 const tableGuard=`DO $tables$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_order12_scope ORDER BY name LOOP
  EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
  IF (SELECT md5((${contentSnapshotSql()})::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.fingerprint
  THEN RAISE EXCEPTION 'Order dependency schema/trigger/policy/ACL differs: %',r.name; END IF;
 END LOOP;
END $tables$;
`
 const triggers=[...new Map(metadata.triggers.map(t=>['public.'+t.routine,{signature:'public.'+t.routine,owner:t.owner,definer:t.definer,sha256:t.sha256}])).values()]
 const triggerGuard=`DO $triggers$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM jsonb_to_recordset(${q(JSON.stringify(triggers))}::jsonb)
 AS x(signature text,owner text,definer boolean,sha256 text) LOOP
 IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(r.signature) AND p.proowner::regrole::text=r.owner
 AND p.prosecdef=r.definer AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.sha256)
 THEN RAISE EXCEPTION 'Shared order dependency function differs: %',r.signature; END IF;
 END LOOP; END $triggers$;
`
 const capabilityGuard=`DO $capability$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure(${q(orderSignature)})
  AND p.proowner::regrole::text='hod_migration' AND p.prosecdef AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof
  AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND p.prokind='f' AND p.provolatile='v' AND p.proparallel='u'
  AND p.pronargdefaults=0 AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=${q(hash(orderBody))}
  AND has_function_privilege('hod_admin_app',p.oid,'EXECUTE')
  AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.privilege_type='EXECUTE' AND (a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))
    OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND a.is_grantable))))
 THEN RAISE EXCEPTION 'Order capability owner/body/settings/ACL differ'; END IF;
END $capability$;
`
 const absent=`DO $absent$ BEGIN IF to_regprocedure(${q(orderSignature)}) IS NOT NULL THEN
 RAISE EXCEPTION 'Order capability already exists; do not replay'; END IF; END $absent$;
`
 const forward=header+tableGuard+triggerGuard+absent+orderFunctionSql+capabilityGuard+orderOwnerProbeSql+tableGuard+triggerGuard+capabilityGuard+`RESET ROLE;
COMMIT;
SELECT jsonb_build_object('database',current_database(),'installed',true,'capability','admin_order_status_update_v1',
 'owner_rollback_probe_passed',true,'fixture_rows_absent',true,'direct_order_stock_grants_added',false,
 'existing_business_rows_changed',false,'sequence_counters_may_advance',true,'providers_switched',false,
 'reservation_lifecycle','Existing active reservation behavior retained; separate acceptance pending',
 'next','Agent verifies isolated runtime capability; hosted route/mail/concurrency and wider migration gates remain pending.') AS admin_order_capability_setup_result;
`
 const inverse=header+tableGuard+triggerGuard+capabilityGuard+`DROP FUNCTION ${orderSignature};
`+tableGuard+triggerGuard+`RESET ROLE;
COMMIT;
`
 return {forward,inverse,scope,body_sha256:hash(orderBody)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const metadata=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-12-order-preflight.json','utf8'))
 const packet=buildOrderPacket(metadata)
 for(const mode of ['forward','inverse'])fs.writeFileSync(`docs/aws-phase-d/ADMIN-RDS-12-order-${mode}.sql`,packet[mode])
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-12-order-scope.json',JSON.stringify({scope:packet.scope,body_sha256:packet.body_sha256,
  sql_sha256:hash(packet.forward),inverse_sha256:hash(packet.inverse)},null,2)+'\n')
 console.log(JSON.stringify({tables:12,capabilities:1,sql_sha256:hash(packet.forward)}))
}
