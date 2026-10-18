begin;

-- Additive migration: no existing content is rewritten. Deploy before the API.
create table if not exists public.cms_save_receipts (
  actor_id uuid not null,
  request_id uuid not null,
  operation text not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, request_id)
);
alter table public.cms_save_receipts enable row level security;
revoke all on public.cms_save_receipts from public, anon, authenticated;
grant select, insert, delete on public.cms_save_receipts to service_role;

-- A single SQL statement reads settings, items and their revision consistently.
-- Include all persisted fields in the revision so writes from older tools are detected.
create or replace function public.cms_reels_snapshot_v1()
returns jsonb language sql stable security invoker
set search_path = pg_catalog, public
as $$
  with snapshot as (
    select
      (select to_jsonb(s) from public.home_instagram_reels_section s
       where s.section_key = 'home_instagram_reels') as section,
      coalesce((select jsonb_agg(to_jsonb(r) order by r.display_order, r.id)
        from public.home_instagram_reels r
        where r.section_key = 'home_instagram_reels'), '[]'::jsonb) as items
  )
  select jsonb_build_object('section', section, 'items', items,
    'revision', md5(jsonb_build_object('section', section, 'items', items)::text))
  from snapshot;
$$;

create or replace function public.cms_save_reels_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_revision text,
  p_section jsonb,
  p_items jsonb,
  p_deleted_ids uuid[]
)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare
  v_snapshot jsonb;
  v_result jsonb;
  v_receipt public.cms_save_receipts%rowtype;
  v_item jsonb;
  v_current public.home_instagram_reels%rowtype;
  v_id uuid;
  v_ids uuid[] := array[]::uuid[];
  v_urls text[] := array[]::text[];
  v_hash text;
  v_position integer := 0;
begin
  if p_actor_id is null or p_request_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin'
  ) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_expected_revision is null or length(p_expected_revision) <> 32
    or jsonb_typeof(p_section) is distinct from 'object'
    or jsonb_typeof(p_items) is distinct from 'array'
    or p_deleted_ids is null or array_position(p_deleted_ids, null) is not null then
    raise exception 'Invalid save payload. Reload this editor.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 30 or cardinality(p_deleted_ids) > 30 then
    raise exception 'A maximum of 30 reels is allowed.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_section->'heading') is distinct from 'string'
    or length(trim(p_section->>'heading')) not between 1 and 120
    or jsonb_typeof(p_section->'subtitle') is distinct from 'string'
    or length(p_section->>'subtitle') > 240
    or jsonb_typeof(p_section->'is_enabled') is distinct from 'boolean'
    or jsonb_typeof(p_section->'pause_on_hover') is distinct from 'boolean'
    or jsonb_typeof(p_section->'marquee_duration_seconds') is distinct from 'number'
    or (p_section->>'marquee_duration_seconds')::numeric not between 10 and 180
    or trunc((p_section->>'marquee_duration_seconds')::numeric) <> (p_section->>'marquee_duration_seconds')::numeric then
    raise exception 'Invalid section settings.' using errcode = '22023';
  end if;

  -- Serialize retries for a given actor/request, including a reused request ID.
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || p_request_id::text, 0));
  v_hash := md5(jsonb_build_object('revision', p_expected_revision, 'section', p_section,
    'items', p_items, 'deleted', p_deleted_ids)::text);
  select receipt.* into v_receipt from public.cms_save_receipts receipt
    where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'reels-v1' or v_receipt.payload_hash <> v_hash then
      raise exception 'This save request was already used for different changes.' using errcode = '40001';
    end if;
    return v_receipt.result;
  end if;

  -- These small CMS tables are locked only for this short transaction. This also
  -- serializes writes from legacy tools, which do not take advisory locks.
  lock table public.home_instagram_reels_section, public.home_instagram_reels in share row exclusive mode;
  v_snapshot := public.cms_reels_snapshot_v1();
  if v_snapshot->>'revision' <> p_expected_revision then
    raise exception 'Reels changed since you opened this page. Reload before saving.' using errcode = '40001';
  end if;

  -- Validate every row and its ownership before performing any content writes.
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or jsonb_typeof(v_item->'instagram_url') is distinct from 'string'
      or (v_item->>'instagram_url') !~ '^https://www[.]instagram[.]com/(reel|reels|p|tv)/[A-Za-z0-9_-]+/$'
      or length(v_item->>'instagram_url') > 500
      or jsonb_typeof(v_item->'title') is distinct from 'string'
      or length(v_item->>'title') > 100
      or jsonb_typeof(v_item->'is_enabled') is distinct from 'boolean' then
      raise exception 'Invalid reel at row %.', v_position + 1 using errcode = '22023';
    end if;
    if v_item->>'instagram_url' = any(v_urls) then
      raise exception 'Each reel URL must be unique.' using errcode = '22023';
    end if;
    v_urls := array_append(v_urls, v_item->>'instagram_url');
    if v_item ? 'id' then
      if jsonb_typeof(v_item->'id') is distinct from 'string' then
        raise exception 'Existing reel IDs cannot be empty.' using errcode = '22023';
      end if;
      v_id := (v_item->>'id')::uuid;
      if v_id = any(v_ids) or v_id = any(p_deleted_ids) or not exists (
        select 1 from public.home_instagram_reels r
        where r.id = v_id and r.section_key = 'home_instagram_reels'
      ) then
        raise exception 'A reel ID is duplicated, removed, or does not belong to this section.' using errcode = '22023';
      end if;
      v_ids := array_append(v_ids, v_id);
    end if;
    if v_item ? 'cover_image_url' and v_item->'cover_image_url' <> 'null'::jsonb and (
      jsonb_typeof(v_item->'cover_image_url') <> 'string'
      or length(v_item->>'cover_image_url') > 1000
      or (v_item->>'cover_image_url') !~ '^https?://[^[:space:]]+$'
    ) then
      raise exception 'Invalid cover image URL.' using errcode = '22023';
    end if;
    v_position := v_position + 1;
  end loop;
  if (select count(distinct removed_id) from unnest(p_deleted_ids) removed_id) <> cardinality(p_deleted_ids)
    or exists (select 1 from unnest(p_deleted_ids) removed_id where not exists (
      select 1 from public.home_instagram_reels r where r.id = removed_id and r.section_key = 'home_instagram_reels'))
    or exists (select 1 from public.home_instagram_reels r where r.section_key = 'home_instagram_reels'
      and not (r.id = any(v_ids)) and not (r.id = any(p_deleted_ids))) then
    raise exception 'Every existing reel must be retained or explicitly removed.' using errcode = '22023';
  end if;

  insert into public.home_instagram_reels_section as target
    (section_key, heading, subtitle, is_enabled, marquee_duration_seconds, pause_on_hover)
  values ('home_instagram_reels', trim(p_section->>'heading'), trim(p_section->>'subtitle'),
    (p_section->>'is_enabled')::boolean, (p_section->>'marquee_duration_seconds')::integer,
    (p_section->>'pause_on_hover')::boolean)
  on conflict (section_key) do update set
    heading = excluded.heading, subtitle = excluded.subtitle, is_enabled = excluded.is_enabled,
    marquee_duration_seconds = excluded.marquee_duration_seconds, pause_on_hover = excluded.pause_on_hover
  where (target.heading, target.subtitle, target.is_enabled, target.marquee_duration_seconds, target.pause_on_hover)
    is distinct from (excluded.heading, excluded.subtitle, excluded.is_enabled, excluded.marquee_duration_seconds, excluded.pause_on_hover);

  delete from public.home_instagram_reels r
    where r.section_key = 'home_instagram_reels' and r.id = any(p_deleted_ids);
  v_position := 0;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if v_item ? 'id' then
      select r.* into strict v_current from public.home_instagram_reels r where r.id = (v_item->>'id')::uuid;
      update public.home_instagram_reels r set
        instagram_url = v_item->>'instagram_url', title = v_item->>'title',
        display_order = v_position, is_enabled = (v_item->>'is_enabled')::boolean,
        cover_image_url = case when v_item ? 'cover_image_url' then v_item->>'cover_image_url' else v_current.cover_image_url end
      where r.id = v_current.id and r.section_key = 'home_instagram_reels'
        and (r.instagram_url, r.title, r.display_order, r.is_enabled, r.cover_image_url)
        is distinct from (v_item->>'instagram_url', v_item->>'title', v_position, (v_item->>'is_enabled')::boolean,
          case when v_item ? 'cover_image_url' then v_item->>'cover_image_url' else v_current.cover_image_url end);
    else
      insert into public.home_instagram_reels
        (section_key, instagram_url, title, display_order, is_enabled, created_by, cover_image_url)
      values ('home_instagram_reels', v_item->>'instagram_url', v_item->>'title', v_position,
        (v_item->>'is_enabled')::boolean, p_actor_id, v_item->>'cover_image_url');
    end if;
    v_position := v_position + 1;
  end loop;

  v_result := public.cms_reels_snapshot_v1();
  insert into public.cms_save_receipts (actor_id, request_id, operation, payload_hash, result)
    values (p_actor_id, p_request_id, 'reels-v1', v_hash, v_result);
  return v_result;
end;
$$;

revoke all on function public.cms_reels_snapshot_v1() from public, anon, authenticated;
revoke all on function public.cms_save_reels_v1(uuid, uuid, text, jsonb, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.cms_reels_snapshot_v1() to service_role;
grant execute on function public.cms_save_reels_v1(uuid, uuid, text, jsonb, jsonb, uuid[]) to service_role;
notify pgrst, 'reload schema';
commit;
