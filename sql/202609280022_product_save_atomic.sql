begin;

create or replace function public.admin_product_save_v1(
  p_actor_id uuid,
  p_product_id uuid,
  p_slug text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product public.products%rowtype;
  v_product_id uuid;
  v_is_create boolean := p_product_id is null;
  v_row jsonb;
  v_child jsonb;
  v_id uuid;
  v_variant_id uuid;
  v_default_client_id text := p_payload->>'default_purity_price_id';
  v_default_purity_id uuid;
  v_first_purity_id uuid;
  v_keep_purity_ids uuid[] := '{}'::uuid[];
  v_keep_metal_ids uuid[] := '{}'::uuid[];
  v_keep_dropdown_ids uuid[] := '{}'::uuid[];
  v_keep_option_ids uuid[];
begin
  if p_actor_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid product save request.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  if v_is_create then
    if nullif(btrim(p_slug), '') is null then
      raise exception 'A product URL is required.' using errcode = '22023';
    end if;
    insert into public.products (name, slug, sku, main_category_id, featured, status)
    values (
      p_payload->>'name', p_slug, p_payload->>'sku',
      (p_payload->>'main_category_id')::uuid,
      (p_payload->>'featured')::boolean,
      (p_payload->>'status')::public.product_status
    ) returning * into v_product;
    v_product_id := v_product.id;
  else
    select * into v_product from public.products where id = p_product_id for update;
    if not found then raise exception 'Product not found.' using errcode = 'P0002'; end if;
    v_product_id := p_product_id;
  end if;

  -- Clear the child FK before purity rows are reconciled. Any failure below rolls this
  -- and every other statement in this function back as one PostgreSQL transaction.
  update public.products set default_purity_price_id = null where id = v_product_id;

  update public.products set
    name = p_payload->>'name',
    sku = p_payload->>'sku',
    product_lane = p_payload->>'product_lane',
    detail_template = (p_payload->>'detail_template')::public.product_detail_template,
    main_category_id = (p_payload->>'main_category_id')::uuid,
    subcategory_id = nullif(p_payload->>'subcategory_id', '')::uuid,
    option_id = nullif(p_payload->>'option_id', '')::uuid,
    style_id = nullif(p_payload->>'style_id', '')::uuid,
    description = p_payload->>'description',
    tag_line = p_payload->>'tag_line',
    seo_title = p_payload->>'seo_title',
    seo_description = p_payload->>'seo_description',
    h1_title = p_payload->>'h1_title',
    base_price = nullif(p_payload->>'base_price', '')::numeric,
    discount_price = nullif(p_payload->>'discount_price', '')::numeric,
    gst_slab_id = nullif(p_payload->>'gst_slab_id', '')::uuid,
    stock_quantity = (p_payload->>'stock_quantity')::integer,
    allow_checkout = (p_payload->>'allow_checkout')::boolean,
    featured = (p_payload->>'featured')::boolean,
    status = (p_payload->>'status')::public.product_status,
    features = p_payload->'features',
    purity_values = p_payload->'purity_values',
    certificate_ids = p_payload->'certificate_ids',
    ring_size_ids = p_payload->'ring_size_ids',
    ring_enabled = (p_payload->>'ring_enabled')::boolean,
    custom_dropdowns_enabled = (p_payload->>'custom_dropdowns_enabled')::boolean,
    ring_category_id = case when (p_payload->>'ring_enabled')::boolean then nullif(p_payload->>'ring_category_id', '')::uuid else null end,
    fit_options = p_payload->'fit_options',
    fit_label = p_payload->>'fit_label',
    gemstone_label = p_payload->>'gemstone_label',
    shapes_enabled = (p_payload->>'shapes_enabled')::boolean,
    show_purity = (p_payload->>'show_purity')::boolean,
    engraving_enabled = (p_payload->>'engraving_enabled')::boolean,
    engraving_label = p_payload->>'engraving_label',
    shipping_rule_id = nullif(p_payload->>'shipping_rule_id', '')::uuid,
    care_warranty_rule_id = nullif(p_payload->>'care_warranty_rule_id', '')::uuid,
    shipping_enabled = (p_payload->>'shipping_enabled')::boolean,
    care_warranty_enabled = (p_payload->>'care_warranty_enabled')::boolean,
    shipping_override_enabled = (p_payload->>'shipping_override_enabled')::boolean,
    care_warranty_override_enabled = (p_payload->>'care_warranty_override_enabled')::boolean,
    shipping_title_override = p_payload->>'shipping_title_override',
    shipping_body_override = p_payload->>'shipping_body_override',
    care_warranty_title_override = p_payload->>'care_warranty_title_override',
    care_warranty_body_override = p_payload->>'care_warranty_body_override',
    specifications = p_payload->'specifications',
    product_details = p_payload->'product_details',
    detail_sections = p_payload->'detail_sections',
    image_1_path = p_payload->>'image_1_path',
    image_2_path = p_payload->>'image_2_path',
    image_3_path = p_payload->>'image_3_path',
    image_4_path = p_payload->>'image_4_path',
    image_1_alt = p_payload->>'image_1_alt',
    image_2_alt = p_payload->>'image_2_alt',
    image_3_alt = p_payload->>'image_3_alt',
    image_4_alt = p_payload->>'image_4_alt',
    video_path = p_payload->>'video_path',
    model_3d_url = p_payload->>'model_3d_url',
    show_image_1 = (p_payload->>'show_image_1')::boolean,
    show_image_2 = (p_payload->>'show_image_2')::boolean,
    show_image_3 = (p_payload->>'show_image_3')::boolean,
    show_image_4 = (p_payload->>'show_image_4')::boolean,
    show_video = (p_payload->>'show_video')::boolean,
    custom_order_enabled = (p_payload->>'custom_order_enabled')::boolean,
    ready_to_ship = (p_payload->>'ready_to_ship')::boolean,
    hiphop_badges = p_payload->'hiphop_badges',
    chain_length_options = p_payload->'chain_length_options',
    hiphop_carat_label = p_payload->>'hiphop_carat_label',
    hiphop_carat_values = p_payload->'hiphop_carat_values',
    gram_weight_label = p_payload->>'gram_weight_label',
    gram_weight_value = p_payload->>'gram_weight_value',
    updated_at = now()
  where id = v_product_id;

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

  delete from public.product_metal_selections where product_id = v_product_id;
  for v_row in select value from jsonb_array_elements(p_payload->'metal_ids') loop
    insert into public.product_metal_selections(product_id, metal_id, sort_order)
    values(v_product_id, (v_row#>>'{}')::uuid, coalesce(array_length(v_keep_metal_ids, 1), 0) + 1);
    v_keep_metal_ids := array_append(v_keep_metal_ids, (v_row#>>'{}')::uuid);
  end loop;

  delete from public.product_stone_shapes where product_id = v_product_id;
  for v_row in select value from jsonb_array_elements(p_payload->'shape_ids') loop
    insert into public.product_stone_shapes(product_id, shape_id) values(v_product_id, (v_row#>>'{}')::uuid);
  end loop;

  -- Preserve existing purity row IDs when the submitted UUID belongs to this product;
  -- temporary client keys are mapped to newly generated database UUIDs.
  for v_row in select value from jsonb_array_elements(p_payload->'purity_prices') loop
    v_id := null;
    if coalesce(v_row->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select id into v_id from public.product_purity_prices
      where id = (v_row->>'id')::uuid and product_id = v_product_id;
    end if;
    if v_id is null then
      insert into public.product_purity_prices(product_id, purity_label, price, compare_at_price, sort_order)
      values(v_product_id, btrim(v_row->>'purity_label'), (v_row->>'price')::numeric,
        nullif(v_row->>'compare_at_price', '')::numeric, (v_row->>'sort_order')::integer)
      returning id into v_id;
    else
      update public.product_purity_prices set
        purity_label = btrim(v_row->>'purity_label'), price = (v_row->>'price')::numeric,
        compare_at_price = nullif(v_row->>'compare_at_price', '')::numeric,
        sort_order = (v_row->>'sort_order')::integer, updated_at = now()
      where id = v_id;
    end if;
    v_keep_purity_ids := array_append(v_keep_purity_ids, v_id);
    if v_first_purity_id is null then v_first_purity_id := v_id; end if;
    if v_default_client_id is not null and v_default_client_id = v_row->>'id' then v_default_purity_id := v_id; end if;
  end loop;
  delete from public.product_purity_prices
  where product_id = v_product_id and not (id = any(v_keep_purity_ids));
  update public.products set default_purity_price_id = coalesce(v_default_purity_id, v_first_purity_id)
  where id = v_product_id;

  -- Product-owned metal media is reconciled by reusable metal ID.
  for v_row in select value from jsonb_array_elements(p_payload->'metal_media') loop
    v_id := null;
    select id into v_id from public.product_metal_media
    where product_id = v_product_id and metal_id = (v_row->>'metal_id')::uuid;
    if v_id is null then
      insert into public.product_metal_media(product_id, metal_id, image_1_path, image_2_path, image_3_path, image_4_path, video_path, is_default_fallback)
      values(v_product_id, (v_row->>'metal_id')::uuid, v_row->>'image_1_path', v_row->>'image_2_path',
        v_row->>'image_3_path', v_row->>'image_4_path', v_row->>'video_path', coalesce((v_row->>'is_default_fallback')::boolean, false));
    else
      update public.product_metal_media set image_1_path=v_row->>'image_1_path', image_2_path=v_row->>'image_2_path',
        image_3_path=v_row->>'image_3_path', image_4_path=v_row->>'image_4_path', video_path=v_row->>'video_path',
        is_default_fallback=coalesce((v_row->>'is_default_fallback')::boolean,false), updated_at=now() where id=v_id;
    end if;
  end loop;
  delete from public.product_metal_media where product_id=v_product_id and not (metal_id = any(
    array(select (value->>'metal_id')::uuid from jsonb_array_elements(p_payload->'metal_media'))));

  delete from public.product_material_value_selections where product_id=v_product_id;
  for v_row in select value from jsonb_array_elements(p_payload->'material_value_ids') loop
    insert into public.product_material_value_selections(product_id,material_value_id,sort_order)
    values(v_product_id,(v_row#>>'{}')::uuid,
      (select count(*)+1 from public.product_material_value_selections where product_id=v_product_id));
  end loop;

  delete from public.product_subcategory_links where product_id=v_product_id;
  if p_payload->>'subcategory_id' is not null then
    insert into public.product_subcategory_links(product_id,subcategory_id,is_primary,sort_order)
    values(v_product_id,(p_payload->>'subcategory_id')::uuid,true,1);
  end if;
  for v_row in select value from jsonb_array_elements(p_payload->'linked_subcategory_ids') loop
    insert into public.product_subcategory_links(product_id,subcategory_id,is_primary,sort_order)
    values(v_product_id,(v_row#>>'{}')::uuid,false,
      (select count(*)+1 from public.product_subcategory_links where product_id=v_product_id));
  end loop;

  delete from public.product_option_links where product_id=v_product_id;
  if p_payload->>'option_id' is not null then
    insert into public.product_option_links(product_id,option_id,is_primary,sort_order)
    values(v_product_id,(p_payload->>'option_id')::uuid,true,1);
  end if;
  for v_row in select value from jsonb_array_elements(p_payload->'linked_option_ids') loop
    insert into public.product_option_links(product_id,option_id,is_primary,sort_order)
    values(v_product_id,(v_row#>>'{}')::uuid,false,
      (select count(*)+1 from public.product_option_links where product_id=v_product_id));
  end loop;

  -- Preserve variant IDs by (product, metal), as the application did before the RPC.
  for v_row in select value from jsonb_array_elements(p_payload->'metal_variants') loop
    select id into v_variant_id from public.product_metal_variants
    where product_id=v_product_id and metal_id=(v_row->>'metal_id')::uuid;
    if v_variant_id is null then
      insert into public.product_metal_variants(product_id,metal_id,price,is_default,sort_order)
      values(v_product_id,(v_row->>'metal_id')::uuid,(v_row->>'price')::numeric,
        (v_row->>'is_default')::boolean,(v_row->>'sort_order')::integer) returning id into v_variant_id;
    else
      update public.product_metal_variants set price=(v_row->>'price')::numeric,
        is_default=(v_row->>'is_default')::boolean, sort_order=(v_row->>'sort_order')::integer,
        updated_at=now() where id=v_variant_id;
    end if;
  end loop;
  delete from public.product_metal_variants where product_id=v_product_id and not (metal_id = any(
    array(select (value->>'metal_id')::uuid from jsonb_array_elements(p_payload->'metal_variants'))));

  delete from public.product_variant_media_items where product_id=v_product_id;
  for v_row in select value from jsonb_array_elements(p_payload->'default_variant_media_items') loop
    insert into public.product_variant_media_items(product_id,variant_id,media_type,media_path,alt_text,sort_order,is_default_fallback)
    values(v_product_id,null,v_row->>'media_type',btrim(v_row->>'media_path'),nullif(btrim(v_row->>'alt_text'),''),
      (v_row->>'sort_order')::integer,true);
  end loop;
  for v_row in select value from jsonb_array_elements(p_payload->'metal_variants') loop
    select id into v_variant_id from public.product_metal_variants
    where product_id=v_product_id and metal_id=(v_row->>'metal_id')::uuid;
    for v_child in select value from jsonb_array_elements(coalesce(v_row->'media_items','[]'::jsonb)) loop
      if nullif(btrim(v_child->>'media_path'),'') is not null then
        insert into public.product_variant_media_items(product_id,variant_id,media_type,media_path,alt_text,sort_order,is_default_fallback)
        values(v_product_id,v_variant_id,v_child->>'media_type',btrim(v_child->>'media_path'),nullif(btrim(v_child->>'alt_text'),''),
          (v_child->>'sort_order')::integer,false);
      end if;
    end loop;
  end loop;

  delete from public.product_faq_items where product_id=v_product_id;
  for v_row in select value from jsonb_array_elements(p_payload->'faq_items') loop
    if nullif(btrim(v_row->>'question'),'') is not null and nullif(btrim(v_row->>'answer'),'') is not null then
      insert into public.product_faq_items(product_id,question,answer,sort_order,is_active,source)
      values(v_product_id,btrim(v_row->>'question'),btrim(v_row->>'answer'),(v_row->>'sort_order')::integer,
        (v_row->>'is_active')::boolean,coalesce(nullif(v_row->>'source',''),'admin'));
    end if;
  end loop;

  -- Disabled custom dropdowns remain stored but inactive through the products flag,
  -- matching the pre-RPC behavior. Enabled submissions reconcile owned rows by ID.
  if (p_payload->>'custom_dropdowns_enabled')::boolean then
    for v_row in select value from jsonb_array_elements(p_payload->'custom_dropdowns') loop
      v_id := (v_row->>'id')::uuid;
      if exists(select 1 from public.product_custom_dropdowns where id=v_id and product_id<>v_product_id) then
        raise exception 'Custom dropdown belongs to another product.' using errcode='40001';
      end if;
      insert into public.product_custom_dropdowns(id,product_id,name,label,is_enabled,is_required,display_order)
      values(v_id,v_product_id,v_row->>'name',v_row->>'label',(v_row->>'is_enabled')::boolean,
        (v_row->>'is_required')::boolean,(v_row->>'display_order')::integer)
      on conflict(id) do update set name=excluded.name,label=excluded.label,is_enabled=excluded.is_enabled,
        is_required=excluded.is_required,display_order=excluded.display_order,updated_at=now();
      v_keep_dropdown_ids := array_append(v_keep_dropdown_ids,v_id);
      v_keep_option_ids := '{}'::uuid[];
      for v_child in select value from jsonb_array_elements(v_row->'options') loop
        if exists(select 1 from public.product_custom_dropdown_options where id=(v_child->>'id')::uuid and dropdown_id<>v_id) then
          raise exception 'Custom dropdown option belongs to another dropdown.' using errcode='40001';
        end if;
        insert into public.product_custom_dropdown_options(id,dropdown_id,label,value,is_enabled,display_order)
        values((v_child->>'id')::uuid,v_id,v_child->>'label',v_child->>'value',(v_child->>'is_enabled')::boolean,
          (v_child->>'display_order')::integer)
        on conflict(id) do update set label=excluded.label,value=excluded.value,is_enabled=excluded.is_enabled,
          display_order=excluded.display_order,updated_at=now();
        v_keep_option_ids := array_append(v_keep_option_ids,(v_child->>'id')::uuid);
      end loop;
      delete from public.product_custom_dropdown_options where dropdown_id=v_id and not(id=any(v_keep_option_ids));
    end loop;
    delete from public.product_custom_dropdowns where product_id=v_product_id and not(id=any(v_keep_dropdown_ids));
  end if;

  select * into v_product from public.products where id=v_product_id;
  return jsonb_build_object('item',to_jsonb(v_product));
end;
$function$;

revoke all on function public.admin_product_save_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_product_save_v1(uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';

commit;
