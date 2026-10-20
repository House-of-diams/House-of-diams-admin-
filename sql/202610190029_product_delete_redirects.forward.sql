-- Phase 3: deleting a product keeps its public address working. Adds
-- admin_product_delete_v2, used by single and bulk delete. Before the delete it
-- repoints any active redirect that targeted the product; after the delete it adds a
-- 301 from /shop/<slug> to the product's category page (or its lane's listing page).
-- admin_product_bulk_delete_v1 stays installed and unchanged.
-- Apply to UAT first, as hod_migration, after an RDS snapshot.
-- Rollback: 202610190029_product_delete_redirects.rollback.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $guard$
begin
  if current_user <> 'hod_migration' then raise exception 'Run as hod_migration'; end if;
  if to_regprocedure('public.admin_product_delete_v2(uuid,uuid,text,uuid[])') is not null then
    raise exception 'admin_product_delete_v2 already exists; inspect before replaying';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hod_admin_app') then
    raise exception 'hod_admin_app role is missing';
  end if;
  if to_regclass('public.seo_redirects') is null
     or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'seo_redirects_source_path_unique') then
    raise exception 'seo_redirects or its unique source_path index is missing';
  end if;
end $guard$;

create function public.admin_product_delete_v2(p_actor_id uuid, p_request_id uuid, p_lane text, p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
-- p_lane null = single delete from the list: products already gone are ignored,
-- matching the earlier single DELETE. With a lane, every product must exist in it.
declare
  v_receipt public.cms_save_receipts%rowtype;
  v_hash text;
  v_result jsonb;
  v_items jsonb;
  v_paths jsonb;
  v_redirects int;
begin
  if p_actor_id is null or p_request_id is null or not exists(select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin') then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if (p_lane is not null and p_lane not in ('standard','hiphop','collection'))
     or coalesce(cardinality(p_ids), 0) not between 1 and 500
     or cardinality(p_ids) <> cardinality(array(select distinct x from unnest(p_ids) x)) then
    raise exception 'Invalid product deletion request.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('product-operation-request:' || p_actor_id || ':' || p_request_id, 0));
  v_hash := md5(jsonb_build_object('lane', p_lane, 'ids', p_ids)::text);
  select r.* into v_receipt from public.cms_save_receipts r where r.actor_id = p_actor_id and r.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'product-delete-v2' or v_receipt.payload_hash <> v_hash then
      raise exception 'This request ID was already used.' using errcode = '40001';
    end if;
    return v_receipt.result;
  end if;

  perform 1 from public.products p where p.id = any(p_ids) order by p.id for update;
  if p_lane is not null then
    if (select count(*) from public.products p where p.id = any(p_ids)) <> cardinality(p_ids) then
      raise exception 'A product was not found.' using errcode = 'P0002';
    end if;
    if exists(select 1 from public.products p where p.id = any(p_ids) and coalesce(p.product_lane, 'standard') <> p_lane) then
      raise exception 'A product is outside this lane.' using errcode = '40001';
    end if;
  end if;

  -- Old product address -> where visitors land after the delete.
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'source', '/shop/' || p.slug, 'target',
           case when coalesce(p.product_lane, 'standard') = 'standard'
                 and c.status::text = 'active' and c.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                 and not exists(select 1 from public.seo_redirects r where r.is_active and r.source_path = '/' || c.slug)
                then '/' || c.slug
                when p.product_lane = 'hiphop' then '/hiphop'
                when p.product_lane = 'collection' then '/collection'
                else '/shop' end)), '[]'::jsonb)
    into v_paths
    from public.products p left join public.catalog_categories c on c.id = p.main_category_id
   where p.id = any(p_ids) and nullif(trim(p.slug), '') is not null;

  -- Redirects that ended at a deleted product would end at a missing page; point them
  -- at the same landing page instead. They are no longer owned by the product.
  update public.seo_redirects r
     set target_path = x->>'target', entity_type = 'manual',
         reason = left(coalesce(nullif(r.reason, '') || '; ', '') || 'product deleted', 500)
    from jsonb_array_elements(v_paths) x
   where r.is_active and r.target_path = x->>'source' and r.source_path <> x->>'target';
  update public.seo_redirects r
     set is_active = false
    from jsonb_array_elements(v_paths) x
   where r.is_active and r.target_path = x->>'source';

  with deleted as (delete from public.products p where p.id = any(p_ids) returning p.id)
  select coalesce(jsonb_agg(to_jsonb(d.id) order by d.id), '[]'::jsonb) into v_items from deleted d;

  insert into public.seo_redirects as r (source_path, target_path, http_status, entity_type, entity_id, reason, is_active)
  select x->>'source', x->>'target', 301, 'manual', (x->>'id')::uuid, 'product deleted', true
    from jsonb_array_elements(v_paths) x
  on conflict (source_path) do update
     set target_path = excluded.target_path, http_status = 301, entity_type = 'manual',
         entity_id = excluded.entity_id, reason = excluded.reason, is_active = true;
  get diagnostics v_redirects = row_count;

  v_result := jsonb_build_object('ok', true, 'deletedCount', jsonb_array_length(v_items), 'ids', v_items, 'redirectCount', v_redirects);
  insert into public.cms_save_receipts(actor_id, request_id, operation, payload_hash, result)
  values (p_actor_id, p_request_id, 'product-delete-v2', v_hash, v_result);
  return v_result;
end;
$function$;

revoke all on function public.admin_product_delete_v2(uuid,uuid,text,uuid[]) from public;
grant execute on function public.admin_product_delete_v2(uuid,uuid,text,uuid[]) to hod_admin_app;

commit;
