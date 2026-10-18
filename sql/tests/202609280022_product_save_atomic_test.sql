-- Run only after 202609280022_product_save_atomic.sql in a non-production verification session.
-- The outer transaction always rolls back the successful preservation scenario.
begin;

create or replace function pg_temp.product_save_payload(p_id uuid)
returns jsonb language sql stable as $$
  select to_jsonb(p) || jsonb_build_object(
    'metal_ids', coalesce((select jsonb_agg(s.metal_id order by s.sort_order) from public.product_metal_selections s where s.product_id=p.id),'[]'::jsonb),
    'shape_ids', coalesce((select jsonb_agg(s.shape_id order by s.id) from public.product_stone_shapes s where s.product_id=p.id),'[]'::jsonb),
    'material_value_ids', coalesce((select jsonb_agg(s.material_value_id order by s.sort_order) from public.product_material_value_selections s where s.product_id=p.id),'[]'::jsonb),
    'linked_subcategory_ids', coalesce((select jsonb_agg(s.subcategory_id order by s.sort_order) from public.product_subcategory_links s where s.product_id=p.id and not s.is_primary),'[]'::jsonb),
    'linked_option_ids', coalesce((select jsonb_agg(s.option_id order by s.sort_order) from public.product_option_links s where s.product_id=p.id and not s.is_primary),'[]'::jsonb),
    'purity_prices', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order,x.id) from public.product_purity_prices x where x.product_id=p.id),'[]'::jsonb),
    'metal_media', coalesce((select jsonb_agg(to_jsonb(x) order by x.metal_id) from public.product_metal_media x where x.product_id=p.id),'[]'::jsonb),
    'metal_variants', coalesce((select jsonb_agg(to_jsonb(v) || jsonb_build_object('media_items',coalesce((select jsonb_agg(to_jsonb(m) order by m.sort_order,m.id) from public.product_variant_media_items m where m.variant_id=v.id),'[]'::jsonb)) order by v.sort_order,v.id) from public.product_metal_variants v where v.product_id=p.id),'[]'::jsonb),
    'default_variant_media_items', coalesce((select jsonb_agg(to_jsonb(m) order by m.sort_order,m.id) from public.product_variant_media_items m where m.product_id=p.id and m.variant_id is null),'[]'::jsonb),
    'faq_items', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order,x.id) from public.product_faq_items x where x.product_id=p.id),'[]'::jsonb),
    'custom_dropdowns', coalesce((select jsonb_agg(to_jsonb(d) || jsonb_build_object('options',coalesce((select jsonb_agg(to_jsonb(o) order by o.display_order,o.id) from public.product_custom_dropdown_options o where o.dropdown_id=d.id),'[]'::jsonb)) order by d.display_order,d.id) from public.product_custom_dropdowns d where d.product_id=p.id),'[]'::jsonb)
  )
  from public.products p where p.id=p_id
$$;

create or replace function pg_temp.product_save_state(p_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'product',(select to_jsonb(p) from public.products p where p.id=p_id),
    'metals',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.product_metal_selections x where x.product_id=p_id),
    'shapes',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.product_stone_shapes x where x.product_id=p_id),
    'materials',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.product_material_value_selections x where x.product_id=p_id),
    'subcategories',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.product_subcategory_links x where x.product_id=p_id),
    'options',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.product_option_links x where x.product_id=p_id),
    'purity',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.product_purity_prices x where x.product_id=p_id),
    'metal_media',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.product_metal_media x where x.product_id=p_id),
    'variants',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.product_metal_variants x where x.product_id=p_id),
    'variant_media',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.product_variant_media_items x where x.product_id=p_id),
    'faqs',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.product_faq_items x where x.product_id=p_id),
    'dropdowns',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.product_custom_dropdowns x where x.product_id=p_id),
    'dropdown_options',(select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb) from public.product_custom_dropdown_options o join public.product_custom_dropdowns d on d.id=o.dropdown_id where d.product_id=p_id)
  )
$$;

do $$
declare
  v_actor uuid;
  v_product_a uuid;
  v_product_b uuid;
  v_shape uuid;
  v_payload jsonb;
  v_before jsonb;
  v_after jsonb;
  v_gemstone text;
  v_slug text := 'atomic-rollback-' || replace(gen_random_uuid()::text,'-','');
begin
  select id into v_actor from public.profiles where role='admin' order by id limit 1;
  select id into v_product_a from public.products order by created_at limit 1;
  select id into v_product_b from public.products where id<>v_product_a order by created_at limit 1;
  select id into v_shape from public.catalog_stone_shapes order by id limit 1;
  if v_actor is null or v_product_a is null or v_product_b is null or v_shape is null then
    raise exception 'Atomic product-save tests require an admin, two products, and one stone-shape master.';
  end if;

  v_payload := pg_temp.product_save_payload(v_product_a);

  -- CREATE rollback: the products row is inserted before the invalid shape FK fails.
  begin
    perform public.admin_product_save_v1(v_actor,null,v_slug,v_payload || jsonb_build_object('name','Atomic rollback create','sku','ATOMIC-'||left(v_slug,20),'shape_ids',jsonb_build_array(gen_random_uuid())));
    raise exception 'Expected create failure did not occur.';
  exception when foreign_key_violation then null;
  end;
  if exists(select 1 from public.products where slug=v_slug) then raise exception 'Create rollback left an orphan product.'; end if;

  -- EDIT rollback: compare the complete aggregate before and after a failure occurring
  -- after the product row and earlier relationship sets were already changed.
  v_before := pg_temp.product_save_state(v_product_a);
  begin
    perform public.admin_product_save_v1(v_actor,v_product_a,null,v_payload || jsonb_build_object('name','Must roll back','shape_ids',jsonb_build_array(gen_random_uuid())));
    raise exception 'Expected edit failure did not occur.';
  exception when foreign_key_violation then null;
  end;
  v_after := pg_temp.product_save_state(v_product_a);
  if v_after is distinct from v_before then raise exception 'Edit rollback did not restore the complete product aggregate.'; end if;

  -- Match the pre-RPC compatibility behavior when this optional products column
  -- exists. Dynamic SQL keeps the same test runnable on older schemas.
  if exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.products'::regclass
      and attname = 'gemstone_value'
      and not attisdropped
  ) then
    v_payload := pg_temp.product_save_payload(v_product_a) || jsonb_build_object('gemstone_value','Atomic gemstone regression check');
    perform public.admin_product_save_v1(v_actor,v_product_a,null,v_payload);
    execute 'select gemstone_value from public.products where id = $1' into v_gemstone using v_product_a;
    if v_gemstone is distinct from 'Atomic gemstone regression check' then
      raise exception 'gemstone_value was not persisted.';
    end if;
  end if;

  -- Master preservation: establish a shared shape relationship, remove it only from A,
  -- and prove the shape master and B relationship survive. The outer transaction rolls back.
  if not exists(select 1 from public.product_stone_shapes where product_id=v_product_a and shape_id=v_shape) then
    insert into public.product_stone_shapes(product_id,shape_id) values(v_product_a,v_shape);
  end if;
  if not exists(select 1 from public.product_stone_shapes where product_id=v_product_b and shape_id=v_shape) then
    insert into public.product_stone_shapes(product_id,shape_id) values(v_product_b,v_shape);
  end if;
  v_payload := pg_temp.product_save_payload(v_product_a) || jsonb_build_object('shape_ids','[]'::jsonb);
  perform public.admin_product_save_v1(v_actor,v_product_a,null,v_payload);
  if exists(select 1 from public.product_stone_shapes where product_id=v_product_a and shape_id=v_shape) then raise exception 'Product A shape link was not removed.'; end if;
  if not exists(select 1 from public.catalog_stone_shapes where id=v_shape) then raise exception 'Shape master was deleted.'; end if;
  if not exists(select 1 from public.product_stone_shapes where product_id=v_product_b and shape_id=v_shape) then raise exception 'Product B shape link was changed.'; end if;
end
$$;

rollback;
