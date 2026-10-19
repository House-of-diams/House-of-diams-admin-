-- Read-only checks for 202610190027_bulk_price_by_metal. Every row must say true.
with f as (
  select p.oid, p.prosecdef, pg_get_userbyid(p.proowner) owner, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.oid = to_regprocedure('public.admin_product_bulk_price_v2(uuid,uuid,text,text,numeric,uuid[],uuid[],jsonb)')
)
select 'v2 exists' as check_name, exists(select 1 from f) as ok
union all select 'v2 is security definer owned by hod_migration', coalesce((select prosecdef and owner = 'hod_migration' from f), false)
union all select 'v2 pins search_path', coalesce((select proconfig @> array['search_path=pg_catalog, public']::text[] from f), false)
union all select 'hod_admin_app can execute v2', coalesce((select has_function_privilege('hod_admin_app', oid, 'EXECUTE') from f), false)
union all select 'storefront role cannot execute v2', coalesce((select not has_function_privilege('hod_app', oid, 'EXECUTE') from f), false)
union all select 'v1 still installed', to_regprocedure('public.admin_product_bulk_price_v1(uuid,uuid,text,text,numeric,uuid[],jsonb)') is not null;
