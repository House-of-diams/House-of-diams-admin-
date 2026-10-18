-- REVIEW CANDIDATE ONLY. NOT AUTHORIZED; never executed or PostgreSQL parsed.
-- Delta after D1c feature module, not a replacement installation script.
-- Preconditions: new isolated hod_admin_app absent-before manifest; exact grantor,
-- safe owner, table RLS enabled, and current PUBLIC/inherited/restrictive policies
-- reviewed. Owner-based catalog definers must bypass runtime-only policies;
-- no unsafe membership, broad inherited rights, triggers or helper side effects.
-- A restrictive existing USING(false) still prevents locks: review/reconcile it,
-- never assume these permissive policies override an existing restrictive policy.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$ BEGIN
 IF current_setting('d1e.lock_review',true) IS DISTINCT FROM 'APPROVED_EXACT_PRESTATE_AND_NEGATIVE_MATRIX'
 THEN RAISE EXCEPTION 'Review-only: missing current prestate and authorization'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hod_admin_app' AND (rolsuper OR rolbypassrls))
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hod_admin_app')
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('catalog_gst_slabs','product_metal_variants','catalog_categories','catalog_subcategories','catalog_options')
 AND (NOT c.relrowsecurity OR c.relowner=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app')))
 THEN RAISE EXCEPTION 'Lock write-denial requires active RLS and a non-owner non-bypass runtime'; END IF;
END $guard$;
GRANT UPDATE(updated_at) ON public.products TO hod_admin_app;
-- Already granted SELECT by feature candidate. id is only a lock capability;
-- runtime UPDATE checks reject even SET id=id, including other permissive rights.
GRANT UPDATE(id) ON public.catalog_gst_slabs TO hod_admin_app;
CREATE POLICY d1e_gst_lock ON public.catalog_gst_slabs FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false);
CREATE POLICY d1e_gst_no_write ON public.catalog_gst_slabs AS RESTRICTIVE FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false);
-- Existing coupon gift validation also locks variants FOR SHARE.
GRANT UPDATE(id) ON public.product_metal_variants TO hod_admin_app;
CREATE POLICY d1e_variant_lock ON public.product_metal_variants FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false);
CREATE POLICY d1e_variant_no_write ON public.product_metal_variants AS RESTRICTIVE FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false);
-- cms_save_home_group1_v1 invoker FOR KEY SHARE validation.
GRANT UPDATE(id) ON public.catalog_categories TO hod_admin_app;
CREATE POLICY d1e_catalog_categories_lock ON public.catalog_categories FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false);
CREATE POLICY d1e_catalog_categories_no_write ON public.catalog_categories AS RESTRICTIVE FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false);
-- cms_save_home_group1_v1 invoker FOR KEY SHARE validation.
GRANT UPDATE(id) ON public.catalog_subcategories TO hod_admin_app;
CREATE POLICY d1e_catalog_subcategories_lock ON public.catalog_subcategories FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false);
CREATE POLICY d1e_catalog_subcategories_no_write ON public.catalog_subcategories AS RESTRICTIVE FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false);
-- cms_save_home_group1_v1 invoker FOR KEY SHARE validation.
GRANT UPDATE(id) ON public.catalog_options TO hod_admin_app;
CREATE POLICY d1e_catalog_options_lock ON public.catalog_options FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false);
CREATE POLICY d1e_catalog_options_no_write ON public.catalog_options AS RESTRICTIVE FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false);
-- No broad UPDATE, no policy removal, no FORCE/RLS-mode changes.
ROLLBACK;
