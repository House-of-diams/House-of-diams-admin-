begin;

-- Atomically update one product's stock and append its adjustment record.
-- Existing products and adjustment rows are not rewritten by this migration.
create or replace function public.admin_inventory_set_stock_v1(
  p_actor_id uuid,
  p_product_id uuid,
  p_expected_stock integer,
  p_new_stock integer,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_current_stock integer;
  v_updated_at timestamptz;
begin
  if p_actor_id is null
     or not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then
    raise exception 'Administrator access is required.' using errcode='42501';
  end if;
  if p_product_id is null or p_expected_stock is null or p_new_stock is null
     or p_expected_stock < 0 or p_new_stock < 0
     or p_expected_stock > 1000000000 or p_new_stock > 1000000000 then
    raise exception 'Invalid inventory update.' using errcode='22023';
  end if;

  -- Serialize changes per product and compare against the editor's last value.
  perform pg_advisory_xact_lock(hashtextextended('inventory-product:'||p_product_id::text,0));
  select coalesce(p.stock_quantity,0),p.updated_at
    into v_current_stock,v_updated_at
    from public.products p
    where p.id=p_product_id
    for update;
  if not found then
    raise exception 'Product not found.' using errcode='P0002';
  end if;
  if v_current_stock<>p_expected_stock then
    raise exception 'This stock level changed after you opened it. Reload before saving.' using errcode='40001';
  end if;

  if v_current_stock=p_new_stock then
    return jsonb_build_object('product_id',p_product_id,'stock_quantity',v_current_stock,'updated_at',v_updated_at,'unchanged',true);
  end if;

  update public.products p
     set stock_quantity=p_new_stock,
         updated_at=now()
   where p.id=p_product_id
   returning p.updated_at into v_updated_at;

  insert into public.inventory_adjustments(
    product_id,adjustment_type,quantity_change,previous_stock,new_stock,notes
  ) values (
    p_product_id,'manual_set',p_new_stock-v_current_stock,v_current_stock,p_new_stock,
    coalesce(nullif(trim(p_notes),''),'Stock updated from inventory admin.')
  );

  return jsonb_build_object('product_id',p_product_id,'stock_quantity',p_new_stock,'updated_at',v_updated_at,'unchanged',false);
end;
$$;

revoke all on function public.admin_inventory_set_stock_v1(uuid,uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function public.admin_inventory_set_stock_v1(uuid,uuid,integer,integer,text) to service_role;
notify pgrst,'reload schema';

commit;
