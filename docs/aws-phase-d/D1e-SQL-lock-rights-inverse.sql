-- REVIEW ONLY. Exact inverse ONLY when all rights/policy names absent before,
-- installed by this delta and unchanged since. Otherwise reconstruct saved ACL.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$ BEGIN
 IF current_setting('d1e.inverse_review',true) IS DISTINCT FROM 'APPROVED_APPLIED_MANIFEST_NO_DRIFT'
 THEN RAISE EXCEPTION 'Review-only: missing exact applied manifest'; END IF;
END $guard$;
DROP POLICY d1e_catalog_options_no_write ON public.catalog_options;
DROP POLICY d1e_catalog_options_lock ON public.catalog_options;
REVOKE UPDATE(id) ON public.catalog_options FROM hod_admin_app;
DROP POLICY d1e_catalog_subcategories_no_write ON public.catalog_subcategories;
DROP POLICY d1e_catalog_subcategories_lock ON public.catalog_subcategories;
REVOKE UPDATE(id) ON public.catalog_subcategories FROM hod_admin_app;
DROP POLICY d1e_catalog_categories_no_write ON public.catalog_categories;
DROP POLICY d1e_catalog_categories_lock ON public.catalog_categories;
REVOKE UPDATE(id) ON public.catalog_categories FROM hod_admin_app;
DROP POLICY d1e_variant_no_write ON public.product_metal_variants;
DROP POLICY d1e_variant_lock ON public.product_metal_variants;
REVOKE UPDATE(id) ON public.product_metal_variants FROM hod_admin_app;
DROP POLICY d1e_gst_no_write ON public.catalog_gst_slabs;
DROP POLICY d1e_gst_lock ON public.catalog_gst_slabs;
REVOKE UPDATE(id) ON public.catalog_gst_slabs FROM hod_admin_app;
REVOKE UPDATE(updated_at) ON public.products FROM hod_admin_app;
ROLLBACK;
