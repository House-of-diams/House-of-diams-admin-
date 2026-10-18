-- REVIEW ONLY, NOT AUTHORIZED/EXECUTED/PARSED. Requires dated legacy routine hash
-- 6399ed7f5ef20c613fa12f50f7c3bc3161c43d48a5a668ece29f19d3761ec337
-- and current receipt/unique/FK/default/trigger/policy/owner metadata agreement.
-- Heavy all-writer table locking intentionally trades throughput for proof:
-- SHARE ROW EXCLUSIVE conflicts with every ordinary INSERT/UPDATE/DELETE and
-- serializes prepares. Parent row locks alone do NOT protect child writers.
-- Owner must own/hold lock rights on every listed table and read profile/receipt
-- under reviewed RLS; no caller DML/LOCK TABLE privilege is granted. Shared impact
-- and capacity acceptance REQUIRED before enabling this capability.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$ BEGIN
 IF current_setting('d1e.duplicate_review',true) IS DISTINCT FROM 'APPROVED_CURRENT_SOURCE_RECEIPTS_LOCKS_OWNER'
 OR to_regprocedure('public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid)') IS NOT NULL
 OR to_regprocedure('public.duplicate_product(uuid,uuid,uuid)') IS NULL
 OR (SELECT encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('public.duplicate_product(uuid,uuid,uuid)')),'UTF8')),'hex'))
 IS DISTINCT FROM '6399ed7f5ef20c613fa12f50f7c3bc3161c43d48a5a668ece29f19d3761ec337'
 THEN RAISE EXCEPTION 'Review-only: unresolved prestate or existing capability'; END IF;
END $guard$;
CREATE FUNCTION public.admin_product_duplicate_prepare_v1(p_source uuid,p_request uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE receipt public.product_duplicate_requests%rowtype; source_row jsonb; replay_row jsonb;
BEGIN
 IF p_source IS NULL OR p_request IS NULL OR p_actor IS NULL OR NOT EXISTS
 (SELECT 1 FROM public.profiles WHERE id=p_actor AND role='admin')
 THEN RAISE EXCEPTION 'Administrator/source/request required' USING ERRCODE='42501'; END IF;
 -- Same key and order as legacy duplicate routine, retained through outer commit.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 SELECT * INTO receipt FROM public.product_duplicate_requests WHERE request_id=p_request;
 IF FOUND THEN
  IF receipt.source_product_id IS DISTINCT FROM p_source OR receipt.requested_by IS DISTINCT FROM p_actor
  THEN RAISE EXCEPTION 'Duplicate request identity mismatch' USING ERRCODE='40001'; END IF;
  IF receipt.new_product_id IS NULL THEN RAISE EXCEPTION 'Incomplete duplicate receipt' USING ERRCODE='40001'; END IF;
  SELECT jsonb_build_object('product_id',id,'slug',slug,'lane',coalesce(product_lane,'standard')) INTO replay_row
  FROM public.products WHERE id=receipt.new_product_id;
  IF replay_row IS NULL THEN RAISE EXCEPTION 'Duplicate result unavailable' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('replay',replay_row);
 END IF;
 -- Includes all legacy cloned relations, blocking update/delete and insert phantoms.
 LOCK TABLE public.products,public.product_metal_selections,
 public.product_material_value_selections,public.product_stone_shapes,
 public.product_subcategory_links,public.product_option_links,public.product_metal_media,
 public.product_purity_prices,public.product_variant_media_items,public.product_metal_variants,
 public.product_faq_items IN SHARE ROW EXCLUSIVE MODE;
 SELECT to_jsonb(p) INTO source_row FROM public.products p WHERE id=p_source;
 IF source_row IS NULL THEN RAISE EXCEPTION 'Source product unavailable'; END IF;
 RETURN jsonb_build_object('graph',jsonb_build_object('product',source_row,
 'metal_media',coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM public.product_metal_media m WHERE product_id=p_source),'[]'::jsonb),
 'variants',coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM public.product_metal_variants v WHERE product_id=p_source),'[]'::jsonb),
 'media_items',coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM public.product_variant_media_items m WHERE product_id=p_source),'[]'::jsonb),
 'product_metal_selections',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.product_metal_selections c WHERE product_id=p_source),'[]'::jsonb),
 'product_material_value_selections',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.product_material_value_selections c WHERE product_id=p_source),'[]'::jsonb),
 'product_stone_shapes',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.product_stone_shapes c WHERE product_id=p_source),'[]'::jsonb),
 'product_subcategory_links',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.product_subcategory_links c WHERE product_id=p_source),'[]'::jsonb),
 'product_option_links',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.product_option_links c WHERE product_id=p_source),'[]'::jsonb),
 'product_purity_prices',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.product_purity_prices c WHERE product_id=p_source),'[]'::jsonb),
 'product_faq_items',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.product_faq_items c WHERE product_id=p_source),'[]'::jsonb)));
END $body$;
ALTER FUNCTION public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid) OWNER TO :"object_owner";
REVOKE ALL ON FUNCTION public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid) TO hod_admin_app;
-- Application MUST use one B2 transaction for prepare -> enforce -> duplicate.
-- No capability cache/ENV override. Missing capability fails closed, even on replay.
ROLLBACK;
