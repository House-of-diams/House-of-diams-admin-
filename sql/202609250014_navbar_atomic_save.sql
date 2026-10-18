begin;

-- Group 4A: atomic navbar snapshot/save boundary.
-- This migration only creates functions. It does not rewrite existing navbar rows.
create or replace function public.navbar_snapshot_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path=pg_catalog,public
as $$
declare
  v_content jsonb;
begin
  v_content := jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' order by x.display_order,x.id) from public.navbar_items x),'[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' order by x.column_number,x.display_order,x.id) from public.navbar_sections x),'[]'::jsonb),
    'links', coalesce((select jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' order by x.display_order,x.id) from public.navbar_section_links x),'[]'::jsonb),
    'source_items', coalesce((select jsonb_agg(to_jsonb(x)-'created_at' order by x.sort_order,x.id) from public.navbar_section_source_items x),'[]'::jsonb),
    'featured_cards', coalesce((select jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' order by x.navbar_item_id,x.id) from public.navbar_featured_cards x),'[]'::jsonb)
  );
  return v_content || jsonb_build_object('revision',md5(v_content::text));
end;
$$;

create or replace function public.navbar_save_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_revision text,
  p_items jsonb,
  p_sections jsonb,
  p_links jsonb,
  p_source_items jsonb,
  p_featured_cards jsonb,
  p_deleted_section_ids uuid[] default '{}'::uuid[],
  p_deleted_link_ids uuid[] default '{}'::uuid[],
  p_deleted_source_item_ids bigint[] default '{}'::bigint[],
  p_deleted_featured_card_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public
as $$
declare
  v_before jsonb;
  v_result jsonb;
  v_receipt public.cms_save_receipts%rowtype;
  v_hash text;
  v_row jsonb;
  v_id uuid;
  v_bigint_id bigint;
  v_parent_id uuid;
  v_key text;
  v_item_ids jsonb := '{}'::jsonb;
  v_section_ids jsonb := '{}'::jsonb;
begin
  if p_actor_id is null or p_request_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then
    raise exception 'Administrator access is required.' using errcode='42501';
  end if;
  if coalesce(p_expected_revision,'') !~ '^[0-9a-f]{32}$'
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_typeof(p_sections) is distinct from 'array'
     or jsonb_typeof(p_links) is distinct from 'array'
     or jsonb_typeof(p_source_items) is distinct from 'array'
     or jsonb_typeof(p_featured_cards) is distinct from 'array' then
    raise exception 'Invalid navbar save payload. Reload the editor.' using errcode='22023';
  end if;
  if cardinality(p_deleted_section_ids)<>cardinality(array(select distinct x from unnest(p_deleted_section_ids)x))
     or cardinality(p_deleted_link_ids)<>cardinality(array(select distinct x from unnest(p_deleted_link_ids)x))
     or cardinality(p_deleted_source_item_ids)<>cardinality(array(select distinct x from unnest(p_deleted_source_item_ids)x))
     or cardinality(p_deleted_featured_card_ids)<>cardinality(array(select distinct x from unnest(p_deleted_featured_card_ids)x)) then
    raise exception 'Deleted navbar IDs must be unique.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('navbar-builder',0));
  perform pg_advisory_xact_lock(hashtextextended('navbar-request:'||p_actor_id||':'||p_request_id,0));
  v_hash:=md5(jsonb_build_object('revision',p_expected_revision,'items',p_items,'sections',p_sections,'links',p_links,'source_items',p_source_items,'featured_cards',p_featured_cards,'deleted_sections',p_deleted_section_ids,'deleted_links',p_deleted_link_ids,'deleted_source_items',p_deleted_source_item_ids,'deleted_featured_cards',p_deleted_featured_card_ids)::text);
  select r.* into v_receipt from public.cms_save_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then
    if v_receipt.operation<>'navbar-save' or v_receipt.payload_hash<>v_hash then
      raise exception 'This save request was already used for different changes.' using errcode='40001';
    end if;
    return v_receipt.result;
  end if;

  v_before:=public.navbar_snapshot_v1();
  if v_before->>'revision'<>p_expected_revision then
    raise exception 'The navbar changed since you opened it. Reload before saving.' using errcode='40001';
  end if;

  if exists(select 1 from jsonb_array_elements(p_items)x group by x->>'key' having count(*)>1)
     or exists(select 1 from jsonb_array_elements(p_sections)x group by x->>'key' having count(*)>1)
     or exists(select 1 from jsonb_array_elements(p_items)x where nullif(trim(x->>'key'),'') is null)
     or exists(select 1 from jsonb_array_elements(p_sections)x where nullif(trim(x->>'key'),'') is null) then
    raise exception 'Navbar client keys must be present and unique.' using errcode='22023';
  end if;

  -- Every persisted row must be present or explicitly deleted. This prevents stale or partial clients from erasing data.
  if exists(select 1 from public.navbar_items x where not exists(select 1 from jsonb_array_elements(p_items)i where nullif(i->>'id','')::uuid=x.id)) then
    raise exception 'Navbar items cannot be removed by this editor.' using errcode='22023';
  end if;
  if exists(select 1 from public.navbar_sections x where not(x.id=any(p_deleted_section_ids)) and not exists(select 1 from jsonb_array_elements(p_sections)i where nullif(i->>'id','')::uuid=x.id)) then
    raise exception 'Navbar sections may only be removed explicitly.' using errcode='22023';
  end if;
  if exists(select 1 from public.navbar_section_links x where not(x.id=any(p_deleted_link_ids)) and not exists(select 1 from jsonb_array_elements(p_links)i where nullif(i->>'id','')::uuid=x.id)) then
    raise exception 'Navbar links may only be removed explicitly.' using errcode='22023';
  end if;
  if exists(select 1 from public.navbar_section_source_items x where not(x.id=any(p_deleted_source_item_ids)) and not exists(select 1 from jsonb_array_elements(p_source_items)i where nullif(i->>'id','')::bigint=x.id)) then
    raise exception 'Navbar source items may only be removed explicitly.' using errcode='22023';
  end if;
  if exists(select 1 from public.navbar_featured_cards x where not(x.id=any(p_deleted_featured_card_ids)) and not exists(select 1 from jsonb_array_elements(p_featured_cards)i where nullif(i->>'id','')::uuid=x.id)) then
    raise exception 'Navbar featured cards may only be removed explicitly.' using errcode='22023';
  end if;

  -- Reject unknown, duplicated, or conflicting persistent IDs before changing anything.
  if exists(select 1 from jsonb_array_elements(p_items)x where nullif(x->>'id','') is not null and not exists(select 1 from public.navbar_items t where t.id=(x->>'id')::uuid))
     or exists(select 1 from jsonb_array_elements(p_sections)x where nullif(x->>'id','') is not null and not exists(select 1 from public.navbar_sections t where t.id=(x->>'id')::uuid))
     or exists(select 1 from jsonb_array_elements(p_links)x where nullif(x->>'id','') is not null and not exists(select 1 from public.navbar_section_links t where t.id=(x->>'id')::uuid))
     or exists(select 1 from jsonb_array_elements(p_source_items)x where nullif(x->>'id','') is not null and not exists(select 1 from public.navbar_section_source_items t where t.id=(x->>'id')::bigint))
     or exists(select 1 from jsonb_array_elements(p_featured_cards)x where nullif(x->>'id','') is not null and not exists(select 1 from public.navbar_featured_cards t where t.id=(x->>'id')::uuid)) then
    raise exception 'The navbar payload contains an unknown row ID.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items)x where nullif(x->>'id','') is not null group by x->>'id' having count(*)>1)
     or exists(select 1 from jsonb_array_elements(p_sections)x where nullif(x->>'id','') is not null group by x->>'id' having count(*)>1)
     or exists(select 1 from jsonb_array_elements(p_links)x where nullif(x->>'id','') is not null group by x->>'id' having count(*)>1)
     or exists(select 1 from jsonb_array_elements(p_source_items)x where nullif(x->>'id','') is not null group by x->>'id' having count(*)>1)
     or exists(select 1 from jsonb_array_elements(p_featured_cards)x where nullif(x->>'id','') is not null group by x->>'id' having count(*)>1) then
    raise exception 'Navbar row IDs must be unique.' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_source_items) source
    join jsonb_array_elements(p_sections) section on section->>'key'=source->>'section_key'
    where case section->>'section_type'
      when 'category_list' then source->>'source_kind'<>'subcategory_option'
      when 'metal_swatches' then source->>'source_kind'<>'metal'
      when 'stone_shapes' then source->>'source_kind'<>'stone_shape'
      when 'ring_sizes' then source->>'source_kind'<>'ring_size'
      when 'certificates' then source->>'source_kind'<>'certificate'
      when 'styles' then source->>'source_kind'<>'style'
      else true
    end
  ) then
    raise exception 'A navbar source item does not match its section type.' using errcode='22023';
  end if;

  delete from public.navbar_section_source_items where id=any(p_deleted_source_item_ids) or section_id=any(p_deleted_section_ids);
  delete from public.navbar_section_links where id=any(p_deleted_link_ids) or section_id=any(p_deleted_section_ids);
  delete from public.navbar_sections where id=any(p_deleted_section_ids);
  delete from public.navbar_featured_cards where id=any(p_deleted_featured_card_ids);

  for v_row in select * from jsonb_array_elements(p_items) loop
    v_key:=v_row->>'key'; v_id:=nullif(v_row->>'id','')::uuid;
    if nullif(trim(v_row->>'label'),'') is null or nullif(trim(v_row->>'slug'),'') is null or v_row->>'item_type' not in ('mega_menu','direct_link') or v_row->>'status' not in ('active','hidden') then
      raise exception 'Invalid navbar item.' using errcode='22023';
    end if;
    if nullif(v_row->>'linked_category_id','') is not null and not exists(select 1 from public.catalog_categories c where c.id=(v_row->>'linked_category_id')::uuid) then
      raise exception 'A navbar item references a missing category.' using errcode='23503';
    end if;
    if v_id is null then
      insert into public.navbar_items(label,slug,item_type,linked_category_id,direct_link_url,display_order,status)
      values(trim(v_row->>'label'),trim(v_row->>'slug'),(jsonb_populate_record(null::public.navbar_items,v_row)).item_type,nullif(v_row->>'linked_category_id','')::uuid,nullif(trim(v_row->>'direct_link_url'),''),(v_row->>'display_order')::integer,(jsonb_populate_record(null::public.navbar_items,v_row)).status)
      returning id into v_id;
    else
      update public.navbar_items set label=trim(v_row->>'label'),slug=trim(v_row->>'slug'),item_type=(jsonb_populate_record(null::public.navbar_items,v_row)).item_type,linked_category_id=nullif(v_row->>'linked_category_id','')::uuid,direct_link_url=nullif(trim(v_row->>'direct_link_url'),''),display_order=(v_row->>'display_order')::integer,status=(jsonb_populate_record(null::public.navbar_items,v_row)).status,updated_at=now()
      where id=v_id and (label,slug,item_type,linked_category_id,direct_link_url,display_order,status) is distinct from (trim(v_row->>'label'),trim(v_row->>'slug'),(jsonb_populate_record(null::public.navbar_items,v_row)).item_type,nullif(v_row->>'linked_category_id','')::uuid,nullif(trim(v_row->>'direct_link_url'),''),(v_row->>'display_order')::integer,(jsonb_populate_record(null::public.navbar_items,v_row)).status);
    end if;
    v_item_ids:=v_item_ids||jsonb_build_object(v_key,v_id::text);
  end loop;

  for v_row in select * from jsonb_array_elements(p_sections) loop
    v_key:=v_row->>'key'; v_id:=nullif(v_row->>'id','')::uuid; v_parent_id:=nullif(v_item_ids->>(v_row->>'item_key'),'')::uuid;
    if v_parent_id is null or nullif(trim(v_row->>'title'),'') is null or v_row->>'section_type' not in ('category_list','manual_links','metal_swatches','stone_shapes','ring_sizes','certificates','category_link','styles') or v_row->>'status' not in ('active','hidden') then
      raise exception 'Invalid navbar section.' using errcode='22023';
    end if;
    if nullif(v_row->>'source_subcategory_id','') is not null and not exists(select 1 from public.catalog_subcategories s where s.id=(v_row->>'source_subcategory_id')::uuid) then raise exception 'A navbar section references a missing subcategory.' using errcode='23503'; end if;
    if nullif(v_row->>'linked_category_id','') is not null and not exists(select 1 from public.catalog_categories c where c.id=(v_row->>'linked_category_id')::uuid) then raise exception 'A navbar section references a missing category.' using errcode='23503'; end if;
    if v_id is null then
      insert into public.navbar_sections(navbar_item_id,title,icon_svg_path,section_type,source_subcategory_id,source_category_slug,enable_category_link,linked_category_id,column_number,show_as_filter,display_order,status)
      values(v_parent_id,trim(v_row->>'title'),nullif(trim(v_row->>'icon_svg_path'),''),(jsonb_populate_record(null::public.navbar_sections,v_row)).section_type,nullif(v_row->>'source_subcategory_id','')::uuid,nullif(trim(v_row->>'source_category_slug'),''),(v_row->>'enable_category_link')::boolean,nullif(v_row->>'linked_category_id','')::uuid,(v_row->>'column_number')::integer,(v_row->>'show_as_filter')::boolean,(v_row->>'display_order')::integer,(jsonb_populate_record(null::public.navbar_sections,v_row)).status) returning id into v_id;
    else
      update public.navbar_sections set navbar_item_id=v_parent_id,title=trim(v_row->>'title'),icon_svg_path=nullif(trim(v_row->>'icon_svg_path'),''),section_type=(jsonb_populate_record(null::public.navbar_sections,v_row)).section_type,source_subcategory_id=nullif(v_row->>'source_subcategory_id','')::uuid,source_category_slug=nullif(trim(v_row->>'source_category_slug'),''),enable_category_link=(v_row->>'enable_category_link')::boolean,linked_category_id=nullif(v_row->>'linked_category_id','')::uuid,column_number=(v_row->>'column_number')::integer,show_as_filter=(v_row->>'show_as_filter')::boolean,display_order=(v_row->>'display_order')::integer,status=(jsonb_populate_record(null::public.navbar_sections,v_row)).status,updated_at=now()
      where id=v_id and (navbar_item_id,title,icon_svg_path,section_type,source_subcategory_id,source_category_slug,enable_category_link,linked_category_id,column_number,show_as_filter,display_order,status) is distinct from (v_parent_id,trim(v_row->>'title'),nullif(trim(v_row->>'icon_svg_path'),''),(jsonb_populate_record(null::public.navbar_sections,v_row)).section_type,nullif(v_row->>'source_subcategory_id','')::uuid,nullif(trim(v_row->>'source_category_slug'),''),(v_row->>'enable_category_link')::boolean,nullif(v_row->>'linked_category_id','')::uuid,(v_row->>'column_number')::integer,(v_row->>'show_as_filter')::boolean,(v_row->>'display_order')::integer,(jsonb_populate_record(null::public.navbar_sections,v_row)).status);
    end if;
    v_section_ids:=v_section_ids||jsonb_build_object(v_key,v_id::text);
  end loop;

  for v_row in select * from jsonb_array_elements(p_links) loop
    v_id:=nullif(v_row->>'id','')::uuid; v_parent_id:=nullif(v_section_ids->>(v_row->>'section_key'),'')::uuid;
    if v_parent_id is null or nullif(trim(v_row->>'label'),'') is null or nullif(trim(v_row->>'url'),'') is null or v_row->>'status' not in ('active','hidden') then raise exception 'Invalid navbar link.' using errcode='22023'; end if;
    if v_id is null then insert into public.navbar_section_links(section_id,label,url,display_order,status) values(v_parent_id,trim(v_row->>'label'),trim(v_row->>'url'),(v_row->>'display_order')::integer,(jsonb_populate_record(null::public.navbar_section_links,v_row)).status);
    else update public.navbar_section_links set section_id=v_parent_id,label=trim(v_row->>'label'),url=trim(v_row->>'url'),display_order=(v_row->>'display_order')::integer,status=(jsonb_populate_record(null::public.navbar_section_links,v_row)).status,updated_at=now() where id=v_id and (section_id,label,url,display_order,status) is distinct from (v_parent_id,trim(v_row->>'label'),trim(v_row->>'url'),(v_row->>'display_order')::integer,(jsonb_populate_record(null::public.navbar_section_links,v_row)).status); end if;
  end loop;

  for v_row in select * from jsonb_array_elements(p_source_items) loop
    v_bigint_id:=nullif(v_row->>'id','')::bigint; v_parent_id:=nullif(v_section_ids->>(v_row->>'section_key'),'')::uuid;
    if v_parent_id is null or v_row->>'source_kind' not in ('subcategory_option','metal','stone_shape','ring_size','certificate','style') or nullif(v_row->>'source_item_id','') is null then raise exception 'Invalid navbar source item.' using errcode='22023'; end if;
    if (v_row->>'source_kind'='subcategory_option' and not exists(select 1 from public.catalog_options x where x.id=(v_row->>'source_item_id')::uuid))
       or (v_row->>'source_kind'='metal' and not exists(select 1 from public.catalog_metals x where x.id=(v_row->>'source_item_id')::uuid))
       or (v_row->>'source_kind'='stone_shape' and not exists(select 1 from public.catalog_stone_shapes x where x.id=(v_row->>'source_item_id')::uuid))
       or (v_row->>'source_kind'='ring_size' and not exists(select 1 from public.catalog_ring_sizes x where x.id=(v_row->>'source_item_id')::uuid))
       or (v_row->>'source_kind'='certificate' and not exists(select 1 from public.catalog_certificates x where x.id=(v_row->>'source_item_id')::uuid))
       or (v_row->>'source_kind'='style' and not exists(select 1 from public.catalog_styles x where x.id=(v_row->>'source_item_id')::uuid)) then raise exception 'A navbar source item references missing catalog data.' using errcode='23503'; end if;
    if v_bigint_id is null then insert into public.navbar_section_source_items(section_id,source_kind,source_item_id,sort_order,is_active) values(v_parent_id,v_row->>'source_kind',v_row->>'source_item_id',(v_row->>'sort_order')::integer,(v_row->>'is_active')::boolean);
    else update public.navbar_section_source_items set section_id=v_parent_id,source_kind=v_row->>'source_kind',source_item_id=v_row->>'source_item_id',sort_order=(v_row->>'sort_order')::integer,is_active=(v_row->>'is_active')::boolean where id=v_bigint_id and (section_id,source_kind,source_item_id,sort_order,is_active) is distinct from (v_parent_id,v_row->>'source_kind',v_row->>'source_item_id',(v_row->>'sort_order')::integer,(v_row->>'is_active')::boolean); end if;
  end loop;

  for v_row in select * from jsonb_array_elements(p_featured_cards) loop
    v_id:=nullif(v_row->>'id','')::uuid; v_parent_id:=nullif(v_item_ids->>(v_row->>'item_key'),'')::uuid;
    if v_parent_id is null then raise exception 'Invalid navbar featured card.' using errcode='22023'; end if;
    if v_id is null then insert into public.navbar_featured_cards(navbar_item_id,image_path,image_alt,button_label,button_url,enabled) values(v_parent_id,nullif(trim(v_row->>'image_path'),''),nullif(trim(v_row->>'image_alt'),''),nullif(trim(v_row->>'button_label'),''),nullif(trim(v_row->>'button_url'),''),(v_row->>'enabled')::boolean);
    else update public.navbar_featured_cards set navbar_item_id=v_parent_id,image_path=nullif(trim(v_row->>'image_path'),''),image_alt=nullif(trim(v_row->>'image_alt'),''),button_label=nullif(trim(v_row->>'button_label'),''),button_url=nullif(trim(v_row->>'button_url'),''),enabled=(v_row->>'enabled')::boolean,updated_at=now() where id=v_id and (navbar_item_id,image_path,image_alt,button_label,button_url,enabled) is distinct from (v_parent_id,nullif(trim(v_row->>'image_path'),''),nullif(trim(v_row->>'image_alt'),''),nullif(trim(v_row->>'button_label'),''),nullif(trim(v_row->>'button_url'),''),(v_row->>'enabled')::boolean); end if;
  end loop;

  v_result:=public.navbar_snapshot_v1();
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'navbar-save',v_hash,v_result);
  return v_result;
end;
$$;

revoke all on function public.navbar_snapshot_v1() from public,anon,authenticated;
revoke all on function public.navbar_save_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid[],uuid[],bigint[],uuid[]) from public,anon,authenticated;
grant execute on function public.navbar_snapshot_v1() to service_role;
grant execute on function public.navbar_save_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid[],uuid[],bigint[],uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
