begin;

-- Group 3B: one atomic, revision-checked boundary for active parent/child CMS sections.
-- Existing rows are not rewritten by this migration.
create or replace function public.cms_relational_snapshot_v1(p_kind text)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare v_parent jsonb; v_items jsonb:='[]'::jsonb; v_parent_id text; v_content jsonb;
begin
  case p_kind
    when 'checkout_result' then
      select to_jsonb(x)-'id'-'created_at'-'updated_at' into v_parent from public.checkout_result_page x where id=1;
      select coalesce(jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' order by case state when 'success' then 1 when 'pending' then 2 when 'failed' then 3 else 4 end),'[]') into v_items from public.checkout_result_states x;
    when 'promotion' then
      select id::text,to_jsonb(x)-'id'-'section_key'-'created_at'-'updated_at' into v_parent_id,v_parent from public.promotion_popup x where section_key='global_promotion_popup';
      if v_parent_id is not null then select coalesce(jsonb_agg(to_jsonb(x)-'promotion_id'-'created_at'-'updated_at' order by sort_order,id),'[]') into v_items from public.promotion_popup_questions x where promotion_id=v_parent_id::bigint; end if;
    when 'service_banner' then
      select to_jsonb(x)-'id'-'created_at'-'updated_at' into v_parent from public.service_banner_section x where id=1;
      select coalesce(jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' order by sort_order,id),'[]') into v_items from public.service_banner_blocks x;
    when 'summary' then
      select id::text,to_jsonb(x)-'id'-'section_key'-'created_at'-'updated_at' into v_parent_id,v_parent from public.cms_summary_sections x where section_key='additional_summary_details';
      if v_parent_id is not null then select coalesce(jsonb_agg(to_jsonb(x)-'section_id'-'created_at'-'updated_at' order by sort_order,id),'[]') into v_items from public.cms_summary_pointers x where section_id=v_parent_id::uuid; end if;
    when 'announcement' then
      select id::text,to_jsonb(x)-'id'-'section_key'-'created_at'-'updated_at' into v_parent_id,v_parent from public.support_announcement_bar x where section_key='global_support_announcement_bar';
      if v_parent_id is not null then select coalesce(jsonb_agg(to_jsonb(x)-'bar_id'-'created_at'-'updated_at' order by sort_order,id),'[]') into v_items from public.support_announcement_bar_items x where bar_id=v_parent_id::bigint; end if;
    when 'faq' then
      select id::text,to_jsonb(x)-'id'-'section_key'-'created_at'-'updated_at' into v_parent_id,v_parent from public.support_faq_section x where section_key='global_support_faq';
      if v_parent_id is not null then select coalesce(jsonb_agg(to_jsonb(x)-'section_id'-'created_at'-'updated_at' order by sort_order,id),'[]') into v_items from public.support_faq_items x where section_id=v_parent_id::bigint; end if;
    else raise exception 'Unsupported CMS relational section.' using errcode='22023';
  end case;
  v_content:=jsonb_build_object('parent',v_parent,'items',v_items);
  return v_content||jsonb_build_object('revision',md5(v_content::text));
end; $$;

create or replace function public.cms_save_relational_v1(p_actor_id uuid,p_request_id uuid,p_expected_revision text,p_kind text,p_parent jsonb,p_items jsonb,p_deleted_ids text[] default '{}')
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_before jsonb; v_result jsonb; v_receipt public.cms_save_receipts%rowtype; v_hash text; v_parent_id text; v_item jsonb; v_id text;
begin
  if p_actor_id is null or p_request_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then raise exception 'Administrator access is required.' using errcode='42501'; end if;
  if p_kind not in ('checkout_result','promotion','service_banner','summary','announcement','faq') or coalesce(p_expected_revision,'') !~ '^[0-9a-f]{32}$' or jsonb_typeof(p_parent) is distinct from 'object' or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Invalid relational save payload. Reload this editor.' using errcode='22023'; end if;
  if cardinality(p_deleted_ids)<>cardinality(array(select distinct x from unnest(p_deleted_ids) x)) then raise exception 'Deleted IDs must be unique.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cms-relational:'||p_kind,0));
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text||p_request_id::text,0));
  v_hash:=md5(jsonb_build_object('kind',p_kind,'revision',p_expected_revision,'parent',p_parent,'items',p_items,'deleted',p_deleted_ids)::text);
  select r.* into v_receipt from public.cms_save_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then if v_receipt.operation<>'relational-save-'||p_kind or v_receipt.payload_hash<>v_hash then raise exception 'This save request was already used for different changes.' using errcode='40001'; end if; return v_receipt.result; end if;
  v_before:=public.cms_relational_snapshot_v1(p_kind);
  if v_before->>'revision'<>p_expected_revision then raise exception 'This section changed since you opened it. Reload before saving.' using errcode='40001'; end if;

  case p_kind
    when 'checkout_result' then
      if jsonb_array_length(p_items)<>4 or exists(select 1 from jsonb_array_elements(p_items) x where x->>'state' not in ('success','pending','failed','error')) or (select count(distinct x->>'state') from jsonb_array_elements(p_items)x)<>4 then raise exception 'All four checkout states are required.' using errcode='22023'; end if;
      insert into public.checkout_result_page(id,main_banner_image_path,main_banner_image_alt,secondary_banner_image_path,secondary_banner_image_alt,secondary_eyebrow,secondary_heading,secondary_paragraph,is_enabled)
      values(1,nullif(trim(p_parent->>'main_banner_image_path'),''),nullif(trim(p_parent->>'main_banner_image_alt'),''),nullif(trim(p_parent->>'secondary_banner_image_path'),''),nullif(trim(p_parent->>'secondary_banner_image_alt'),''),nullif(trim(p_parent->>'secondary_eyebrow'),''),nullif(trim(p_parent->>'secondary_heading'),''),nullif(trim(p_parent->>'secondary_paragraph'),''),(p_parent->>'is_enabled')::boolean)
      on conflict(id) do update set main_banner_image_path=excluded.main_banner_image_path,main_banner_image_alt=excluded.main_banner_image_alt,secondary_banner_image_path=excluded.secondary_banner_image_path,secondary_banner_image_alt=excluded.secondary_banner_image_alt,secondary_eyebrow=excluded.secondary_eyebrow,secondary_heading=excluded.secondary_heading,secondary_paragraph=excluded.secondary_paragraph,is_enabled=excluded.is_enabled,updated_at=now();
      for v_item in select * from jsonb_array_elements(p_items) loop
        insert into public.checkout_result_states(state,eyebrow,heading,paragraph,order_button_label,is_enabled) values(v_item->>'state',nullif(trim(v_item->>'eyebrow'),''),nullif(trim(v_item->>'heading'),''),nullif(trim(v_item->>'paragraph'),''),nullif(trim(v_item->>'order_button_label'),''),(v_item->>'is_enabled')::boolean)
        on conflict(state) do update set eyebrow=excluded.eyebrow,heading=excluded.heading,paragraph=excluded.paragraph,order_button_label=excluded.order_button_label,is_enabled=excluded.is_enabled,updated_at=now();
      end loop;
    when 'promotion' then
      insert into public.promotion_popup(section_key,label,title,description,cta_text,cta_link,cta_action,selected_coupon_id,image_path,mobile_image_path,image_alt,image_only_mode,is_active,show_once_per_session)
      values('global_promotion_popup',p_parent->>'label',p_parent->>'title',p_parent->>'description',p_parent->>'cta_text',p_parent->>'cta_link',p_parent->>'cta_action',nullif(p_parent->>'selected_coupon_id','')::bigint,p_parent->>'image_path',nullif(p_parent->>'mobile_image_path',''),nullif(p_parent->>'image_alt',''),(p_parent->>'image_only_mode')::boolean,(p_parent->>'is_active')::boolean,(p_parent->>'show_once_per_session')::boolean)
      on conflict(section_key) do update set label=excluded.label,title=excluded.title,description=excluded.description,cta_text=excluded.cta_text,cta_link=excluded.cta_link,cta_action=excluded.cta_action,selected_coupon_id=excluded.selected_coupon_id,image_path=excluded.image_path,mobile_image_path=excluded.mobile_image_path,image_alt=excluded.image_alt,image_only_mode=excluded.image_only_mode,is_active=excluded.is_active,show_once_per_session=excluded.show_once_per_session,updated_at=now() returning id::text into v_parent_id;
      if exists(select 1 from public.promotion_popup_questions x where x.promotion_id=v_parent_id::bigint and not(x.id::text=any(p_deleted_ids)) and not exists(select 1 from jsonb_array_elements(p_items)i where i->>'id'=x.id::text)) then raise exception 'Questions may only be removed explicitly.' using errcode='22023'; end if;
      for v_item in select * from jsonb_array_elements(p_items) loop v_id:=nullif(v_item->>'id','');
        if v_id is null then insert into public.promotion_popup_questions(promotion_id,field_key,question,input_type,options,allow_multiple,validation_pattern,validation_message,is_required,is_active,sort_order) values(v_parent_id::bigint,v_item->>'field_key',v_item->>'question',v_item->>'input_type',coalesce(v_item->'options','[]'),(v_item->>'allow_multiple')::boolean,nullif(v_item->>'validation_pattern',''),nullif(v_item->>'validation_message',''),(v_item->>'is_required')::boolean,(v_item->>'is_active')::boolean,(v_item->>'sort_order')::integer);
        else update public.promotion_popup_questions set field_key=v_item->>'field_key',question=v_item->>'question',input_type=v_item->>'input_type',options=coalesce(v_item->'options','[]'),allow_multiple=(v_item->>'allow_multiple')::boolean,validation_pattern=nullif(v_item->>'validation_pattern',''),validation_message=nullif(v_item->>'validation_message',''),is_required=(v_item->>'is_required')::boolean,is_active=(v_item->>'is_active')::boolean,sort_order=(v_item->>'sort_order')::integer,updated_at=now() where id=v_id::bigint and promotion_id=v_parent_id::bigint; if not found then raise exception 'Question not found.' using errcode='22023'; end if; end if;
      end loop; delete from public.promotion_popup_questions where promotion_id=v_parent_id::bigint and id::text=any(p_deleted_ids);
    when 'service_banner' then
      insert into public.service_banner_section(id,image_path,image_alt,is_enabled) values(1,nullif(trim(p_parent->>'image_path'),''),nullif(trim(p_parent->>'image_alt'),''),(p_parent->>'is_enabled')::boolean) on conflict(id) do update set image_path=excluded.image_path,image_alt=excluded.image_alt,is_enabled=excluded.is_enabled,updated_at=now();
      if exists(select 1 from public.service_banner_blocks x where not(x.id::text=any(p_deleted_ids)) and not exists(select 1 from jsonb_array_elements(p_items)i where i->>'id'=x.id::text)) then raise exception 'Blocks may only be removed explicitly.' using errcode='22023'; end if;
      for v_item in select * from jsonb_array_elements(p_items) loop v_id:=nullif(v_item->>'id',''); if v_id is null then insert into public.service_banner_blocks(title,paragraph,sort_order,is_active) values(v_item->>'title',v_item->>'paragraph',(v_item->>'sort_order')::integer,(v_item->>'is_active')::boolean); else update public.service_banner_blocks set title=v_item->>'title',paragraph=v_item->>'paragraph',sort_order=(v_item->>'sort_order')::integer,is_active=(v_item->>'is_active')::boolean,updated_at=now() where id=v_id::uuid; if not found then raise exception 'Block not found.' using errcode='22023'; end if; end if; end loop;
      delete from public.service_banner_blocks where id::text=any(p_deleted_ids);
    when 'summary' then
      insert into public.cms_summary_sections(section_key,heading,is_enabled) values('additional_summary_details',trim(p_parent->>'heading'),(p_parent->>'is_enabled')::boolean) on conflict(section_key) do update set heading=excluded.heading,is_enabled=excluded.is_enabled,updated_at=now() returning id::text into v_parent_id;
      if exists(select 1 from public.cms_summary_pointers x where section_id=v_parent_id::uuid and not(x.id::text=any(p_deleted_ids)) and not exists(select 1 from jsonb_array_elements(p_items)i where i->>'id'=x.id::text)) then raise exception 'Pointers may only be removed explicitly.' using errcode='22023'; end if;
      for v_item in select * from jsonb_array_elements(p_items) loop v_id:=nullif(v_item->>'id',''); if v_id is null then insert into public.cms_summary_pointers(section_id,sort_order,icon_url,pointer_text,video_url,video_link_text) values(v_parent_id::uuid,(v_item->>'sort_order')::integer,nullif(trim(v_item->>'icon_url'),''),trim(v_item->>'pointer_text'),nullif(trim(v_item->>'video_url'),''),nullif(trim(v_item->>'video_link_text'),'')); else update public.cms_summary_pointers set sort_order=(v_item->>'sort_order')::integer,icon_url=nullif(trim(v_item->>'icon_url'),''),pointer_text=trim(v_item->>'pointer_text'),video_url=nullif(trim(v_item->>'video_url'),''),video_link_text=nullif(trim(v_item->>'video_link_text'),''),updated_at=now() where id=v_id::uuid and section_id=v_parent_id::uuid; if not found then raise exception 'Pointer not found.' using errcode='22023'; end if; end if; end loop;
      delete from public.cms_summary_pointers where section_id=v_parent_id::uuid and id::text=any(p_deleted_ids);
    when 'announcement' then
      insert into public.support_announcement_bar(section_key,is_active,autoplay,speed_ms) values('global_support_announcement_bar',(p_parent->>'is_active')::boolean,(p_parent->>'autoplay')::boolean,(p_parent->>'speed_ms')::integer) on conflict(section_key) do update set is_active=excluded.is_active,autoplay=excluded.autoplay,speed_ms=excluded.speed_ms,updated_at=now() returning id::text into v_parent_id;
      if exists(select 1 from public.support_announcement_bar_items x where bar_id=v_parent_id::bigint and not(x.id::text=any(p_deleted_ids)) and not exists(select 1 from jsonb_array_elements(p_items)i where i->>'id'=x.id::text)) then raise exception 'Announcements may only be removed explicitly.' using errcode='22023'; end if;
      for v_item in select * from jsonb_array_elements(p_items) loop v_id:=nullif(v_item->>'id',''); if v_id is null then insert into public.support_announcement_bar_items(bar_id,message,link_url,open_in_new_tab,sort_order,is_active) values(v_parent_id::bigint,v_item->>'message',v_item->>'link_url',(v_item->>'open_in_new_tab')::boolean,(v_item->>'sort_order')::integer,(v_item->>'is_active')::boolean); else update public.support_announcement_bar_items set message=v_item->>'message',link_url=v_item->>'link_url',open_in_new_tab=(v_item->>'open_in_new_tab')::boolean,sort_order=(v_item->>'sort_order')::integer,is_active=(v_item->>'is_active')::boolean,updated_at=now() where id=v_id::bigint and bar_id=v_parent_id::bigint; if not found then raise exception 'Announcement not found.' using errcode='22023'; end if; end if; end loop;
      delete from public.support_announcement_bar_items where bar_id=v_parent_id::bigint and id::text=any(p_deleted_ids);
    when 'faq' then
      insert into public.support_faq_section(section_key,title,subtitle) values('global_support_faq',trim(p_parent->>'title'),p_parent->>'subtitle') on conflict(section_key) do update set title=excluded.title,subtitle=excluded.subtitle,updated_at=now() returning id::text into v_parent_id;
      if exists(select 1 from public.support_faq_items x where section_id=v_parent_id::bigint and not(x.id::text=any(p_deleted_ids)) and not exists(select 1 from jsonb_array_elements(p_items)i where i->>'id'=x.id::text)) then raise exception 'FAQs may only be removed explicitly.' using errcode='22023'; end if;
      for v_item in select * from jsonb_array_elements(p_items) loop v_id:=nullif(v_item->>'id',''); if v_id is null then insert into public.support_faq_items(section_id,question,answer,sort_order,is_active,category_id,catalog_category_id) values(v_parent_id::bigint,trim(v_item->>'question'),trim(v_item->>'answer'),(v_item->>'sort_order')::integer,(v_item->>'is_active')::boolean,nullif(v_item->>'category_id','')::bigint,nullif(v_item->>'catalog_category_id','')::uuid); else update public.support_faq_items set question=trim(v_item->>'question'),answer=trim(v_item->>'answer'),sort_order=(v_item->>'sort_order')::integer,is_active=(v_item->>'is_active')::boolean,category_id=nullif(v_item->>'category_id','')::bigint,catalog_category_id=nullif(v_item->>'catalog_category_id','')::uuid,updated_at=now() where id=v_id::bigint and section_id=v_parent_id::bigint; if not found then raise exception 'FAQ not found.' using errcode='22023'; end if; end if; end loop;
      delete from public.support_faq_items where section_id=v_parent_id::bigint and id::text=any(p_deleted_ids);
  end case;
  v_result:=public.cms_relational_snapshot_v1(p_kind);
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'relational-save-'||p_kind,v_hash,v_result);
  return v_result;
end; $$;

revoke all on function public.cms_relational_snapshot_v1(text) from public,anon,authenticated;
revoke all on function public.cms_save_relational_v1(uuid,uuid,text,text,jsonb,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.cms_relational_snapshot_v1(text) to service_role;
grant execute on function public.cms_save_relational_v1(uuid,uuid,text,text,jsonb,jsonb,text[]) to service_role;
notify pgrst,'reload schema';
commit;
