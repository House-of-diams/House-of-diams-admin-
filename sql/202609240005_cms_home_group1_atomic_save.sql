begin;

-- Group 1 homepage CMS save boundary. This migration is additive and does not
-- rewrite existing content. It depends on cms_save_receipts from 202609240004.
create or replace function public.cms_home_group1_snapshot_v1(p_kind text)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public
as $$
declare v_section jsonb; v_items jsonb;
begin
  case p_kind
    when 'hero' then
      select to_jsonb(s) - 'created_at' - 'updated_at' into v_section
        from public.homepage_hero s where s.section_key = 'home_hero';
      select coalesce(jsonb_agg(to_jsonb(i) - 'created_at' - 'updated_at' order by i.sort_order, i.id), '[]') into v_items
        from public.homepage_hero_slider_items i
        where i.hero_id = (select id from public.homepage_hero where section_key = 'home_hero');
    when 'collection' then
      v_section := 'null';
      select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order, i.id), '[]') into v_items from public.collection_items i;
    when 'certifications' then
      select to_jsonb(s) into v_section from public.certifications_section s where s.section_key = 'home_certifications';
      select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order, i.id), '[]') into v_items from public.certifications_items i;
    when 'discover_shapes' then
      v_section := 'null';
      select coalesce(jsonb_agg(to_jsonb(i) - 'created_at' - 'updated_at' order by i.sort_order, i.id), '[]') into v_items from public.discover_shapes_items i;
    when 'bestsellers' then
      select to_jsonb(s) - 'created_at' - 'updated_at' into v_section from public.cms_home_bestsellers s where s.status = 'active' limit 1;
      select coalesce(jsonb_agg(to_jsonb(i) - 'created_at' order by i.display_order, i.id), '[]') into v_items
        from public.cms_home_bestseller_products i where i.section_id = (v_section->>'id')::uuid;
    when 'shop_by_category' then
      select to_jsonb(s) - 'created_at' - 'updated_at' into v_section from public.homepage_shop_by_category s where s.section_key = 'home_shop_by_category';
      select coalesce(jsonb_agg(to_jsonb(i) - 'created_at' - 'updated_at' order by i.display_order, i.id), '[]') into v_items
        from public.homepage_shop_by_category_items i where i.section_id = (v_section->>'id')::bigint;
    else raise exception 'Unsupported CMS section.' using errcode = '22023';
  end case;
  return jsonb_build_object('section', v_section, 'items', v_items,
    'revision', md5(jsonb_build_object('section', v_section, 'items', v_items)::text));
end;
$$;

create or replace function public.cms_save_home_group1_v1(
  p_actor_id uuid, p_request_id uuid, p_expected_revision text, p_kind text,
  p_section jsonb, p_items jsonb, p_deleted_ids text[]
)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb; v_result jsonb; v_receipt public.cms_save_receipts%rowtype;
  v_hash text; v_item jsonb; v_id_text text; v_position integer := 0;
  v_hero_id bigint; v_section_bigint bigint; v_section_uuid uuid;
begin
  if p_actor_id is null or p_request_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin'
  ) then raise exception 'Administrator access is required.' using errcode = '42501'; end if;
  if p_expected_revision is null or length(p_expected_revision) <> 32
    or p_kind not in ('hero','collection','certifications','discover_shapes','bestsellers','shop_by_category')
    or jsonb_typeof(p_items) is distinct from 'array' or p_deleted_ids is null
    or array_position(p_deleted_ids, null) is not null
  then raise exception 'Invalid save payload. Reload this editor.' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) > 100 or cardinality(p_deleted_ids) > 100
  then raise exception 'Too many CMS rows.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('cms-home-group1:' || p_kind, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || p_request_id::text, 0));
  v_hash := md5(jsonb_build_object('revision', p_expected_revision, 'kind', p_kind,
    'section', p_section, 'items', p_items, 'deleted', p_deleted_ids)::text);
  select receipt.* into v_receipt from public.cms_save_receipts receipt
    where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'home-group1-' || p_kind or v_receipt.payload_hash <> v_hash
    then raise exception 'This save request was already used for different changes.' using errcode = '40001'; end if;
    return v_receipt.result;
  end if;

  case p_kind
    when 'hero' then lock table public.homepage_hero, public.homepage_hero_slider_items in share row exclusive mode;
    when 'collection' then lock table public.collection_items in share row exclusive mode;
    when 'certifications' then lock table public.certifications_section, public.certifications_items in share row exclusive mode;
    when 'discover_shapes' then lock table public.discover_shapes_items in share row exclusive mode;
    when 'bestsellers' then lock table public.cms_home_bestsellers, public.cms_home_bestseller_products in share row exclusive mode;
    when 'shop_by_category' then lock table public.homepage_shop_by_category, public.homepage_shop_by_category_items in share row exclusive mode;
  end case;
  v_before := public.cms_home_group1_snapshot_v1(p_kind);
  if v_before->>'revision' <> p_expected_revision
  then raise exception 'This section changed since you opened it. Reload before saving.' using errcode = '40001'; end if;
  if (select count(distinct x) from unnest(p_deleted_ids) x) <> cardinality(p_deleted_ids)
  then raise exception 'A deleted row ID was duplicated.' using errcode = '22023'; end if;

  -- Every existing ID must be retained or explicitly deleted. New rows omit id.
  if exists (select 1 from jsonb_array_elements(p_items) x where x ? 'id' and (
      jsonb_typeof(x->'id') not in ('string','number') or nullif(x->>'id','') is null or x->>'id' = any(p_deleted_ids)))
    or exists (select id from (select value->>'id' id from jsonb_array_elements(p_items) where value ? 'id') q group by id having count(*) > 1)
  then raise exception 'A row ID is empty, duplicated, or both retained and deleted.' using errcode = '22023'; end if;

  if p_kind = 'hero' then
    v_hero_id := (v_before->'section'->>'id')::bigint;
    if v_hero_id is null or jsonb_typeof(p_section) <> 'object'
      or jsonb_typeof(p_section->'slider_enabled') <> 'boolean'
      or jsonb_typeof(p_section->'seo_title') <> 'string'
      or jsonb_typeof(p_section->'seo_description') <> 'string'
    then raise exception 'Invalid hero settings.' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements(p_items) x where
      jsonb_typeof(x->'image_path') <> 'string' or jsonb_typeof(x->'mobile_image_path') <> 'string'
      or jsonb_typeof(x->'headline') <> 'string' or jsonb_typeof(x->'subtitle') <> 'string'
      or jsonb_typeof(x->'button_text') <> 'string' or jsonb_typeof(x->'button_link') <> 'string')
    then raise exception 'Invalid hero slide.' using errcode = '22023'; end if;
    if exists (select 1 from public.homepage_hero_slider_items i where i.hero_id=v_hero_id
      and i.id::text <> all(p_deleted_ids) and not exists (select 1 from jsonb_array_elements(p_items) x where x->>'id'=i.id::text))
      or exists (select 1 from jsonb_array_elements(p_items) x where x ? 'id' and not exists
        (select 1 from public.homepage_hero_slider_items i where i.hero_id=v_hero_id and i.id::text=x->>'id'))
    then raise exception 'Every existing slide must be retained or explicitly removed.' using errcode = '22023'; end if;
    update public.homepage_hero h set slider_enabled=(p_section->>'slider_enabled')::boolean,
      seo_title=nullif(trim(p_section->>'seo_title'),''), seo_description=nullif(trim(p_section->>'seo_description'),''), is_active=true
      where h.id=v_hero_id and (h.slider_enabled,h.seo_title,h.seo_description,h.is_active) is distinct from
      ((p_section->>'slider_enabled')::boolean,nullif(trim(p_section->>'seo_title'),''),nullif(trim(p_section->>'seo_description'),''),true);
    delete from public.homepage_hero_slider_items i where i.hero_id=v_hero_id and i.id::text=any(p_deleted_ids);
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_position:=v_position+1; v_id_text:=v_item->>'id';
      if v_id_text is null then insert into public.homepage_hero_slider_items
        (hero_id,sort_order,image_path,mobile_image_path,headline,subtitle,button_text,button_link)
        values(v_hero_id,v_position,v_item->>'image_path',v_item->>'mobile_image_path',v_item->>'headline',v_item->>'subtitle',v_item->>'button_text',v_item->>'button_link');
      else update public.homepage_hero_slider_items i set sort_order=v_position,image_path=v_item->>'image_path',mobile_image_path=v_item->>'mobile_image_path',
        headline=v_item->>'headline',subtitle=v_item->>'subtitle',button_text=v_item->>'button_text',button_link=v_item->>'button_link'
        where i.id=v_id_text::bigint and (i.sort_order,i.image_path,i.mobile_image_path,i.headline,i.subtitle,i.button_text,i.button_link) is distinct from
        (v_position,v_item->>'image_path',v_item->>'mobile_image_path',v_item->>'headline',v_item->>'subtitle',v_item->>'button_text',v_item->>'button_link'); end if;
    end loop;

  elsif p_kind = 'collection' then
    if jsonb_typeof(p_section) <> 'null' or exists (select 1 from jsonb_array_elements(p_items) x where
      jsonb_typeof(x->'label') <> 'string' or jsonb_typeof(x->'title') <> 'string' or jsonb_typeof(x->'description') <> 'string'
      or jsonb_typeof(x->'image_path') <> 'string' or jsonb_typeof(x->'link') <> 'string')
    then raise exception 'Invalid collection content.' using errcode = '22023'; end if;
    if exists (select 1 from public.collection_items i where i.id::text <> all(p_deleted_ids)
      and not exists (select 1 from jsonb_array_elements(p_items) x where x->>'id'=i.id::text))
      or exists (select 1 from jsonb_array_elements(p_items) x where x ? 'id' and not exists
        (select 1 from public.collection_items i where i.id::text=x->>'id'))
    then raise exception 'Every existing collection item must be retained or explicitly removed.' using errcode = '22023'; end if;
    delete from public.collection_items i where i.id::text=any(p_deleted_ids);
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_position:=v_position+1; v_id_text:=v_item->>'id';
      if v_id_text is null then insert into public.collection_items(sort_order,label,title,description,image_path,link)
        values(v_position,trim(v_item->>'label'),trim(v_item->>'title'),trim(v_item->>'description'),trim(v_item->>'image_path'),trim(v_item->>'link'));
      else update public.collection_items i set sort_order=v_position,label=trim(v_item->>'label'),title=trim(v_item->>'title'),description=trim(v_item->>'description'),image_path=trim(v_item->>'image_path'),link=trim(v_item->>'link')
        where i.id=v_id_text::bigint and (i.sort_order,i.label,i.title,i.description,i.image_path,i.link) is distinct from
        (v_position,trim(v_item->>'label'),trim(v_item->>'title'),trim(v_item->>'description'),trim(v_item->>'image_path'),trim(v_item->>'link')); end if;
    end loop;

  elsif p_kind = 'certifications' then
    if jsonb_typeof(p_section) <> 'object' or jsonb_typeof(p_section->'eyebrow') <> 'string' or jsonb_typeof(p_section->'heading') <> 'string'
      or exists (select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x->'title') <> 'string' or jsonb_typeof(x->'description') <> 'string'
        or jsonb_typeof(x->'badge') <> 'string' or jsonb_typeof(x->'icon_path') <> 'string')
    then raise exception 'Invalid certifications content.' using errcode = '22023'; end if;
    if exists (select 1 from public.certifications_items i where i.id::text <> all(p_deleted_ids)
      and not exists (select 1 from jsonb_array_elements(p_items) x where x->>'id'=i.id::text))
      or exists (select 1 from jsonb_array_elements(p_items) x where x ? 'id' and not exists
        (select 1 from public.certifications_items i where i.id::text=x->>'id'))
    then raise exception 'Every existing certification must be retained or explicitly removed.' using errcode = '22023'; end if;
    insert into public.certifications_section as target(section_key,eyebrow,heading) values('home_certifications',trim(p_section->>'eyebrow'),trim(p_section->>'heading'))
      on conflict(section_key) do update set eyebrow=excluded.eyebrow,heading=excluded.heading
      where (target.eyebrow,target.heading) is distinct from (excluded.eyebrow,excluded.heading);
    delete from public.certifications_items i where i.id::text=any(p_deleted_ids);
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_position:=v_position+1; v_id_text:=v_item->>'id';
      if v_id_text is null then insert into public.certifications_items(sort_order,title,description,badge,icon_path)
        values(v_position,trim(v_item->>'title'),trim(v_item->>'description'),trim(v_item->>'badge'),trim(v_item->>'icon_path'));
      else update public.certifications_items i set sort_order=v_position,title=trim(v_item->>'title'),description=trim(v_item->>'description'),badge=trim(v_item->>'badge'),icon_path=trim(v_item->>'icon_path')
        where i.id=v_id_text::bigint and (i.sort_order,i.title,i.description,i.badge,i.icon_path) is distinct from
        (v_position,trim(v_item->>'title'),trim(v_item->>'description'),trim(v_item->>'badge'),trim(v_item->>'icon_path')); end if;
    end loop;

  elsif p_kind = 'discover_shapes' then
    if jsonb_typeof(p_section) <> 'null' or exists (select 1 from jsonb_array_elements(p_items) x where
      jsonb_typeof(x->'title') <> 'string' or jsonb_typeof(x->'description') <> 'string' or jsonb_typeof(x->'image_path') <> 'string'
      or jsonb_typeof(x->'image_alt') <> 'string' or (x->'shape_id' <> 'null' and jsonb_typeof(x->'shape_id') <> 'string'))
    then raise exception 'Invalid shape content.' using errcode = '22023'; end if;
    if exists (select 1 from public.discover_shapes_items i where i.id::text <> all(p_deleted_ids)
      and not exists (select 1 from jsonb_array_elements(p_items) x where x->>'id'=i.id::text))
      or exists (select 1 from jsonb_array_elements(p_items) x where x ? 'id' and not exists
        (select 1 from public.discover_shapes_items i where i.id::text=x->>'id'))
    then raise exception 'Every existing shape card must be retained or explicitly removed.' using errcode = '22023'; end if;
    delete from public.discover_shapes_items i where i.id::text=any(p_deleted_ids);
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_position:=v_position+1; v_id_text:=v_item->>'id';
      if v_id_text is null then insert into public.discover_shapes_items(title,description,image_path,image_alt,shape_id,sort_order,status)
        values(trim(v_item->>'title'),trim(v_item->>'description'),trim(v_item->>'image_path'),trim(v_item->>'image_alt'),nullif(v_item->>'shape_id','')::uuid,v_position,'active');
      else update public.discover_shapes_items i set title=trim(v_item->>'title'),description=trim(v_item->>'description'),image_path=trim(v_item->>'image_path'),image_alt=trim(v_item->>'image_alt'),shape_id=nullif(v_item->>'shape_id','')::uuid,sort_order=v_position,status='active'
        where i.id=v_id_text::uuid and (i.title,i.description,i.image_path,i.image_alt,i.shape_id,i.sort_order,i.status) is distinct from
        (trim(v_item->>'title'),trim(v_item->>'description'),trim(v_item->>'image_path'),trim(v_item->>'image_alt'),nullif(v_item->>'shape_id','')::uuid,v_position,'active'); end if;
    end loop;

  elsif p_kind = 'bestsellers' then
    if jsonb_typeof(p_section) <> 'object' or jsonb_typeof(p_section->'eyebrow') <> 'string' or jsonb_typeof(p_section->'heading') <> 'string'
      or jsonb_typeof(p_section->'cta_label') <> 'string' or jsonb_typeof(p_section->'cta_href') <> 'string'
      or exists (select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x->'product_id') <> 'string'
        or jsonb_typeof(x->'display_title') not in ('string','null') or jsonb_typeof(x->'display_image_path') not in ('string','null'))
    then raise exception 'Invalid bestseller content.' using errcode = '22023'; end if;
    v_section_uuid := nullif(v_before->'section'->>'id','')::uuid;
    if v_section_uuid is null then insert into public.cms_home_bestsellers(eyebrow,heading,cta_label,cta_href,status)
      values(trim(p_section->>'eyebrow'),trim(p_section->>'heading'),trim(p_section->>'cta_label'),trim(p_section->>'cta_href'),'active') returning id into v_section_uuid;
    else update public.cms_home_bestsellers s set eyebrow=trim(p_section->>'eyebrow'),heading=trim(p_section->>'heading'),cta_label=trim(p_section->>'cta_label'),cta_href=trim(p_section->>'cta_href'),status='active'
      where s.id=v_section_uuid and (s.eyebrow,s.heading,s.cta_label,s.cta_href,s.status) is distinct from
      (trim(p_section->>'eyebrow'),trim(p_section->>'heading'),trim(p_section->>'cta_label'),trim(p_section->>'cta_href'),'active'::public.cms_status); end if;
    if exists (select 1 from public.cms_home_bestseller_products i where i.section_id=v_section_uuid and i.id::text <> all(p_deleted_ids)
      and not exists (select 1 from jsonb_array_elements(p_items) x where x->>'id'=i.id::text))
      or exists (select 1 from jsonb_array_elements(p_items) x where x ? 'id' and not exists
        (select 1 from public.cms_home_bestseller_products i where i.section_id=v_section_uuid and i.id::text=x->>'id'))
      or exists (select 1 from jsonb_array_elements(p_items) x where not exists
        (select 1 from public.products p where p.id=(x->>'product_id')::uuid and p.status='active'))
    then raise exception 'Bestseller rows or products are stale.' using errcode = '22023'; end if;
    perform 1 from public.products p join jsonb_array_elements(p_items) x on p.id=(x->>'product_id')::uuid
      where p.status='active' for key share of p;
    delete from public.cms_home_bestseller_products i where i.section_id=v_section_uuid and i.id::text=any(p_deleted_ids);
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_id_text:=v_item->>'id';
      if v_id_text is null then insert into public.cms_home_bestseller_products(section_id,product_id,display_order,display_title,display_image_path)
        values(v_section_uuid,(v_item->>'product_id')::uuid,v_position,nullif(trim(v_item->>'display_title'),''),nullif(trim(v_item->>'display_image_path'),''));
      else update public.cms_home_bestseller_products i set product_id=(v_item->>'product_id')::uuid,display_order=v_position,display_title=nullif(trim(v_item->>'display_title'),''),display_image_path=nullif(trim(v_item->>'display_image_path'),'')
        where i.id=v_id_text::uuid and (i.product_id,i.display_order,i.display_title,i.display_image_path) is distinct from
        ((v_item->>'product_id')::uuid,v_position,nullif(trim(v_item->>'display_title'),''),nullif(trim(v_item->>'display_image_path'),'')); end if;
      v_position:=v_position+1;
    end loop;

  elsif p_kind = 'shop_by_category' then
    if jsonb_typeof(p_section) <> 'object' or jsonb_typeof(p_section->'heading') <> 'string'
      or jsonb_typeof(p_section->'is_enabled') <> 'boolean' then raise exception 'Invalid shop settings.' using errcode = '22023'; end if;
    v_section_bigint := nullif(v_before->'section'->>'id','')::bigint;
    if v_section_bigint is null then insert into public.homepage_shop_by_category(section_key,heading,shop_all_label,shop_all_link,is_enabled,desktop_columns,tablet_columns,mobile_columns)
      values('home_shop_by_category',trim(p_section->>'heading'),nullif(trim(p_section->>'shop_all_label'),''),nullif(trim(p_section->>'shop_all_link'),''),(p_section->>'is_enabled')::boolean,(p_section->>'desktop_columns')::smallint,(p_section->>'tablet_columns')::smallint,(p_section->>'mobile_columns')::smallint) returning id into v_section_bigint;
    else update public.homepage_shop_by_category s set heading=trim(p_section->>'heading'),shop_all_label=nullif(trim(p_section->>'shop_all_label'),''),shop_all_link=nullif(trim(p_section->>'shop_all_link'),''),is_enabled=(p_section->>'is_enabled')::boolean,desktop_columns=(p_section->>'desktop_columns')::smallint,tablet_columns=(p_section->>'tablet_columns')::smallint,mobile_columns=(p_section->>'mobile_columns')::smallint
      where s.id=v_section_bigint and (s.heading,s.shop_all_label,s.shop_all_link,s.is_enabled,s.desktop_columns,s.tablet_columns,s.mobile_columns) is distinct from
      (trim(p_section->>'heading'),nullif(trim(p_section->>'shop_all_label'),''),nullif(trim(p_section->>'shop_all_link'),''),(p_section->>'is_enabled')::boolean,(p_section->>'desktop_columns')::smallint,(p_section->>'tablet_columns')::smallint,(p_section->>'mobile_columns')::smallint); end if;
    if exists (select 1 from public.homepage_shop_by_category_items i where i.section_id=v_section_bigint and i.id::text <> all(p_deleted_ids)
      and not exists (select 1 from jsonb_array_elements(p_items) x where x->>'id'=i.id::text))
      or exists (select 1 from jsonb_array_elements(p_items) x where x ? 'id' and not exists
        (select 1 from public.homepage_shop_by_category_items i where i.section_id=v_section_bigint and i.id::text=x->>'id'))
    then raise exception 'Shop rows are stale.' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements(p_items) x where
      ((x->>'item_type'='category')::integer + (x->>'item_type'='subcategory')::integer + (x->>'item_type'='option')::integer) <> 1
      or (x->>'item_type'='category' and (x->>'category_id' is null or x->>'subcategory_id' is not null or x->>'option_id' is not null))
      or (x->>'item_type'='subcategory' and (x->>'subcategory_id' is null or x->>'category_id' is not null or x->>'option_id' is not null))
      or (x->>'item_type'='option' and (x->>'option_id' is null or x->>'category_id' is not null or x->>'subcategory_id' is not null))
      or (x->>'item_type'='category' and not exists(select 1 from public.catalog_categories c where c.id=(x->>'category_id')::uuid and c.status='active'))
      or (x->>'item_type'='subcategory' and not exists(select 1 from public.catalog_subcategories c where c.id=(x->>'subcategory_id')::uuid and c.status='active'))
      or (x->>'item_type'='option' and not exists(select 1 from public.catalog_options c where c.id=(x->>'option_id')::uuid and c.status='active')))
      or exists (select 1 from jsonb_array_elements(p_items) x group by x->>'item_type',coalesce(x->>'category_id',x->>'subcategory_id',x->>'option_id') having count(*)>1)
    then raise exception 'Shop items must be unique active catalog records.' using errcode='22023'; end if;
    perform 1 from public.catalog_categories c join jsonb_array_elements(p_items) x on x->>'item_type'='category' and c.id=(x->>'category_id')::uuid for key share of c;
    perform 1 from public.catalog_subcategories c join jsonb_array_elements(p_items) x on x->>'item_type'='subcategory' and c.id=(x->>'subcategory_id')::uuid for key share of c;
    perform 1 from public.catalog_options c join jsonb_array_elements(p_items) x on x->>'item_type'='option' and c.id=(x->>'option_id')::uuid for key share of c;
    delete from public.homepage_shop_by_category_items i where i.section_id=v_section_bigint and i.id::text=any(p_deleted_ids);
    for v_item in select value from jsonb_array_elements(p_items) loop
      if v_item->>'item_type' not in ('category','subcategory','option') then raise exception 'Invalid shop item type.' using errcode='22023'; end if;
      v_id_text:=v_item->>'id';
      if v_id_text is null then insert into public.homepage_shop_by_category_items(section_id,item_type,category_id,subcategory_id,option_id,display_order,is_active)
        values(v_section_bigint,v_item->>'item_type',nullif(v_item->>'category_id','')::uuid,nullif(v_item->>'subcategory_id','')::uuid,nullif(v_item->>'option_id','')::uuid,v_position,(v_item->>'is_active')::boolean);
      else update public.homepage_shop_by_category_items i set item_type=v_item->>'item_type',category_id=nullif(v_item->>'category_id','')::uuid,subcategory_id=nullif(v_item->>'subcategory_id','')::uuid,option_id=nullif(v_item->>'option_id','')::uuid,display_order=v_position,is_active=(v_item->>'is_active')::boolean
        where i.id=v_id_text::bigint and (i.item_type,i.category_id,i.subcategory_id,i.option_id,i.display_order,i.is_active) is distinct from
        (v_item->>'item_type',nullif(v_item->>'category_id','')::uuid,nullif(v_item->>'subcategory_id','')::uuid,nullif(v_item->>'option_id','')::uuid,v_position,(v_item->>'is_active')::boolean); end if;
      v_position:=v_position+1;
    end loop;
  end if;

  v_result := public.cms_home_group1_snapshot_v1(p_kind);
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result)
    values(p_actor_id,p_request_id,'home-group1-'||p_kind,v_hash,v_result);
  return v_result;
end;
$$;

revoke all on function public.cms_home_group1_snapshot_v1(text) from public, anon, authenticated;
revoke all on function public.cms_save_home_group1_v1(uuid,uuid,text,text,jsonb,jsonb,text[]) from public, anon, authenticated;
grant execute on function public.cms_home_group1_snapshot_v1(text) to service_role;
grant execute on function public.cms_save_home_group1_v1(uuid,uuid,text,text,jsonb,jsonb,text[]) to service_role;
notify pgrst, 'reload schema';
commit;
