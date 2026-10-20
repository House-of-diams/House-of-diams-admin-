-- Read-only checks for 202610190029_product_delete_redirects. Every row must say true.
with f as (
  select p.oid, p.prosecdef, pg_get_userbyid(p.proowner) owner, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.oid = to_regprocedure('public.admin_product_delete_v2(uuid,uuid,text,uuid[])')
)
select 'delete v2 exists' as check_name, exists(select 1 from f) as ok
union all select 'delete v2 is security definer owned by hod_migration', coalesce((select prosecdef and owner = 'hod_migration' from f), false)
union all select 'delete v2 pins search_path', coalesce((select proconfig @> array['search_path=pg_catalog, public']::text[] from f), false)
union all select 'hod_admin_app can execute delete v2', coalesce((select has_function_privilege('hod_admin_app', oid, 'EXECUTE') from f), false)
union all select 'storefront role cannot execute delete v2', coalesce((select not has_function_privilege('hod_app', oid, 'EXECUTE') from f), false)
union all select 'function owner can write redirects', has_table_privilege('hod_migration', 'public.seo_redirects', 'INSERT,UPDATE')
union all select 'bulk delete v1 still installed', to_regprocedure('public.admin_product_bulk_delete_v1(uuid,uuid,text,uuid[])') is not null;
