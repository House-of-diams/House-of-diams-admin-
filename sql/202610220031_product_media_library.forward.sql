-- HOD-090: a per-product video library, per-metal video picks and a 24-frame hover view.
-- Additive only: three new tables and one new function. No existing table, column,
-- function or row is changed, so every existing product keeps working exactly as it does now.
--   product_media_library          videos uploaded once per product (e.g. "Yellow gold")
--   product_variant_library_links  which library video a metal option uses
--   product_hover_views            the 24 frames of the hover animation, one set per product
-- Writes go only through admin_product_media_extras_save_v1 (administrators only).
-- Apply to UAT first, as hod_migration, after an RDS snapshot.
-- Rollback: 202610220031_product_media_library.rollback.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $guard$
begin
  if current_user <> 'hod_migration' then raise exception 'Run as hod_migration'; end if;
  if to_regclass('public.products') is null or to_regclass('public.product_metal_variants') is null or to_regclass('public.profiles') is null then
    raise exception 'products, product_metal_variants or profiles is missing';
  end if;
  if to_regclass('public.product_media_library') is not null
     or to_regclass('public.product_variant_library_links') is not null
     or to_regclass('public.product_hover_views') is not null then
    raise exception 'A media library table already exists; inspect before replaying';
  end if;
  if to_regprocedure('public.admin_product_media_extras_save_v1(uuid,uuid,jsonb,jsonb,jsonb,boolean)') is not null then
    raise exception 'admin_product_media_extras_save_v1 already exists; inspect before replaying';
  end if;
end $guard$;

create table public.product_media_library (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  media_type text not null default 'video' check (media_type = 'video'),
  media_path text not null check (char_length(btrim(media_path)) between 1 and 2000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_media_library_label_unique on public.product_media_library (product_id, lower(btrim(label)));
create index product_media_library_product_idx on public.product_media_library (product_id, sort_order);

create table public.product_variant_library_links (
  product_id uuid not null references public.products(id) on delete cascade,
  metal_id uuid not null,
  library_id uuid not null references public.product_media_library(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, metal_id)
);
create index product_variant_library_links_library_idx on public.product_variant_library_links (library_id);

create table public.product_hover_views (
  product_id uuid primary key references public.products(id) on delete cascade,
  version integer not null check (version > 0),
  frame_paths text[] not null check (cardinality(frame_paths) = 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_media_library owner to hod_migration;
alter table public.product_variant_library_links owner to hod_migration;
alter table public.product_hover_views owner to hod_migration;
revoke all on public.product_media_library, public.product_variant_library_links, public.product_hover_views from public;
grant select on public.product_media_library, public.product_variant_library_links, public.product_hover_views to hod_admin_app, hod_app;

create function public.admin_product_media_extras_save_v1(
  p_actor_id uuid,
  p_product_id uuid,
  p_library jsonb,
  p_links jsonb,
  p_hover jsonb,
  p_hover_set boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_item jsonb;
  v_id uuid;
  v_label text;
  v_path text;
  v_metal uuid;
  v_library uuid;
  v_index integer := 0;
  v_ids uuid[] := '{}'::uuid[];
  v_labels text[] := '{}'::text[];
  v_metals uuid[] := '{}'::uuid[];
  v_version integer;
  v_frames text[];
  v_current integer;
  v_frame text;
begin
  if p_actor_id is null or p_product_id is null
     or p_library is null or jsonb_typeof(p_library) <> 'array'
     or p_links is null or jsonb_typeof(p_links) <> 'array' then
    raise exception 'Invalid media library request.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  perform 1 from public.products where id = p_product_id for update;
  if not found then raise exception 'Product not found.' using errcode = 'P0002'; end if;

  if jsonb_array_length(p_library) > 12 then
    raise exception 'A product can have at most 12 library videos.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_library) loop
    v_index := v_index + 1;
    v_id := (v_item->>'id')::uuid;
    v_label := btrim(v_item->>'label');
    v_path := btrim(v_item->>'media_path');
    if v_id is null or v_id = any(v_ids) then raise exception 'Invalid library video.' using errcode = '22023'; end if;
    if char_length(coalesce(v_label, '')) not between 1 and 80 then
      raise exception 'Each library video needs a label of 1 to 80 characters.' using errcode = '22023';
    end if;
    if lower(v_label) = any(v_labels) then
      raise exception 'Library video labels must be different from each other.' using errcode = '22023';
    end if;
    if v_path is null or char_length(v_path) not between 1 and 2000 or v_path ~ '\.\.' or v_path ~ '[[:cntrl:]]'
       or not (v_path ~ '^https://[^[:space:]]+$' or v_path ~ '^[A-Za-z0-9][A-Za-z0-9/_.%() -]*$') then
      raise exception 'A library video has an invalid file address.' using errcode = '22023';
    end if;
    v_ids := v_ids || v_id;
    v_labels := v_labels || lower(v_label);
    insert into public.product_media_library (id, product_id, label, media_path, sort_order)
    values (v_id, p_product_id, v_label, v_path, v_index)
    on conflict (id) do update
      set label = excluded.label, media_path = excluded.media_path, sort_order = excluded.sort_order, updated_at = now()
      where public.product_media_library.product_id = p_product_id;
    if not exists (select 1 from public.product_media_library where id = v_id and product_id = p_product_id) then
      raise exception 'A library video belongs to another product.' using errcode = '22023';
    end if;
  end loop;
  delete from public.product_media_library where product_id = p_product_id and not (id = any(v_ids));

  delete from public.product_variant_library_links where product_id = p_product_id;
  for v_item in select value from jsonb_array_elements(p_links) loop
    v_metal := (v_item->>'metal_id')::uuid;
    v_library := nullif(v_item->>'library_id', '')::uuid;
    if v_metal is null or v_metal = any(v_metals) then raise exception 'Invalid video choice for a metal option.' using errcode = '22023'; end if;
    v_metals := v_metals || v_metal;
    if v_library is null then continue; end if;
    if not (v_library = any(v_ids)) then raise exception 'A metal option uses a video that is not in the library.' using errcode = '22023'; end if;
    if not exists (select 1 from public.product_metal_variants where product_id = p_product_id and metal_id = v_metal) then
      raise exception 'A video was chosen for a metal option this product does not have.' using errcode = '22023';
    end if;
    insert into public.product_variant_library_links (product_id, metal_id, library_id) values (p_product_id, v_metal, v_library);
  end loop;

  if coalesce(p_hover_set, false) then
    if p_hover is null or jsonb_typeof(p_hover) = 'null' then
      delete from public.product_hover_views where product_id = p_product_id;
    else
      v_version := (p_hover->>'version')::integer;
      select array_agg(value order by ord) into v_frames from jsonb_array_elements_text(p_hover->'frame_paths') with ordinality as t(value, ord);
      if v_version is null or v_version < 1 or coalesce(cardinality(v_frames), 0) <> 24 then
        raise exception 'The hover view needs exactly 24 frames.' using errcode = '22023';
      end if;
      for v_index in 1..24 loop
        v_frame := v_frames[v_index];
        -- The stored address is either the object key or the CDN address that ends with it.
        if v_frame !~ ('^(https://[^[:space:]]+/)?products/hover/' || p_product_id::text || '/v' || v_version::text || '/' || lpad((v_index - 1)::text, 2, '0') || '\.webp$') then
          raise exception 'A hover frame has an unexpected file address.' using errcode = '22023';
        end if;
      end loop;
      select version into v_current from public.product_hover_views where product_id = p_product_id;
      if v_current is not null and v_version <= v_current then
        raise exception 'This hover view is older than the saved one.' using errcode = '40001';
      end if;
      insert into public.product_hover_views (product_id, version, frame_paths)
      values (p_product_id, v_version, v_frames)
      on conflict (product_id) do update set version = excluded.version, frame_paths = excluded.frame_paths, updated_at = now();
    end if;
  end if;

  return jsonb_build_object(
    'library', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'media_path', media_path) order by sort_order) from public.product_media_library where product_id = p_product_id), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('metal_id', metal_id, 'library_id', library_id) order by metal_id) from public.product_variant_library_links where product_id = p_product_id), '[]'::jsonb),
    'hover', (select jsonb_build_object('version', version, 'frame_paths', frame_paths) from public.product_hover_views where product_id = p_product_id)
  );
end
$function$;

alter function public.admin_product_media_extras_save_v1(uuid, uuid, jsonb, jsonb, jsonb, boolean) owner to hod_migration;
revoke all on function public.admin_product_media_extras_save_v1(uuid, uuid, jsonb, jsonb, jsonb, boolean) from public;
grant execute on function public.admin_product_media_extras_save_v1(uuid, uuid, jsonb, jsonb, jsonb, boolean) to hod_admin_app;

commit;
