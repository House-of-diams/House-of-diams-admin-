begin;

-- Atomic, idempotent product-list operations. This migration creates functions only;
-- it does not modify existing product rows when applied.
create table if not exists public.cms_save_receipts (
  actor_id uuid not null,
  request_id uuid not null,
  operation text not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id,request_id)
);
alter table public.cms_save_receipts enable row level security;
revoke all on table public.cms_save_receipts from public,anon,authenticated;
grant select,insert,update,delete on table public.cms_save_receipts to service_role;

create or replace function public.admin_product_bulk_price_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_lane text,
  p_operation text,
  p_value numeric,
  p_ids uuid[],
  p_expected_prices jsonb
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_receipt public.cms_save_receipts%rowtype;
  v_hash text;
  v_result jsonb;
  v_items jsonb;
begin
  if p_actor_id is null or p_request_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then
    raise exception 'Administrator access is required.' using errcode='42501';
  end if;
  if p_lane not in ('standard','hiphop','collection') or p_operation not in ('increase_amount','decrease_amount','increase_percent','decrease_percent')
     or p_value is null or p_value<=0 or p_value>1000000000
     or (p_operation like '%_percent' and p_value>1000)
     or (p_operation='decrease_percent' and p_value>=100)
     or coalesce(cardinality(p_ids),0) not between 1 and 500
     or cardinality(p_ids)<>cardinality(array(select distinct x from unnest(p_ids)x))
     or jsonb_typeof(p_expected_prices) is distinct from 'array'
     or jsonb_array_length(p_expected_prices)<>cardinality(p_ids) then
    raise exception 'Invalid bulk price request.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_expected_prices)x where coalesce(x->>'id','')!~'^[0-9a-fA-F-]{36}$' or coalesce(x->>'price','')!~'^[0-9]+(\.[0-9]+)?$')
     or exists(select 1 from jsonb_array_elements(p_expected_prices)x group by x->>'id' having count(*)>1)
     or exists(select 1 from unnest(p_ids)i where not exists(select 1 from jsonb_array_elements(p_expected_prices)x where x->>'id'=i::text)) then
    raise exception 'Invalid price verification data.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('product-operation-request:'||p_actor_id||':'||p_request_id,0));
  v_hash:=md5(jsonb_build_object('lane',p_lane,'operation',p_operation,'value',p_value,'ids',p_ids,'expected',p_expected_prices)::text);
  select r.* into v_receipt from public.cms_save_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then
    if v_receipt.operation<>'product-bulk-price-v1' or v_receipt.payload_hash<>v_hash then raise exception 'This request ID was already used.' using errcode='40001';end if;
    return v_receipt.result;
  end if;

  perform 1 from public.products p where p.id=any(p_ids) order by p.id for update;
  if (select count(*) from public.products p where p.id=any(p_ids))<>cardinality(p_ids) then raise exception 'A product was not found.' using errcode='P0002';end if;
  if exists(select 1 from public.products p where p.id=any(p_ids) and coalesce(p.product_lane,'standard')<>p_lane) then raise exception 'A product is outside this lane.' using errcode='40001';end if;
  if exists(
    select 1 from public.products p join jsonb_array_elements(p_expected_prices)x on x->>'id'=p.id::text
    where p.id=any(p_ids) and (p.base_price is null or p.base_price<=0 or round(p.base_price::numeric,2)<>round((x->>'price')::numeric,2))
  ) then raise exception 'A product price changed.' using errcode='40001';end if;
  if exists(
    select 1 from public.products p where p.id=any(p_ids) and (
      case when p_operation='increase_amount' then p.base_price+p_value
           when p_operation='decrease_amount' then p.base_price-p_value
           when p_operation='increase_percent' then p.base_price+(p.base_price*p_value/100)
           else p.base_price-(p.base_price*p_value/100) end
    ) not between 0.01 and 1000000000
  ) then raise exception 'The adjustment would create an invalid price.' using errcode='22023';end if;

  with updated as (
    update public.products p set
      base_price=round(case when p_operation='increase_amount' then p.base_price+p_value
                            when p_operation='decrease_amount' then p.base_price-p_value
                            when p_operation='increase_percent' then p.base_price+(p.base_price*p_value/100)
                            else p.base_price-(p.base_price*p_value/100) end,2),
      updated_at=now()
    where p.id=any(p_ids)
    returning p.id,p.base_price
  ) select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'price',u.base_price) order by u.id),'[]'::jsonb) into v_items from updated u;
  v_result:=jsonb_build_object('ok',true,'updatedCount',jsonb_array_length(v_items),'items',v_items);
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'product-bulk-price-v1',v_hash,v_result);
  return v_result;
end; $$;

create or replace function public.admin_product_activate_drafts_v1(p_actor_id uuid,p_request_id uuid,p_lane text,p_ids uuid[])
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_receipt public.cms_save_receipts%rowtype;v_hash text;v_result jsonb;v_items jsonb;
begin
  if p_actor_id is null or p_request_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then raise exception 'Administrator access is required.' using errcode='42501';end if;
  if p_lane not in ('standard','hiphop','collection') or coalesce(cardinality(p_ids),0) not between 1 and 500 or cardinality(p_ids)<>cardinality(array(select distinct x from unnest(p_ids)x)) then raise exception 'Invalid draft activation request.' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('product-operation-request:'||p_actor_id||':'||p_request_id,0));
  v_hash:=md5(jsonb_build_object('lane',p_lane,'ids',p_ids)::text);
  select r.* into v_receipt from public.cms_save_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then if v_receipt.operation<>'product-activate-drafts-v1' or v_receipt.payload_hash<>v_hash then raise exception 'This request ID was already used.' using errcode='40001';end if;return v_receipt.result;end if;
  perform 1 from public.products p where p.id=any(p_ids) order by p.id for update;
  if (select count(*) from public.products p where p.id=any(p_ids))<>cardinality(p_ids) then raise exception 'A product was not found.' using errcode='P0002';end if;
  if exists(select 1 from public.products p where p.id=any(p_ids) and (coalesce(p.product_lane,'standard')<>p_lane or p.status<>'draft')) then raise exception 'A product is no longer an eligible draft.' using errcode='40001';end if;
  with updated as (update public.products p set status='active',updated_at=now() where p.id=any(p_ids) returning p.id,p.status)
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'status',u.status) order by u.id),'[]'::jsonb) into v_items from updated u;
  v_result:=jsonb_build_object('activatedCount',jsonb_array_length(v_items),'items',v_items);
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'product-activate-drafts-v1',v_hash,v_result);
  return v_result;
end; $$;

create or replace function public.admin_product_bulk_delete_v1(p_actor_id uuid,p_request_id uuid,p_lane text,p_ids uuid[])
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_receipt public.cms_save_receipts%rowtype;v_hash text;v_result jsonb;v_items jsonb;
begin
  if p_actor_id is null or p_request_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then raise exception 'Administrator access is required.' using errcode='42501';end if;
  if p_lane not in ('standard','hiphop','collection') or coalesce(cardinality(p_ids),0) not between 1 and 500 or cardinality(p_ids)<>cardinality(array(select distinct x from unnest(p_ids)x)) then raise exception 'Invalid bulk deletion request.' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('product-operation-request:'||p_actor_id||':'||p_request_id,0));
  v_hash:=md5(jsonb_build_object('lane',p_lane,'ids',p_ids)::text);
  select r.* into v_receipt from public.cms_save_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then if v_receipt.operation<>'product-bulk-delete-v1' or v_receipt.payload_hash<>v_hash then raise exception 'This request ID was already used.' using errcode='40001';end if;return v_receipt.result;end if;
  perform 1 from public.products p where p.id=any(p_ids) order by p.id for update;
  if (select count(*) from public.products p where p.id=any(p_ids))<>cardinality(p_ids) then raise exception 'A product was not found.' using errcode='P0002';end if;
  if exists(select 1 from public.products p where p.id=any(p_ids) and coalesce(p.product_lane,'standard')<>p_lane) then raise exception 'A product is outside this lane.' using errcode='40001';end if;
  with deleted as (delete from public.products p where p.id=any(p_ids) returning p.id)
  select coalesce(jsonb_agg(to_jsonb(d.id) order by d.id),'[]'::jsonb) into v_items from deleted d;
  v_result:=jsonb_build_object('ok',true,'deletedCount',jsonb_array_length(v_items),'ids',v_items);
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'product-bulk-delete-v1',v_hash,v_result);
  return v_result;
end; $$;

revoke all on function public.admin_product_bulk_price_v1(uuid,uuid,text,text,numeric,uuid[],jsonb) from public,anon,authenticated;
revoke all on function public.admin_product_activate_drafts_v1(uuid,uuid,text,uuid[]) from public,anon,authenticated;
revoke all on function public.admin_product_bulk_delete_v1(uuid,uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.admin_product_bulk_price_v1(uuid,uuid,text,text,numeric,uuid[],jsonb) to service_role;
grant execute on function public.admin_product_activate_drafts_v1(uuid,uuid,text,uuid[]) to service_role;
grant execute on function public.admin_product_bulk_delete_v1(uuid,uuid,text,uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
