-- ADMIN-RDS-11: coupon edits, global settings and notification read-marking only.
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
CREATE TEMP TABLE admin_ops11_scope ON COMMIT DROP AS
 SELECT * FROM jsonb_to_recordset('[{"name":"public.coupons","insert":["code","title","discount_type","discount_value","reward_type","minimum_order_amount","gift_product_id","gift_variant_data","gift_banner_image_url","banner_enabled","banner_title","banner_description","starts_at","ends_at","featured_priority","usage_limit","is_active"],"update":["code","title","discount_type","discount_value","reward_type","minimum_order_amount","gift_product_id","gift_variant_data","gift_banner_image_url","banner_enabled","banner_title","banner_description","starts_at","ends_at","featured_priority","usage_limit","is_active"],"delete":true,"predicate":"true","fingerprint":"ca35c5fc3c722c677a68d21a20efd0bb","preserved":"1583ba9e99819d4a046749e328798a71","read_all":false,"read_columns":["id","code","title","discount_type","discount_value","usage_limit","usage_count","is_active","created_at","reward_type","minimum_order_amount","gift_product_id","gift_variant_data","gift_banner_image_url","banner_enabled","banner_title","banner_description","starts_at","ends_at","featured_priority"]},{"name":"public.site_settings","insert":["settings_key","whatsapp_number","default_gst_slab_id","maintenance_mode_enabled","maintenance_mode_message","estimated_delivery_text"],"update":["whatsapp_number","default_gst_slab_id","maintenance_mode_enabled","maintenance_mode_message","estimated_delivery_text"],"delete":false,"predicate":"settings_key = ''global_site_settings''::text","fingerprint":"af8ebad3f82b3b0dd25d7e7c38a2c0f4","preserved":"203d1931c7c5dba68660ce542af53067","read_all":false,"read_columns":["settings_key","whatsapp_number","default_gst_slab_id","maintenance_mode_enabled","maintenance_mode_message","estimated_delivery_text"]},{"name":"public.admin_notification_reads","insert":["admin_user_id","notification_key","read_at"],"update":[],"delete":false,"predicate":"EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = admin_user_id AND p.role = ''admin'')","fingerprint":"c6a4479253965e722b29b35447be108b","preserved":"dc4a646d0eb711a5ace5a0db0a94a475","read_all":false,"read_columns":["admin_user_id","notification_key"]}]'::jsonb)
 AS s(name text,"insert" jsonb,"update" jsonb,"delete" boolean,predicate text,
 fingerprint text,preserved text,read_all boolean,read_columns jsonb);
DO $guard$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_ops11_scope ORDER BY name LOOP
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
 THEN RAISE EXCEPTION 'Operations prestate differs or packet already installed: %',r.name; END IF;
 END LOOP; END $guard$;
GRANT INSERT("code","title","discount_type","discount_value","reward_type","minimum_order_amount","gift_product_id","gift_variant_data","gift_banner_image_url","banner_enabled","banner_title","banner_description","starts_at","ends_at","featured_priority","usage_limit","is_active") ON public.coupons TO hod_admin_app;
CREATE POLICY hod_admin_ops11_insert ON public.coupons FOR INSERT TO hod_admin_app WITH CHECK(true);
GRANT UPDATE("code","title","discount_type","discount_value","reward_type","minimum_order_amount","gift_product_id","gift_variant_data","gift_banner_image_url","banner_enabled","banner_title","banner_description","starts_at","ends_at","featured_priority","usage_limit","is_active") ON public.coupons TO hod_admin_app;
CREATE POLICY hod_admin_ops11_update ON public.coupons FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(true);
GRANT DELETE ON public.coupons TO hod_admin_app;
CREATE POLICY hod_admin_ops11_delete ON public.coupons FOR DELETE TO hod_admin_app USING(true);
GRANT INSERT("settings_key","whatsapp_number","default_gst_slab_id","maintenance_mode_enabled","maintenance_mode_message","estimated_delivery_text") ON public.site_settings TO hod_admin_app;
CREATE POLICY hod_admin_ops11_insert ON public.site_settings FOR INSERT TO hod_admin_app WITH CHECK(settings_key = 'global_site_settings'::text);
CREATE POLICY hod_admin_ops11_insert_guard ON public.site_settings AS RESTRICTIVE FOR INSERT TO hod_admin_app WITH CHECK(settings_key = 'global_site_settings'::text);
GRANT UPDATE("whatsapp_number","default_gst_slab_id","maintenance_mode_enabled","maintenance_mode_message","estimated_delivery_text") ON public.site_settings TO hod_admin_app;
CREATE POLICY hod_admin_ops11_update ON public.site_settings FOR UPDATE TO hod_admin_app USING(settings_key = 'global_site_settings'::text) WITH CHECK(settings_key = 'global_site_settings'::text);
CREATE POLICY hod_admin_ops11_update_guard ON public.site_settings AS RESTRICTIVE FOR UPDATE TO hod_admin_app USING(settings_key = 'global_site_settings'::text) WITH CHECK(settings_key = 'global_site_settings'::text);
GRANT INSERT("admin_user_id","notification_key","read_at") ON public.admin_notification_reads TO hod_admin_app;
CREATE POLICY hod_admin_ops11_insert ON public.admin_notification_reads FOR INSERT TO hod_admin_app WITH CHECK(EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = admin_user_id AND p.role = 'admin'));
CREATE POLICY hod_admin_ops11_insert_guard ON public.admin_notification_reads AS RESTRICTIVE FOR INSERT TO hod_admin_app WITH CHECK(EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = admin_user_id AND p.role = 'admin'));
CREATE POLICY admin_ops11_compare ON public.coupons FOR INSERT TO hod_admin_app WITH CHECK(true);
DO $compare$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy p JOIN pg_policy x ON x.polrelid=p.polrelid AND x.polname='admin_ops11_compare'
 WHERE p.polrelid='public.coupons'::regclass AND p.polname='hod_admin_ops11_insert' AND p.polcmd=x.polcmd
 AND p.polpermissive=true AND p.polroles=x.polroles
 AND pg_get_expr(p.polqual,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polqual,x.polrelid)
 AND pg_get_expr(p.polwithcheck,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polwithcheck,x.polrelid))
 THEN RAISE EXCEPTION 'Operations policy definition drift'; END IF;
END $compare$;
DROP POLICY admin_ops11_compare ON public.coupons;
CREATE POLICY admin_ops11_compare ON public.coupons FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(true);
DO $compare$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy p JOIN pg_policy x ON x.polrelid=p.polrelid AND x.polname='admin_ops11_compare'
 WHERE p.polrelid='public.coupons'::regclass AND p.polname='hod_admin_ops11_update' AND p.polcmd=x.polcmd
 AND p.polpermissive=true AND p.polroles=x.polroles
 AND pg_get_expr(p.polqual,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polqual,x.polrelid)
 AND pg_get_expr(p.polwithcheck,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polwithcheck,x.polrelid))
 THEN RAISE EXCEPTION 'Operations policy definition drift'; END IF;
END $compare$;
DROP POLICY admin_ops11_compare ON public.coupons;
CREATE POLICY admin_ops11_compare ON public.coupons FOR DELETE TO hod_admin_app USING(true);
DO $compare$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy p JOIN pg_policy x ON x.polrelid=p.polrelid AND x.polname='admin_ops11_compare'
 WHERE p.polrelid='public.coupons'::regclass AND p.polname='hod_admin_ops11_delete' AND p.polcmd=x.polcmd
 AND p.polpermissive=true AND p.polroles=x.polroles
 AND pg_get_expr(p.polqual,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polqual,x.polrelid)
 AND pg_get_expr(p.polwithcheck,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polwithcheck,x.polrelid))
 THEN RAISE EXCEPTION 'Operations policy definition drift'; END IF;
END $compare$;
DROP POLICY admin_ops11_compare ON public.coupons;
CREATE POLICY admin_ops11_compare ON public.site_settings FOR INSERT TO hod_admin_app WITH CHECK(settings_key = 'global_site_settings'::text);
DO $compare$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy p JOIN pg_policy x ON x.polrelid=p.polrelid AND x.polname='admin_ops11_compare'
 WHERE p.polrelid='public.site_settings'::regclass AND p.polname='hod_admin_ops11_insert' AND p.polcmd=x.polcmd
 AND p.polpermissive=true AND p.polroles=x.polroles
 AND pg_get_expr(p.polqual,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polqual,x.polrelid)
 AND pg_get_expr(p.polwithcheck,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polwithcheck,x.polrelid))
 THEN RAISE EXCEPTION 'Operations policy definition drift'; END IF;
END $compare$;
DROP POLICY admin_ops11_compare ON public.site_settings;
CREATE POLICY admin_ops11_compare ON public.site_settings FOR INSERT TO hod_admin_app WITH CHECK(settings_key = 'global_site_settings'::text);
DO $compare$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy p JOIN pg_policy x ON x.polrelid=p.polrelid AND x.polname='admin_ops11_compare'
 WHERE p.polrelid='public.site_settings'::regclass AND p.polname='hod_admin_ops11_insert_guard' AND p.polcmd=x.polcmd
 AND p.polpermissive=false AND p.polroles=x.polroles
 AND pg_get_expr(p.polqual,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polqual,x.polrelid)
 AND pg_get_expr(p.polwithcheck,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polwithcheck,x.polrelid))
 THEN RAISE EXCEPTION 'Operations policy definition drift'; END IF;
END $compare$;
DROP POLICY admin_ops11_compare ON public.site_settings;
CREATE POLICY admin_ops11_compare ON public.site_settings FOR UPDATE TO hod_admin_app USING(settings_key = 'global_site_settings'::text) WITH CHECK(settings_key = 'global_site_settings'::text);
DO $compare$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy p JOIN pg_policy x ON x.polrelid=p.polrelid AND x.polname='admin_ops11_compare'
 WHERE p.polrelid='public.site_settings'::regclass AND p.polname='hod_admin_ops11_update' AND p.polcmd=x.polcmd
 AND p.polpermissive=true AND p.polroles=x.polroles
 AND pg_get_expr(p.polqual,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polqual,x.polrelid)
 AND pg_get_expr(p.polwithcheck,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polwithcheck,x.polrelid))
 THEN RAISE EXCEPTION 'Operations policy definition drift'; END IF;
END $compare$;
DROP POLICY admin_ops11_compare ON public.site_settings;
CREATE POLICY admin_ops11_compare ON public.site_settings FOR UPDATE TO hod_admin_app USING(settings_key = 'global_site_settings'::text) WITH CHECK(settings_key = 'global_site_settings'::text);
DO $compare$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy p JOIN pg_policy x ON x.polrelid=p.polrelid AND x.polname='admin_ops11_compare'
 WHERE p.polrelid='public.site_settings'::regclass AND p.polname='hod_admin_ops11_update_guard' AND p.polcmd=x.polcmd
 AND p.polpermissive=false AND p.polroles=x.polroles
 AND pg_get_expr(p.polqual,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polqual,x.polrelid)
 AND pg_get_expr(p.polwithcheck,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polwithcheck,x.polrelid))
 THEN RAISE EXCEPTION 'Operations policy definition drift'; END IF;
END $compare$;
DROP POLICY admin_ops11_compare ON public.site_settings;
CREATE POLICY admin_ops11_compare ON public.admin_notification_reads FOR INSERT TO hod_admin_app WITH CHECK(EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = admin_user_id AND p.role = 'admin'));
DO $compare$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy p JOIN pg_policy x ON x.polrelid=p.polrelid AND x.polname='admin_ops11_compare'
 WHERE p.polrelid='public.admin_notification_reads'::regclass AND p.polname='hod_admin_ops11_insert' AND p.polcmd=x.polcmd
 AND p.polpermissive=true AND p.polroles=x.polroles
 AND pg_get_expr(p.polqual,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polqual,x.polrelid)
 AND pg_get_expr(p.polwithcheck,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polwithcheck,x.polrelid))
 THEN RAISE EXCEPTION 'Operations policy definition drift'; END IF;
END $compare$;
DROP POLICY admin_ops11_compare ON public.admin_notification_reads;
CREATE POLICY admin_ops11_compare ON public.admin_notification_reads FOR INSERT TO hod_admin_app WITH CHECK(EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = admin_user_id AND p.role = 'admin'));
DO $compare$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy p JOIN pg_policy x ON x.polrelid=p.polrelid AND x.polname='admin_ops11_compare'
 WHERE p.polrelid='public.admin_notification_reads'::regclass AND p.polname='hod_admin_ops11_insert_guard' AND p.polcmd=x.polcmd
 AND p.polpermissive=false AND p.polroles=x.polroles
 AND pg_get_expr(p.polqual,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polqual,x.polrelid)
 AND pg_get_expr(p.polwithcheck,p.polrelid) IS NOT DISTINCT FROM pg_get_expr(x.polwithcheck,x.polrelid))
 THEN RAISE EXCEPTION 'Operations policy definition drift'; END IF;
END $compare$;
DROP POLICY admin_ops11_compare ON public.admin_notification_reads;
DO $verify$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_ops11_scope LOOP IF (SELECT md5((jsonb_build_object(
 'owner',c.relowner::regrole::text,'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'identity',a.attidentity,'generated',a.attgenerated,'not_null',a.attnotnull,
   'default_hash',md5(pg_get_expr(d.adbin,d.adrelid)),
   'acl',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
     FROM aclexplode(a.attacl) x WHERE x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'acl',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
   FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x WHERE x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app')),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,
   'permissive',p.polpermissive,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),
   'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb)
   FROM pg_policy p WHERE p.polrelid=c.oid AND left(p.polname,16)<>'hod_admin_ops11_'),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
   'definition',md5(pg_get_triggerdef(t.oid)),'function',md5(pg_get_functiondef(t.tgfoid))) ORDER BY t.tgname),'[]'::jsonb)
   FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname),'[]'::jsonb)
   FROM pg_constraint k WHERE k.conrelid=c.oid)))::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.preserved
 THEN RAISE EXCEPTION 'Preserved operations schema/policies/ACL differ: %',r.name; END IF; IF has_table_privilege('hod_admin_app',r.name,'SELECT')<>r.read_all
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
 THEN RAISE EXCEPTION 'Operations privilege scope differs: %',r.name; END IF; END LOOP;
 IF (SELECT count(*) FROM admin_ops11_scope s JOIN pg_policy p ON p.polrelid=to_regclass(s.name)
 WHERE left(p.polname,16)='hod_admin_ops11_')<>9
 THEN RAISE EXCEPTION 'Operations policy count differs'; END IF;
 FOR r IN SELECT * FROM admin_ops11_scope LOOP
  IF EXISTS(SELECT FROM pg_policy p WHERE p.polrelid=to_regclass(r.name) AND left(p.polname,16)='hod_admin_ops11_' AND (
   p.polroles<>ARRAY[(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app')]
   OR (p.polpermissive = (right(p.polname,6)='_guard'))
   OR p.polcmd<>CASE split_part(p.polname,'_',4) WHEN 'insert' THEN 'a' WHEN 'update' THEN 'w' WHEN 'delete' THEN 'd' ELSE '?' END::"char"
   OR (p.polcmd='a' AND p.polqual IS NOT NULL) OR (p.polcmd='d' AND p.polwithcheck IS NOT NULL)
   OR (p.polcmd IN ('w','d') AND pg_get_expr(p.polqual,p.polrelid) IS DISTINCT FROM
    (SELECT pg_get_expr(x.polqual,x.polrelid) FROM pg_policy x WHERE x.polrelid=p.polrelid AND x.polname=replace(p.polname,'_guard','')))
   OR (p.polcmd IN ('a','w') AND pg_get_expr(p.polwithcheck,p.polrelid) IS DISTINCT FROM
    (SELECT pg_get_expr(x.polwithcheck,x.polrelid) FROM pg_policy x WHERE x.polrelid=p.polrelid AND x.polname=replace(p.polname,'_guard','')))))
  THEN RAISE EXCEPTION 'Operations policy shape differs: %',r.name; END IF;
 END LOOP;
END $verify$;
RESET ROLE;
COMMIT;
SELECT jsonb_build_object('database',current_database(),'installed',true,'operation_tables',3,
 'orders_changed',false,'business_rows_changed',false,'providers_switched',false,
 'next','Agent verifies bounded coupon/notification writes; global settings and order cancellation need separate acceptance.') AS admin_operations_write_setup_result;
