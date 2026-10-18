export const duplicateSignature='public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid,text,text)'
export const duplicateChildren=['product_metal_media','product_metal_variants','product_variant_media_items',
 'product_metal_selections','product_material_value_selections','product_stone_shapes','product_subcategory_links',
 'product_option_links','product_purity_prices','product_faq_items']
const graphKeys={product_metal_media:'metal_media',product_metal_variants:'variants',product_variant_media_items:'media_items'}
export const duplicateBody=`
DECLARE receipt public.product_duplicate_requests%ROWTYPE; source_row jsonb; replay_row jsonb;
BEGIN
 IF p_source IS NULL OR p_request IS NULL OR p_actor IS NULL OR p_issuer IS NULL OR p_subject IS NULL
 OR length(p_issuer) NOT BETWEEN 1 AND 2048 OR length(p_subject) NOT BETWEEN 1 AND 512 THEN
  RAISE EXCEPTION 'Administrator/source/request required' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation') NOT IN ('repeatable read','serializable')
 OR current_setting('transaction_read_only')<>'off' THEN
  RAISE EXCEPTION 'Duplication requires a repeatable write transaction' USING ERRCODE='25001'; END IF;
 -- The authenticated route supplies the internal actor, never the browser body.
 -- Lock the enabled enrollment/profile so revocation cannot race the operation.
 PERFORM 1 FROM public.admin_identities m JOIN public.profiles p ON p.id=m.profile_id
 WHERE m.profile_id=p_actor AND m.issuer=p_issuer AND m.subject=p_subject
 AND m.enabled AND m.revoked_at IS NULL AND p.role::text='admin'
 ORDER BY m.issuer,m.subject FOR SHARE OF m,p;
 IF NOT FOUND THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 -- Same request lock as the existing copier; retained through the outer commit.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 SELECT * INTO receipt FROM public.product_duplicate_requests WHERE request_id=p_request FOR SHARE;
 IF FOUND THEN
  IF receipt.source_product_id IS DISTINCT FROM p_source OR receipt.requested_by IS DISTINCT FROM p_actor
  OR receipt.new_product_id IS NULL THEN RAISE EXCEPTION 'Duplicate request mismatch/incomplete' USING ERRCODE='40001'; END IF;
  SELECT jsonb_build_object('product_id',id,'slug',slug,'lane',coalesce(product_lane,'standard')) INTO replay_row
  FROM public.products WHERE id=receipt.new_product_id FOR SHARE;
  IF replay_row IS NULL THEN RAISE EXCEPTION 'Duplicate result unavailable' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('replay',replay_row);
 END IF;
 SELECT to_jsonb(p) INTO source_row FROM public.products p WHERE id=p_source FOR SHARE;
 IF source_row IS NULL THEN RAISE EXCEPTION 'Source product unavailable' USING ERRCODE='P0002'; END IF;
 -- All statements, the media guard and the existing copier observe this same
 -- snapshot, including child inserts/deletes. No all-writer table locks needed.
 RETURN jsonb_build_object('graph',jsonb_build_object('product',source_row,
 ${duplicateChildren.map(t=>`'${graphKeys[t]??t}',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.${t} c WHERE product_id=p_source),'[]'::jsonb)`).join(',\n ')}));
END;
`
export const duplicateFunctionSql=`CREATE FUNCTION ${duplicateSignature.replace('(uuid,uuid,uuid,text,text)','(p_source uuid,p_request uuid,p_actor uuid,p_issuer text,p_subject text)')}
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $duplicate13$${duplicateBody}$duplicate13$;
REVOKE ALL ON FUNCTION ${duplicateSignature} FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ${duplicateSignature} TO hod_admin_app;
`
