-- Rollback for 202610190029: removes admin_product_delete_v2. v1 was never changed.
-- Redirect rows it already wrote stay; they are valid 301s to live pages.
-- Deploy the previous admin build first, or product delete will report the service as unavailable.
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if current_user <> 'hod_migration' then raise exception 'Run as hod_migration'; end if;
end $guard$;
drop function if exists public.admin_product_delete_v2(uuid,uuid,text,uuid[]);
commit;
