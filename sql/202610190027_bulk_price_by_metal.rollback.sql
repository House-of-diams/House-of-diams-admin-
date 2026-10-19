-- Rollback for HOD-006: removes admin_product_bulk_price_v2. v1 was never changed.
-- Deploy the previous admin build first, or bulk price will report the service as unavailable.
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if current_user <> 'hod_migration' then raise exception 'Run as hod_migration'; end if;
end $guard$;
drop function if exists public.admin_product_bulk_price_v2(uuid,uuid,text,text,numeric,uuid[],uuid[],jsonb);
commit;
