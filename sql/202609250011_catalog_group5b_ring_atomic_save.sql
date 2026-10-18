begin;

create or replace function public.catalog_ring_snapshot_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_categories jsonb;
  v_sizes jsonb;
  v_state jsonb;
begin
  select coalesce(jsonb_agg((to_jsonb(x)-'created_at'-'updated_at') || jsonb_build_object('_revision', md5(to_jsonb(x)::text)) order by x.display_order, x.name, x.id), '[]'::jsonb) into v_categories from public.catalog_ring_categories x;
  select coalesce(jsonb_agg((to_jsonb(x)-'created_at'-'updated_at') || jsonb_build_object('_revision', md5(to_jsonb(x)::text)) order by x.ring_category_id, x.display_order, x.size_label, x.id), '[]'::jsonb) into v_sizes from public.catalog_ring_category_sizes x;
  v_state:=jsonb_build_object('categories',v_categories,'sizes',v_sizes);
  return v_state || jsonb_build_object('revision',md5(v_state::text));
end;
$$;

create or replace function public.catalog_ring_save_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_revision text,
  p_categories jsonb,
  p_sizes jsonb,
  p_deleted_category_ids text[] default '{}',
  p_deleted_size_ids text[] default '{}'
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
  v_hash text:=md5(jsonb_build_object('expected_revision',p_expected_revision,'categories',p_categories,'sizes',p_sizes,'deleted_category_ids',p_deleted_category_ids,'deleted_size_ids',p_deleted_size_ids)::text);
  v_item jsonb;
  v_id uuid;
  v_category_id uuid;
  v_existing_id uuid;
  v_name text;
  v_slug text;
  v_label text;
  v_order integer;
  v_status text;
  v_count integer;
begin
  if not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then raise exception 'Administrator access is required.' using errcode='42501'; end if;
  if p_request_id is null or p_expected_revision is null or jsonb_typeof(p_categories)<>'array' or jsonb_typeof(p_sizes)<>'array' then raise exception 'Invalid ring catalog save request.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-request:'||p_actor_id::text||':'||p_request_id::text,0));
  select * into v_receipt from public.cms_save_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then
    if v_receipt.operation<>'catalog-ring-save' or v_receipt.payload_hash<>v_hash then raise exception 'This request ID was already used for a different ring save.' using errcode='22023'; end if;
    return v_receipt.result;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-ring-state',0));
  v_before:=public.catalog_ring_snapshot_v1();
  if v_before->>'revision'<>p_expected_revision then raise exception 'The ring catalog changed since you opened it. Reload before saving.' using errcode='40001'; end if;

  if exists(select 1 from jsonb_array_elements(p_categories) x where jsonb_typeof(x)<>'object' or exists(select 1 from jsonb_object_keys(x) k where k<>all(array['id','name','slug','description','display_order','status','_revision']))) then raise exception 'Ring category payload contains unsupported fields.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_sizes) x where jsonb_typeof(x)<>'object' or exists(select 1 from jsonb_object_keys(x) k where k<>all(array['id','ring_category_id','size_label','size_value','display_order','status','_revision']))) then raise exception 'Ring size payload contains unsupported fields.' using errcode='22023'; end if;
  if coalesce(array_length(p_deleted_category_ids,1),0) <> (select count(*) from (select distinct x from unnest(coalesce(p_deleted_category_ids,'{}')) x) q) then raise exception 'Duplicate deleted category IDs are not allowed.' using errcode='22023'; end if;
  if coalesce(array_length(p_deleted_size_ids,1),0) <> (select count(*) from (select distinct x from unnest(coalesce(p_deleted_size_ids,'{}')) x) q) then raise exception 'Duplicate deleted size IDs are not allowed.' using errcode='22023'; end if;
  if exists(select 1 from unnest(coalesce(p_deleted_category_ids,'{}')) d where not exists(select 1 from public.catalog_ring_categories x where x.id::text=d)) then raise exception 'A deleted ring category does not exist.' using errcode='P0002'; end if;
  if exists(select 1 from unnest(coalesce(p_deleted_size_ids,'{}')) d where not exists(select 1 from public.catalog_ring_category_sizes x where x.id::text=d)) then raise exception 'A deleted ring size does not exist.' using errcode='P0002'; end if;

  if exists(select 1 from public.catalog_ring_categories x where not(x.id::text=any(coalesce(p_deleted_category_ids,'{}'))) and not exists(select 1 from jsonb_array_elements(p_categories) i where i->>'id'=x.id::text)) then raise exception 'Ring categories may only be removed explicitly.' using errcode='22023'; end if;
  if exists(select 1 from public.catalog_ring_category_sizes x where not(x.id::text=any(coalesce(p_deleted_size_ids,'{}'))) and not exists(select 1 from jsonb_array_elements(p_sizes) i where i->>'id'=x.id::text)) then raise exception 'Ring sizes may only be removed explicitly.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_categories) i where nullif(i->>'id','') is not null and i->>'id'=any(coalesce(p_deleted_category_ids,'{}'))) then raise exception 'A category cannot be retained and deleted.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_sizes) i where nullif(i->>'id','') is not null and i->>'id'=any(coalesce(p_deleted_size_ids,'{}'))) then raise exception 'A size cannot be retained and deleted.' using errcode='22023'; end if;

  for v_item in select * from jsonb_array_elements(p_categories) loop
    v_name:=trim(coalesce(v_item->>'name','')); v_slug:=lower(regexp_replace(regexp_replace(trim(coalesce(v_item->>'slug','')),'[^a-zA-Z0-9]+','-','g'),'(^-|-$)','','g')); v_status:=coalesce(v_item->>'status','active');
    begin v_order:=coalesce((v_item->>'display_order')::integer,0); exception when others then raise exception 'Ring category display order must be a whole number.' using errcode='22023'; end;
    if v_name='' or v_slug='' then raise exception 'Ring category name and slug are required.' using errcode='22023'; end if;
    if v_status not in ('active','hidden') or v_order<0 or v_order>1000000 then raise exception 'Invalid ring category status or display order.' using errcode='22023'; end if;
    if nullif(v_item->>'id','') is null then
      if exists(select 1 from public.catalog_ring_categories x where lower(x.name)=lower(v_name) or x.slug=v_slug) then raise exception 'A ring category with this name or slug already exists.' using errcode='23505'; end if;
      insert into public.catalog_ring_categories(name,slug,description,display_order,status) values(v_name,v_slug,nullif(trim(v_item->>'description'),''),v_order,v_status) returning id into v_id;
    else
      v_id:=(v_item->>'id')::uuid;
      if not exists(select 1 from public.catalog_ring_categories x where x.id=v_id) then raise exception 'Ring category not found.' using errcode='P0002'; end if;
      if exists(select 1 from public.catalog_ring_categories x where x.id<>v_id and (lower(x.name)=lower(v_name) or x.slug=v_slug)) then raise exception 'A ring category with this name or slug already exists.' using errcode='23505'; end if;
      update public.catalog_ring_categories x set name=v_name,slug=v_slug,description=nullif(trim(v_item->>'description'),''),display_order=v_order,status=v_status,updated_at=now() where x.id=v_id and (x.name,x.slug,x.description,x.display_order,x.status) is distinct from (v_name,v_slug,nullif(trim(v_item->>'description'),''),v_order,v_status);
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(p_sizes) loop
    v_label:=trim(coalesce(v_item->>'size_label','')); v_status:=coalesce(v_item->>'status','active'); v_category_id:=nullif(v_item->>'ring_category_id','')::uuid;
    begin v_order:=coalesce((v_item->>'display_order')::integer,0); exception when others then raise exception 'Ring size display order must be a whole number.' using errcode='22023'; end;
    if v_label='' or v_category_id is null or v_status not in ('active','hidden') or v_order<0 or v_order>1000000 then raise exception 'Invalid ring size details.' using errcode='22023'; end if;
    if not exists(select 1 from public.catalog_ring_categories x where x.id=v_category_id) then raise exception 'Every ring size must belong to an existing category.' using errcode='23503'; end if;
    if nullif(v_item->>'id','') is null then
      if exists(select 1 from public.catalog_ring_category_sizes x where x.ring_category_id=v_category_id and lower(x.size_label)=lower(v_label)) then raise exception 'A size with this label already exists in this ring category.' using errcode='23505'; end if;
      insert into public.catalog_ring_category_sizes(ring_category_id,size_label,size_value,display_order,status) values(v_category_id,v_label,nullif(trim(v_item->>'size_value'),''),v_order,v_status) returning id into v_id;
    else
      v_id:=(v_item->>'id')::uuid;
      if not exists(select 1 from public.catalog_ring_category_sizes x where x.id=v_id) then raise exception 'Ring size not found.' using errcode='P0002'; end if;
      if exists(select 1 from public.catalog_ring_category_sizes x where x.id<>v_id and x.ring_category_id=v_category_id and lower(x.size_label)=lower(v_label)) then raise exception 'A size with this label already exists in this ring category.' using errcode='23505'; end if;
      update public.catalog_ring_category_sizes x set ring_category_id=v_category_id,size_label=v_label,size_value=nullif(trim(v_item->>'size_value'),''),display_order=v_order,status=v_status,updated_at=now() where x.id=v_id and (x.ring_category_id,x.size_label,x.size_value,x.display_order,x.status) is distinct from (v_category_id,v_label,nullif(trim(v_item->>'size_value'),''),v_order,v_status);
    end if;
  end loop;

  if exists(select 1 from public.catalog_ring_categories x where x.id::text=any(coalesce(p_deleted_category_ids,'{}')) and exists(select 1 from public.products p where p.ring_category_id=x.id)) then raise exception 'A ring category is used by products. Hide it instead of deleting it.' using errcode='P0001'; end if;
  if exists(select 1 from public.catalog_ring_category_sizes x where x.id::text=any(coalesce(p_deleted_size_ids,'{}'))) then delete from public.catalog_ring_category_sizes x where x.id::text=any(coalesce(p_deleted_size_ids,'{}')); end if;
  if exists(select 1 from public.catalog_ring_category_sizes x where x.ring_category_id::text=any(coalesce(p_deleted_category_ids,'{}'))) then raise exception 'Delete the category sizes explicitly before deleting their ring category.' using errcode='P0001'; end if;
  delete from public.catalog_ring_categories x where x.id::text=any(coalesce(p_deleted_category_ids,'{}'));
  v_result:=public.catalog_ring_snapshot_v1();
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'catalog-ring-save',v_hash,v_result);
  return v_result;
exception when unique_violation then raise exception 'A ring category or size with the same name, slug, or label already exists.' using errcode='23505';
end;
$$;

revoke all on function public.catalog_ring_snapshot_v1() from public,anon,authenticated;
revoke all on function public.catalog_ring_save_v1(uuid,uuid,text,jsonb,jsonb,text[],text[]) from public,anon,authenticated;
grant execute on function public.catalog_ring_snapshot_v1() to service_role;
grant execute on function public.catalog_ring_save_v1(uuid,uuid,text,jsonb,jsonb,text[],text[]) to service_role;
notify pgrst,'reload schema';
commit;
