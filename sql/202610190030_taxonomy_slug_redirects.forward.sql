-- HOD-059: renaming (or moving) a category, subcategory or option keeps its old
-- storefront URLs working. An AFTER UPDATE trigger on each table writes a 301 for
-- every affected path:
--   category    /<old>                 and every /<old>/<sub>[/<option>] below it
--   subcategory /<cat>/<old>           and every /<cat>/<old>/<option> below it
--   option      /<cat>/<sub>/<old>
-- Redirects that already ended at an old path are repointed (no chains), and a path
-- that becomes live again stops redirecting. No existing function is changed.
-- Apply to UAT first, as hod_migration, after an RDS snapshot.
-- Rollback: 202610190030_taxonomy_slug_redirects.rollback.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $guard$
begin
  if current_user <> 'hod_migration' then raise exception 'Run as hod_migration'; end if;
  if to_regprocedure('public.catalog_slug_redirects_v1()') is not null then
    raise exception 'catalog_slug_redirects_v1 already exists; inspect before replaying';
  end if;
  if to_regclass('public.seo_redirects') is null
     or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'seo_redirects_source_path_unique') then
    raise exception 'seo_redirects or its unique source_path index is missing';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'catalog_slug_redirects' and not tgisinternal) then
    raise exception 'catalog_slug_redirects trigger already exists';
  end if;
end $guard$;

create function public.catalog_slug_redirects_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_old_prefix text;
  v_new_prefix text;
  v_entity text;
  v_pairs jsonb;
begin
  if tg_table_name = 'catalog_categories' then
    if new.slug is not distinct from old.slug then return new; end if;
    v_entity := 'category';
    v_old_prefix := '/' || old.slug;
    v_new_prefix := '/' || new.slug;
  elsif tg_table_name = 'catalog_subcategories' then
    if new.slug is not distinct from old.slug and new.category_id is not distinct from old.category_id then return new; end if;
    v_entity := 'subcategory';
    select '/' || c.slug || '/' || old.slug into v_old_prefix from public.catalog_categories c where c.id = old.category_id;
    select '/' || c.slug || '/' || new.slug into v_new_prefix from public.catalog_categories c where c.id = new.category_id;
  else
    if new.slug is not distinct from old.slug and new.subcategory_id is not distinct from old.subcategory_id then return new; end if;
    v_entity := 'option';
    select '/' || c.slug || '/' || s.slug || '/' || old.slug into v_old_prefix
      from public.catalog_subcategories s join public.catalog_categories c on c.id = s.category_id where s.id = old.subcategory_id;
    select '/' || c.slug || '/' || s.slug || '/' || new.slug into v_new_prefix
      from public.catalog_subcategories s join public.catalog_categories c on c.id = s.category_id where s.id = new.subcategory_id;
  end if;
  if v_old_prefix is null or v_new_prefix is null or nullif(trim(old.slug), '') is null or v_old_prefix = v_new_prefix then return new; end if;

  -- Every path that moves: the row itself plus its descendants (suffix after the prefix).
  with suffixes as (
    select '' as suffix
    union all
    select '/' || s.slug from public.catalog_subcategories s where tg_table_name = 'catalog_categories' and s.category_id = new.id
    union all
    select '/' || s.slug || '/' || o.slug from public.catalog_subcategories s join public.catalog_options o on o.subcategory_id = s.id
     where tg_table_name = 'catalog_categories' and s.category_id = new.id
    union all
    select '/' || o.slug from public.catalog_options o where tg_table_name = 'catalog_subcategories' and o.subcategory_id = new.id
  )
  select coalesce(jsonb_agg(jsonb_build_object('source', v_old_prefix || suffix, 'target', v_new_prefix || suffix)), '[]'::jsonb)
    into v_pairs from suffixes;

  -- Redirect bookkeeping must never block the rename itself: on any error the
  -- redirect changes roll back together and a warning is logged.
  begin
  -- A path that is live again must not keep redirecting away.
  update public.seo_redirects r set is_active = false
    from jsonb_array_elements(v_pairs) p
   where r.is_active and r.source_path = p->>'target';
  -- Redirects that ended at a moved path now end at its new path (no chains).
  update public.seo_redirects r set target_path = p->>'target'
    from jsonb_array_elements(v_pairs) p
   where r.is_active and r.target_path = p->>'source' and r.source_path <> p->>'target';

  insert into public.seo_redirects as r (source_path, target_path, http_status, entity_type, entity_id, reason, is_active)
  select p->>'source', p->>'target', 301, v_entity, new.id, v_entity || ' slug changed', true
    from jsonb_array_elements(v_pairs) p
  on conflict (source_path) do update
     set target_path = excluded.target_path, http_status = 301, entity_type = excluded.entity_type,
         entity_id = excluded.entity_id, reason = excluded.reason, is_active = true;
  exception when others then
    raise warning 'catalog slug redirects skipped for % % (%)', v_entity, new.id, sqlstate;
  end;
  return new;
end;
$function$;

revoke all on function public.catalog_slug_redirects_v1() from public;

create trigger catalog_slug_redirects after update of slug on public.catalog_categories
  for each row execute function public.catalog_slug_redirects_v1();
create trigger catalog_slug_redirects after update of slug, category_id on public.catalog_subcategories
  for each row execute function public.catalog_slug_redirects_v1();
create trigger catalog_slug_redirects after update of slug, subcategory_id on public.catalog_options
  for each row execute function public.catalog_slug_redirects_v1();

commit;
