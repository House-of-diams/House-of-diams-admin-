begin;

-- Group 3A: atomic, revision-checked saves for active singleton CMS sections.
-- Additive only; existing rows are not rewritten by this migration.
create or replace function public.cms_singleton_snapshot_v1(p_kind text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_content jsonb;
begin
  case p_kind
    when 'about_hero' then
      select to_jsonb(r)-'id'-'created_at'-'updated_at' into v_item from public.about_hero r where r.section_key='about_hero';
    when 'about_wide_banner' then
      select to_jsonb(r)-'id'-'created_at'-'updated_at' into v_item from public.about_wide_banner r where r.section_key='about_wide_banner';
    when 'blog_hero' then
      select to_jsonb(r)-'id'-'created_at'-'updated_at' into v_item from public.blog_page_hero r where r.id=1;
    when 'education_hero' then
      select to_jsonb(r)-'id'-'updated_at' into v_item from public.education_page_hero r where r.id=1;
    when 'contact_hero' then
      select to_jsonb(r)-'id'-'created_at'-'updated_at' into v_item from public.contact_hero r where r.section_key='contact_hero';
    when 'bespoke_showcase' then
      select to_jsonb(r)-'id'-'created_at'-'updated_at' into v_item from public.home_bespoke_showcase_section r where r.section_key='home_bespoke_showcase';
    when 'collection_page' then
      select to_jsonb(r)-'id'-'created_at'-'updated_at' into v_item from public.collection_page_config r where r.section_key='main_collection_page';
    when 'hiphop_showcase' then
      select to_jsonb(r)-'id'-'created_at'-'updated_at' into v_item from public.hiphop_showcase_section r where r.section_key='home_hiphop_showcase';
    else
      raise exception 'Unsupported CMS singleton.' using errcode='22023';
  end case;
  v_content:=jsonb_build_object('item',v_item);
  return v_content||jsonb_build_object('revision',md5(v_content::text));
end;
$$;

create or replace function public.cms_save_singleton_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_revision text,
  p_kind text,
  p_item jsonb
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
begin
  if p_actor_id is null or p_request_id is null or not exists(
    select 1 from public.profiles p where p.id=p_actor_id and p.role='admin'
  ) then raise exception 'Administrator access is required.' using errcode='42501'; end if;
  if p_kind not in ('about_hero','about_wide_banner','blog_hero','education_hero','contact_hero','bespoke_showcase','collection_page','hiphop_showcase')
    or coalesce(p_expected_revision,'') !~ '^[0-9a-f]{32}$'
    or jsonb_typeof(p_item) is distinct from 'object'
  then raise exception 'Invalid singleton save payload. Reload this editor.' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('cms-singleton:'||p_kind,0));
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text||p_request_id::text,0));
  v_hash:=md5(jsonb_build_object('kind',p_kind,'revision',p_expected_revision,'item',p_item)::text);
  select r.* into v_receipt from public.cms_save_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then
    if v_receipt.operation<>'singleton-save-'||p_kind or v_receipt.payload_hash<>v_hash then
      raise exception 'This save request was already used for different changes.' using errcode='40001';
    end if;
    return v_receipt.result;
  end if;
  v_before:=public.cms_singleton_snapshot_v1(p_kind);
  if v_before->>'revision'<>p_expected_revision then
    raise exception 'This section changed since you opened it. Reload before saving.' using errcode='40001';
  end if;

  case p_kind
    when 'about_hero' then
      insert into public.about_hero(section_key,is_enabled,media_type,desktop_media_path,mobile_media_path,video_poster_path,media_alt,show_text_overlay,heading,paragraph,show_button,button_label,button_link,overlay_position,overlay_scrim_enabled)
      values('about_hero',(p_item->>'is_enabled')::boolean,p_item->>'media_type',nullif(trim(p_item->>'desktop_media_path'),''),nullif(trim(p_item->>'mobile_media_path'),''),nullif(trim(p_item->>'video_poster_path'),''),trim(p_item->>'media_alt'),(p_item->>'show_text_overlay')::boolean,trim(p_item->>'heading'),trim(p_item->>'paragraph'),(p_item->>'show_button')::boolean,trim(p_item->>'button_label'),trim(p_item->>'button_link'),p_item->>'overlay_position',(p_item->>'overlay_scrim_enabled')::boolean)
      on conflict(section_key) do update set is_enabled=excluded.is_enabled,media_type=excluded.media_type,desktop_media_path=excluded.desktop_media_path,mobile_media_path=excluded.mobile_media_path,video_poster_path=excluded.video_poster_path,media_alt=excluded.media_alt,show_text_overlay=excluded.show_text_overlay,heading=excluded.heading,paragraph=excluded.paragraph,show_button=excluded.show_button,button_label=excluded.button_label,button_link=excluded.button_link,overlay_position=excluded.overlay_position,overlay_scrim_enabled=excluded.overlay_scrim_enabled,updated_at=now();
    when 'about_wide_banner' then
      insert into public.about_wide_banner(section_key,is_enabled,desktop_image_path,mobile_image_path,image_alt,heading,paragraph,show_button,button_label,button_link,content_position,sort_order)
      values('about_wide_banner',(p_item->>'is_enabled')::boolean,nullif(trim(p_item->>'desktop_image_path'),''),nullif(trim(p_item->>'mobile_image_path'),''),nullif(trim(p_item->>'image_alt'),''),nullif(trim(p_item->>'heading'),''),nullif(trim(p_item->>'paragraph'),''),(p_item->>'show_button')::boolean,nullif(trim(p_item->>'button_label'),''),nullif(trim(p_item->>'button_link'),''),p_item->>'content_position',(p_item->>'sort_order')::integer)
      on conflict(section_key) do update set is_enabled=excluded.is_enabled,desktop_image_path=excluded.desktop_image_path,mobile_image_path=excluded.mobile_image_path,image_alt=excluded.image_alt,heading=excluded.heading,paragraph=excluded.paragraph,show_button=excluded.show_button,button_label=excluded.button_label,button_link=excluded.button_link,content_position=excluded.content_position,sort_order=excluded.sort_order,updated_at=now();
    when 'blog_hero' then
      insert into public.blog_page_hero(id,is_enabled,heading,paragraph,button_label,button_link,desktop_image_path,desktop_image_alt,mobile_image_path,mobile_image_alt)
      values(1,(p_item->>'is_enabled')::boolean,trim(p_item->>'heading'),nullif(trim(p_item->>'paragraph'),''),nullif(trim(p_item->>'button_label'),''),nullif(trim(p_item->>'button_link'),''),nullif(trim(p_item->>'desktop_image_path'),''),nullif(trim(p_item->>'desktop_image_alt'),''),nullif(trim(p_item->>'mobile_image_path'),''),nullif(trim(p_item->>'mobile_image_alt'),''))
      on conflict(id) do update set is_enabled=excluded.is_enabled,heading=excluded.heading,paragraph=excluded.paragraph,button_label=excluded.button_label,button_link=excluded.button_link,desktop_image_path=excluded.desktop_image_path,desktop_image_alt=excluded.desktop_image_alt,mobile_image_path=excluded.mobile_image_path,mobile_image_alt=excluded.mobile_image_alt,updated_at=now();
    when 'education_hero' then
      insert into public.education_page_hero(id,is_enabled,heading,paragraph,button_label,button_link,desktop_image_path,desktop_image_alt,mobile_image_path,mobile_image_alt)
      values(1,(p_item->>'is_enabled')::boolean,trim(p_item->>'heading'),nullif(trim(p_item->>'paragraph'),''),nullif(trim(p_item->>'button_label'),''),nullif(trim(p_item->>'button_link'),''),nullif(trim(p_item->>'desktop_image_path'),''),nullif(trim(p_item->>'desktop_image_alt'),''),nullif(trim(p_item->>'mobile_image_path'),''),nullif(trim(p_item->>'mobile_image_alt'),''))
      on conflict(id) do update set is_enabled=excluded.is_enabled,heading=excluded.heading,paragraph=excluded.paragraph,button_label=excluded.button_label,button_link=excluded.button_link,desktop_image_path=excluded.desktop_image_path,desktop_image_alt=excluded.desktop_image_alt,mobile_image_path=excluded.mobile_image_path,mobile_image_alt=excluded.mobile_image_alt,updated_at=now();
    when 'contact_hero' then
      insert into public.contact_hero(section_key,eyebrow,heading,subtitle)
      values('contact_hero',trim(p_item->>'eyebrow'),trim(p_item->>'heading'),trim(p_item->>'subtitle'))
      on conflict(section_key) do update set eyebrow=excluded.eyebrow,heading=excluded.heading,subtitle=excluded.subtitle,updated_at=now();
    when 'bespoke_showcase' then
      insert into public.home_bespoke_showcase_section(section_key,is_enabled,eyebrow,heading,subtitle,cta_label,image_path,mobile_image_path,image_alt,sort_order)
      values('home_bespoke_showcase',(p_item->>'is_enabled')::boolean,trim(p_item->>'eyebrow'),trim(p_item->>'heading'),trim(p_item->>'subtitle'),trim(p_item->>'cta_label'),nullif(trim(p_item->>'image_path'),''),nullif(trim(p_item->>'mobile_image_path'),''),trim(p_item->>'image_alt'),(p_item->>'sort_order')::integer)
      on conflict(section_key) do update set is_enabled=excluded.is_enabled,eyebrow=excluded.eyebrow,heading=excluded.heading,subtitle=excluded.subtitle,cta_label=excluded.cta_label,image_path=excluded.image_path,mobile_image_path=excluded.mobile_image_path,image_alt=excluded.image_alt,sort_order=excluded.sort_order,updated_at=now();
    when 'collection_page' then
      insert into public.collection_page_config(section_key,page_enabled,show_in_footer,show_home_showcase,showcase_heading,showcase_subtitle,showcase_cta_label,showcase_cta_href,showcase_image_path,showcase_mobile_image_path)
      values('main_collection_page',(p_item->>'page_enabled')::boolean,(p_item->>'show_in_footer')::boolean,(p_item->>'show_home_showcase')::boolean,nullif(trim(p_item->>'showcase_heading'),''),nullif(trim(p_item->>'showcase_subtitle'),''),nullif(trim(p_item->>'showcase_cta_label'),''),nullif(trim(p_item->>'showcase_cta_href'),''),nullif(trim(p_item->>'showcase_image_path'),''),nullif(trim(p_item->>'showcase_mobile_image_path'),''))
      on conflict(section_key) do update set page_enabled=excluded.page_enabled,show_in_footer=excluded.show_in_footer,show_home_showcase=excluded.show_home_showcase,showcase_heading=excluded.showcase_heading,showcase_subtitle=excluded.showcase_subtitle,showcase_cta_label=excluded.showcase_cta_label,showcase_cta_href=excluded.showcase_cta_href,showcase_image_path=excluded.showcase_image_path,showcase_mobile_image_path=excluded.showcase_mobile_image_path,updated_at=now();
    when 'hiphop_showcase' then
      insert into public.hiphop_showcase_section(section_key,is_enabled,eyebrow,heading_line_1,heading_line_2,heading_emphasis,cta_label,cta_link,image_path,image_alt)
      values('home_hiphop_showcase',(p_item->>'is_enabled')::boolean,trim(p_item->>'eyebrow'),trim(p_item->>'heading_line_1'),trim(p_item->>'heading_line_2'),trim(p_item->>'heading_emphasis'),trim(p_item->>'cta_label'),trim(p_item->>'cta_link'),trim(p_item->>'image_path'),trim(p_item->>'image_alt'))
      on conflict(section_key) do update set is_enabled=excluded.is_enabled,eyebrow=excluded.eyebrow,heading_line_1=excluded.heading_line_1,heading_line_2=excluded.heading_line_2,heading_emphasis=excluded.heading_emphasis,cta_label=excluded.cta_label,cta_link=excluded.cta_link,image_path=excluded.image_path,image_alt=excluded.image_alt,updated_at=now();
  end case;
  v_result:=public.cms_singleton_snapshot_v1(p_kind);
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result)
  values(p_actor_id,p_request_id,'singleton-save-'||p_kind,v_hash,v_result);
  return v_result;
end;
$$;

revoke all on function public.cms_singleton_snapshot_v1(text) from public,anon,authenticated;
revoke all on function public.cms_save_singleton_v1(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.cms_singleton_snapshot_v1(text) to service_role;
grant execute on function public.cms_save_singleton_v1(uuid,uuid,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
