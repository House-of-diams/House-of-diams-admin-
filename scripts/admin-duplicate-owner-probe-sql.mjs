export const duplicateOwnerProbeSql=`
CREATE TEMP TABLE admin_duplicate13_probe ON COMMIT DROP AS
 SELECT gen_random_uuid() AS source_id,gen_random_uuid() AS request_id,
 'AWS-PROBE-'||gen_random_uuid()::text AS marker,m.profile_id AS actor_id,m.issuer,m.subject,
 (SELECT id FROM public.catalog_categories WHERE status::text='active' AND coalesce(category_lane,'standard')='standard' ORDER BY id LIMIT 1) AS category_id
 FROM public.admin_identities m JOIN public.profiles p ON p.id=m.profile_id
 WHERE m.issuer='https://auth-uat.houseofdiams.com/realms/houseofdiams'
 AND m.subject='1167a5b6-9fcb-45d1-b7d8-53e95cd49704' AND m.enabled AND m.revoked_at IS NULL AND p.role::text='admin';
DO $probe_guard$ DECLARE r record; BEGIN
 IF (SELECT count(*) FROM admin_duplicate13_probe)<>1 THEN RAISE EXCEPTION 'Expected enabled mapping missing'; END IF;
 SELECT * INTO r FROM admin_duplicate13_probe;
 IF r.category_id IS NULL OR EXISTS(SELECT FROM public.products WHERE id=r.source_id)
 OR EXISTS(SELECT FROM public.product_duplicate_requests WHERE request_id=r.request_id)
 THEN RAISE EXCEPTION 'Duplicate fixture prerequisite/collision'; END IF;
END $probe_guard$;
SAVEPOINT admin_duplicate13_acceptance;
DO $probe$ DECLARE r record; prepared jsonb; copied record; replay jsonb; BEGIN
 SELECT * INTO r FROM admin_duplicate13_probe;
 INSERT INTO public.products(id,name,slug,sku,main_category_id,stock_quantity,base_price,status,product_lane,allow_checkout)
 VALUES(r.source_id,r.marker,lower(r.marker),r.marker,r.category_id,7,1,'draft','standard',false);
 INSERT INTO public.product_faq_items(product_id,question,answer) VALUES(r.source_id,'Migration fixture?','Rollback only.');
 INSERT INTO public.product_purity_prices(product_id,purity_label,price,sort_order) VALUES(r.source_id,'Fixture',1,1);
 UPDATE public.products SET default_purity_price_id=(SELECT id FROM public.product_purity_prices WHERE product_id=r.source_id) WHERE id=r.source_id;
 prepared:=public.admin_product_duplicate_prepare_v1(r.source_id,r.request_id,r.actor_id,r.issuer,r.subject);
 IF prepared->'graph'->'product'->>'id'<>r.source_id::text
 OR jsonb_array_length(prepared->'graph'->'product_faq_items')<>1 THEN RAISE EXCEPTION 'Prepared graph differs'; END IF;
 SELECT * INTO copied FROM public.duplicate_product(r.source_id,r.request_id,r.actor_id);
 IF copied.product_id IS NULL OR copied.product_id=r.source_id OR copied.lane<>'standard'
 OR NOT EXISTS(SELECT FROM public.products WHERE id=copied.product_id AND status::text='draft' AND stock_quantity=0
 AND NOT allow_checkout AND duplicated_from_product_id=r.source_id AND duplicated_by=r.actor_id
 AND default_purity_price_id IN(SELECT id FROM public.product_purity_prices WHERE product_id=copied.product_id))
 OR (SELECT count(*) FROM public.product_faq_items WHERE product_id=copied.product_id)<>1
 THEN RAISE EXCEPTION 'Duplicate draft/graph contract differs'; END IF;
 replay:=public.admin_product_duplicate_prepare_v1(r.source_id,r.request_id,r.actor_id,r.issuer,r.subject);
 IF replay->'replay'->>'product_id'<>copied.product_id::text
 OR (SELECT count(*) FROM public.product_duplicate_requests WHERE request_id=r.request_id AND new_product_id=copied.product_id)<>1
 THEN RAISE EXCEPTION 'Duplicate replay differs'; END IF;
 BEGIN
  PERFORM public.admin_product_duplicate_prepare_v1(gen_random_uuid(),r.request_id,r.actor_id,r.issuer,r.subject);
  RAISE EXCEPTION 'Request source mismatch accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.admin_product_duplicate_prepare_v1(r.source_id,gen_random_uuid(),gen_random_uuid(),r.issuer,r.subject);
  RAISE EXCEPTION 'Unknown actor accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $probe$;
ROLLBACK TO SAVEPOINT admin_duplicate13_acceptance;
RELEASE SAVEPOINT admin_duplicate13_acceptance;
DO $absence$ DECLARE r record; BEGIN
 SELECT * INTO r FROM admin_duplicate13_probe;
 IF EXISTS(SELECT FROM public.products WHERE id=r.source_id OR duplicated_from_product_id=r.source_id OR sku=r.marker)
 OR EXISTS(SELECT FROM public.product_duplicate_requests WHERE request_id=r.request_id OR source_product_id=r.source_id)
 OR EXISTS(SELECT FROM public.product_faq_items WHERE product_id=r.source_id)
 OR EXISTS(SELECT FROM public.product_purity_prices WHERE product_id=r.source_id)
 THEN RAISE EXCEPTION 'Duplicate fixture cleanup failed'; END IF;
END $absence$;
`
