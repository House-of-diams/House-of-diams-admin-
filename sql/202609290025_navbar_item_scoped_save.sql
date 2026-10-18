begin;

-- Each item editor owns exactly one navbar item and its child rows.  This
-- snapshot/revision deliberately excludes every other menu item.
create or replace function public.navbar_item_snapshot_v1(p_item_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_payload jsonb;
begin
  select jsonb_build_object(
    'item', to_jsonb(i),
    'sections', coalesce((select jsonb_agg(to_jsonb(s) order by s.display_order, s.id) from public.navbar_sections s where s.navbar_item_id=i.id), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(to_jsonb(l) order by l.display_order, l.id) from public.navbar_section_links l join public.navbar_sections s on s.id=l.section_id where s.navbar_item_id=i.id), '[]'::jsonb),
    'source_items', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.id) from public.navbar_section_source_items x join public.navbar_sections s on s.id=x.section_id where s.navbar_item_id=i.id), '[]'::jsonb),
    'featured_cards', coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.navbar_featured_cards f where f.navbar_item_id=i.id), '[]'::jsonb)
  ) into v_payload from public.navbar_items i where i.id=p_item_id;
  if v_payload is null then raise exception 'Navbar item does not exist.' using errcode='23503'; end if;
  return jsonb_build_object('revision', md5(v_payload::text));
end; $$;

create or replace function public.navbar_item_save_v1(
  p_actor_id uuid, p_request_id uuid, p_expected_revision text, p_item_id uuid,
  p_item jsonb, p_sections jsonb, p_links jsonb, p_source_items jsonb, p_featured_card jsonb,
  p_deleted_section_ids uuid[], p_deleted_link_ids uuid[], p_deleted_source_item_ids bigint[], p_deleted_featured_card_ids uuid[]
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_snapshot jsonb; v_row jsonb; v_section_ids jsonb := '{}'::jsonb; v_section_id uuid; v_id uuid; v_source_id bigint; v_hash text;
begin
  -- This function is executable only by service_role. The route has already
  -- authenticated the browser user, and this check keeps the audit actor an
  -- existing admin without incorrectly comparing it to service_role's JWT.
  if not exists (select 1 from public.profiles profile where profile.id=p_actor_id and profile.role='admin') then
    raise exception 'Forbidden.' using errcode='42501';
  end if;
  if jsonb_typeof(p_item)<>'object' or jsonb_typeof(p_sections)<>'array' or jsonb_typeof(p_links)<>'array' or jsonb_typeof(p_source_items)<>'array' or jsonb_typeof(p_featured_card)<>'object' then raise exception 'Invalid navbar item payload.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('navbar-item:'||p_item_id::text, 0));
  v_hash := md5(jsonb_build_object('item',p_item,'sections',p_sections,'links',p_links,'source_items',p_source_items,'featured_card',p_featured_card,'deleted_sections',p_deleted_section_ids,'deleted_links',p_deleted_link_ids,'deleted_sources',p_deleted_source_item_ids,'deleted_cards',p_deleted_featured_card_ids)::text);
  select result into v_snapshot from public.cms_save_receipts where actor_id=p_actor_id and request_id=p_request_id and operation='navbar-item-save';
  if found then
    if (select payload_hash from public.cms_save_receipts where actor_id=p_actor_id and request_id=p_request_id and operation='navbar-item-save') <> v_hash then raise exception 'Request ID was reused.' using errcode='22023'; end if;
    return v_snapshot;
  end if;
  v_snapshot := public.navbar_item_snapshot_v1(p_item_id);
  if v_snapshot->>'revision' <> p_expected_revision then raise exception 'This navbar item changed after it was opened.' using errcode='40001'; end if;
  if p_item->>'id' <> p_item_id::text or not exists(select 1 from public.navbar_items where id=p_item_id) then raise exception 'Invalid navbar item.' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_deleted_section_ids) as deleted(row_id) where not exists(select 1 from public.navbar_sections s where s.id=deleted.row_id and s.navbar_item_id=p_item_id))
    or exists(select 1 from unnest(p_deleted_link_ids) as deleted(row_id) where not exists(select 1 from public.navbar_section_links l join public.navbar_sections s on s.id=l.section_id where l.id=deleted.row_id and s.navbar_item_id=p_item_id))
    or exists(select 1 from unnest(p_deleted_source_item_ids) as deleted(row_id) where not exists(select 1 from public.navbar_section_source_items x join public.navbar_sections s on s.id=x.section_id where x.id=deleted.row_id and s.navbar_item_id=p_item_id))
    or exists(select 1 from unnest(p_deleted_featured_card_ids) as deleted(row_id) where not exists(select 1 from public.navbar_featured_cards f where f.id=deleted.row_id and f.navbar_item_id=p_item_id)) then raise exception 'A deleted row belongs to another navbar item.' using errcode='22023'; end if;
  update public.navbar_items set label=trim(p_item->>'label'), slug=trim(p_item->>'slug'), item_type=(jsonb_populate_record(null::public.navbar_items,p_item)).item_type, linked_category_id=nullif(p_item->>'linked_category_id','')::uuid, direct_link_url=nullif(trim(p_item->>'direct_link_url'),''), status=(jsonb_populate_record(null::public.navbar_items,p_item)).status, updated_at=now() where id=p_item_id;
  delete from public.navbar_section_source_items where id=any(p_deleted_source_item_ids) or section_id=any(p_deleted_section_ids);
  delete from public.navbar_section_links where id=any(p_deleted_link_ids) or section_id=any(p_deleted_section_ids);
  delete from public.navbar_sections where id=any(p_deleted_section_ids) and navbar_item_id=p_item_id;
  delete from public.navbar_featured_cards where id=any(p_deleted_featured_card_ids) and navbar_item_id=p_item_id;
  for v_row in select value from jsonb_array_elements(p_sections) loop
    v_id:=nullif(v_row->>'id','')::uuid;
    if v_id is not null and not exists(select 1 from public.navbar_sections where id=v_id and navbar_item_id=p_item_id) then raise exception 'A section belongs to another navbar item.' using errcode='22023'; end if;
    if v_id is null then insert into public.navbar_sections(navbar_item_id,title,icon_svg_path,section_type,source_subcategory_id,source_category_slug,enable_category_link,linked_category_id,column_number,show_as_filter,display_order,status) values(p_item_id,trim(v_row->>'title'),nullif(v_row->>'icon_svg_path',''),(jsonb_populate_record(null::public.navbar_sections,v_row)).section_type,nullif(v_row->>'source_subcategory_id','')::uuid,nullif(v_row->>'source_category_slug',''),coalesce((v_row->>'enable_category_link')::boolean,false),nullif(v_row->>'linked_category_id','')::uuid,(v_row->>'column_number')::integer,coalesce((v_row->>'show_as_filter')::boolean,false),(v_row->>'display_order')::integer,(jsonb_populate_record(null::public.navbar_sections,v_row)).status) returning id into v_section_id;
    else v_section_id:=v_id; update public.navbar_sections set title=trim(v_row->>'title'),icon_svg_path=nullif(v_row->>'icon_svg_path',''),section_type=(jsonb_populate_record(null::public.navbar_sections,v_row)).section_type,source_subcategory_id=nullif(v_row->>'source_subcategory_id','')::uuid,source_category_slug=nullif(v_row->>'source_category_slug',''),enable_category_link=coalesce((v_row->>'enable_category_link')::boolean,false),linked_category_id=nullif(v_row->>'linked_category_id','')::uuid,column_number=(v_row->>'column_number')::integer,show_as_filter=coalesce((v_row->>'show_as_filter')::boolean,false),display_order=(v_row->>'display_order')::integer,status=(jsonb_populate_record(null::public.navbar_sections,v_row)).status,updated_at=now() where id=v_id; end if;
    v_section_ids:=v_section_ids||jsonb_build_object(v_row->>'key',v_section_id::text);
  end loop;
  for v_row in select value from jsonb_array_elements(p_links) loop
    v_section_id:=nullif(v_section_ids->>(v_row->>'section_key'),'')::uuid; v_id:=nullif(v_row->>'id','')::uuid;
    if v_section_id is null then raise exception 'Invalid navbar link section.' using errcode='22023'; end if;
    if v_id is null then insert into public.navbar_section_links(section_id,label,url,display_order,status) values(v_section_id,trim(v_row->>'label'),trim(v_row->>'url'),(v_row->>'display_order')::integer,(jsonb_populate_record(null::public.navbar_section_links,v_row)).status); else update public.navbar_section_links set section_id=v_section_id,label=trim(v_row->>'label'),url=trim(v_row->>'url'),display_order=(v_row->>'display_order')::integer,status=(jsonb_populate_record(null::public.navbar_section_links,v_row)).status,updated_at=now() where id=v_id and exists(select 1 from public.navbar_sections s where s.id=navbar_section_links.section_id and s.navbar_item_id=p_item_id); end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_source_items) loop
    v_section_id:=nullif(v_section_ids->>(v_row->>'section_key'),'')::uuid; v_source_id:=nullif(v_row->>'id','')::bigint;
    if v_section_id is null then raise exception 'Invalid navbar source section.' using errcode='22023'; end if;
    if v_source_id is null then insert into public.navbar_section_source_items(section_id,source_kind,source_item_id,sort_order,is_active) values(v_section_id,v_row->>'source_kind',v_row->>'source_item_id',(v_row->>'sort_order')::integer,(v_row->>'is_active')::boolean); else update public.navbar_section_source_items set section_id=v_section_id,source_kind=v_row->>'source_kind',source_item_id=v_row->>'source_item_id',sort_order=(v_row->>'sort_order')::integer,is_active=(v_row->>'is_active')::boolean where id=v_source_id and exists(select 1 from public.navbar_sections s where s.id=navbar_section_source_items.section_id and s.navbar_item_id=p_item_id); end if;
  end loop;
  if p_item->>'item_type' = 'mega_menu' then
    v_id:=nullif(p_featured_card->>'id','')::uuid;
    if v_id is null then insert into public.navbar_featured_cards(navbar_item_id,image_path,image_alt,button_label,button_url,enabled) values(p_item_id,nullif(p_featured_card->>'image_path',''),nullif(p_featured_card->>'image_alt',''),nullif(p_featured_card->>'button_label',''),nullif(p_featured_card->>'button_url',''),coalesce((p_featured_card->>'enabled')::boolean,false)); else update public.navbar_featured_cards set image_path=nullif(p_featured_card->>'image_path',''),image_alt=nullif(p_featured_card->>'image_alt',''),button_label=nullif(p_featured_card->>'button_label',''),button_url=nullif(p_featured_card->>'button_url',''),enabled=coalesce((p_featured_card->>'enabled')::boolean,false),updated_at=now() where id=v_id and navbar_item_id=p_item_id; end if;
  end if;
  v_snapshot:=public.navbar_item_snapshot_v1(p_item_id);
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'navbar-item-save',v_hash,v_snapshot);
  return v_snapshot;
end; $$;

revoke all on function public.navbar_item_snapshot_v1(uuid) from public, anon, authenticated;
revoke all on function public.navbar_item_save_v1(uuid,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,uuid[],uuid[],bigint[],uuid[]) from public, anon, authenticated;
grant execute on function public.navbar_item_snapshot_v1(uuid) to service_role;
grant execute on function public.navbar_item_save_v1(uuid,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,uuid[],uuid[],bigint[],uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
