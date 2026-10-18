-- Reviewed scope: product draft transition/delete plus reference row-lock capability.
-- Execute the complete file on HOD Staging / hod_staging / hod_dev_migration.
-- No product rows, function bodies, storefront rights or provider selectors change.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL ROLE hod_migration;
DO $guard$
DECLARE target text;
BEGIN
 IF current_database()<>'hod_staging' OR session_user<>'hod_dev_migration' OR current_user<>'hod_migration'
 THEN RAISE EXCEPTION 'Use hod_staging as hod_dev_migration with existing owner SET rights'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hod_admin_app' AND NOT rolcanlogin
  AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
 OR EXISTS(SELECT FROM pg_roles WHERE rolname<>'hod_admin_app' AND pg_has_role('hod_admin_app',oid,'MEMBER'))
 THEN RAISE EXCEPTION 'Unsafe or non-isolated admin capability'; END IF;
 FOREACH target IN ARRAY ARRAY['catalog_categories','catalog_gst_slabs','catalog_options',
  'catalog_subcategories','product_metal_variants','products'] LOOP
  IF NOT EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('public.'||target)
   AND relowner::regrole::text='hod_migration' AND relkind='r' AND relrowsecurity AND NOT relforcerowsecurity)
  THEN RAISE EXCEPTION 'Owner/table/RLS drift: %',target; END IF;
  EXECUTE format('LOCK TABLE public.%I IN SHARE UPDATE EXCLUSIVE MODE',target);
  IF NOT has_table_privilege('hod_admin_app',to_regclass('public.'||target),'SELECT')
   OR has_table_privilege('hod_admin_app',to_regclass('public.'||target),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege('hod_admin_app',to_regclass('public.'||target),'INSERT,UPDATE,REFERENCES')
   OR EXISTS(SELECT FROM pg_policies WHERE schemaname='public' AND tablename=target
    AND (permissive<>'PERMISSIVE' OR left(policyname,18)='hod_admin_write09_'))
  THEN RAISE EXCEPTION 'Prestate differs or already installed: %',target; END IF;
 END LOOP;
END $guard$;
CREATE TEMP TABLE admin_write09_before ON COMMIT DROP AS
SELECT c.oid,c.relname,
 (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policyname),'[]'::jsonb) FROM pg_policies p
  WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies,
 (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb)
  FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  WHERE a.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app')) AS other_acl,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'acl',
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
   FROM aclexplode(a.attacl) x WHERE x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))) ORDER BY a.attnum),'[]'::jsonb)
  FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS other_column_acl
FROM pg_class c WHERE c.oid=ANY(ARRAY['public.catalog_categories'::regclass,'public.catalog_gst_slabs'::regclass,
 'public.catalog_options'::regclass,'public.catalog_subcategories'::regclass,
 'public.product_metal_variants'::regclass,'public.products'::regclass]);
GRANT UPDATE(status,updated_at),DELETE ON public.products TO hod_admin_app;
CREATE POLICY hod_admin_write09_product_draft ON public.products FOR UPDATE TO hod_admin_app
 USING(true) WITH CHECK(status::text='draft');
CREATE POLICY hod_admin_write09_product_draft_guard ON public.products AS RESTRICTIVE FOR UPDATE TO hod_admin_app
 USING(true) WITH CHECK(status::text='draft');
CREATE POLICY hod_admin_write09_product_delete ON public.products FOR DELETE TO hod_admin_app USING(true);
DO $locks$
DECLARE target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['catalog_categories','catalog_gst_slabs','catalog_options',
  'catalog_subcategories','product_metal_variants'] LOOP
  EXECUTE format('GRANT UPDATE(id) ON public.%I TO hod_admin_app',target);
  EXECUTE format('CREATE POLICY hod_admin_write09_lock ON public.%I FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false)',target);
  EXECUTE format('CREATE POLICY hod_admin_write09_lock_guard ON public.%I AS RESTRICTIVE FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false)',target);
 END LOOP;
END $locks$;
DO $verify$
DECLARE b record; after_policies jsonb; after_acl jsonb; after_columns jsonb; col record;
BEGIN
 FOR b IN SELECT * FROM admin_write09_before LOOP
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policyname),'[]'::jsonb) INTO after_policies
   FROM pg_policies p WHERE schemaname='public' AND tablename=b.relname AND left(policyname,18)<>'hod_admin_write09_';
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb) INTO after_acl
   FROM pg_class c,LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid=b.oid AND a.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app');
  SELECT coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'acl',
   (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
    FROM aclexplode(a.attacl) x WHERE x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))) ORDER BY a.attnum),'[]'::jsonb)
   INTO after_columns FROM pg_attribute a WHERE a.attrelid=b.oid AND a.attnum>0 AND NOT a.attisdropped;
  IF b.policies IS DISTINCT FROM after_policies OR b.other_acl IS DISTINCT FROM after_acl
   OR b.other_column_acl IS DISTINCT FROM after_columns
   OR has_table_privilege('hod_admin_app',b.oid,'INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege('hod_admin_app',b.oid,'INSERT,REFERENCES')
   OR has_table_privilege('hod_admin_app',b.oid,'DELETE')<>(b.relname='products')
  THEN RAISE EXCEPTION 'Permission/preservation postcondition failed: %',b.relname; END IF;
  FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=b.oid AND attnum>0 AND NOT attisdropped LOOP
   IF has_column_privilege('hod_admin_app',b.oid,col.attname,'UPDATE') IS DISTINCT FROM
    (CASE WHEN b.relname='products' THEN col.attname IN ('status','updated_at') ELSE col.attname='id' END)
   THEN RAISE EXCEPTION 'Unexpected column update scope: %.%',b.relname,col.attname; END IF;
  END LOOP;
 END LOOP;
END $verify$;
COMMIT;
SELECT jsonb_build_object('database',current_database(),'installed',true,'reference_lock_tables',5,
 'product_draft_update',true,'product_delete',true,'reference_writes_denied',true,
 'business_rows_changed',false,'providers_switched',false,
 'next','Agent verifies isolated product writes with rollback; other feature writes and media remain pending.') AS admin_product_write_setup_result;
