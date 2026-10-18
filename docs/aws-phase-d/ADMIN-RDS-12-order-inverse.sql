-- ADMIN-RDS-12: one admin-only order update capability; no general write grants.
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
SELECT * FROM jsonb_to_recordset('[{"name":"public.admin_identities","fingerprint":"400755f0312e93f7dbd85f8a17b2ca4d"},{"name":"public.catalog_categories","fingerprint":"4b9b6a9a939f3efe1b615d500babdbf1"},{"name":"public.catalog_options","fingerprint":"587d9bf02227a15a765315ab5ed22bf7"},{"name":"public.catalog_subcategories","fingerprint":"633678d059813e1acdca093d415f9680"},{"name":"public.inventory_adjustments","fingerprint":"1c6d0ae65624437d8e335ca58d3b50ac"},{"name":"public.inventory_reservations","fingerprint":"769ff7869e8626fc26b5f3c81a47f56c"},{"name":"public.order_items","fingerprint":"215e78211f3c1b7b259d7ba4e1ddf8e8"},{"name":"public.orders","fingerprint":"6056b68ee3e1cb5b2ed2e3cb61c8079e"},{"name":"public.order_status_history","fingerprint":"2666faf6ebe26d914a22dfc97ce2ae25"},{"name":"public.product_content_rules","fingerprint":"707e134376cd742d2736ecd375eaaf19"},{"name":"public.products","fingerprint":"4e1df9cba8c0e21ec3d241b36d352eef"},{"name":"public.profiles","fingerprint":"bfd124193706eeffda3f6a0e0cb04f47"}]'::jsonb) AS s(name text,fingerprint text);
DO $tables$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_order12_scope ORDER BY name LOOP
  EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
  IF (SELECT md5((jsonb_build_object(
 'owner',c.relowner::regrole::text,'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'identity',a.attidentity,'generated',a.attgenerated,'not_null',a.attnotnull,
   'default_hash',md5(pg_get_expr(d.adbin,d.adrelid)),
   'acl',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
     FROM aclexplode(a.attacl) x )) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'acl',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
   FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x ),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,
   'permissive',p.polpermissive,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),
   'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb)
   FROM pg_policy p WHERE p.polrelid=c.oid ),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
   'definition',md5(pg_get_triggerdef(t.oid)),'function',md5(pg_get_functiondef(t.tgfoid))) ORDER BY t.tgname),'[]'::jsonb)
   FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname),'[]'::jsonb)
   FROM pg_constraint k WHERE k.conrelid=c.oid)))::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.fingerprint
  THEN RAISE EXCEPTION 'Order dependency schema/trigger/policy/ACL differs: %',r.name; END IF;
 END LOOP;
END $tables$;
DO $triggers$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM jsonb_to_recordset('[{"signature":"public.set_updated_at()","owner":"hod_migration","definer":false,"sha256":"199f5c02bd7c5ee76f3d2ba98482eddd62afcaa2b4915baed2a47fe3383b428e"},{"signature":"public.catalog_navbar_source_delete_guard_v1()","owner":"hod_migration","definer":false,"sha256":"02b3bef8c58fa618d5c60463eff5bca4e85d779e1724d7428c888d6e67654b53"},{"signature":"public.reserve_pending_order_item()","owner":"hod_migration","definer":true,"sha256":"2a3801e2e1c943f453ac4dc0ec9c0f260b3c303cfd16de42763966e4aa080575"},{"signature":"public.apply_order_stock_on_create()","owner":"hod_migration","definer":false,"sha256":"81a1d02fb4104c5cc696ad057549913bf6bca6117ea81d5f7c7623ae84bd802f"},{"signature":"public.record_order_status_history()","owner":"hod_migration","definer":true,"sha256":"40ba57642b790d2c11dc47df6ec3c2d297b0ac6fb4707d5008c177179cf49127"},{"signature":"public.restore_order_stock_on_cancel()","owner":"hod_migration","definer":false,"sha256":"040e78cfe6f3dcd16da2892d5a2e04ec0c7ed1f867a838c9dc46a9a3ce555c3a"},{"signature":"public.enforce_collection_checkout_off()","owner":"hod_migration","definer":false,"sha256":"05a0bc84c022094e71b616b95fde5f45469c7ec88b7bfb3d5d60fd6b347cbecc"},{"signature":"public.validate_product_classification()","owner":"hod_migration","definer":false,"sha256":"9f582a283391ca00eb12c21a3cd23c7163ecb405e0f5a396ca6e284e460ad146"},{"signature":"public.validate_product_content_rule_refs()","owner":"hod_migration","definer":false,"sha256":"38e6c90aac3d7b75bcfcbb206030a5eae47668e9a2055da39c15604dc721915b"}]'::jsonb)
 AS x(signature text,owner text,definer boolean,sha256 text) LOOP
 IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(r.signature) AND p.proowner::regrole::text=r.owner
 AND p.prosecdef=r.definer AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.sha256)
 THEN RAISE EXCEPTION 'Shared order dependency function differs: %',r.signature; END IF;
 END LOOP; END $triggers$;
DO $capability$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.admin_order_status_update_v1(uuid,text,text,uuid,jsonb,timestamp with time zone)')
  AND p.proowner::regrole::text='hod_migration' AND p.prosecdef AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof
  AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND p.prokind='f' AND p.provolatile='v' AND p.proparallel='u'
  AND p.pronargdefaults=0 AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='0f170a012d0fa8168b99d3521121bd4ad195a2e907320aee062ab07e2b8a86b4'
  AND has_function_privilege('hod_admin_app',p.oid,'EXECUTE')
  AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.privilege_type='EXECUTE' AND (a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))
    OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND a.is_grantable))))
 THEN RAISE EXCEPTION 'Order capability owner/body/settings/ACL differ'; END IF;
END $capability$;
DROP FUNCTION public.admin_order_status_update_v1(uuid,text,text,uuid,jsonb,timestamp with time zone);
DO $tables$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_order12_scope ORDER BY name LOOP
  EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
  IF (SELECT md5((jsonb_build_object(
 'owner',c.relowner::regrole::text,'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'identity',a.attidentity,'generated',a.attgenerated,'not_null',a.attnotnull,
   'default_hash',md5(pg_get_expr(d.adbin,d.adrelid)),
   'acl',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
     FROM aclexplode(a.attacl) x )) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'acl',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
   FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x ),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,
   'permissive',p.polpermissive,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),
   'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb)
   FROM pg_policy p WHERE p.polrelid=c.oid ),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
   'definition',md5(pg_get_triggerdef(t.oid)),'function',md5(pg_get_functiondef(t.tgfoid))) ORDER BY t.tgname),'[]'::jsonb)
   FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname),'[]'::jsonb)
   FROM pg_constraint k WHERE k.conrelid=c.oid)))::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.fingerprint
  THEN RAISE EXCEPTION 'Order dependency schema/trigger/policy/ACL differs: %',r.name; END IF;
 END LOOP;
END $tables$;
DO $triggers$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM jsonb_to_recordset('[{"signature":"public.set_updated_at()","owner":"hod_migration","definer":false,"sha256":"199f5c02bd7c5ee76f3d2ba98482eddd62afcaa2b4915baed2a47fe3383b428e"},{"signature":"public.catalog_navbar_source_delete_guard_v1()","owner":"hod_migration","definer":false,"sha256":"02b3bef8c58fa618d5c60463eff5bca4e85d779e1724d7428c888d6e67654b53"},{"signature":"public.reserve_pending_order_item()","owner":"hod_migration","definer":true,"sha256":"2a3801e2e1c943f453ac4dc0ec9c0f260b3c303cfd16de42763966e4aa080575"},{"signature":"public.apply_order_stock_on_create()","owner":"hod_migration","definer":false,"sha256":"81a1d02fb4104c5cc696ad057549913bf6bca6117ea81d5f7c7623ae84bd802f"},{"signature":"public.record_order_status_history()","owner":"hod_migration","definer":true,"sha256":"40ba57642b790d2c11dc47df6ec3c2d297b0ac6fb4707d5008c177179cf49127"},{"signature":"public.restore_order_stock_on_cancel()","owner":"hod_migration","definer":false,"sha256":"040e78cfe6f3dcd16da2892d5a2e04ec0c7ed1f867a838c9dc46a9a3ce555c3a"},{"signature":"public.enforce_collection_checkout_off()","owner":"hod_migration","definer":false,"sha256":"05a0bc84c022094e71b616b95fde5f45469c7ec88b7bfb3d5d60fd6b347cbecc"},{"signature":"public.validate_product_classification()","owner":"hod_migration","definer":false,"sha256":"9f582a283391ca00eb12c21a3cd23c7163ecb405e0f5a396ca6e284e460ad146"},{"signature":"public.validate_product_content_rule_refs()","owner":"hod_migration","definer":false,"sha256":"38e6c90aac3d7b75bcfcbb206030a5eae47668e9a2055da39c15604dc721915b"}]'::jsonb)
 AS x(signature text,owner text,definer boolean,sha256 text) LOOP
 IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(r.signature) AND p.proowner::regrole::text=r.owner
 AND p.prosecdef=r.definer AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.sha256)
 THEN RAISE EXCEPTION 'Shared order dependency function differs: %',r.signature; END IF;
 END LOOP; END $triggers$;
RESET ROLE;
COMMIT;
