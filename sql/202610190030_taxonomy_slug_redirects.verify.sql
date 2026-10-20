-- Read-only checks for 202610190030_taxonomy_slug_redirects. Every row must say true.
with f as (
  select p.oid, p.prosecdef, pg_get_userbyid(p.proowner) owner, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.oid = to_regprocedure('public.catalog_slug_redirects_v1()')
)
select 'trigger function exists' as check_name, exists(select 1 from f) as ok
union all select 'function is security definer owned by hod_migration', coalesce((select prosecdef and owner = 'hod_migration' from f), false)
union all select 'function pins search_path', coalesce((select proconfig @> array['search_path=pg_catalog, public']::text[] from f), false)
union all select 'function owner can write redirects', has_table_privilege('hod_migration', 'public.seo_redirects', 'INSERT,UPDATE')
union all select 'trigger on ' || t, exists(select 1 from pg_trigger g where g.tgrelid = ('public.' || t)::regclass and g.tgname = 'catalog_slug_redirects' and g.tgenabled = 'O')
  from unnest(array['catalog_categories', 'catalog_subcategories', 'catalog_options']) t;
