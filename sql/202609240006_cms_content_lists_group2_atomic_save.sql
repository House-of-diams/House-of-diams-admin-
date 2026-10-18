begin;

-- Group 2 CMS list save boundary. This migration is additive and does not
-- rewrite existing content. It depends on cms_save_receipts from 202609240004.
create or replace function public.cms_content_list_snapshot_v1(p_kind text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_items jsonb;
begin
  case p_kind
    when 'about_values' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',i.id,'sort_order',i.sort_order,'icon_path',i.icon_path,
        'image_path',coalesce(i.image_path,''),'image_alt',coalesce(i.image_alt,''),
        'title',i.title,'description',i.description
      ) order by i.sort_order, i.id), '[]'::jsonb)
        into v_items from public.about_values i;
    when 'about_timeline' then
      select coalesce(jsonb_agg(to_jsonb(i) - 'created_at' - 'updated_at' order by i.sort_order, i.id), '[]'::jsonb)
        into v_items from public.about_timeline i;
    when 'about_founders' then
      select coalesce(jsonb_agg(to_jsonb(i) - 'created_at' - 'updated_at' order by i.sort_order, i.id), '[]'::jsonb)
        into v_items from public.about_founders i;
    when 'contact_info' then
      select coalesce(jsonb_agg(to_jsonb(i) - 'created_at' - 'updated_at' order by i.sort_order, i.id), '[]'::jsonb)
        into v_items from public.contact_info i;
    when 'bespoke_process' then
      select coalesce(jsonb_agg(to_jsonb(i) - 'created_at' - 'updated_at' order by i.sort_order, i.id), '[]'::jsonb)
        into v_items from public.bespoke_process_cards i;
    when 'bespoke_manufacturing' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',i.id,'sort_order',i.sort_order,'step',i.step,'eyebrow',i.eyebrow,
        'title',i.title,'description',i.description,'image_path',i.image_path,
        'media_type',i.media_type,'media_path',coalesce(i.media_path,'')
      ) order by i.sort_order, i.id), '[]'::jsonb)
        into v_items from public.bespoke_process_steps i;
    else
      raise exception 'Unsupported CMS list.' using errcode = '22023';
  end case;

  return jsonb_build_object(
    'items', v_items,
    'revision', md5(v_items::text)
  );
end;
$$;

create or replace function public.cms_save_content_list_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_revision text,
  p_kind text,
  p_items jsonb,
  p_deleted_ids text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb;
  v_result jsonb;
  v_receipt public.cms_save_receipts%rowtype;
  v_hash text;
  v_item jsonb;
  v_id_text text;
  v_position integer := 0;
begin
  if p_actor_id is null or p_request_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin'
  ) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  if p_expected_revision is null
    or p_expected_revision !~ '^[0-9a-f]{32}$'
    or p_kind not in ('about_values', 'about_timeline', 'about_founders', 'contact_info', 'bespoke_process', 'bespoke_manufacturing')
    or jsonb_typeof(p_items) is distinct from 'array'
    or p_deleted_ids is null
    or array_position(p_deleted_ids, null) is not null
  then
    raise exception 'Invalid save payload. Reload this editor.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 100 or cardinality(p_deleted_ids) > 100 then
    raise exception 'Too many CMS rows.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cms-content-list:' || p_kind, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || p_request_id::text, 0));

  v_hash := md5(jsonb_build_object(
    'revision', p_expected_revision,
    'kind', p_kind,
    'items', p_items,
    'deleted', p_deleted_ids
  )::text);

  select receipt.* into v_receipt
  from public.cms_save_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;

  if found then
    if v_receipt.operation <> 'content-list-' || p_kind or v_receipt.payload_hash <> v_hash then
      raise exception 'This save request was already used for different changes.' using errcode = '40001';
    end if;
    return v_receipt.result;
  end if;

  case p_kind
    when 'about_values' then lock table public.about_values in share row exclusive mode;
    when 'about_timeline' then lock table public.about_timeline in share row exclusive mode;
    when 'about_founders' then lock table public.about_founders in share row exclusive mode;
    when 'contact_info' then lock table public.contact_info in share row exclusive mode;
    when 'bespoke_process' then lock table public.bespoke_process_cards in share row exclusive mode;
    when 'bespoke_manufacturing' then lock table public.bespoke_process_steps in share row exclusive mode;
  end case;

  v_before := public.cms_content_list_snapshot_v1(p_kind);
  if v_before->>'revision' <> p_expected_revision then
    raise exception 'This section changed since you opened it. Reload before saving.' using errcode = '40001';
  end if;

  if (select count(distinct deleted_id) from unnest(p_deleted_ids) deleted_id) <> cardinality(p_deleted_ids) then
    raise exception 'A deleted row ID was duplicated.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where item ? 'id' and (
      jsonb_typeof(item->'id') not in ('string', 'number')
      or nullif(item->>'id', '') is null
      or item->>'id' !~ '^[1-9][0-9]*$'
      or item->>'id' = any(p_deleted_ids)
    )
  ) or exists (
    select item_id
    from (select value->>'id' item_id from jsonb_array_elements(p_items) where value ? 'id') submitted
    group by item_id having count(*) > 1
  ) then
    raise exception 'A row ID is invalid, duplicated, or both retained and deleted.' using errcode = '22023';
  end if;

  if p_kind = 'about_values' then
    if exists (select 1 from jsonb_array_elements(p_items) item where
      jsonb_typeof(item->'icon_path') is distinct from 'string'
      or jsonb_typeof(item->'image_path') is distinct from 'string'
      or jsonb_typeof(item->'image_alt') is distinct from 'string'
      or jsonb_typeof(item->'title') is distinct from 'string'
      or jsonb_typeof(item->'description') is distinct from 'string')
    then raise exception 'Every value card must be valid.' using errcode = '22023'; end if;
    if exists (select 1 from public.about_values row where row.id::text <> all(p_deleted_ids)
      and not exists (select 1 from jsonb_array_elements(p_items) item where item->>'id' = row.id::text))
      or exists (select 1 from jsonb_array_elements(p_items) item where item ? 'id'
        and not exists (select 1 from public.about_values row where row.id::text = item->>'id'))
      or exists (select 1 from unnest(p_deleted_ids) deleted_id
        where not exists (select 1 from public.about_values row where row.id::text = deleted_id))
    then raise exception 'Every existing value card must be retained or explicitly removed.' using errcode = '22023'; end if;
    delete from public.about_values row where row.id::text = any(p_deleted_ids);
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_position := v_position + 1; v_id_text := v_item->>'id';
      if v_id_text is null then
        insert into public.about_values(sort_order, icon_path, image_path, image_alt, title, description)
        values(v_position, trim(v_item->>'icon_path'), nullif(trim(v_item->>'image_path'), ''), nullif(trim(v_item->>'image_alt'), ''), trim(v_item->>'title'), trim(v_item->>'description'));
      else
        update public.about_values row set sort_order=v_position, icon_path=trim(v_item->>'icon_path'), image_path=nullif(trim(v_item->>'image_path'), ''), image_alt=nullif(trim(v_item->>'image_alt'), ''), title=trim(v_item->>'title'), description=trim(v_item->>'description')
        where row.id=v_id_text::bigint and (row.sort_order,row.icon_path,row.image_path,row.image_alt,row.title,row.description) is distinct from
          (v_position,trim(v_item->>'icon_path'),nullif(trim(v_item->>'image_path'), ''),nullif(trim(v_item->>'image_alt'), ''),trim(v_item->>'title'),trim(v_item->>'description'));
      end if;
    end loop;

  elsif p_kind = 'about_timeline' then
    if exists (select 1 from jsonb_array_elements(p_items) item where jsonb_typeof(item->'year') is distinct from 'string' or jsonb_typeof(item->'label') is distinct from 'string')
    then raise exception 'Every timeline entry must be valid.' using errcode = '22023'; end if;
    if exists (select 1 from public.about_timeline row where row.id::text <> all(p_deleted_ids) and not exists (select 1 from jsonb_array_elements(p_items) item where item->>'id'=row.id::text))
      or exists (select 1 from jsonb_array_elements(p_items) item where item ? 'id' and not exists (select 1 from public.about_timeline row where row.id::text=item->>'id'))
      or exists (select 1 from unnest(p_deleted_ids) deleted_id where not exists (select 1 from public.about_timeline row where row.id::text=deleted_id))
    then raise exception 'Every existing timeline entry must be retained or explicitly removed.' using errcode = '22023'; end if;
    delete from public.about_timeline row where row.id::text = any(p_deleted_ids);
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_position:=v_position+1; v_id_text:=v_item->>'id';
      if v_id_text is null then insert into public.about_timeline(sort_order,year,label) values(v_position,trim(v_item->>'year'),trim(v_item->>'label'));
      else update public.about_timeline row set sort_order=v_position,year=trim(v_item->>'year'),label=trim(v_item->>'label')
        where row.id=v_id_text::bigint and (row.sort_order,row.year,row.label) is distinct from (v_position,trim(v_item->>'year'),trim(v_item->>'label')); end if;
    end loop;

  elsif p_kind = 'about_founders' then
    if exists (select 1 from jsonb_array_elements(p_items) item where jsonb_typeof(item->'name') is distinct from 'string' or jsonb_typeof(item->'designation') is distinct from 'string' or jsonb_typeof(item->'bio') is distinct from 'string' or jsonb_typeof(item->'image_path') is distinct from 'string')
    then raise exception 'Every founder must be valid.' using errcode = '22023'; end if;
    if exists (select 1 from public.about_founders row where row.id::text <> all(p_deleted_ids) and not exists (select 1 from jsonb_array_elements(p_items) item where item->>'id'=row.id::text))
      or exists (select 1 from jsonb_array_elements(p_items) item where item ? 'id' and not exists (select 1 from public.about_founders row where row.id::text=item->>'id'))
      or exists (select 1 from unnest(p_deleted_ids) deleted_id where not exists (select 1 from public.about_founders row where row.id::text=deleted_id))
    then raise exception 'Every existing founder must be retained or explicitly removed.' using errcode = '22023'; end if;
    delete from public.about_founders row where row.id::text = any(p_deleted_ids);
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_position:=v_position+1; v_id_text:=v_item->>'id';
      if v_id_text is null then insert into public.about_founders(sort_order,name,designation,bio,image_path) values(v_position,trim(v_item->>'name'),trim(v_item->>'designation'),trim(v_item->>'bio'),trim(v_item->>'image_path'));
      else update public.about_founders row set sort_order=v_position,name=trim(v_item->>'name'),designation=trim(v_item->>'designation'),bio=trim(v_item->>'bio'),image_path=trim(v_item->>'image_path')
        where row.id=v_id_text::bigint and (row.sort_order,row.name,row.designation,row.bio,row.image_path) is distinct from (v_position,trim(v_item->>'name'),trim(v_item->>'designation'),trim(v_item->>'bio'),trim(v_item->>'image_path')); end if;
    end loop;

  elsif p_kind = 'contact_info' then
    if exists (select 1 from jsonb_array_elements(p_items) item where jsonb_typeof(item->'label') is distinct from 'string' or jsonb_typeof(item->'value') is distinct from 'string' or jsonb_typeof(item->'note') is distinct from 'string' or jsonb_typeof(item->'href') is distinct from 'string' or jsonb_typeof(item->'icon_path') is distinct from 'string')
    then raise exception 'Every contact card must be valid.' using errcode = '22023'; end if;
    if exists (select 1 from public.contact_info row where row.id::text <> all(p_deleted_ids) and not exists (select 1 from jsonb_array_elements(p_items) item where item->>'id'=row.id::text))
      or exists (select 1 from jsonb_array_elements(p_items) item where item ? 'id' and not exists (select 1 from public.contact_info row where row.id::text=item->>'id'))
      or exists (select 1 from unnest(p_deleted_ids) deleted_id where not exists (select 1 from public.contact_info row where row.id::text=deleted_id))
    then raise exception 'Every existing contact card must be retained or explicitly removed.' using errcode = '22023'; end if;
    delete from public.contact_info row where row.id::text = any(p_deleted_ids);
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_position:=v_position+1; v_id_text:=v_item->>'id';
      if v_id_text is null then insert into public.contact_info(sort_order,label,value,note,href,icon_path) values(v_position,trim(v_item->>'label'),trim(v_item->>'value'),trim(v_item->>'note'),trim(v_item->>'href'),trim(v_item->>'icon_path'));
      else update public.contact_info row set sort_order=v_position,label=trim(v_item->>'label'),value=trim(v_item->>'value'),note=trim(v_item->>'note'),href=trim(v_item->>'href'),icon_path=trim(v_item->>'icon_path')
        where row.id=v_id_text::bigint and (row.sort_order,row.label,row.value,row.note,row.href,row.icon_path) is distinct from (v_position,trim(v_item->>'label'),trim(v_item->>'value'),trim(v_item->>'note'),trim(v_item->>'href'),trim(v_item->>'icon_path')); end if;
    end loop;

  elsif p_kind = 'bespoke_process' then
    if exists (select 1 from jsonb_array_elements(p_items) item where jsonb_typeof(item->'eyebrow') is distinct from 'string' or jsonb_typeof(item->'title') is distinct from 'string' or jsonb_typeof(item->'description') is distinct from 'string')
    then raise exception 'Every process card must be valid.' using errcode = '22023'; end if;
    if exists (select 1 from public.bespoke_process_cards row where row.id::text <> all(p_deleted_ids) and not exists (select 1 from jsonb_array_elements(p_items) item where item->>'id'=row.id::text))
      or exists (select 1 from jsonb_array_elements(p_items) item where item ? 'id' and not exists (select 1 from public.bespoke_process_cards row where row.id::text=item->>'id'))
      or exists (select 1 from unnest(p_deleted_ids) deleted_id where not exists (select 1 from public.bespoke_process_cards row where row.id::text=deleted_id))
    then raise exception 'Every existing process card must be retained or explicitly removed.' using errcode = '22023'; end if;
    delete from public.bespoke_process_cards row where row.id::text = any(p_deleted_ids);
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_position:=v_position+1; v_id_text:=v_item->>'id';
      if v_id_text is null then insert into public.bespoke_process_cards(sort_order,eyebrow,title,description) values(v_position,trim(v_item->>'eyebrow'),trim(v_item->>'title'),trim(v_item->>'description'));
      else update public.bespoke_process_cards row set sort_order=v_position,eyebrow=trim(v_item->>'eyebrow'),title=trim(v_item->>'title'),description=trim(v_item->>'description')
        where row.id=v_id_text::bigint and (row.sort_order,row.eyebrow,row.title,row.description) is distinct from (v_position,trim(v_item->>'eyebrow'),trim(v_item->>'title'),trim(v_item->>'description')); end if;
    end loop;

  elsif p_kind = 'bespoke_manufacturing' then
    if exists (select 1 from jsonb_array_elements(p_items) item where jsonb_typeof(item->'step') is distinct from 'string' or jsonb_typeof(item->'eyebrow') is distinct from 'string' or jsonb_typeof(item->'title') is distinct from 'string' or jsonb_typeof(item->'description') is distinct from 'string' or coalesce(item->>'media_type','') not in ('image','video') or jsonb_typeof(item->'media_path') is distinct from 'string' or jsonb_typeof(item->'image_path') is distinct from 'string')
    then raise exception 'Every manufacturing step must be valid.' using errcode = '22023'; end if;
    if exists (select 1 from public.bespoke_process_steps row where row.id::text <> all(p_deleted_ids) and not exists (select 1 from jsonb_array_elements(p_items) item where item->>'id'=row.id::text))
      or exists (select 1 from jsonb_array_elements(p_items) item where item ? 'id' and not exists (select 1 from public.bespoke_process_steps row where row.id::text=item->>'id'))
      or exists (select 1 from unnest(p_deleted_ids) deleted_id where not exists (select 1 from public.bespoke_process_steps row where row.id::text=deleted_id))
    then raise exception 'Every existing manufacturing step must be retained or explicitly removed.' using errcode = '22023'; end if;
    delete from public.bespoke_process_steps row where row.id::text = any(p_deleted_ids);
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_position:=v_position+1; v_id_text:=v_item->>'id';
      if v_id_text is null then insert into public.bespoke_process_steps(sort_order,step,eyebrow,title,description,image_path,media_type,media_path)
        values(v_position,trim(v_item->>'step'),trim(v_item->>'eyebrow'),trim(v_item->>'title'),trim(v_item->>'description'),trim(v_item->>'image_path'),v_item->>'media_type',trim(v_item->>'media_path'));
      else update public.bespoke_process_steps row set sort_order=v_position,step=trim(v_item->>'step'),eyebrow=trim(v_item->>'eyebrow'),title=trim(v_item->>'title'),description=trim(v_item->>'description'),image_path=trim(v_item->>'image_path'),media_type=v_item->>'media_type',media_path=trim(v_item->>'media_path')
        where row.id=v_id_text::bigint and (row.sort_order,row.step,row.eyebrow,row.title,row.description,row.image_path,row.media_type,row.media_path) is distinct from
          (v_position,trim(v_item->>'step'),trim(v_item->>'eyebrow'),trim(v_item->>'title'),trim(v_item->>'description'),trim(v_item->>'image_path'),v_item->>'media_type',trim(v_item->>'media_path')); end if;
    end loop;
  end if;

  v_result := public.cms_content_list_snapshot_v1(p_kind);
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result)
  values(p_actor_id,p_request_id,'content-list-' || p_kind,v_hash,v_result);
  return v_result;
end;
$$;

revoke all on function public.cms_content_list_snapshot_v1(text) from public, anon, authenticated;
revoke all on function public.cms_save_content_list_v1(uuid,uuid,text,text,jsonb,text[]) from public, anon, authenticated;
grant execute on function public.cms_content_list_snapshot_v1(text) to service_role;
grant execute on function public.cms_save_content_list_v1(uuid,uuid,text,text,jsonb,text[]) to service_role;

notify pgrst, 'reload schema';
commit;
