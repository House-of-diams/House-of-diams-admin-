-- Fix navbar conflict responses that PostgREST can retry indefinitely.
-- A stale editor revision is an HTTP conflict, not a PostgreSQL serialization
-- failure. Keep both save functions and their existing grants intact.

begin;

do $migration$
declare
  v_signature text;
  v_definition text;
  v_updated text;
begin
  foreach v_signature in array array[
    'public.navbar_save_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid[],uuid[],bigint[],uuid[])',
    'public.navbar_item_save_v1(uuid,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,uuid[],uuid[],bigint[],uuid[])'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'Missing navbar save function: %', v_signature;
    end if;

    v_definition := pg_get_functiondef(to_regprocedure(v_signature)::oid);
    v_updated := regexp_replace(
      v_definition,
      'errcode[[:space:]]*=[[:space:]]*''40001''',
      'errcode = ''PT409''',
      'gi'
    );

    if v_updated = v_definition then
      if v_definition ~* 'errcode[[:space:]]*=[[:space:]]*''PT409''' then
        continue;
      end if;
      raise exception 'Expected navbar conflict code not found in %', v_signature;
    end if;

    execute v_updated;
  end loop;
end
$migration$;

notify pgrst, 'reload schema';
commit;

-- Clear any PostgREST connections already stuck retrying the legacy save.
-- This only targets connections whose current/last query invokes that RPC.
select pid, pg_terminate_backend(pid) as terminated
from pg_stat_activity
where usename = 'authenticator'
  and application_name = 'postgrest'
  and query ilike '%navbar_save_v1%'
  and pid <> pg_backend_pid();

-- Both rows should report true after the migration.
select p.proname,
       pg_get_functiondef(p.oid) ~* 'errcode[[:space:]]*=[[:space:]]*''PT409''' as conflict_returns_409
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('navbar_save_v1', 'navbar_item_save_v1');
