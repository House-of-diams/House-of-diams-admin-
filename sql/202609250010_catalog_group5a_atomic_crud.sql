begin;

create table if not exists public.cms_save_receipts (
  actor_id uuid not null,
  request_id uuid not null,
  operation text not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, request_id)
);

create or replace function public.catalog_master_row_v1(p_kind text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_item jsonb;
begin
  case p_kind
    when 'gst_slab' then select to_jsonb(x) into v_item from public.catalog_gst_slabs x where x.id = p_id;
    when 'certificate' then select to_jsonb(x) into v_item from public.catalog_certificates x where x.id = p_id;
    when 'material_value' then select to_jsonb(x) into v_item from public.catalog_material_values x where x.id = p_id;
    when 'ring_size' then select to_jsonb(x) into v_item from public.catalog_ring_sizes x where x.id = p_id;
    when 'stone_shape' then select to_jsonb(x) into v_item from public.catalog_stone_shapes x where x.id = p_id;
    when 'style' then select to_jsonb(x) into v_item from public.catalog_styles x where x.id = p_id;
    when 'content_rule' then select to_jsonb(x) into v_item from public.product_content_rules x where x.id = p_id;
    else raise exception 'Unsupported catalog master type.' using errcode = '22023';
  end case;

  if v_item is null then
    return jsonb_build_object('item', null, 'revision', md5('null'));
  end if;
  return jsonb_build_object('item', v_item, 'revision', md5(v_item::text));
end;
$$;

create or replace function public.catalog_master_list_v1(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_items jsonb;
begin
  case p_kind
    when 'gst_slab' then select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('_revision', md5(to_jsonb(x)::text)) order by x.display_order, x.name, x.id), '[]'::jsonb) into v_items from public.catalog_gst_slabs x;
    when 'certificate' then select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('_revision', md5(to_jsonb(x)::text)) order by x.display_order, x.name, x.id), '[]'::jsonb) into v_items from public.catalog_certificates x;
    when 'material_value' then select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('_revision', md5(to_jsonb(x)::text)) order by x.display_order, x.name, x.id), '[]'::jsonb) into v_items from public.catalog_material_values x;
    when 'ring_size' then select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('_revision', md5(to_jsonb(x)::text)) order by x.display_order, x.name, x.id), '[]'::jsonb) into v_items from public.catalog_ring_sizes x;
    when 'stone_shape' then select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('_revision', md5(to_jsonb(x)::text)) order by x.display_order, x.name, x.id), '[]'::jsonb) into v_items from public.catalog_stone_shapes x;
    when 'style' then select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('_revision', md5(to_jsonb(x)::text)) order by x.display_order, x.name, x.id), '[]'::jsonb) into v_items from public.catalog_styles x;
    when 'content_rule' then select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('_revision', md5(to_jsonb(x)::text)) order by x.display_order, x.name, x.id), '[]'::jsonb) into v_items from public.product_content_rules x;
    else raise exception 'Unsupported catalog master type.' using errcode = '22023';
  end case;
  return coalesce(v_items, '[]'::jsonb);
end;
$$;

create or replace function public.catalog_save_master_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_revision text,
  p_kind text,
  p_id uuid,
  p_item jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_result jsonb;
  v_receipt public.cms_save_receipts%rowtype;
  v_hash text := md5(jsonb_build_object('kind', p_kind, 'id', p_id, 'expected_revision', p_expected_revision, 'item', p_item)::text);
  v_id uuid;
  v_name text := trim(coalesce(p_item->>'name', ''));
  v_slug text := lower(regexp_replace(regexp_replace(trim(coalesce(p_item->>'slug', '')), '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'));
  v_status text := coalesce(p_item->>'status', 'active');
  v_order integer;
begin
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin') then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_request_id is null or p_item is null or jsonb_typeof(p_item) <> 'object' then
    raise exception 'Invalid catalog save request.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('catalog-request:' || p_actor_id::text || ':' || p_request_id::text, 0));
  select * into v_receipt from public.cms_save_receipts r where r.actor_id = p_actor_id and r.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'catalog-master-save-' || p_kind or v_receipt.payload_hash <> v_hash then
      raise exception 'This request ID was already used for a different save.' using errcode = '22023';
    end if;
    return v_receipt.result;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('catalog-master:' || p_kind || ':' || coalesce(p_id::text, 'new'), 0));
  if p_id is null then
    if p_expected_revision is not null then raise exception 'New records cannot have an existing revision.' using errcode = '22023'; end if;
  else
    v_before := public.catalog_master_row_v1(p_kind, p_id);
    if v_before->'item' = 'null'::jsonb then raise exception 'Catalog record not found.' using errcode = 'P0002'; end if;
    if p_expected_revision is null or v_before->>'revision' <> p_expected_revision then
      raise exception 'This record changed since you opened it. Reload before saving.' using errcode = '40001';
    end if;
  end if;

  if v_name = '' or length(v_name) > 200 then raise exception 'Name is required and must be 200 characters or fewer.' using errcode = '22023'; end if;
  if v_status not in ('active', 'hidden') then raise exception 'Status must be active or hidden.' using errcode = '22023'; end if;
  begin v_order := coalesce((p_item->>'display_order')::integer, 0); exception when others then raise exception 'Display order must be a whole number.' using errcode = '22023'; end;
  if v_order < 0 or v_order > 1000000 then raise exception 'Display order is outside the allowed range.' using errcode = '22023'; end if;

  case p_kind
    when 'gst_slab' then
      if exists(select 1 from jsonb_object_keys(p_item) k where k <> all(array['name','code','percentage','description','status','display_order'])) then raise exception 'GST payload contains unsupported fields.' using errcode='22023'; end if;
      if trim(coalesce(p_item->>'code','')) = '' or length(trim(p_item->>'code')) > 50 then raise exception 'GST code is required.' using errcode='22023'; end if;
      if exists(select 1 from public.catalog_gst_slabs x where (lower(x.name)=lower(v_name) or upper(x.code)=upper(trim(p_item->>'code'))) and (p_id is null or x.id<>p_id)) then raise exception 'A GST slab with this name or code already exists.' using errcode='23505'; end if;
      if (p_item->>'percentage')::numeric < 0 or (p_item->>'percentage')::numeric > 100 then raise exception 'GST percentage must be between 0 and 100.' using errcode='22023'; end if;
      if p_id is null then
        insert into public.catalog_gst_slabs(name,code,percentage,description,status,display_order) values(v_name,upper(trim(p_item->>'code')),(p_item->>'percentage')::numeric,nullif(trim(p_item->>'description'),''),v_status,v_order) returning id into v_id;
      else
        update public.catalog_gst_slabs x set name=v_name,code=upper(trim(p_item->>'code')),percentage=(p_item->>'percentage')::numeric,description=nullif(trim(p_item->>'description'),''),status=v_status,display_order=v_order,updated_at=now()
        where x.id=p_id and (x.name,x.code,x.percentage,x.description,x.status,x.display_order) is distinct from (v_name,upper(trim(p_item->>'code')),(p_item->>'percentage')::numeric,nullif(trim(p_item->>'description'),''),v_status,v_order); v_id:=p_id;
      end if;
    when 'certificate' then
      if exists(select 1 from jsonb_object_keys(p_item) k where k <> all(array['name','code','status','display_order'])) then raise exception 'Certificate payload contains unsupported fields.' using errcode='22023'; end if;
      if exists(select 1 from public.catalog_certificates x where (lower(x.name)=lower(v_name) or (nullif(trim(p_item->>'code'),'') is not null and upper(x.code)=upper(trim(p_item->>'code')))) and (p_id is null or x.id<>p_id)) then raise exception 'A certificate with this name or code already exists.' using errcode='23505'; end if;
      if p_id is null then
        v_slug:=lower(regexp_replace(regexp_replace(v_name,'[^a-zA-Z0-9]+','-','g'),'(^-|-$)','','g'));
        if v_slug='' then raise exception 'Name must contain letters or numbers.' using errcode='22023'; end if;
        insert into public.catalog_certificates(name,code,slug,status,display_order) values(v_name,nullif(upper(trim(p_item->>'code')),''),v_slug,v_status::public.catalog_status,v_order) returning id into v_id;
      else
        update public.catalog_certificates x set name=v_name,code=nullif(upper(trim(p_item->>'code')),''),status=v_status::public.catalog_status,display_order=v_order,updated_at=now()
        where x.id=p_id and (x.name,x.code,x.status,x.display_order) is distinct from (v_name,nullif(upper(trim(p_item->>'code')),''),v_status::public.catalog_status,v_order); v_id:=p_id;
      end if;
    when 'material_value' then
      if exists(select 1 from jsonb_object_keys(p_item) k where k <> all(array['name','slug','cta_mode','cta_label','status','display_order'])) then raise exception 'Material value payload contains unsupported fields.' using errcode='22023'; end if;
      if v_slug='' then raise exception 'Slug is required.' using errcode='22023'; end if;
      if exists(select 1 from public.catalog_material_values x where (lower(x.name)=lower(v_name) or x.slug=v_slug) and (p_id is null or x.id<>p_id)) then raise exception 'A material value with this name or slug already exists.' using errcode='23505'; end if;
      if coalesce(p_item->>'cta_mode','both') not in ('both','enquire_only','checkout_only') then raise exception 'Invalid CTA mode.' using errcode='22023'; end if;
      if p_id is null then insert into public.catalog_material_values(name,slug,cta_mode,cta_label,status,display_order) values(v_name,v_slug,coalesce(p_item->>'cta_mode','both'),nullif(trim(p_item->>'cta_label'),''),v_status,v_order) returning id into v_id;
      else update public.catalog_material_values x set name=v_name,slug=v_slug,cta_mode=coalesce(p_item->>'cta_mode','both'),cta_label=nullif(trim(p_item->>'cta_label'),''),status=v_status,display_order=v_order,updated_at=now() where x.id=p_id and (x.name,x.slug,x.cta_mode,x.cta_label,x.status,x.display_order) is distinct from (v_name,v_slug,coalesce(p_item->>'cta_mode','both'),nullif(trim(p_item->>'cta_label'),''),v_status,v_order); v_id:=p_id; end if;
    when 'ring_size' then
      if exists(select 1 from jsonb_object_keys(p_item) k where k <> all(array['name','slug','status','display_order'])) then raise exception 'Ring size payload contains unsupported fields.' using errcode='22023'; end if;
      if v_slug='' then raise exception 'Slug is required.' using errcode='22023'; end if;
      if exists(select 1 from public.catalog_ring_sizes x where (lower(x.name)=lower(v_name) or x.slug=v_slug) and (p_id is null or x.id<>p_id)) then raise exception 'A ring size with this name or slug already exists.' using errcode='23505'; end if;
      if p_id is null then insert into public.catalog_ring_sizes(name,slug,status,display_order) values(v_name,v_slug,v_status::public.catalog_status,v_order) returning id into v_id;
      else update public.catalog_ring_sizes x set name=v_name,slug=v_slug,status=v_status::public.catalog_status,display_order=v_order,updated_at=now() where x.id=p_id and (x.name,x.slug,x.status,x.display_order) is distinct from (v_name,v_slug,v_status::public.catalog_status,v_order); v_id:=p_id; end if;
    when 'stone_shape' then
      if exists(select 1 from jsonb_object_keys(p_item) k where k <> all(array['name','slug','svg_asset_url','status','display_order'])) then raise exception 'Stone shape payload contains unsupported fields.' using errcode='22023'; end if;
      if v_slug='' then raise exception 'Slug is required.' using errcode='22023'; end if;
      if exists(select 1 from public.catalog_stone_shapes x where (lower(x.name)=lower(v_name) or x.slug=v_slug) and (p_id is null or x.id<>p_id)) then raise exception 'A stone shape with this name or slug already exists.' using errcode='23505'; end if;
      if p_id is null then insert into public.catalog_stone_shapes(name,slug,svg_asset_url,status,display_order) values(v_name,v_slug,nullif(trim(p_item->>'svg_asset_url'),''),v_status::public.catalog_status,v_order) returning id into v_id;
      else update public.catalog_stone_shapes x set name=v_name,slug=v_slug,svg_asset_url=nullif(trim(p_item->>'svg_asset_url'),''),status=v_status::public.catalog_status,display_order=v_order,updated_at=now() where x.id=p_id and (x.name,x.slug,x.svg_asset_url,x.status,x.display_order) is distinct from (v_name,v_slug,nullif(trim(p_item->>'svg_asset_url'),''),v_status::public.catalog_status,v_order); v_id:=p_id; end if;
    when 'style' then
      if exists(select 1 from jsonb_object_keys(p_item) k where k <> all(array['name','icon_svg_path','status','display_order'])) then raise exception 'Style payload contains unsupported fields.' using errcode='22023'; end if;
      if exists(select 1 from public.catalog_styles x where lower(x.name)=lower(v_name) and (p_id is null or x.id<>p_id)) then raise exception 'A style with this name already exists.' using errcode='23505'; end if;
      if p_id is null then
        v_slug:=lower(regexp_replace(regexp_replace(v_name,'[^a-zA-Z0-9]+','-','g'),'(^-|-$)','','g'));
        if v_slug='' then raise exception 'Name must contain letters or numbers.' using errcode='22023'; end if;
        insert into public.catalog_styles(name,slug,icon_svg_path,status,display_order) values(v_name,v_slug,nullif(trim(p_item->>'icon_svg_path'),''),v_status::public.catalog_status,v_order) returning id into v_id;
      else update public.catalog_styles x set name=v_name,icon_svg_path=nullif(trim(p_item->>'icon_svg_path'),''),status=v_status::public.catalog_status,display_order=v_order,updated_at=now() where x.id=p_id and (x.name,x.icon_svg_path,x.status,x.display_order) is distinct from (v_name,nullif(trim(p_item->>'icon_svg_path'),''),v_status::public.catalog_status,v_order); v_id:=p_id; end if;
    when 'content_rule' then
      if exists(select 1 from jsonb_object_keys(p_item) k where k <> all(array['kind','name','slug','title','body','status','display_order'])) then raise exception 'Content rule payload contains unsupported fields.' using errcode='22023'; end if;
      if coalesce(p_item->>'kind','') not in ('shipping','care_warranty') then raise exception 'Invalid content rule type.' using errcode='22023'; end if;
      if v_slug='' or trim(coalesce(p_item->>'title',''))='' or trim(coalesce(p_item->>'body',''))='' then raise exception 'Slug, title, and body are required.' using errcode='22023'; end if;
      if exists(select 1 from public.product_content_rules x where (lower(x.name)=lower(v_name) or x.slug=v_slug) and (p_id is null or x.id<>p_id)) then raise exception 'A content rule with this name or slug already exists.' using errcode='23505'; end if;
      if p_id is null then insert into public.product_content_rules(kind,name,slug,title,body,status,display_order) values((p_item->>'kind')::public.product_content_kind,v_name,v_slug,trim(p_item->>'title'),trim(p_item->>'body'),v_status::public.product_content_status,v_order) returning id into v_id;
      else update public.product_content_rules x set kind=(p_item->>'kind')::public.product_content_kind,name=v_name,slug=v_slug,title=trim(p_item->>'title'),body=trim(p_item->>'body'),status=v_status::public.product_content_status,display_order=v_order,updated_at=now() where x.id=p_id and (x.kind,x.name,x.slug,x.title,x.body,x.status,x.display_order) is distinct from ((p_item->>'kind')::public.product_content_kind,v_name,v_slug,trim(p_item->>'title'),trim(p_item->>'body'),v_status::public.product_content_status,v_order); v_id:=p_id; end if;
    else raise exception 'Unsupported catalog master type.' using errcode='22023';
  end case;

  v_result:=public.catalog_master_row_v1(p_kind,v_id);
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'catalog-master-save-'||p_kind,v_hash,v_result);
  return v_result;
exception
  when unique_violation then raise exception 'A record with the same name, code, or slug already exists.' using errcode='23505';
end;
$$;

create or replace function public.catalog_delete_master_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_revision text,
  p_kind text,
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_result jsonb;
  v_receipt public.cms_save_receipts%rowtype;
  v_hash text := md5(jsonb_build_object('kind',p_kind,'id',p_id,'expected_revision',p_expected_revision)::text);
  v_usage jsonb := '{}'::jsonb;
  v_total integer := 0;
  v_count integer;
begin
  if not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then raise exception 'Administrator access is required.' using errcode='42501'; end if;
  if p_request_id is null or p_id is null or p_expected_revision is null then raise exception 'Invalid catalog delete request.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-request:'||p_actor_id::text||':'||p_request_id::text,0));
  select * into v_receipt from public.cms_save_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then
    if v_receipt.operation <> 'catalog-master-delete-'||p_kind or v_receipt.payload_hash <> v_hash then raise exception 'This request ID was already used for a different delete.' using errcode='22023'; end if;
    return v_receipt.result;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-master:'||p_kind||':'||p_id::text,0));
  v_before:=public.catalog_master_row_v1(p_kind,p_id);
  if v_before->'item'='null'::jsonb then raise exception 'Catalog record not found.' using errcode='P0002'; end if;
  if v_before->>'revision'<>p_expected_revision then raise exception 'This record changed since you opened it. Reload before deleting.' using errcode='40001'; end if;

  case p_kind
    when 'gst_slab' then
      select count(*) into v_count from public.products x where x.gst_slab_id=p_id; v_usage:=v_usage||jsonb_build_object('products',v_count); v_total:=v_total+v_count;
      select count(*) into v_count from public.order_items x where x.gst_slab_id=p_id; v_usage:=v_usage||jsonb_build_object('order_items',v_count); v_total:=v_total+v_count;
      select count(*) into v_count from public.site_settings x where x.default_gst_slab_id=p_id; v_usage:=v_usage||jsonb_build_object('site_settings',v_count); v_total:=v_total+v_count;
    when 'certificate' then
      select count(*) into v_count from public.products x where coalesce(x.certificate_ids,'[]'::jsonb) @> jsonb_build_array(p_id::text); v_usage:=jsonb_build_object('products',v_count); v_total:=v_count;
    when 'material_value' then
      select count(*) into v_count from public.product_material_value_selections x where x.material_value_id=p_id; v_usage:=jsonb_build_object('product_selections',v_count); v_total:=v_count;
    when 'ring_size' then
      select count(*) into v_count from public.products x where coalesce(x.ring_size_ids,'[]'::jsonb) @> jsonb_build_array(p_id::text); v_usage:=jsonb_build_object('products',v_count); v_total:=v_count;
    when 'stone_shape' then
      select count(*) into v_count from public.product_stone_shapes x where x.shape_id=p_id; v_usage:=v_usage||jsonb_build_object('product_stone_shapes',v_count); v_total:=v_total+v_count;
      select count(*) into v_count from public.product_shape_selections x where x.shape_id=p_id; v_usage:=v_usage||jsonb_build_object('product_shape_selections',v_count); v_total:=v_total+v_count;
      select count(*) into v_count from public.discover_shapes_items x where x.shape_id=p_id; v_usage:=v_usage||jsonb_build_object('homepage_shape_cards',v_count); v_total:=v_total+v_count;
    when 'style' then select count(*) into v_count from public.products x where x.style_id=p_id; v_usage:=jsonb_build_object('products',v_count); v_total:=v_count;
    when 'content_rule' then
      select count(*) into v_count from public.products x where x.shipping_rule_id=p_id; v_usage:=v_usage||jsonb_build_object('shipping_products',v_count); v_total:=v_total+v_count;
      select count(*) into v_count from public.products x where x.care_warranty_rule_id=p_id; v_usage:=v_usage||jsonb_build_object('care_warranty_products',v_count); v_total:=v_total+v_count;
    else raise exception 'Unsupported catalog master type.' using errcode='22023';
  end case;
  if v_total>0 then raise exception 'This record is used in % place(s). Hide it instead of deleting it. Usage: %',v_total,v_usage::text using errcode='P0001'; end if;

  case p_kind
    when 'gst_slab' then delete from public.catalog_gst_slabs x where x.id=p_id;
    when 'certificate' then delete from public.catalog_certificates x where x.id=p_id;
    when 'material_value' then delete from public.catalog_material_values x where x.id=p_id;
    when 'ring_size' then delete from public.catalog_ring_sizes x where x.id=p_id;
    when 'stone_shape' then delete from public.catalog_stone_shapes x where x.id=p_id;
    when 'style' then delete from public.catalog_styles x where x.id=p_id;
    when 'content_rule' then delete from public.product_content_rules x where x.id=p_id;
  end case;
  v_result:=jsonb_build_object('ok',true,'id',p_id,'usage',v_usage);
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'catalog-master-delete-'||p_kind,v_hash,v_result);
  return v_result;
end;
$$;

revoke all on function public.catalog_master_row_v1(text,uuid) from public,anon,authenticated;
revoke all on function public.catalog_master_list_v1(text) from public,anon,authenticated;
revoke all on function public.catalog_save_master_v1(uuid,uuid,text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.catalog_delete_master_v1(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.catalog_master_row_v1(text,uuid) to service_role;
grant execute on function public.catalog_master_list_v1(text) to service_role;
grant execute on function public.catalog_save_master_v1(uuid,uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.catalog_delete_master_v1(uuid,uuid,text,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
