begin;

create or replace function public.cms_support_faq_categories_v1()
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg((to_jsonb(c)-'created_at'-'updated_at')||jsonb_build_object('_revision',md5((to_jsonb(c)-'created_at'-'updated_at')::text)) order by c.sort_order,c.id),'[]'::jsonb)
  from public.support_faq_categories c;
$$;

create or replace function public.cms_save_support_faq_category_v1(p_actor_id uuid,p_request_id uuid,p_expected_revision text,p_id bigint,p_item jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_before jsonb;v_revision text;v_result jsonb;v_receipt public.cms_save_receipts%rowtype;v_hash text:=md5(jsonb_build_object('id',p_id,'revision',p_expected_revision,'item',p_item)::text);v_id bigint;v_name text:=trim(coalesce(p_item->>'name',''));v_slug text:=lower(regexp_replace(regexp_replace(trim(coalesce(nullif(p_item->>'slug',''),p_item->>'name','')),'[^a-zA-Z0-9]+','-','g'),'(^-|-$)','','g'));v_order int;
begin
  if p_actor_id is null or p_request_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then raise exception 'Administrator access is required.' using errcode='42501';end if;
  if p_item is null or jsonb_typeof(p_item)<>'object' or exists(select 1 from jsonb_object_keys(p_item) k where k<>all(array['name','slug','description','image_path','image_alt','sort_order','is_active'])) then raise exception 'Invalid FAQ category payload.' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('support-faq-category-request:'||p_actor_id||':'||p_request_id,0));
  select * into v_receipt from public.cms_save_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then if v_receipt.operation<>'support-faq-category-save' or v_receipt.payload_hash<>v_hash then raise exception 'This request ID was already used.' using errcode='22023';end if;return v_receipt.result;end if;
  perform pg_advisory_xact_lock(hashtextextended('support-faq-category:'||coalesce(p_id::text,'new'),0));
  if p_id is null then if p_expected_revision is not null then raise exception 'New categories cannot include a revision.' using errcode='22023';end if;
  else select to_jsonb(c)-'created_at'-'updated_at' into v_before from public.support_faq_categories c where c.id=p_id;if v_before is null then raise exception 'FAQ category not found.' using errcode='P0002';end if;v_revision:=md5(v_before::text);if p_expected_revision is null or p_expected_revision<>v_revision then raise exception 'This FAQ category changed since you opened it.' using errcode='40001';end if;end if;
  begin v_order:=coalesce((p_item->>'sort_order')::int,1);exception when others then raise exception 'Sort order must be a whole number.' using errcode='22023';end;
  if v_name='' or v_slug='' or v_order<0 or v_order>1000000 then raise exception 'Invalid FAQ category details.' using errcode='22023';end if;
  if p_id is null then insert into public.support_faq_categories(name,slug,description,image_path,image_alt,sort_order,is_active) values(v_name,v_slug,trim(coalesce(p_item->>'description','')),nullif(trim(coalesce(p_item->>'image_path','')),''),trim(coalesce(nullif(p_item->>'image_alt',''),v_name)),v_order,coalesce((p_item->>'is_active')::boolean,true)) returning id into v_id;
  else update public.support_faq_categories set name=v_name,slug=v_slug,description=trim(coalesce(p_item->>'description','')),image_path=nullif(trim(coalesce(p_item->>'image_path','')),''),image_alt=trim(coalesce(nullif(p_item->>'image_alt',''),v_name)),sort_order=v_order,is_active=coalesce((p_item->>'is_active')::boolean,true),updated_at=now() where id=p_id returning id into v_id;end if;
  select jsonb_build_object('category',(to_jsonb(c)-'created_at'-'updated_at')||jsonb_build_object('_revision',md5((to_jsonb(c)-'created_at'-'updated_at')::text))) into v_result from public.support_faq_categories c where c.id=v_id;
  insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'support-faq-category-save',v_hash,v_result);return v_result;
exception when unique_violation then raise exception 'An FAQ category with this name or slug already exists.' using errcode='23505';end;
$$;

create or replace function public.cms_delete_support_faq_category_v1(p_actor_id uuid,p_request_id uuid,p_expected_revision text,p_id bigint)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_before jsonb;v_revision text;v_result jsonb;v_receipt public.cms_save_receipts%rowtype;v_hash text:=md5(jsonb_build_object('id',p_id,'revision',p_expected_revision)::text);v_count int;
begin
  if p_actor_id is null or p_request_id is null or p_id is null or p_expected_revision is null or not exists(select 1 from public.profiles p where p.id=p_actor_id and p.role='admin') then raise exception 'Invalid FAQ category delete request.' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('support-faq-category-request:'||p_actor_id||':'||p_request_id,0));select * into v_receipt from public.cms_save_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;if found then if v_receipt.operation<>'support-faq-category-delete' or v_receipt.payload_hash<>v_hash then raise exception 'This request ID was already used.' using errcode='22023';end if;return v_receipt.result;end if;
  perform pg_advisory_xact_lock(hashtextextended('support-faq-category:'||p_id,0));select to_jsonb(c)-'created_at'-'updated_at' into v_before from public.support_faq_categories c where c.id=p_id;if v_before is null then raise exception 'FAQ category not found.' using errcode='P0002';end if;v_revision:=md5(v_before::text);if v_revision<>p_expected_revision then raise exception 'This FAQ category changed since you opened it.' using errcode='40001';end if;
  select (select count(*) from public.support_faq_items where category_id=p_id)+(select count(*) from public.docs_pages where faq_category_id=p_id) into v_count;if v_count>0 then raise exception 'Remove this category from its FAQs and document page before deleting it.' using errcode='23503';end if;
  delete from public.support_faq_categories where id=p_id;v_result:=jsonb_build_object('ok',true,'id',p_id);insert into public.cms_save_receipts(actor_id,request_id,operation,payload_hash,result) values(p_actor_id,p_request_id,'support-faq-category-delete',v_hash,v_result);return v_result;
end;
$$;

revoke all on function public.cms_support_faq_categories_v1() from public,anon,authenticated;
revoke all on function public.cms_save_support_faq_category_v1(uuid,uuid,text,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.cms_delete_support_faq_category_v1(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.cms_support_faq_categories_v1() to service_role;
grant execute on function public.cms_save_support_faq_category_v1(uuid,uuid,text,bigint,jsonb) to service_role;
grant execute on function public.cms_delete_support_faq_category_v1(uuid,uuid,text,bigint) to service_role;
notify pgrst,'reload schema';
commit;
