-- Rollback for 202610190030: removes the slug-redirect triggers and their function.
-- Redirect rows already written stay; they are valid 301s to live pages.
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if current_user <> 'hod_migration' then raise exception 'Run as hod_migration'; end if;
end $guard$;
drop trigger if exists catalog_slug_redirects on public.catalog_categories;
drop trigger if exists catalog_slug_redirects on public.catalog_subcategories;
drop trigger if exists catalog_slug_redirects on public.catalog_options;
drop function if exists public.catalog_slug_redirects_v1();
commit;
