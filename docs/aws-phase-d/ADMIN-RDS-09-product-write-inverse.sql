-- ROLLBACK ONLY; do not run as setup. Stops on permission/policy drift.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL ROLE hod_migration;
DO $inverse$
DECLARE target text; p record; col record; expected_update boolean; expected_count integer;
BEGIN
 IF current_database()<>'hod_staging' OR session_user<>'hod_dev_migration' OR current_user<>'hod_migration'
 THEN RAISE EXCEPTION 'Wrong rollback connection'; END IF;
 FOREACH target IN ARRAY ARRAY['catalog_categories','catalog_gst_slabs','catalog_options',
  'catalog_subcategories','product_metal_variants','products'] LOOP
  IF NOT EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('public.'||target)
    AND relowner::regrole::text='hod_migration' AND relrowsecurity AND NOT relforcerowsecurity)
   OR has_table_privilege('hod_admin_app',to_regclass('public.'||target),'INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege('hod_admin_app',to_regclass('public.'||target),'INSERT,REFERENCES')
   OR has_table_privilege('hod_admin_app',to_regclass('public.'||target),'DELETE')<>(target='products')
  THEN RAISE EXCEPTION 'Rollback permission/owner drift: %',target; END IF;
  EXECUTE format('LOCK TABLE public.%I IN SHARE UPDATE EXCLUSIVE MODE',target);
  FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=to_regclass('public.'||target)
    AND attnum>0 AND NOT attisdropped LOOP
   expected_update:=CASE WHEN target='products' THEN col.attname IN ('status','updated_at') ELSE col.attname='id' END;
   IF has_column_privilege('hod_admin_app',to_regclass('public.'||target),col.attname,'UPDATE')<>expected_update
   THEN RAISE EXCEPTION 'Rollback column scope drift'; END IF;
  END LOOP;
  expected_count:=CASE WHEN target='products' THEN 3 ELSE 2 END;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=target
      AND left(policyname,18)='hod_admin_write09_')<>expected_count
  THEN RAISE EXCEPTION 'Missing or changed rollback policy set'; END IF;
  FOR p IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename=target
    AND left(policyname,18)='hod_admin_write09_' LOOP
   IF p.roles::text[] IS DISTINCT FROM ARRAY['hod_admin_app'] OR p.qual IS DISTINCT FROM 'true'
   THEN RAISE EXCEPTION 'Rollback policy role/visibility drift'; END IF;
   IF target='products' THEN
    IF p.policyname='hod_admin_write09_product_delete' THEN
     IF p.cmd<>'DELETE' OR p.permissive<>'PERMISSIVE' OR p.with_check IS NOT NULL
     THEN RAISE EXCEPTION 'Delete policy drift'; END IF;
    ELSIF p.policyname IN ('hod_admin_write09_product_draft','hod_admin_write09_product_draft_guard') THEN
     IF p.cmd<>'UPDATE' OR p.permissive<>(CASE WHEN p.policyname='hod_admin_write09_product_draft_guard' THEN 'RESTRICTIVE' ELSE 'PERMISSIVE' END)
      OR regexp_replace(coalesce(p.with_check,''),'[()[:space:]]','','g') NOT IN
       ('status=''draft''::text','status::text=''draft''::text')
     THEN RAISE EXCEPTION 'Draft policy drift'; END IF;
    ELSE RAISE EXCEPTION 'Unexpected product policy'; END IF;
   ELSE
    IF p.policyname NOT IN ('hod_admin_write09_lock','hod_admin_write09_lock_guard') OR p.cmd<>'UPDATE'
     OR p.with_check IS DISTINCT FROM 'false'
     OR p.permissive<>(CASE WHEN p.policyname='hod_admin_write09_lock_guard' THEN 'RESTRICTIVE' ELSE 'PERMISSIVE' END)
    THEN RAISE EXCEPTION 'Lock policy drift'; END IF;
   END IF;
  END LOOP;
 END LOOP;
 FOREACH target IN ARRAY ARRAY['catalog_categories','catalog_gst_slabs','catalog_options',
  'catalog_subcategories','product_metal_variants'] LOOP
  EXECUTE format('DROP POLICY hod_admin_write09_lock ON public.%I',target);
  EXECUTE format('DROP POLICY hod_admin_write09_lock_guard ON public.%I',target);
  EXECUTE format('REVOKE UPDATE(id) ON public.%I FROM hod_admin_app',target);
 END LOOP;
 DROP POLICY hod_admin_write09_product_draft ON public.products;
 DROP POLICY hod_admin_write09_product_draft_guard ON public.products;
 DROP POLICY hod_admin_write09_product_delete ON public.products;
 REVOKE UPDATE(status,updated_at),DELETE ON public.products FROM hod_admin_app;
END $inverse$;
COMMIT;
SELECT jsonb_build_object('rolled_back',true,'business_rows_changed',false) AS admin_product_write_rollback_result;
