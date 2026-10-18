begin;

-- Group 4C: atomic, revision-checked Bespoke form configuration saves.
-- This migration creates functions only. It does not rewrite or delete existing content.
create or replace function public.bespoke_form_snapshot_v1()
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public as $$
declare
  v_settings jsonb;
  v_content jsonb;
begin
  select to_jsonb(x)-'created_at'-'updated_at'
    into v_settings
    from public.bespoke_form_settings x
    order by x.updated_at desc,x.id
    limit 1;

  v_settings:=coalesce(v_settings,jsonb_build_object(
    'intro_heading','',
    'intro_subtitle','',
    'footer_note','',
    'status','active'
  ));

  v_content:=jsonb_build_object(
    'settings',v_settings,
    'guarantees',(select coalesce(jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' order by x.display_order,x.id),'[]'::jsonb) from public.bespoke_form_guarantees x),
    'pieceTypes',(select coalesce(jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' order by x.display_order,x.id),'[]'::jsonb) from public.bespoke_form_piece_types x),
    'stoneOptions',(select coalesce(jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' order by x.display_order,x.id),'[]'::jsonb) from public.bespoke_form_stone_options x),
    'caratOptions',(select coalesce(jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' order by x.display_order,x.id),'[]'::jsonb) from public.bespoke_form_carat_options x),
    'metalOptions',(select coalesce(jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' order by x.display_order,x.id),'[]'::jsonb) from public.bespoke_form_metal_options x)
  );
  return v_content||jsonb_build_object('revision',md5(v_content::text));
end;
$$;

create or replace function public.bespoke_form_save_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_revision text,
  p_settings jsonb,
  p_lists jsonb,
  p_deleted_ids jsonb
)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare
  v_before jsonb;
  v_result jsonb;
  v_receipt public.cms_save_receipts%rowtype;
  v_hash text;
  v_settings_id uuid;
  v_key text;
  v_table text;
  v_items jsonb;
  v_deleted jsonb;
  v_delete_ids uuid[];
  v_row jsonb;
  v_id uuid;
  v_invalid boolean;
begin
  if p_actor_id is null or p_request_id is null
     or not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then
    raise exception 'Administrator access is required.' using errcode='42501';
  end if;
  if coalesce(p_expected_revision,'')!~'^[0-9a-f]{32}$'
     or jsonb_typeof(p_settings) is distinct from 'object'
     or jsonb_typeof(p_lists) is distinct from 'object'
     or jsonb_typeof(p_deleted_ids) is distinct from 'object' then
    raise exception 'Invalid Bespoke form save payload.' using errcode='22023';
  end if;
  if p_settings->>'status' not in ('active','hidden') then
    raise exception 'A valid form status is required.' using errcode='22023';
  end if;
  if not (p_lists ?& array['guarantees','pieceTypes','stoneOptions','caratOptions','metalOptions'])
     or (select count(*) from jsonb_object_keys(p_lists))<>5
     or not (p_deleted_ids ?& array['guarantees','pieceTypes','stoneOptions','caratOptions','metalOptions'])
     or (select count(*) from jsonb_object_keys(p_deleted_ids))<>5 then
    raise exception 'All Bespoke form option groups are required.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bespoke-form',0));
  perform pg_advisory_xact_lock(hashtextextended('bespoke-form-request:'||p_actor_id||':'||p_request_id,0));
  v_hash:=md5(jsonb_build_object(
    'revision',p_expected_revision,
    'settings',p_settings,
    'lists',p_lists,
    'deleted',p_deleted_ids
  )::text);

  select r.* into v_receipt
    from public.cms_save_receipts r
    where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then
    if v_receipt.operation<>'bespoke-form-save' or v_receipt.payload_hash<>v_hash then
      raise exception 'This save request was already used for different changes.' using errcode='40001';
    end if;
    return v_receipt.result;
  end if;

  v_before:=public.bespoke_form_snapshot_v1();
  if v_before->>'revision'<>p_expected_revision then
    raise exception 'The Bespoke form changed since you opened it. Reload before saving.' using errcode='40001';
  end if;

  v_settings_id:=nullif(v_before->'settings'->>'id','')::uuid;
  if nullif(p_settings->>'id','') is not null
     and nullif(p_settings->>'id','')::uuid is distinct from v_settings_id then
    raise exception 'The Bespoke form settings ID is invalid.' using errcode='22023';
  end if;

  foreach v_key in array array['guarantees','pieceTypes','stoneOptions','caratOptions','metalOptions'] loop
    v_table:=case v_key
      when 'guarantees' then 'bespoke_form_guarantees'
      when 'pieceTypes' then 'bespoke_form_piece_types'
      when 'stoneOptions' then 'bespoke_form_stone_options'
      when 'caratOptions' then 'bespoke_form_carat_options'
      when 'metalOptions' then 'bespoke_form_metal_options'
    end;
    v_items:=p_lists->v_key;
    v_deleted:=p_deleted_ids->v_key;
    if jsonb_typeof(v_items) is distinct from 'array' or jsonb_typeof(v_deleted) is distinct from 'array' then
      raise exception 'Every Bespoke form option group must be a list.' using errcode='22023';
    end if;
    if exists(
      select 1 from jsonb_array_elements(v_items) x
      where nullif(x->>'id','') is not null
      group by x->>'id' having count(*)>1
    ) or (
      select count(*)<>count(distinct value) from jsonb_array_elements_text(v_deleted)
    ) then
      raise exception 'Option IDs must be unique.' using errcode='22023';
    end if;
    if exists(
      select 1 from jsonb_array_elements(v_items) x
      where nullif(trim(x->>'label'),'') is null
         or coalesce(x->>'display_order','')!~'^[0-9]+$'
         or x->>'status' not in ('active','hidden')
    ) then
      raise exception 'Every option requires a label, valid order, and valid status.' using errcode='22023';
    end if;

    execute format(
      'select exists(select 1 from jsonb_array_elements($1) x where nullif(x->>''id'','''') is not null and not exists(select 1 from public.%I t where t.id=(x->>''id'')::uuid))',
      v_table
    ) into v_invalid using v_items;
    if v_invalid then
      raise exception 'A Bespoke form option does not belong to its option group.' using errcode='22023';
    end if;

    execute format(
      'select exists(select 1 from jsonb_array_elements_text($1) d where not exists(select 1 from public.%I t where t.id=d::uuid))',
      v_table
    ) into v_invalid using v_deleted;
    if v_invalid then
      raise exception 'A deleted Bespoke form option is invalid.' using errcode='22023';
    end if;

    if exists(
      select 1 from jsonb_array_elements(v_items) x
      join jsonb_array_elements_text(v_deleted) d on d=x->>'id'
    ) then
      raise exception 'An option cannot be retained and deleted together.' using errcode='22023';
    end if;

    execute format(
      'select exists(select 1 from public.%I t where not exists(select 1 from jsonb_array_elements($1) x where nullif(x->>''id'','''')::uuid=t.id) and not exists(select 1 from jsonb_array_elements_text($2) d where d::uuid=t.id))',
      v_table
    ) into v_invalid using v_items,v_deleted;
    if v_invalid then
      raise exception 'Options may only be removed explicitly.' using errcode='22023';
    end if;
  end loop;

  if v_settings_id is null then
    insert into public.bespoke_form_settings(intro_heading,intro_subtitle,footer_note,status)
    values(
      nullif(trim(p_settings->>'intro_heading'),''),
      nullif(trim(p_settings->>'intro_subtitle'),''),
      nullif(trim(p_settings->>'footer_note'),''),
      (jsonb_populate_record(null::public.bespoke_form_settings,p_settings)).status
    ) returning id into v_settings_id;
  else
    update public.bespoke_form_settings
    set intro_heading=nullif(trim(p_settings->>'intro_heading'),''),
        intro_subtitle=nullif(trim(p_settings->>'intro_subtitle'),''),
        footer_note=nullif(trim(p_settings->>'footer_note'),''),
        status=(jsonb_populate_record(null::public.bespoke_form_settings,p_settings)).status,
        updated_at=now()
    where id=v_settings_id
      and (intro_heading,intro_subtitle,footer_note,status) is distinct from (
        nullif(trim(p_settings->>'intro_heading'),''),
        nullif(trim(p_settings->>'intro_subtitle'),''),
        nullif(trim(p_settings->>'footer_note'),''),
        (jsonb_populate_record(null::public.bespoke_form_settings,p_settings)).status
      );
  end if;

  foreach v_key in array array['guarantees','pieceTypes','stoneOptions','caratOptions','metalOptions'] loop
    v_table:=case v_key
      when 'guarantees' then 'bespoke_form_guarantees'
      when 'pieceTypes' then 'bespoke_form_piece_types'
      when 'stoneOptions' then 'bespoke_form_stone_options'
      when 'caratOptions' then 'bespoke_form_carat_options'
      when 'metalOptions' then 'bespoke_form_metal_options'
    end;
    v_items:=p_lists->v_key;
    v_deleted:=p_deleted_ids->v_key;
    select coalesce(array_agg(value::uuid),'{}'::uuid[])
      into v_delete_ids from jsonb_array_elements_text(v_deleted);
    execute format('delete from public.%I where id=any($1)',v_table) using v_delete_ids;

    for v_row in select * from jsonb_array_elements(v_items) loop
      v_id:=nullif(v_row->>'id','')::uuid;
      if v_id is null then
        execute format(
          'insert into public.%1$I(label,display_order,status) values(trim($1->>''label''),($1->>''display_order'')::integer,(jsonb_populate_record(null::public.%1$I,$1)).status)',
          v_table
        ) using v_row;
      else
        execute format(
          'update public.%1$I set label=trim($1->>''label''),display_order=($1->>''display_order'')::integer,status=(jsonb_populate_record(null::public.%1$I,$1)).status,updated_at=now() where id=$2 and (label,display_order,status) is distinct from (trim($1->>''label''),($1->>''display_order'')::integer,(jsonb_populate_record(null::public.%1$I,$1)).status)',
          v_table
        ) using v_row,v_id;
      end if;
    end loop;
  end loop;

  v_result:=public.bespoke_form_snapshot_v1();
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result)
  values(p_actor_id,p_request_id,'bespoke-form-save',v_hash,v_result);
  return v_result;
end;
$$;

revoke all on function public.bespoke_form_snapshot_v1() from public,anon,authenticated;
revoke all on function public.bespoke_form_save_v1(uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bespoke_form_snapshot_v1() to service_role;
grant execute on function public.bespoke_form_save_v1(uuid,uuid,text,jsonb,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
