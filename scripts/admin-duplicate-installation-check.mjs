import {contentSnapshotSql} from './admin-content-permission-snapshot.mjs'
import {duplicateSignature} from './admin-duplicate-capability-sql.mjs'
export async function inspectDuplicateCapability(db,scope){
 const tables=(await db.query(`SELECT s.name,md5((${contentSnapshotSql()})::text)=s.fingerprint AS ok
  FROM jsonb_to_recordset($1::jsonb) s(name text,fingerprint text)
  LEFT JOIN pg_class c ON c.oid=to_regclass(s.name) ORDER BY s.name`,[JSON.stringify(scope.scope)])).rows
 const routines=(await db.query(`SELECT s.signature,p.oid IS NOT NULL AND p.proowner::regrole::text=s.owner AND p.prosecdef=s.definer
  AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=s.sha256 AS ok
  FROM jsonb_to_recordset($1::jsonb) s(signature text,owner text,definer boolean,sha256 text)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(s.signature) ORDER BY s.signature`,[JSON.stringify(scope.routines)])).rows
 const capability=(await db.query(`SELECT p.oid IS NOT NULL AS present,
  p.oid IS NOT NULL AND p.proowner::regrole::text='hod_migration' AND p.prosecdef AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof
  AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND p.prokind='f' AND p.provolatile='v' AND p.proparallel='u'
  AND p.pronargdefaults=0 AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=$2::text AND has_function_privilege('hod_admin_app',p.oid,'EXECUTE')
  AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE'
   AND (a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))
    OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND a.is_grantable))) AS ok
  FROM (SELECT to_regprocedure($1::text) AS oid) s LEFT JOIN pg_proc p ON p.oid=s.oid LEFT JOIN pg_language l ON l.oid=p.prolang`,[duplicateSignature,scope.body_sha256])).rows[0]
 const receiptIsolated=(await db.query(`SELECT NOT has_any_column_privilege('hod_admin_app','public.product_duplicate_requests','INSERT,UPDATE')
  AND NOT has_table_privilege('hod_admin_app','public.product_duplicate_requests','DELETE,TRUNCATE')
  AND has_function_privilege('hod_admin_app','public.duplicate_product(uuid,uuid,uuid)','EXECUTE') AS ok`)).rows[0]?.ok===true
 return {ok:capability?.ok===true&&receiptIsolated&&tables.length===24&&tables.every(t=>t.ok===true)
  &&routines.length===scope.routines.length&&routines.every(t=>t.ok===true),capability_present:capability?.present===true,
  capability_verified:capability?.ok===true,receipt_writes_denied:receiptIsolated,tables,routines}
}
