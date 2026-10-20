-- Read-only checks for 202610190028_order_status_guard. Every row must say true.
with f as (select p.oid, p.prosrc, p.prosecdef, pg_get_userbyid(p.proowner) owner from pg_proc p
  where p.oid = to_regprocedure('public.admin_order_status_update_v1(uuid,text,text,uuid,jsonb,timestamp with time zone)'))
select 'paid-only rule installed' as check_name, coalesce((select position('Only paid orders can be processed' in prosrc) > 0 from f), false) as ok
union all select 'allowed-steps rule installed', coalesce((select position('This status change is not allowed.' in prosrc) > 0 from f), false)
union all select 'security definer owned by hod_migration', coalesce((select prosecdef and owner = 'hod_migration' from f), false)
union all select 'hod_admin_app can execute', coalesce((select has_function_privilege('hod_admin_app', oid, 'EXECUTE') from f), false)
union all select 'returns charged currency', coalesce((select position('''payment_currency'',v_after.payment_currency' in prosrc) > 0 from f), false)
union all select 'storefront role cannot execute', coalesce((select not has_function_privilege('hod_app', oid, 'EXECUTE') from f), false);
