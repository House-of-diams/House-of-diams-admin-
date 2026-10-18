begin;

-- Group 4B: atomic, revision-checked Bespoke Hero saves.
-- This migration creates functions only and does not rewrite existing content.
create or replace function public.bespoke_hero_snapshot_v1()
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare v_parent jsonb; v_parent_id uuid; v_items jsonb:='[]'::jsonb; v_content jsonb;
begin
  select x.id,to_jsonb(x)-'created_at'-'updated_at' into v_parent_id,v_parent from public.bespoke_hero_content x order by x.updated_at desc,x.id limit 1;
  if v_parent_id is not null then
    select coalesce(jsonb_agg(to_jsonb(x)-'hero_id'-'created_at'-'updated_at' order by x.sort_order,x.id),'[]'::jsonb) into v_items from public.bespoke_hero_slider_items x where x.hero_id=v_parent_id;
  end if;
  v_content:=jsonb_build_object('item',v_parent,'items',v_items);
  return v_content||jsonb_build_object('revision',md5(v_content::text));
end; $$;

create or replace function public.bespoke_hero_save_v1(p_actor_id uuid,p_request_id uuid,p_expected_revision text,p_item jsonb,p_items jsonb,p_deleted_ids uuid[] default '{}'::uuid[])
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_before jsonb;v_result jsonb;v_receipt public.cms_save_receipts%rowtype;v_hash text;v_parent_id uuid;v_row jsonb;v_id uuid;
begin
  if p_actor_id is null or p_request_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then raise exception 'Administrator access is required.' using errcode='42501';end if;
  if coalesce(p_expected_revision,'')!~'^[0-9a-f]{32}$' or jsonb_typeof(p_item) is distinct from 'object' or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Invalid Bespoke Hero save payload.' using errcode='22023';end if;
  if cardinality(p_deleted_ids)<>cardinality(array(select distinct x from unnest(p_deleted_ids)x)) then raise exception 'Deleted slide IDs must be unique.' using errcode='22023';end if;
  if nullif(trim(p_item->>'heading_line_1'),'') is null or p_item->>'status' not in ('active','hidden') then raise exception 'The primary heading and a valid status are required.' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(p_items)x where nullif(x->>'id','') is not null group by x->>'id' having count(*)>1) then raise exception 'Slide IDs must be unique.' using errcode='22023';end if;

  perform pg_advisory_xact_lock(hashtextextended('bespoke-hero',0));
  perform pg_advisory_xact_lock(hashtextextended('bespoke-hero-request:'||p_actor_id||':'||p_request_id,0));
  v_hash:=md5(jsonb_build_object('revision',p_expected_revision,'item',p_item,'items',p_items,'deleted',p_deleted_ids)::text);
  select r.* into v_receipt from public.cms_save_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then if v_receipt.operation<>'bespoke-hero-save' or v_receipt.payload_hash<>v_hash then raise exception 'This save request was already used for different changes.' using errcode='40001';end if;return v_receipt.result;end if;
  v_before:=public.bespoke_hero_snapshot_v1();
  if v_before->>'revision'<>p_expected_revision then raise exception 'The Bespoke Hero changed since you opened it. Reload before saving.' using errcode='40001';end if;
  v_parent_id:=nullif(v_before->'item'->>'id','')::uuid;
  if nullif(p_item->>'id','') is not null and nullif(p_item->>'id','')::uuid is distinct from v_parent_id then raise exception 'The Bespoke Hero ID is invalid.' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(p_items)x where nullif(x->>'id','') is not null and not exists(select 1 from public.bespoke_hero_slider_items s where s.id=(x->>'id')::uuid and s.hero_id=v_parent_id)) then raise exception 'A slide does not belong to this hero.' using errcode='22023';end if;
  if exists(select 1 from public.bespoke_hero_slider_items s where s.hero_id=v_parent_id and not(s.id=any(p_deleted_ids)) and not exists(select 1 from jsonb_array_elements(p_items)x where nullif(x->>'id','')::uuid=s.id)) then raise exception 'Slides may only be removed explicitly.' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(p_items)x where nullif(trim(x->>'image_path'),'') is null or nullif(trim(x->>'button_text'),'') is null or nullif(trim(x->>'button_link'),'') is null or coalesce((x->>'sort_order')::integer,0)<1) then raise exception 'Every slide requires an image, button text, button link, and valid order.' using errcode='22023';end if;

  if v_parent_id is null then
    insert into public.bespoke_hero_content(badge_text,eyebrow,heading_line_1,heading_line_2,subtitle,primary_cta_label,primary_cta_action,secondary_cta_label,secondary_cta_action,slider_enabled,status)
    values(nullif(trim(p_item->>'badge_text'),''),nullif(trim(p_item->>'eyebrow'),''),trim(p_item->>'heading_line_1'),nullif(trim(p_item->>'heading_line_2'),''),nullif(trim(p_item->>'subtitle'),''),nullif(trim(p_item->>'primary_cta_label'),''),nullif(trim(p_item->>'primary_cta_action'),''),nullif(trim(p_item->>'secondary_cta_label'),''),nullif(trim(p_item->>'secondary_cta_action'),''),(p_item->>'slider_enabled')::boolean,(jsonb_populate_record(null::public.bespoke_hero_content,p_item)).status) returning id into v_parent_id;
  else
    update public.bespoke_hero_content set badge_text=nullif(trim(p_item->>'badge_text'),''),eyebrow=nullif(trim(p_item->>'eyebrow'),''),heading_line_1=trim(p_item->>'heading_line_1'),heading_line_2=nullif(trim(p_item->>'heading_line_2'),''),subtitle=nullif(trim(p_item->>'subtitle'),''),primary_cta_label=nullif(trim(p_item->>'primary_cta_label'),''),primary_cta_action=nullif(trim(p_item->>'primary_cta_action'),''),secondary_cta_label=nullif(trim(p_item->>'secondary_cta_label'),''),secondary_cta_action=nullif(trim(p_item->>'secondary_cta_action'),''),slider_enabled=(p_item->>'slider_enabled')::boolean,status=(jsonb_populate_record(null::public.bespoke_hero_content,p_item)).status,updated_at=now()
    where id=v_parent_id and (badge_text,eyebrow,heading_line_1,heading_line_2,subtitle,primary_cta_label,primary_cta_action,secondary_cta_label,secondary_cta_action,slider_enabled,status) is distinct from (nullif(trim(p_item->>'badge_text'),''),nullif(trim(p_item->>'eyebrow'),''),trim(p_item->>'heading_line_1'),nullif(trim(p_item->>'heading_line_2'),''),nullif(trim(p_item->>'subtitle'),''),nullif(trim(p_item->>'primary_cta_label'),''),nullif(trim(p_item->>'primary_cta_action'),''),nullif(trim(p_item->>'secondary_cta_label'),''),nullif(trim(p_item->>'secondary_cta_action'),''),(p_item->>'slider_enabled')::boolean,(jsonb_populate_record(null::public.bespoke_hero_content,p_item)).status);
  end if;
  delete from public.bespoke_hero_slider_items where hero_id=v_parent_id and id=any(p_deleted_ids);
  for v_row in select * from jsonb_array_elements(p_items) loop
    v_id:=nullif(v_row->>'id','')::uuid;
    if v_id is null then insert into public.bespoke_hero_slider_items(hero_id,sort_order,image_path,mobile_image_path,button_text,button_link) values(v_parent_id,(v_row->>'sort_order')::integer,trim(v_row->>'image_path'),nullif(trim(v_row->>'mobile_image_path'),''),trim(v_row->>'button_text'),trim(v_row->>'button_link'));
    else update public.bespoke_hero_slider_items set sort_order=(v_row->>'sort_order')::integer,image_path=trim(v_row->>'image_path'),mobile_image_path=nullif(trim(v_row->>'mobile_image_path'),''),button_text=trim(v_row->>'button_text'),button_link=trim(v_row->>'button_link'),updated_at=now() where id=v_id and hero_id=v_parent_id and (sort_order,image_path,mobile_image_path,button_text,button_link) is distinct from ((v_row->>'sort_order')::integer,trim(v_row->>'image_path'),nullif(trim(v_row->>'mobile_image_path'),''),trim(v_row->>'button_text'),trim(v_row->>'button_link'));end if;
  end loop;
  v_result:=public.bespoke_hero_snapshot_v1();
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'bespoke-hero-save',v_hash,v_result);
  return v_result;
end; $$;

revoke all on function public.bespoke_hero_snapshot_v1() from public,anon,authenticated;
revoke all on function public.bespoke_hero_save_v1(uuid,uuid,text,jsonb,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.bespoke_hero_snapshot_v1() to service_role;
grant execute on function public.bespoke_hero_save_v1(uuid,uuid,text,jsonb,jsonb,uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
