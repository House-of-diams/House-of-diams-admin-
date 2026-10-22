-- Read-only checks for 202610220031_product_media_library. Every row must say true.
with f as (
  select p.oid, p.prosecdef, pg_get_userbyid(p.proowner) owner, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.oid = to_regprocedure('public.admin_product_media_extras_save_v1(uuid,uuid,jsonb,jsonb,jsonb,boolean)')
)
select 'function exists' as check_name, exists(select 1 from f) as ok
union all select 'function is security definer owned by hod_migration', coalesce((select prosecdef and owner = 'hod_migration' from f), false)
union all select 'function pins search_path', coalesce((select proconfig @> array['search_path=pg_catalog, public']::text[] from f), false)
union all select 'admin app can run the function', has_function_privilege('hod_admin_app', 'public.admin_product_media_extras_save_v1(uuid,uuid,jsonb,jsonb,jsonb,boolean)', 'EXECUTE')
union all select 'storefront app cannot run the function', not has_function_privilege('hod_app', 'public.admin_product_media_extras_save_v1(uuid,uuid,jsonb,jsonb,jsonb,boolean)', 'EXECUTE')
union all select t || ' exists', to_regclass('public.' || t) is not null
  from unnest(array['product_media_library', 'product_variant_library_links', 'product_hover_views']) t
union all select t || ' readable by admin and storefront apps', has_table_privilege('hod_admin_app', 'public.' || t, 'SELECT') and has_table_privilege('hod_app', 'public.' || t, 'SELECT')
  from unnest(array['product_media_library', 'product_variant_library_links', 'product_hover_views']) t
union all select t || ' not writable by the apps', not has_table_privilege('hod_admin_app', 'public.' || t, 'INSERT,UPDATE,DELETE') and not has_table_privilege('hod_app', 'public.' || t, 'INSERT,UPDATE,DELETE')
  from unnest(array['product_media_library', 'product_variant_library_links', 'product_hover_views']) t;
