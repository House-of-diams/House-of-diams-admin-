-- Rollback for 202610220031_product_media_library.forward.sql.
-- This removes the three new tables and the function. It deletes ONLY the video library,
-- the per-metal video choices and the hover views created with this feature; no product,
-- price, image, order or other existing data is touched. Take an RDS snapshot first.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $guard$
begin
  if current_user <> 'hod_migration' then raise exception 'Run as hod_migration'; end if;
end $guard$;
drop function if exists public.admin_product_media_extras_save_v1(uuid, uuid, jsonb, jsonb, jsonb, boolean);
drop table if exists public.product_variant_library_links;
drop table if exists public.product_hover_views;
drop table if exists public.product_media_library;
commit;
