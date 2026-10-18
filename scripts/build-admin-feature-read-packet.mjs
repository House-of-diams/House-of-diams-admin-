// Build the next bounded READ-permission delta from source-derived requirements
// and the latest real catalog evidence. Never connects or executes SQL.
import fs from 'node:fs'
import {createHash} from 'node:crypto'
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''))
const prior=read('docs/aws-phase-d/D1e-minimum-grant-manifest.json')
const current=read('docs/aws-phase-d/DEPLOY-READINESS-database-access.json')
const scopes=new Map(prior.relations.filter(r=>!['public.profiles','public.cms_save_receipts'].includes(r.relation))
  .map(r=>[r.relation,{all:r.selectAll,columns:r.select}]))
// Explicit current repository projections. Entire-row access is needed only
// where order detail expands the actual composite row.
const extra={
 orders:'*',order_items:'*',order_love_letters:'*',
 customer_identities:'id,email,email_verified,created_at',customer_profiles:'identity_id,first_name,last_name',
 admin_notification_reads:'admin_user_id,notification_key',
 site_settings:'settings_key,whatsapp_number,default_gst_slab_id,maintenance_mode_enabled,maintenance_mode_message,estimated_delivery_text',
 contact_submissions:'id,full_name,email,phone,topic,message,status,created_at',
 newsletter_submissions:'id,email,source,status,created_at',
 promotion_popup_responses:'id,promotion_id,email,answers,coupon_revealed,revealed_at,created_at',
 promotion_popup_questions:'promotion_id,field_key,question',
 coupons:'id,code,title,discount_type,discount_value,reward_type,minimum_order_amount,gift_product_id,gift_variant_data,gift_banner_image_url,banner_enabled,banner_title,banner_description,starts_at,ends_at,featured_priority,usage_limit,is_active,usage_count,created_at',
}
for(const [table,columns] of Object.entries(extra)){
 const name='public.'+table,previous=scopes.get(name)
 scopes.set(name,{all:previous?.all||columns==='*',
  columns:[...new Set([...(previous?.columns??[]),...(columns==='*'?[]:columns.split(','))])]})
}
const records=[]
for(const [name,scope] of [...scopes].sort(([a],[b])=>a.localeCompare(b))) {
 const state=current.relations.find(r=>r.name===name)
 if(!state?.present)throw new Error('Current table evidence missing: '+name)
 if(state.runtime_select)continue // Preserve the installed 27-table product delta.
 if(!scope.all&&!scope.columns.length)throw new Error('Empty scope: '+name)
 if(!/^public\.[a-z_]+$/.test(name)||scope.columns.some(c=>!/^\w+$/.test(c)))throw new Error('Unsafe identifier')
 if(state.runtime_insert||state.runtime_update||state.runtime_delete)throw new Error('Unexpected existing direct writes')
 if(state.policies.some(p=>p.permissive!=='PERMISSIVE'))throw new Error('Restrictive policy needs separate review')
 records.push({name,owner:state.owner,rls:state.rls,all:scope.all,columns:[...new Set(scope.columns)].sort()})
}
const q=v=>"'"+v.replaceAll("'","''")+"'"
const qi=v=>'"'+v.replaceAll('"','""')+'"'
const list=JSON.stringify(records)
const base=`-- REVIEW DRAFT until ADMIN-RDS-08-review.md accepts this exact hash.
-- Bounded admin READ permissions only. No rows, write rights, roles or provider settings change.
-- Execute the entire file on hod_staging using hod_dev_migration (HOD Staging).
-- That existing login owns customer tables and can SET ROLE hod_migration for restored tables.
-- Existing product-read installation, other roles and policies must remain intact.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE admin_read08_scope ON COMMIT DROP AS
 SELECT * FROM jsonb_to_recordset(${q(list)}::jsonb)
 AS x(name text,owner text,rls boolean,"all" boolean,columns jsonb);
DO $guard$
DECLARE r record;
BEGIN
 IF current_database()<>'hod_staging' OR session_user<>'hod_dev_migration' THEN
  RAISE EXCEPTION 'Use HOD Staging / hod_dev_migration / hod_staging; nothing installed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hod_admin_app' AND NOT rolcanlogin
  AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
 OR EXISTS(SELECT FROM pg_roles WHERE rolname<>'hod_admin_app' AND pg_has_role('hod_admin_app',oid,'MEMBER'))
 THEN RAISE EXCEPTION 'Admin capability must remain isolated'; END IF;
 FOR r IN SELECT * FROM admin_read08_scope LOOP
  IF r.owner NOT IN ('hod_migration','hod_dev_migration') OR NOT pg_has_role(session_user,r.owner,'SET')
  OR NOT EXISTS(SELECT FROM pg_class WHERE oid=to_regclass(r.name) AND relkind='r'
   AND relowner::regrole::text=r.owner AND relrowsecurity=r.rls AND NOT relforcerowsecurity)
  THEN RAISE EXCEPTION 'Table/owner/RLS differs from reviewed evidence: %',r.name; END IF;
  EXECUTE format('SET LOCAL ROLE %I',r.owner);
  EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
  EXECUTE 'RESET ROLE';
  IF EXISTS(SELECT FROM pg_policies WHERE schemaname='public' AND tablename=split_part(r.name,'.',2)
    AND (policyname='hod_admin_feature_read_v1' OR permissive<>'PERMISSIVE'))
  OR has_any_column_privilege('hod_admin_app',to_regclass(r.name),'SELECT')
  OR has_table_privilege('hod_admin_app',to_regclass(r.name),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  OR has_any_column_privilege('hod_admin_app',to_regclass(r.name),'INSERT,UPDATE,REFERENCES')
  THEN RAISE EXCEPTION 'Existing permission/policy differs; do not replay: %',r.name; END IF;
 END LOOP;
END $guard$;
CREATE TEMP TABLE admin_read08_before ON COMMIT DROP AS
SELECT s.name,
 (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policyname),'[]'::jsonb) FROM pg_policies p
  WHERE p.schemaname='public' AND p.tablename=split_part(s.name,'.',2)) AS policies,
 (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb)
  FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  WHERE a.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app')) AS other_acl,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'acl',
   (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
    FROM aclexplode(a.attacl) x WHERE x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))) ORDER BY a.attnum),'[]'::jsonb)
  FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS column_acl
FROM admin_read08_scope s JOIN pg_class c ON c.oid=to_regclass(s.name);
`
let forward=base
for(const r of records){
 forward+=`SET LOCAL ROLE ${qi(r.owner)};\n`
 forward+=`GRANT SELECT${r.all?'':'('+r.columns.map(qi).join(',')+')'} ON ${r.name} TO hod_admin_app;\n`
 if(r.rls)forward+=`CREATE POLICY hod_admin_feature_read_v1 ON ${r.name} FOR SELECT TO hod_admin_app USING(true);\n`
 forward+='RESET ROLE;\n'
}
forward+=`DO $verify$
DECLARE r record; b record; after_policies jsonb; after_acl jsonb; after_columns jsonb;
BEGIN
 FOR r IN SELECT * FROM admin_read08_scope LOOP
  SELECT * INTO b FROM admin_read08_before WHERE name=r.name;
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policyname),'[]'::jsonb) INTO after_policies
   FROM pg_policies p WHERE schemaname='public' AND tablename=split_part(r.name,'.',2) AND policyname<>'hod_admin_feature_read_v1';
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb) INTO after_acl
   FROM pg_class c,LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid=to_regclass(r.name) AND a.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app');
  SELECT coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'acl',
    (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
     FROM aclexplode(a.attacl) x WHERE x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))) ORDER BY a.attnum),'[]'::jsonb)
   INTO after_columns FROM pg_attribute a WHERE a.attrelid=to_regclass(r.name) AND a.attnum>0 AND NOT a.attisdropped;
  IF b.policies IS DISTINCT FROM after_policies OR b.other_acl IS DISTINCT FROM after_acl
   OR b.column_acl IS DISTINCT FROM after_columns
   OR has_table_privilege('hod_admin_app',to_regclass(r.name),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege('hod_admin_app',to_regclass(r.name),'INSERT,UPDATE,REFERENCES')
   OR (r."all" AND NOT has_table_privilege('hod_admin_app',to_regclass(r.name),'SELECT'))
   OR (NOT r."all" AND EXISTS(SELECT FROM jsonb_array_elements_text(r.columns) c
     WHERE NOT has_column_privilege('hod_admin_app',to_regclass(r.name),c.value,'SELECT')))
  THEN RAISE EXCEPTION 'Read-only/preservation postcondition failed: %',r.name; END IF;
 END LOOP;
END $verify$;
COMMIT;
SELECT jsonb_build_object('database',current_database(),'installed',true,'read_permission_tables',${records.length},
 'writes_added',false,'providers_switched',false,'next','Run the real feature read checker; writes, media and login remain separate.') AS admin_feature_read_setup_result;
`
fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-08-feature-read-forward.sql',forward)
const inverse=`-- ROLLBACK ONLY, not setup. Remove only this packet's absent-before READ rights.
-- Stop and reconcile if later permission/policy changes occurred. Never remove data.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $inverse$
DECLARE r record; old_policies jsonb; new_policies jsonb;
BEGIN
 IF current_database()<>'hod_staging' OR session_user<>'hod_dev_migration'
 THEN RAISE EXCEPTION 'Use HOD Staging / hod_dev_migration / hod_staging'; END IF;
 FOR r IN SELECT * FROM jsonb_to_recordset(${q(list)}::jsonb)
  AS x(name text,owner text,rls boolean,"all" boolean,columns jsonb) LOOP
  IF NOT pg_has_role(session_user,r.owner,'SET') OR NOT EXISTS(SELECT FROM pg_class
   WHERE oid=to_regclass(r.name) AND relowner::regrole::text=r.owner AND relrowsecurity=r.rls)
  OR has_table_privilege('hod_admin_app',to_regclass(r.name),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  OR has_any_column_privilege('hod_admin_app',to_regclass(r.name),'INSERT,UPDATE,REFERENCES')
  THEN RAISE EXCEPTION 'Rollback state drift: %',r.name; END IF;
  EXECUTE format('SET LOCAL ROLE %I',r.owner);
  EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
  EXECUTE 'RESET ROLE';
  IF r.rls AND NOT EXISTS(SELECT FROM pg_policies WHERE schemaname='public'
   AND tablename=split_part(r.name,'.',2) AND policyname='hod_admin_feature_read_v1'
   AND permissive='PERMISSIVE' AND cmd='SELECT' AND roles::text[]=ARRAY['hod_admin_app']
   AND qual='true' AND with_check IS NULL)
  THEN RAISE EXCEPTION 'Rollback policy differs: %',r.name; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policyname),'[]'::jsonb) INTO old_policies
   FROM pg_policies p WHERE schemaname='public' AND tablename=split_part(r.name,'.',2)
   AND policyname<>'hod_admin_feature_read_v1';
  EXECUTE format('SET LOCAL ROLE %I',r.owner);
  IF r.rls THEN EXECUTE format('DROP POLICY hod_admin_feature_read_v1 ON %s',r.name); END IF;
  IF r."all" THEN EXECUTE format('REVOKE SELECT ON %s FROM hod_admin_app',r.name);
  ELSE EXECUTE format('REVOKE SELECT(%s) ON %s FROM hod_admin_app',
   (SELECT string_agg(format('%I',value),',') FROM jsonb_array_elements_text(r.columns)),r.name); END IF;
  EXECUTE 'RESET ROLE';
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policyname),'[]'::jsonb) INTO new_policies
   FROM pg_policies p WHERE schemaname='public' AND tablename=split_part(r.name,'.',2);
  IF old_policies IS DISTINCT FROM new_policies
   OR has_any_column_privilege('hod_admin_app',to_regclass(r.name),'SELECT')
  THEN RAISE EXCEPTION 'Rollback postcondition failed: %',r.name; END IF;
 END LOOP;
END $inverse$;
COMMIT;
SELECT jsonb_build_object('database',current_database(),'read_permissions_removed',true,
 'tables',${records.length},'business_rows_changed',false) AS admin_feature_read_rollback_result;
`
fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-08-feature-read-inverse.sql',inverse)
fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-08-feature-read-scope.json',JSON.stringify({scope:records,
 sql_sha256:createHash('sha256').update(forward).digest('hex'),
 inverse_sha256:createHash('sha256').update(inverse).digest('hex')},null,2)+'\n')
console.log(JSON.stringify({read_permission_tables:records.length,sql_generated:true,sql_executed:false}))
