CREATE OR REPLACE FUNCTION public.duplicate_product(p_source_product_id uuid, p_request_id uuid, p_admin_id uuid)
 RETURNS TABLE(product_id uuid, slug text, lane text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_source public.products%rowtype;
  v_new_product public.products%rowtype;
  v_existing_product_id uuid;
  v_new_product_id uuid := gen_random_uuid();
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_new_slug text;
  v_new_sku text;
  v_payload jsonb;
  v_old_purity record;
  v_new_purity_id uuid;
  v_old_variant record;
  v_new_variant_id uuid;
begin
  if p_source_product_id is null or p_request_id is null or p_admin_id is null then
    raise exception 'Source product, request, and administrator IDs are required.';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only an administrator can duplicate products.';
  end if;

  -- Serialize identical request IDs so concurrent clicks cannot create two copies.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select r.new_product_id into v_existing_product_id
  from public.product_duplicate_requests r
  where r.request_id = p_request_id;

  if v_existing_product_id is not null then
    return query
    select p.id, p.slug, coalesce(p.product_lane, 'standard')
    from public.products p
    where p.id = v_existing_product_id;
    return;
  end if;

  select p.* into v_source
  from public.products p
  where p.id = p_source_product_id
  for share;

  if not found then
    raise exception 'Source product was not found.';
  end if;

  insert into public.product_duplicate_requests (request_id, source_product_id, requested_by)
  values (p_request_id, p_source_product_id, p_admin_id)
  on conflict (request_id) do nothing;

  v_new_slug :=
    coalesce(
      nullif(btrim(regexp_replace(lower(coalesce(v_source.slug, v_source.name)), '[^a-z0-9]+', '-', 'g'), '-'), ''),
      'product'
    ) || '-copy-' || left(v_suffix, 12);
  v_new_sku := left(coalesce(nullif(trim(v_source.sku), ''), 'PRODUCT'), 80)
    || '-COPY-' || upper(left(v_suffix, 8));

  v_payload :=
    to_jsonb(v_source)
    || jsonb_build_object(
      'id', v_new_product_id,
      'name', v_source.name || ' — Copy',
      'slug', v_new_slug,
      'sku', v_new_sku,
      'status', 'draft',
      'stock_quantity', 0,
      'allow_checkout', false,
      'featured', false,
      'ready_to_ship', false,
      'default_purity_price_id', null,
      'duplicated_from_product_id', v_source.id,
      'duplicated_by', p_admin_id,
      'duplicated_at', now(),
      'created_at', now(),
      'updated_at', now()
    );

  insert into public.products
  select (jsonb_populate_record(null::public.products, v_payload)).*
  returning * into v_new_product;

  insert into public.product_metal_selections (product_id, metal_id, sort_order)
  select v_new_product.id, s.metal_id, s.sort_order
  from public.product_metal_selections s where s.product_id = v_source.id;

  insert into public.product_material_value_selections (product_id, material_value_id, sort_order)
  select v_new_product.id, s.material_value_id, s.sort_order
  from public.product_material_value_selections s where s.product_id = v_source.id;

  insert into public.product_stone_shapes (product_id, shape_id)
  select v_new_product.id, s.shape_id
  from public.product_stone_shapes s where s.product_id = v_source.id;

  insert into public.product_subcategory_links (product_id, subcategory_id, is_primary, sort_order)
  select v_new_product.id, s.subcategory_id, s.is_primary, s.sort_order
  from public.product_subcategory_links s where s.product_id = v_source.id;

  insert into public.product_option_links (product_id, option_id, is_primary, sort_order)
  select v_new_product.id, o.option_id, o.is_primary, o.sort_order
  from public.product_option_links o where o.product_id = v_source.id;

  insert into public.product_metal_media (
    product_id, metal_id, image_1_path, image_2_path, image_3_path,
    image_4_path, video_path, is_default_fallback
  )
  select
    v_new_product.id, m.metal_id, m.image_1_path, m.image_2_path, m.image_3_path,
    m.image_4_path, m.video_path, m.is_default_fallback
  from public.product_metal_media m where m.product_id = v_source.id;

  for v_old_purity in
    select p.* from public.product_purity_prices p
    where p.product_id = v_source.id order by p.sort_order, p.id
  loop
    insert into public.product_purity_prices (
      product_id, purity_label, price, compare_at_price, sort_order
    ) values (
      v_new_product.id, v_old_purity.purity_label, v_old_purity.price,
      v_old_purity.compare_at_price, v_old_purity.sort_order
    ) returning id into v_new_purity_id;

    if v_old_purity.id = v_source.default_purity_price_id then
      update public.products
      set default_purity_price_id = v_new_purity_id
      where id = v_new_product.id;
    end if;
  end loop;

  insert into public.product_variant_media_items (
    product_id, variant_id, media_type, media_path, sort_order, is_default_fallback, alt_text
  )
  select
    v_new_product.id, null, m.media_type, m.media_path,
    m.sort_order, m.is_default_fallback, m.alt_text
  from public.product_variant_media_items m
  where m.product_id = v_source.id and m.variant_id is null;

  for v_old_variant in
    select v.* from public.product_metal_variants v
    where v.product_id = v_source.id order by v.sort_order, v.id
  loop
    insert into public.product_metal_variants (
      product_id, metal_id, price, is_default, sort_order
    ) values (
      v_new_product.id, v_old_variant.metal_id, v_old_variant.price,
      v_old_variant.is_default, v_old_variant.sort_order
    ) returning id into v_new_variant_id;

    insert into public.product_variant_media_items (
      product_id, variant_id, media_type, media_path, sort_order, is_default_fallback, alt_text
    )
    select
      v_new_product.id, v_new_variant_id, m.media_type, m.media_path,
      m.sort_order, m.is_default_fallback, m.alt_text
    from public.product_variant_media_items m
    where m.product_id = v_source.id and m.variant_id = v_old_variant.id;
  end loop;

  insert into public.product_faq_items (
    product_id, question, answer, sort_order, is_active, source
  )
  select v_new_product.id, f.question, f.answer, f.sort_order, f.is_active, f.source
  from public.product_faq_items f where f.product_id = v_source.id;

  update public.product_duplicate_requests
  set new_product_id = v_new_product.id, completed_at = now()
  where request_id = p_request_id;

  return query
  select v_new_product.id, v_new_product.slug, coalesce(v_new_product.product_lane, 'standard');
end;
$function$
