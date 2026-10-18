begin;

do $migration$
declare
  v_definition text;
  v_marker text := '  delete from public.product_metal_selections where product_id = v_product_id;';
  v_compatibility_write text := $compatibility$
  -- Older deployments do not yet have this column. Preserve the previous route
  -- behavior: write it when present, while keeping saves compatible when absent.
  if exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.products'::regclass
      and attname = 'gemstone_value'
      and not attisdropped
  ) then
    execute 'update public.products set gemstone_value = $1 where id = $2'
      using p_payload->>'gemstone_value', v_product_id;
  end if;

$compatibility$;
begin
  select pg_get_functiondef('public.admin_product_save_v1(uuid,uuid,text,jsonb)'::regprocedure)
  into v_definition;

  if position('attname = ''gemstone_value''' in v_definition) = 0 then
    if position(v_marker in v_definition) = 0 then
      raise exception 'Unable to locate the product-save compatibility insertion point.';
    end if;
    v_definition := replace(v_definition, v_marker, v_compatibility_write || v_marker);
    execute v_definition;
  end if;
end
$migration$;

notify pgrst, 'reload schema';
commit;
