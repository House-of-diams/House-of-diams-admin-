begin;

-- Group 4 CMS write boundary for Blog, Education, and Docs. This migration is
-- additive: it does not rewrite existing content. It depends on
-- public.cms_save_receipts from 202609240004.

create or replace function public.cms_article_snapshot_v1(p_kind text, p_post_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_post jsonb;
  v_tags jsonb;
  v_products jsonb;
  v_blocks jsonb;
  v_content jsonb;
begin
  if p_post_id is null or p_post_id < 1 or p_kind not in ('blog', 'education') then
    raise exception 'Invalid article reference.' using errcode = '22023';
  end if;

  if p_kind = 'blog' then
    select to_jsonb(p) - 'created_at' - 'updated_at' into v_post
    from public.blog_posts p where p.id = p_post_id;
    select coalesce(jsonb_agg(to_jsonb(t) - 'post_id' - 'created_at' - 'updated_at' order by t.sort_order, t.id), '[]'::jsonb)
      into v_tags from public.blog_post_tags t where t.post_id = p_post_id;
    select coalesce(jsonb_agg(to_jsonb(r) - 'post_id' - 'created_at' order by r.sort_order, r.id), '[]'::jsonb)
      into v_products from public.blog_post_products r where r.post_id = p_post_id;
    select coalesce(jsonb_agg(to_jsonb(b) - 'post_id' - 'created_at' - 'updated_at' order by b.sort_order, b.id), '[]'::jsonb)
      into v_blocks from public.blog_post_content_blocks b where b.post_id = p_post_id;
  else
    select to_jsonb(p) - 'created_at' - 'updated_at' into v_post
    from public.education_posts p where p.id = p_post_id;
    select coalesce(jsonb_agg(to_jsonb(t) - 'post_id' - 'created_at' - 'updated_at' order by t.sort_order, t.id), '[]'::jsonb)
      into v_tags from public.education_post_tags t where t.post_id = p_post_id;
    select coalesce(jsonb_agg(to_jsonb(r) - 'post_id' - 'created_at' order by r.sort_order, r.id), '[]'::jsonb)
      into v_products from public.education_post_products r where r.post_id = p_post_id;
    select coalesce(jsonb_agg(to_jsonb(b) - 'post_id' - 'created_at' - 'updated_at' order by b.sort_order, b.id), '[]'::jsonb)
      into v_blocks from public.education_post_content_blocks b where b.post_id = p_post_id;
  end if;

  if v_post is null then
    raise exception 'Article not found.' using errcode = 'P0002';
  end if;

  v_content := jsonb_build_object('post', v_post, 'tags', v_tags, 'products', v_products, 'content_blocks', v_blocks);
  return v_content || jsonb_build_object('revision', md5(v_content::text));
end;
$$;

create or replace function public.cms_save_article_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_kind text,
  p_post_id bigint,
  p_expected_revision text,
  p_post jsonb,
  p_tags jsonb,
  p_products jsonb,
  p_blocks jsonb,
  p_deleted_tag_ids text[],
  p_deleted_product_ids text[],
  p_deleted_block_ids text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb;
  v_result jsonb;
  v_receipt public.cms_save_receipts%rowtype;
  v_hash text;
  v_item jsonb;
  v_id_text text;
  v_post_id bigint := p_post_id;
  v_slug text;
  v_base_slug text;
  v_suffix integer := 2;
  v_position integer;
begin
  if p_actor_id is null or p_request_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin'
  ) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  if p_kind not in ('blog', 'education')
    or jsonb_typeof(p_post) is distinct from 'object'
    or jsonb_typeof(p_tags) is distinct from 'array'
    or jsonb_typeof(p_products) is distinct from 'array'
    or jsonb_typeof(p_blocks) is distinct from 'array'
    or p_deleted_tag_ids is null or p_deleted_product_ids is null or p_deleted_block_ids is null
    or array_position(p_deleted_tag_ids, null) is not null
    or array_position(p_deleted_product_ids, null) is not null
    or array_position(p_deleted_block_ids, null) is not null
  then
    raise exception 'Invalid article payload. Reload this editor.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_tags) > 100 or jsonb_array_length(p_products) > 100
    or jsonb_array_length(p_blocks) > 100 or cardinality(p_deleted_tag_ids) > 100
    or cardinality(p_deleted_product_ids) > 100 or cardinality(p_deleted_block_ids) > 100
  then
    raise exception 'Too many article relations.' using errcode = '22023';
  end if;

  if nullif(trim(p_post->>'title'), '') is null
    or nullif(trim(p_post->>'subtitle'), '') is null
    or nullif(trim(p_post->>'body_html'), '') is null
    or jsonb_typeof(p_post->'is_published') is distinct from 'boolean'
    or coalesce(p_post->>'sort_order', '') !~ '^-?[0-9]+$'
  then
    raise exception 'Title, subtitle, body, publication status, and order are required.' using errcode = '22023';
  end if;

  v_base_slug := trim(p_post->>'slug_base');
  if v_base_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_base_slug) > 180 then
    raise exception 'A valid article URL is required.' using errcode = '22023';
  end if;

  if exists (select 1 from jsonb_array_elements(p_tags) x where
      jsonb_typeof(x->'tag') is distinct from 'string' or nullif(trim(x->>'tag'), '') is null)
    or exists (select lower(trim(x->>'tag')) from jsonb_array_elements(p_tags) x group by 1 having count(*) > 1)
  then
    raise exception 'Tags must be non-empty and unique.' using errcode = '22023';
  end if;

  if exists (select 1 from jsonb_array_elements(p_products) x where
      jsonb_typeof(x->'product_id') is distinct from 'string'
      or (x->>'product_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')
    or exists (select x->>'product_id' from jsonb_array_elements(p_products) x group by 1 having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(p_products) x
      where not exists (select 1 from public.products p where p.id = (x->>'product_id')::uuid))
  then
    raise exception 'Every linked product must exist and may only be selected once.' using errcode = '22023';
  end if;

  if exists (select 1 from jsonb_array_elements(p_blocks) x where
      coalesce(x->>'block_type', '') not in ('text','image','heading','quote')
      or jsonb_typeof(x->'is_enabled') is distinct from 'boolean'
      or (x->>'block_type' = 'image' and nullif(trim(x->>'image_path'), '') is null)
      or (x->>'block_type' = 'heading' and nullif(trim(x->>'heading'), '') is null)
      or (x->>'block_type' in ('text','quote') and nullif(trim(x->>'body_html'), '') is null))
  then
    raise exception 'Every content block must contain the required content.' using errcode = '22023';
  end if;

  if p_kind = 'blog' and nullif(p_post->>'catalog_category_id', '') is not null and (
    (p_post->>'catalog_category_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    or not exists (select 1 from public.catalog_categories c where c.id = (p_post->>'catalog_category_id')::uuid)
  ) then
    raise exception 'The selected catalog category does not exist.' using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cms-article:' || p_kind || ':' || coalesce(p_post_id::text, 'new'), 0));
  perform pg_advisory_xact_lock(hashtextextended('cms-article-slug:' || p_kind || ':' || v_base_slug, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || p_request_id::text, 0));

  v_hash := md5(jsonb_build_object('kind',p_kind,'post_id',p_post_id,'revision',p_expected_revision,
    'post',p_post,'tags',p_tags,'products',p_products,'blocks',p_blocks,
    'deleted_tags',p_deleted_tag_ids,'deleted_products',p_deleted_product_ids,'deleted_blocks',p_deleted_block_ids)::text);
  select r.* into v_receipt from public.cms_save_receipts r
  where r.actor_id = p_actor_id and r.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'article-save-' || p_kind or v_receipt.payload_hash <> v_hash then
      raise exception 'This save request was already used for different changes.' using errcode = '40001';
    end if;
    return v_receipt.result;
  end if;

  if p_post_id is null then
    if p_expected_revision is not null or cardinality(p_deleted_tag_ids) > 0
      or cardinality(p_deleted_product_ids) > 0 or cardinality(p_deleted_block_ids) > 0
      or exists (select 1 from jsonb_array_elements(p_tags) x where x ? 'id')
      or exists (select 1 from jsonb_array_elements(p_products) x where x ? 'id')
      or exists (select 1 from jsonb_array_elements(p_blocks) x where x ? 'id')
    then
      raise exception 'New articles cannot contain saved row IDs or deletions.' using errcode = '22023';
    end if;
  else
    if p_expected_revision is null or p_expected_revision !~ '^[0-9a-f]{32}$' then
      raise exception 'This editor is out of date. Reload it before saving.' using errcode = '40001';
    end if;
    v_before := public.cms_article_snapshot_v1(p_kind, p_post_id);
    if v_before->>'revision' <> p_expected_revision then
      raise exception 'This article changed since you opened it. Reload before saving.' using errcode = '40001';
    end if;
  end if;

  if (select count(distinct x) from unnest(p_deleted_tag_ids) x) <> cardinality(p_deleted_tag_ids)
    or (select count(distinct x) from unnest(p_deleted_product_ids) x) <> cardinality(p_deleted_product_ids)
    or (select count(distinct x) from unnest(p_deleted_block_ids) x) <> cardinality(p_deleted_block_ids)
  then raise exception 'A deleted row ID was duplicated.' using errcode = '22023'; end if;

  if exists (select 1 from jsonb_array_elements(p_tags) x where x ? 'id' and (coalesce(x->>'id','') !~ '^[1-9][0-9]*$' or x->>'id'=any(p_deleted_tag_ids)))
    or exists (select x->>'id' from jsonb_array_elements(p_tags) x where x ? 'id' group by 1 having count(*)>1)
    or exists (select 1 from jsonb_array_elements(p_products) x where x ? 'id' and (coalesce(x->>'id','') !~ '^[1-9][0-9]*$' or x->>'id'=any(p_deleted_product_ids)))
    or exists (select x->>'id' from jsonb_array_elements(p_products) x where x ? 'id' group by 1 having count(*)>1)
    or exists (select 1 from jsonb_array_elements(p_blocks) x where x ? 'id' and (coalesce(x->>'id','') !~ '^[1-9][0-9]*$' or x->>'id'=any(p_deleted_block_ids)))
    or exists (select x->>'id' from jsonb_array_elements(p_blocks) x where x ? 'id' group by 1 having count(*)>1)
  then raise exception 'A relation ID is invalid, duplicated, or both retained and deleted.' using errcode = '22023'; end if;

  v_slug := v_base_slug;
  if p_post_id is not null then
    if p_kind='blog' then select p.slug into v_slug from public.blog_posts p where p.id=p_post_id;
    else select p.slug into v_slug from public.education_posts p where p.id=p_post_id; end if;
    if v_slug is null then raise exception 'Article not found.' using errcode='P0002'; end if;
    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then v_slug := v_base_slug; end if;
  end if;
  if p_post_id is null or v_slug = v_base_slug then
    loop
      exit when (p_kind='blog' and not exists(select 1 from public.blog_posts p where p.slug=v_slug and p.id is distinct from p_post_id))
        or (p_kind='education' and not exists(select 1 from public.education_posts p where p.slug=v_slug and p.id is distinct from p_post_id));
      v_slug := v_base_slug || '-' || v_suffix; v_suffix := v_suffix + 1;
    end loop;
  end if;

  if p_kind = 'blog' then
    if p_post_id is null then
      insert into public.blog_posts(slug,title,title_html,card_title,subtitle,category,catalog_category_id,author,date_label,read_time,bg_key,bg_color,hero_image_path,card_image_path,hero_image_alt,body_html,is_published,sort_order)
      values(v_slug,trim(p_post->>'title'),coalesce(nullif(trim(p_post->>'title_html'),''),trim(p_post->>'title')),nullif(trim(p_post->>'card_title'),''),trim(p_post->>'subtitle'),trim(p_post->>'category'),nullif(p_post->>'catalog_category_id','')::uuid,trim(p_post->>'author'),trim(p_post->>'date_label'),trim(p_post->>'read_time'),trim(p_post->>'bg_key'),trim(p_post->>'bg_color'),trim(p_post->>'hero_image_path'),nullif(trim(p_post->>'card_image_path'),''),nullif(trim(p_post->>'hero_image_alt'),''),trim(p_post->>'body_html'),(p_post->>'is_published')::boolean,(p_post->>'sort_order')::integer)
      returning id into v_post_id;
    else
      update public.blog_posts p set slug=v_slug,title=trim(p_post->>'title'),title_html=coalesce(nullif(trim(p_post->>'title_html'),''),trim(p_post->>'title')),card_title=nullif(trim(p_post->>'card_title'),''),subtitle=trim(p_post->>'subtitle'),category=trim(p_post->>'category'),catalog_category_id=nullif(p_post->>'catalog_category_id','')::uuid,author=trim(p_post->>'author'),date_label=trim(p_post->>'date_label'),read_time=trim(p_post->>'read_time'),bg_key=trim(p_post->>'bg_key'),bg_color=trim(p_post->>'bg_color'),hero_image_path=trim(p_post->>'hero_image_path'),card_image_path=nullif(trim(p_post->>'card_image_path'),''),hero_image_alt=nullif(trim(p_post->>'hero_image_alt'),''),body_html=trim(p_post->>'body_html'),is_published=(p_post->>'is_published')::boolean,sort_order=(p_post->>'sort_order')::integer,updated_at=now()
      where p.id=v_post_id;
    end if;
  else
    if p_post_id is null then
      insert into public.education_posts(slug,title,title_html,card_title,subtitle,category,author,date_label,read_time,bg_key,bg_color,hero_image_path,card_image_path,hero_image_alt,body_html,is_published,sort_order)
      values(v_slug,trim(p_post->>'title'),coalesce(nullif(trim(p_post->>'title_html'),''),trim(p_post->>'title')),nullif(trim(p_post->>'card_title'),''),trim(p_post->>'subtitle'),trim(p_post->>'category'),trim(p_post->>'author'),trim(p_post->>'date_label'),trim(p_post->>'read_time'),trim(p_post->>'bg_key'),trim(p_post->>'bg_color'),trim(p_post->>'hero_image_path'),nullif(trim(p_post->>'card_image_path'),''),nullif(trim(p_post->>'hero_image_alt'),''),trim(p_post->>'body_html'),(p_post->>'is_published')::boolean,(p_post->>'sort_order')::integer)
      returning id into v_post_id;
    else
      update public.education_posts p set slug=v_slug,title=trim(p_post->>'title'),title_html=coalesce(nullif(trim(p_post->>'title_html'),''),trim(p_post->>'title')),card_title=nullif(trim(p_post->>'card_title'),''),subtitle=trim(p_post->>'subtitle'),category=trim(p_post->>'category'),author=trim(p_post->>'author'),date_label=trim(p_post->>'date_label'),read_time=trim(p_post->>'read_time'),bg_key=trim(p_post->>'bg_key'),bg_color=trim(p_post->>'bg_color'),hero_image_path=trim(p_post->>'hero_image_path'),card_image_path=nullif(trim(p_post->>'card_image_path'),''),hero_image_alt=nullif(trim(p_post->>'hero_image_alt'),''),body_html=trim(p_post->>'body_html'),is_published=(p_post->>'is_published')::boolean,sort_order=(p_post->>'sort_order')::integer,updated_at=now()
      where p.id=v_post_id;
    end if;
  end if;

  -- Existing children must be either retained by ID or explicitly deleted.
  if p_post_id is not null then
    if p_kind='blog' then
      if exists(select 1 from public.blog_post_tags r where r.post_id=v_post_id and r.id::text<>all(p_deleted_tag_ids) and not exists(select 1 from jsonb_array_elements(p_tags)x where x->>'id'=r.id::text))
        or exists(select 1 from jsonb_array_elements(p_tags)x where x?'id' and not exists(select 1 from public.blog_post_tags r where r.post_id=v_post_id and r.id::text=x->>'id'))
        or exists(select 1 from unnest(p_deleted_tag_ids)d where not exists(select 1 from public.blog_post_tags r where r.post_id=v_post_id and r.id::text=d))
        or exists(select 1 from public.blog_post_products r where r.post_id=v_post_id and r.id::text<>all(p_deleted_product_ids) and not exists(select 1 from jsonb_array_elements(p_products)x where x->>'id'=r.id::text))
        or exists(select 1 from jsonb_array_elements(p_products)x where x?'id' and not exists(select 1 from public.blog_post_products r where r.post_id=v_post_id and r.id::text=x->>'id'))
        or exists(select 1 from unnest(p_deleted_product_ids)d where not exists(select 1 from public.blog_post_products r where r.post_id=v_post_id and r.id::text=d))
        or exists(select 1 from public.blog_post_content_blocks r where r.post_id=v_post_id and r.id::text<>all(p_deleted_block_ids) and not exists(select 1 from jsonb_array_elements(p_blocks)x where x->>'id'=r.id::text))
        or exists(select 1 from jsonb_array_elements(p_blocks)x where x?'id' and not exists(select 1 from public.blog_post_content_blocks r where r.post_id=v_post_id and r.id::text=x->>'id'))
        or exists(select 1 from unnest(p_deleted_block_ids)d where not exists(select 1 from public.blog_post_content_blocks r where r.post_id=v_post_id and r.id::text=d))
      then raise exception 'Every existing article relation must be retained or explicitly removed.' using errcode='22023'; end if;
    else
      if exists(select 1 from public.education_post_tags r where r.post_id=v_post_id and r.id::text<>all(p_deleted_tag_ids) and not exists(select 1 from jsonb_array_elements(p_tags)x where x->>'id'=r.id::text))
        or exists(select 1 from jsonb_array_elements(p_tags)x where x?'id' and not exists(select 1 from public.education_post_tags r where r.post_id=v_post_id and r.id::text=x->>'id'))
        or exists(select 1 from unnest(p_deleted_tag_ids)d where not exists(select 1 from public.education_post_tags r where r.post_id=v_post_id and r.id::text=d))
        or exists(select 1 from public.education_post_products r where r.post_id=v_post_id and r.id::text<>all(p_deleted_product_ids) and not exists(select 1 from jsonb_array_elements(p_products)x where x->>'id'=r.id::text))
        or exists(select 1 from jsonb_array_elements(p_products)x where x?'id' and not exists(select 1 from public.education_post_products r where r.post_id=v_post_id and r.id::text=x->>'id'))
        or exists(select 1 from unnest(p_deleted_product_ids)d where not exists(select 1 from public.education_post_products r where r.post_id=v_post_id and r.id::text=d))
        or exists(select 1 from public.education_post_content_blocks r where r.post_id=v_post_id and r.id::text<>all(p_deleted_block_ids) and not exists(select 1 from jsonb_array_elements(p_blocks)x where x->>'id'=r.id::text))
        or exists(select 1 from jsonb_array_elements(p_blocks)x where x?'id' and not exists(select 1 from public.education_post_content_blocks r where r.post_id=v_post_id and r.id::text=x->>'id'))
        or exists(select 1 from unnest(p_deleted_block_ids)d where not exists(select 1 from public.education_post_content_blocks r where r.post_id=v_post_id and r.id::text=d))
      then raise exception 'Every existing article relation must be retained or explicitly removed.' using errcode='22023'; end if;
    end if;
  end if;

  if p_kind='blog' then
    delete from public.blog_post_tags r where r.post_id=v_post_id and r.id::text=any(p_deleted_tag_ids);
    delete from public.blog_post_products r where r.post_id=v_post_id and r.id::text=any(p_deleted_product_ids);
    delete from public.blog_post_content_blocks r where r.post_id=v_post_id and r.id::text=any(p_deleted_block_ids);
  else
    delete from public.education_post_tags r where r.post_id=v_post_id and r.id::text=any(p_deleted_tag_ids);
    delete from public.education_post_products r where r.post_id=v_post_id and r.id::text=any(p_deleted_product_ids);
    delete from public.education_post_content_blocks r where r.post_id=v_post_id and r.id::text=any(p_deleted_block_ids);
  end if;

  v_position:=0;
  for v_item in select value from jsonb_array_elements(p_tags) loop
    v_position:=v_position+1; v_id_text:=v_item->>'id';
    if p_kind='blog' then
      if v_id_text is null then insert into public.blog_post_tags(post_id,tag,sort_order) values(v_post_id,trim(v_item->>'tag'),v_position);
      else update public.blog_post_tags r set tag=trim(v_item->>'tag'),sort_order=v_position,updated_at=now() where r.id=v_id_text::bigint and r.post_id=v_post_id and (r.tag,r.sort_order) is distinct from (trim(v_item->>'tag'),v_position); end if;
    else
      if v_id_text is null then insert into public.education_post_tags(post_id,tag,sort_order) values(v_post_id,trim(v_item->>'tag'),v_position);
      else update public.education_post_tags r set tag=trim(v_item->>'tag'),sort_order=v_position,updated_at=now() where r.id=v_id_text::bigint and r.post_id=v_post_id and (r.tag,r.sort_order) is distinct from (trim(v_item->>'tag'),v_position); end if;
    end if;
  end loop;

  v_position:=0;
  for v_item in select value from jsonb_array_elements(p_products) loop
    v_position:=v_position+1; v_id_text:=v_item->>'id';
    if p_kind='blog' then
      if v_id_text is null then insert into public.blog_post_products(post_id,product_id,sort_order) values(v_post_id,(v_item->>'product_id')::uuid,v_position);
      else update public.blog_post_products r set product_id=(v_item->>'product_id')::uuid,sort_order=v_position where r.id=v_id_text::bigint and r.post_id=v_post_id and (r.product_id,r.sort_order) is distinct from ((v_item->>'product_id')::uuid,v_position); end if;
    else
      if v_id_text is null then insert into public.education_post_products(post_id,product_id,sort_order) values(v_post_id,(v_item->>'product_id')::uuid,v_position);
      else update public.education_post_products r set product_id=(v_item->>'product_id')::uuid,sort_order=v_position where r.id=v_id_text::bigint and r.post_id=v_post_id and (r.product_id,r.sort_order) is distinct from ((v_item->>'product_id')::uuid,v_position); end if;
    end if;
  end loop;

  v_position:=0;
  for v_item in select value from jsonb_array_elements(p_blocks) loop
    v_position:=v_position+1; v_id_text:=v_item->>'id';
    if p_kind='blog' then
      if v_id_text is null then insert into public.blog_post_content_blocks(post_id,block_type,sort_order,heading,body_html,image_path,image_alt,image_caption,is_enabled) values(v_post_id,v_item->>'block_type',v_position,nullif(trim(v_item->>'heading'),''),nullif(trim(v_item->>'body_html'),''),nullif(trim(v_item->>'image_path'),''),nullif(trim(v_item->>'image_alt'),''),nullif(trim(v_item->>'image_caption'),''),(v_item->>'is_enabled')::boolean);
      else update public.blog_post_content_blocks r set block_type=v_item->>'block_type',sort_order=v_position,heading=nullif(trim(v_item->>'heading'),''),body_html=nullif(trim(v_item->>'body_html'),''),image_path=nullif(trim(v_item->>'image_path'),''),image_alt=nullif(trim(v_item->>'image_alt'),''),image_caption=nullif(trim(v_item->>'image_caption'),''),is_enabled=(v_item->>'is_enabled')::boolean,updated_at=now() where r.id=v_id_text::bigint and r.post_id=v_post_id; end if;
    else
      if v_id_text is null then insert into public.education_post_content_blocks(post_id,block_type,sort_order,heading,body_html,image_path,image_alt,image_caption,is_enabled) values(v_post_id,v_item->>'block_type',v_position,nullif(trim(v_item->>'heading'),''),nullif(trim(v_item->>'body_html'),''),nullif(trim(v_item->>'image_path'),''),nullif(trim(v_item->>'image_alt'),''),nullif(trim(v_item->>'image_caption'),''),(v_item->>'is_enabled')::boolean);
      else update public.education_post_content_blocks r set block_type=v_item->>'block_type',sort_order=v_position,heading=nullif(trim(v_item->>'heading'),''),body_html=nullif(trim(v_item->>'body_html'),''),image_path=nullif(trim(v_item->>'image_path'),''),image_alt=nullif(trim(v_item->>'image_alt'),''),image_caption=nullif(trim(v_item->>'image_caption'),''),is_enabled=(v_item->>'is_enabled')::boolean,updated_at=now() where r.id=v_id_text::bigint and r.post_id=v_post_id; end if;
    end if;
  end loop;

  v_result:=public.cms_article_snapshot_v1(p_kind,v_post_id);
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result)
  values(p_actor_id,p_request_id,'article-save-'||p_kind,v_hash,v_result);
  return v_result;
end;
$$;

create or replace function public.cms_delete_article_v1(p_actor_id uuid,p_request_id uuid,p_kind text,p_post_id bigint,p_expected_revision text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_before jsonb; v_result jsonb; v_receipt public.cms_save_receipts%rowtype; v_hash text;
begin
  if p_actor_id is null or p_request_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then raise exception 'Administrator access is required.' using errcode='42501'; end if;
  if p_kind not in ('blog','education') or p_post_id is null or p_post_id<1 or coalesce(p_expected_revision,'') !~ '^[0-9a-f]{32}$' then raise exception 'Invalid delete request.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cms-article:'||p_kind||':'||p_post_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text||p_request_id::text,0));
  v_hash:=md5(jsonb_build_object('kind',p_kind,'post_id',p_post_id,'revision',p_expected_revision)::text);
  select r.* into v_receipt from public.cms_save_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then if v_receipt.operation<>'article-delete-'||p_kind or v_receipt.payload_hash<>v_hash then raise exception 'This delete request was already used for different changes.' using errcode='40001'; end if; return v_receipt.result; end if;
  v_before:=public.cms_article_snapshot_v1(p_kind,p_post_id);
  if v_before->>'revision'<>p_expected_revision then raise exception 'This article changed since you opened it. Reload before deleting.' using errcode='40001'; end if;
  if p_kind='blog' then
    delete from public.blog_post_content_blocks where post_id=p_post_id; delete from public.blog_post_tags where post_id=p_post_id; delete from public.blog_post_products where post_id=p_post_id; delete from public.blog_posts where id=p_post_id;
  else
    delete from public.education_post_content_blocks where post_id=p_post_id; delete from public.education_post_tags where post_id=p_post_id; delete from public.education_post_products where post_id=p_post_id; delete from public.education_posts where id=p_post_id;
  end if;
  v_result:=jsonb_build_object('ok',true,'deleted_id',p_post_id);
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'article-delete-'||p_kind,v_hash,v_result);
  return v_result;
end; $$;

create or replace function public.cms_docs_snapshot_v1(p_slug text)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare v_page jsonb; v_blocks jsonb; v_content jsonb;
begin
  select to_jsonb(p)-'created_at'-'updated_at' into v_page from public.docs_pages p where p.slug=p_slug;
  if v_page is null then raise exception 'Docs page not found.' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(to_jsonb(b)-'page_id'-'created_at'-'updated_at' order by b.sort_order,b.id),'[]'::jsonb) into v_blocks from public.docs_blocks b where b.page_id=(v_page->>'id')::bigint;
  v_content:=jsonb_build_object('page',v_page,'blocks',v_blocks);
  return v_content||jsonb_build_object('revision',md5(v_content::text));
end; $$;

create or replace function public.cms_save_docs_page_v1(p_actor_id uuid,p_request_id uuid,p_slug text,p_expected_revision text,p_page jsonb,p_blocks jsonb,p_deleted_block_ids text[])
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_before jsonb; v_result jsonb; v_receipt public.cms_save_receipts%rowtype; v_hash text; v_page_id bigint; v_item jsonb; v_id text; v_pos integer:=0;
begin
  if p_actor_id is null or p_request_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then raise exception 'Administrator access is required.' using errcode='42501'; end if;
  if p_slug not in ('terms','privacy-policy','shipping','returns') or coalesce(p_expected_revision,'') !~ '^[0-9a-f]{32}$' or jsonb_typeof(p_page) is distinct from 'object' or jsonb_typeof(p_blocks) is distinct from 'array' or p_deleted_block_ids is null or array_position(p_deleted_block_ids,null) is not null then raise exception 'Invalid docs payload. Reload this editor.' using errcode='22023'; end if;
  if jsonb_array_length(p_blocks)>100 or cardinality(p_deleted_block_ids)>100 then raise exception 'Too many docs blocks.' using errcode='22023'; end if;
  if nullif(trim(p_page->>'title'),'') is null or nullif(trim(p_page->>'eyebrow'),'') is null or nullif(trim(p_page->>'subtitle'),'') is null then raise exception 'All page fields are required.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_blocks)x where jsonb_typeof(x->'heading') is distinct from 'string' or jsonb_typeof(x->'description') is distinct from 'string' or jsonb_typeof(x->'body') is distinct from 'string' or (nullif(trim(x->>'heading'),'') is null and nullif(trim(x->>'description'),'') is null and nullif(trim(x->>'body'),'') is null)) then raise exception 'Every docs block must contain content.' using errcode='22023'; end if;
  if p_slug='returns' and nullif(p_page->>'faq_category_id','') is not null and ((p_page->>'faq_category_id') !~ '^[1-9][0-9]*$' or not exists(select 1 from public.support_faq_categories c where c.id=(p_page->>'faq_category_id')::bigint)) then raise exception 'The selected FAQ category does not exist.' using errcode='23503'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cms-docs:'||p_slug,0)); perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text||p_request_id::text,0));
  v_hash:=md5(jsonb_build_object('slug',p_slug,'revision',p_expected_revision,'page',p_page,'blocks',p_blocks,'deleted',p_deleted_block_ids)::text);
  select r.* into v_receipt from public.cms_save_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then if v_receipt.operation<>'docs-save-'||p_slug or v_receipt.payload_hash<>v_hash then raise exception 'This save request was already used for different changes.' using errcode='40001'; end if; return v_receipt.result; end if;
  v_before:=public.cms_docs_snapshot_v1(p_slug); if v_before->>'revision'<>p_expected_revision then raise exception 'This page changed since you opened it. Reload before saving.' using errcode='40001'; end if;
  v_page_id:=(v_before->'page'->>'id')::bigint;
  if (select count(distinct x) from unnest(p_deleted_block_ids)x)<>cardinality(p_deleted_block_ids)
    or exists(select 1 from jsonb_array_elements(p_blocks)x where x?'id' and (coalesce(x->>'id','') !~ '^[1-9][0-9]*$' or x->>'id'=any(p_deleted_block_ids)))
    or exists(select x->>'id' from jsonb_array_elements(p_blocks)x where x?'id' group by 1 having count(*)>1)
    or exists(select 1 from public.docs_blocks r where r.page_id=v_page_id and r.id::text<>all(p_deleted_block_ids) and not exists(select 1 from jsonb_array_elements(p_blocks)x where x->>'id'=r.id::text))
    or exists(select 1 from jsonb_array_elements(p_blocks)x where x?'id' and not exists(select 1 from public.docs_blocks r where r.page_id=v_page_id and r.id::text=x->>'id'))
    or exists(select 1 from unnest(p_deleted_block_ids)d where not exists(select 1 from public.docs_blocks r where r.page_id=v_page_id and r.id::text=d))
  then raise exception 'Every existing docs block must be retained or explicitly removed.' using errcode='22023'; end if;
  update public.docs_pages p set title=trim(p_page->>'title'),eyebrow=trim(p_page->>'eyebrow'),subtitle=trim(p_page->>'subtitle'),faq_category_id=case when p_slug='returns' then nullif(p_page->>'faq_category_id','')::bigint else p.faq_category_id end,updated_at=now() where p.id=v_page_id;
  delete from public.docs_blocks b where b.page_id=v_page_id and b.id::text=any(p_deleted_block_ids);
  for v_item in select value from jsonb_array_elements(p_blocks) loop v_pos:=v_pos+1; v_id:=v_item->>'id';
    if v_id is null then insert into public.docs_blocks(page_id,sort_order,heading,description,body) values(v_page_id,v_pos,trim(v_item->>'heading'),trim(v_item->>'description'),trim(v_item->>'body'));
    else update public.docs_blocks b set sort_order=v_pos,heading=trim(v_item->>'heading'),description=trim(v_item->>'description'),body=trim(v_item->>'body'),updated_at=now() where b.id=v_id::bigint and b.page_id=v_page_id and (b.sort_order,b.heading,b.description,b.body) is distinct from (v_pos,trim(v_item->>'heading'),trim(v_item->>'description'),trim(v_item->>'body')); end if;
  end loop;
  v_result:=public.cms_docs_snapshot_v1(p_slug); insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'docs-save-'||p_slug,v_hash,v_result); return v_result;
end; $$;

revoke all on function public.cms_article_snapshot_v1(text,bigint) from public,anon,authenticated;
revoke all on function public.cms_save_article_v1(uuid,uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,text[],text[],text[]) from public,anon,authenticated;
revoke all on function public.cms_delete_article_v1(uuid,uuid,text,bigint,text) from public,anon,authenticated;
revoke all on function public.cms_docs_snapshot_v1(text) from public,anon,authenticated;
revoke all on function public.cms_save_docs_page_v1(uuid,uuid,text,text,jsonb,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.cms_article_snapshot_v1(text,bigint) to service_role;
grant execute on function public.cms_save_article_v1(uuid,uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,text[],text[],text[]) to service_role;
grant execute on function public.cms_delete_article_v1(uuid,uuid,text,bigint,text) to service_role;
grant execute on function public.cms_docs_snapshot_v1(text) to service_role;
grant execute on function public.cms_save_docs_page_v1(uuid,uuid,text,text,jsonb,jsonb,text[]) to service_role;

notify pgrst,'reload schema';
commit;
