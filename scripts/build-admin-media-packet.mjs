import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {mediaCoreSql,mediaSources,mediaPolicy} from './admin-media-schema-sql.mjs'
import {mediaCatalogSql} from './admin-media-catalog.mjs'
import {mediaOwnerProbeSql} from './admin-media-owner-probe-sql.mjs'
import {contentSnapshotSql} from './admin-content-permission-snapshot.mjs'
import {createMediaFixture} from './admin-media-test-fixture.mjs'
const q=s=>"'"+s.replaceAll("'","''")+"'"
const hash=s=>createHash('sha256').update(s).digest('hex')
export function buildMediaPacket(preflight,manifest){
 if(preflight.schema_present||!preflight.owner_can_create_schema||preflight.runtime_owner_membership||preflight.runtime_can_set_owner
  ||preflight.defaults.length||preflight.tables.length!==2||preflight.tables.map(t=>t.name).sort().join('|')!=='public.admin_identities|public.profiles'
  ||preflight.tables.some(t=>t.snapshot.owner!=='hod_migration'||t.snapshot.force))throw Error('Media prestate requires review')
 const scope=preflight.tables.map(t=>({name:t.name,fingerprint:t.fingerprint}))
 const header=`-- ADMIN-RDS-14: isolated media registry foundation; policy remains DISABLED.
-- Run the ENTIRE file once: HOD Staging / hod_staging / hod_dev_migration.
-- Database-only fixture rows roll back. No S3 bytes, cloud policy or provider change.
BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='90s';SET LOCAL search_path=pg_catalog,public,pg_temp;
SET LOCAL ROLE hod_migration;
DO $target$ BEGIN
 IF current_database()<>'hod_staging' OR session_user<>'hod_dev_migration' OR current_user<>'hod_migration'
 THEN RAISE EXCEPTION 'Use HOD Staging / hod_staging / hod_dev_migration'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hod_migration' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hod_admin_app' AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
 OR EXISTS(SELECT FROM pg_roles WHERE rolname<>'hod_admin_app' AND pg_has_role('hod_admin_app',oid,'MEMBER'))
 OR NOT has_database_privilege('hod_migration',current_database(),'CREATE')
 THEN RAISE EXCEPTION 'Media owner/capability isolation differs'; END IF;
 IF EXISTS(SELECT FROM pg_default_acl WHERE defaclrole='hod_migration'::regrole)
 THEN RAISE EXCEPTION 'Owner default ACL changed; review before installation'; END IF;
END $target$;
CREATE TEMP TABLE admin_media14_scope ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset(${q(JSON.stringify(scope))}::jsonb) AS s(name text,fingerprint text);
`
 const dependencies=`DO $dependencies$ DECLARE r record;BEGIN
 FOR r IN SELECT * FROM admin_media14_scope ORDER BY name LOOP
  EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
  IF (SELECT md5((${contentSnapshotSql()})::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.fingerprint
  THEN RAISE EXCEPTION 'Media identity dependency differs: %',r.name; END IF;
 END LOOP;
END $dependencies$;
`
 const installed=`DO $manifest$ BEGIN
 IF (${mediaCatalogSql}) IS DISTINCT FROM ${q(JSON.stringify(manifest))}::jsonb
 THEN RAISE EXCEPTION 'Media schema/ACL/policy/function/trigger manifest differs'; END IF;
END $manifest$;
`
 const empty=`DO $empty$ BEGIN
 IF EXISTS(SELECT FROM admin_media.admissions) OR (SELECT count(*) FROM admin_media.policy)<>1 OR (SELECT count(*) FROM admin_media.audit)<>1
 OR NOT EXISTS(SELECT FROM admin_media.policy WHERE singleton AND NOT enabled AND policy=${q(mediaPolicy)}
  AND review_reference='ADMIN-RDS-14-foundation-only' AND sources=${q(JSON.stringify(mediaSources))}::jsonb)
 OR NOT EXISTS(SELECT FROM admin_media.audit a JOIN admin_media.policy p ON p.singleton WHERE a.relation_name='policy'
  AND a.operation='INSERT' AND a.before_state IS NULL AND a.after_state=to_jsonb(p))
 THEN RAISE EXCEPTION 'Media rows/activation/audit differ; no automatic inverse'; END IF;
END $empty$;
`
 const forward=header+dependencies+`DO $absent$ BEGIN IF to_regnamespace('admin_media') IS NOT NULL THEN
 RAISE EXCEPTION 'Media schema already exists; do not replay'; END IF; END $absent$;
`+mediaCoreSql+installed+mediaOwnerProbeSql+installed+dependencies+empty+`RESET ROLE;
COMMIT;
SELECT jsonb_build_object('database',current_database(),'installed',true,'media_tables',3,'policy_enabled',false,
 'owner_database_probe_passed',true,'fixture_rows_absent',true,'s3_objects_changed',false,'providers_switched',false,
 'existing_business_rows_changed',false,'next','Agent verifies registry isolation; AWS IAM/CDN/immutability and publication remain pending.') AS admin_media_foundation_setup_result;
`
 const inverse=header+dependencies+installed+empty+`DROP TABLE admin_media.admissions,admin_media.policy,admin_media.audit;
DROP FUNCTION admin_media.guard_admission(),admin_media.audit_change(),admin_media.enrolled_actor(uuid,text,text);
DROP SCHEMA admin_media;
`+dependencies+`RESET ROLE;
COMMIT;
`
 return {forward,inverse,scope,manifest,sources:mediaSources,policy:mediaPolicy,core_sha256:hash(mediaCoreSql)}
}
export async function expectedMediaManifest(){
 const db=await createMediaFixture()
 try{await db.exec('SET search_path=pg_catalog,public,pg_temp');return (await db.query(`SELECT ${mediaCatalogSql} AS manifest`)).rows[0].manifest}
 finally{await db.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const preflight=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-14-media-preflight.json','utf8'))
 const packet=buildMediaPacket(preflight,await expectedMediaManifest())
 for(const mode of ['forward','inverse'])fs.writeFileSync(`docs/aws-phase-d/ADMIN-RDS-14-media-${mode}.sql`,packet[mode])
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-14-media-scope.json',JSON.stringify({scope:packet.scope,manifest:packet.manifest,
  sources:packet.sources,policy:packet.policy,core_sha256:packet.core_sha256,sql_sha256:hash(packet.forward),inverse_sha256:hash(packet.inverse)},null,2)+'\n')
 console.log(JSON.stringify({tables:3,functions:3,policy_enabled:false,sql_sha256:hash(packet.forward)}))
}
