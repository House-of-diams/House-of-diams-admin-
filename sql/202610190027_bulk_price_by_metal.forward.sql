-- HOD-006: bulk price changes apply to the chosen metals' variant prices, which are
-- what the storefront shows and charges. Adds admin_product_bulk_price_v2; v1 stays
-- installed and unchanged. Apply to UAT first, as hod_migration, after an RDS snapshot.
-- Rollback: 202610190027_bulk_price_by_metal.rollback.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $guard$
begin
  if current_user <> 'hod_migration' then raise exception 'Run as hod_migration'; end if;
  if to_regprocedure('public.admin_product_bulk_price_v2(uuid,uuid,text,text,numeric,uuid[],uuid[],jsonb)') is not null then
    raise exception 'admin_product_bulk_price_v2 already exists; inspect before replaying';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hod_admin_app') then
    raise exception 'hod_admin_app role is missing';
  end if;
end $guard$;

create function public.admin_product_bulk_price_v2(
  p_actor_id uuid, p_request_id uuid, p_lane text, p_operation text, p_value numeric,
  p_ids uuid[], p_metal_ids uuid[], p_expected_prices jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
-- p_expected_prices: [{"variant_id": uuid, "price": number}] for every variant of
-- p_ids x p_metal_ids, exactly as shown in the admin preview.
-- New prices are rounded to whole currency units. A product whose default variant
-- changes gets base_price set to that variant's new price.
declare
  v_receipt public.cms_save_receipts%rowtype;
  v_hash text;
  v_result jsonb;
  v_items jsonb;
  v_skipped jsonb;
  v_expected_count int;
  v_found_count int;
begin
  if p_actor_id is null or p_request_id is null
     or not exists(select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin') then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_lane not in ('standard','hiphop','collection')
     or p_operation not in ('increase_amount','decrease_amount','increase_percent','decrease_percent')
     or p_value is null or p_value <= 0 or p_value > 1000000000
     or (p_operation like '%_percent' and p_value > 1000)
     or (p_operation = 'decrease_percent' and p_value >= 100)
     or coalesce(cardinality(p_ids), 0) not between 1 and 500
     or cardinality(p_ids) <> cardinality(array(select distinct x from unnest(p_ids) x))
     or coalesce(cardinality(p_metal_ids), 0) not between 1 and 50
     or cardinality(p_metal_ids) <> cardinality(array(select distinct x from unnest(p_metal_ids) x))
     or jsonb_typeof(p_expected_prices) is distinct from 'array' then
    raise exception 'Invalid bulk price request.' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_expected_prices) x
            where coalesce(x->>'variant_id','') !~ '^[0-9a-fA-F-]{36}$' or coalesce(x->>'price','') !~ '^[0-9]+(\.[0-9]+)?$')
     or exists(select 1 from jsonb_array_elements(p_expected_prices) x group by x->>'variant_id' having count(*) > 1) then
    raise exception 'Invalid price verification data.' using errcode = '22023';
  end if;
  if (select count(*) from public.catalog_metals m where m.id = any(p_metal_ids)) <> cardinality(p_metal_ids) then
    raise exception 'A selected metal was not found.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('product-operation-request:'||p_actor_id||':'||p_request_id, 0));
  v_hash := md5(jsonb_build_object('lane',p_lane,'operation',p_operation,'value',p_value,'ids',p_ids,
    'metals',p_metal_ids,'expected',p_expected_prices)::text);
  select r.* into v_receipt from public.cms_save_receipts r where r.actor_id = p_actor_id and r.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'product-bulk-price-v2' or v_receipt.payload_hash <> v_hash then
      raise exception 'This request ID was already used.' using errcode = '40001';
    end if;
    return v_receipt.result;
  end if;

  -- Lock products, then their variants, in one stable order.
  perform 1 from public.products p where p.id = any(p_ids) order by p.id for update;
  if (select count(*) from public.products p where p.id = any(p_ids)) <> cardinality(p_ids) then
    raise exception 'A product was not found.' using errcode = 'P0002';
  end if;
  if exists(select 1 from public.products p where p.id = any(p_ids) and coalesce(p.product_lane,'standard') <> p_lane) then
    raise exception 'A product is outside this lane.' using errcode = '40001';
  end if;
  perform 1 from public.product_metal_variants v
   where v.product_id = any(p_ids) and v.metal_id = any(p_metal_ids) order by v.id for update;

  -- The preview must match the current variant set and prices exactly.
  select count(*) into v_found_count from public.product_metal_variants v
   where v.product_id = any(p_ids) and v.metal_id = any(p_metal_ids);
  v_expected_count := jsonb_array_length(p_expected_prices);
  if v_found_count = 0 then
    raise exception 'None of the selected products has the selected metals.' using errcode = '22023';
  end if;
  if v_found_count <> v_expected_count or exists(
    select 1 from public.product_metal_variants v
      left join jsonb_array_elements(p_expected_prices) x on x->>'variant_id' = v.id::text
     where v.product_id = any(p_ids) and v.metal_id = any(p_metal_ids)
       and (x.value is null or v.price is null or round(v.price::numeric, 2) <> round((x.value->>'price')::numeric, 2))
  ) then
    raise exception 'A price changed since the preview. Reload and try again.' using errcode = '40001';
  end if;

  if exists(
    select 1 from public.product_metal_variants v
     where v.product_id = any(p_ids) and v.metal_id = any(p_metal_ids)
       and round(case when p_operation = 'increase_amount' then v.price + p_value
                      when p_operation = 'decrease_amount' then v.price - p_value
                      when p_operation = 'increase_percent' then v.price + (v.price * p_value / 100)
                      else v.price - (v.price * p_value / 100) end, 0) not between 1 and 1000000000
  ) then
    raise exception 'The adjustment would create an invalid price.' using errcode = '22023';
  end if;

  with updated as (
    update public.product_metal_variants v set
      price = round(case when p_operation = 'increase_amount' then v.price + p_value
                         when p_operation = 'decrease_amount' then v.price - p_value
                         when p_operation = 'increase_percent' then v.price + (v.price * p_value / 100)
                         else v.price - (v.price * p_value / 100) end, 0),
      updated_at = now()
    where v.product_id = any(p_ids) and v.metal_id = any(p_metal_ids)
    returning v.id, v.product_id, v.metal_id, v.price, v.is_default
  ), synced as (
    update public.products p set base_price = u.price, updated_at = now()
      from updated u
     where u.is_default and p.id = u.product_id
    returning p.id
  )
  select coalesce(jsonb_agg(jsonb_build_object('variantId', u.id, 'productId', u.product_id, 'metalId', u.metal_id,
           'price', u.price, 'isDefault', u.is_default) order by u.product_id, u.metal_id), '[]'::jsonb)
    into v_items from updated u;

  select coalesce(jsonb_agg(i order by i), '[]'::jsonb) into v_skipped
    from unnest(p_ids) i
   where not exists(select 1 from public.product_metal_variants v where v.product_id = i and v.metal_id = any(p_metal_ids));

  v_result := jsonb_build_object('ok', true, 'updatedCount', jsonb_array_length(v_items),
    'skippedProductIds', v_skipped, 'items', v_items);
  insert into public.cms_save_receipts(actor_id, request_id, operation, payload_hash, result)
  values (p_actor_id, p_request_id, 'product-bulk-price-v2', v_hash, v_result);
  return v_result;
end;
$function$;

revoke all on function public.admin_product_bulk_price_v2(uuid,uuid,text,text,numeric,uuid[],uuid[],jsonb) from public;
grant execute on function public.admin_product_bulk_price_v2(uuid,uuid,text,text,numeric,uuid[],uuid[],jsonb) to hod_admin_app;

commit;
