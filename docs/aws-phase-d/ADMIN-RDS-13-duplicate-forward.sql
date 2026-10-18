-- ADMIN-RDS-13: new restricted preparation helper; existing copier stays unchanged.
-- Run the ENTIRE file once: HOD Staging / hod_staging / hod_dev_migration.
-- Fresh test product/copy/receipt rows are rolled back. No existing rows edited.
BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='90s';
SET LOCAL search_path=pg_catalog,public,pg_temp;
SET LOCAL ROLE hod_migration;
DO $target$ BEGIN
 IF current_database()<>'hod_staging' OR session_user<>'hod_dev_migration' OR current_user<>'hod_migration'
 THEN RAISE EXCEPTION 'Use HOD Staging / hod_staging / hod_dev_migration'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hod_admin_app' AND NOT rolcanlogin AND NOT rolinherit
 AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
 OR EXISTS(SELECT FROM pg_roles WHERE rolname<>'hod_admin_app' AND pg_has_role('hod_admin_app',oid,'MEMBER'))
 THEN RAISE EXCEPTION 'Unsafe admin capability'; END IF;
END $target$;
CREATE TEMP TABLE admin_duplicate13_scope ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset('[{"name":"public.admin_identities","fingerprint":"400755f0312e93f7dbd85f8a17b2ca4d"},{"name":"public.catalog_categories","fingerprint":"4b9b6a9a939f3efe1b615d500babdbf1"},{"name":"public.catalog_gst_slabs","fingerprint":"636104122bd27cff589e4c4b5957f8a6"},{"name":"public.catalog_material_values","fingerprint":"af77136bc27231d15f811b8534527fb5"},{"name":"public.catalog_metals","fingerprint":"0cec801eeaafd62ddf9ae263c54ea98b"},{"name":"public.catalog_options","fingerprint":"587d9bf02227a15a765315ab5ed22bf7"},{"name":"public.catalog_ring_categories","fingerprint":"905a51647a135c1b1281f4f9c12be88a"},{"name":"public.catalog_stone_shapes","fingerprint":"ba7652e37c28a2a1103f7eba9574f2d2"},{"name":"public.catalog_styles","fingerprint":"e5568058f2cd2b105b3d88a85e66fab1"},{"name":"public.catalog_subcategories","fingerprint":"633678d059813e1acdca093d415f9680"},{"name":"public.product_content_rules","fingerprint":"707e134376cd742d2736ecd375eaaf19"},{"name":"public.product_duplicate_requests","fingerprint":"269e4ee4b8f83963de2911e09c972d86"},{"name":"public.product_faq_items","fingerprint":"9edb8c9e13440109d68e018796c62fac"},{"name":"public.product_material_value_selections","fingerprint":"c5bb34c3af85b0bc341decf323cd7c3c"},{"name":"public.product_metal_media","fingerprint":"f35ef27458063b5c5b0d12dd220d5e48"},{"name":"public.product_metal_selections","fingerprint":"2942df7b09e66d2118668d71296e2c1c"},{"name":"public.product_metal_variants","fingerprint":"8953de74d987295c1d191fcf402c885d"},{"name":"public.product_option_links","fingerprint":"8a8c15df44c6ffeebf3a4e56fdf41889"},{"name":"public.product_purity_prices","fingerprint":"5ce7cb14fe88c39e84e8f1056f219c9b"},{"name":"public.products","fingerprint":"4e1df9cba8c0e21ec3d241b36d352eef"},{"name":"public.product_stone_shapes","fingerprint":"4a4f5a9b9b702c4a79209fe8d1053949"},{"name":"public.product_subcategory_links","fingerprint":"9159eb04fa763983fdd716456acc9197"},{"name":"public.product_variant_media_items","fingerprint":"0ba6203fd515f18f75633f1ca8bec1b1"},{"name":"public.profiles","fingerprint":"bfd124193706eeffda3f6a0e0cb04f47"}]'::jsonb) AS s(name text,fingerprint text);
DO $dependencies$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_duplicate13_scope ORDER BY name LOOP
  EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
  IF (SELECT md5((jsonb_build_object(
 'owner',c.relowner::regrole::text,'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'identity',a.attidentity,'generated',a.attgenerated,'not_null',a.attnotnull,
   'default_hash',md5(pg_get_expr(d.adbin,d.adrelid)),
   'acl',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
     FROM aclexplode(a.attacl) x )) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'acl',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
   FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x ),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,
   'permissive',p.polpermissive,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),
   'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb)
   FROM pg_policy p WHERE p.polrelid=c.oid ),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
   'definition',md5(pg_get_triggerdef(t.oid)),'function',md5(pg_get_functiondef(t.tgfoid))) ORDER BY t.tgname),'[]'::jsonb)
   FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname),'[]'::jsonb)
   FROM pg_constraint k WHERE k.conrelid=c.oid)))::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.fingerprint
  THEN RAISE EXCEPTION 'Duplicate dependency schema/ACL/policy/trigger differs: %',r.name; END IF;
 END LOOP;
 FOR r IN SELECT * FROM jsonb_to_recordset('[{"signature":"public.set_updated_at()","owner":"hod_migration","definer":false,"sha256":"199f5c02bd7c5ee76f3d2ba98482eddd62afcaa2b4915baed2a47fe3383b428e"},{"signature":"public.catalog_navbar_source_delete_guard_v1()","owner":"hod_migration","definer":false,"sha256":"02b3bef8c58fa618d5c60463eff5bca4e85d779e1724d7428c888d6e67654b53"},{"signature":"public.set_product_faq_items_updated_at()","owner":"hod_migration","definer":false,"sha256":"533e5092ef9e704579ae02529061591cc2f5c2a8a82012ce1cdb1e2d4d733425"},{"signature":"public.validate_product_metal_selection()","owner":"hod_migration","definer":false,"sha256":"372030e389693822d0e580b41b496fdae3043234a4dfd920d51c2d0f685950a9"},{"signature":"public.enforce_collection_checkout_off()","owner":"hod_migration","definer":false,"sha256":"05a0bc84c022094e71b616b95fde5f45469c7ec88b7bfb3d5d60fd6b347cbecc"},{"signature":"public.validate_product_classification()","owner":"hod_migration","definer":false,"sha256":"9f582a283391ca00eb12c21a3cd23c7163ecb405e0f5a396ca6e284e460ad146"},{"signature":"public.validate_product_content_rule_refs()","owner":"hod_migration","definer":false,"sha256":"38e6c90aac3d7b75bcfcbb206030a5eae47668e9a2055da39c15604dc721915b"},{"signature":"public.duplicate_product(uuid,uuid,uuid)","owner":"hod_migration","definer":true,"sha256":"6399ed7f5ef20c613fa12f50f7c3bc3161c43d48a5a668ece29f19d3761ec337"}]'::jsonb) AS x(signature text,owner text,definer boolean,sha256 text) LOOP
  IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(r.signature) AND p.proowner::regrole::text=r.owner
   AND p.prosecdef=r.definer AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.sha256)
  THEN RAISE EXCEPTION 'Shared duplicate routine differs: %',r.signature; END IF;
 END LOOP;
 IF NOT has_function_privilege('hod_admin_app','public.duplicate_product(uuid,uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Original copy execution missing'; END IF;
END $dependencies$;
DO $absent$ BEGIN IF to_regprocedure('public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid,text,text)') IS NOT NULL
 OR to_regprocedure('public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid)') IS NOT NULL THEN
 RAISE EXCEPTION 'Duplicate capability already exists; do not replay'; END IF; END $absent$;
CREATE FUNCTION public.admin_product_duplicate_prepare_v1(p_source uuid,p_request uuid,p_actor uuid,p_issuer text,p_subject text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $duplicate13$
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
 'metal_media',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.product_metal_media c WHERE product_id=p_source),'[]'::jsonb),
 'variants',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.product_metal_variants c WHERE product_id=p_source),'[]'::jsonb),
 'media_items',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.product_variant_media_items c WHERE product_id=p_source),'[]'::jsonb),
 'product_metal_selections',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.product_metal_selections c WHERE product_id=p_source),'[]'::jsonb),
 'product_material_value_selections',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.product_material_value_selections c WHERE product_id=p_source),'[]'::jsonb),
 'product_stone_shapes',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.product_stone_shapes c WHERE product_id=p_source),'[]'::jsonb),
 'product_subcategory_links',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.product_subcategory_links c WHERE product_id=p_source),'[]'::jsonb),
 'product_option_links',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.product_option_links c WHERE product_id=p_source),'[]'::jsonb),
 'product_purity_prices',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.product_purity_prices c WHERE product_id=p_source),'[]'::jsonb),
 'product_faq_items',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.product_faq_items c WHERE product_id=p_source),'[]'::jsonb)));
END;
$duplicate13$;
REVOKE ALL ON FUNCTION public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid,text,text) TO hod_admin_app;
DO $capability$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid,text,text)')
  AND p.proowner::regrole::text='hod_migration' AND p.prosecdef AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof
  AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND p.prokind='f' AND p.provolatile='v' AND p.proparallel='u'
  AND p.pronargdefaults=0 AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='95f14575c52b893d8f0a1bef069d307e50eaa3db211c0e7a2470945d3fc86ed3'
  AND has_function_privilege('hod_admin_app',p.oid,'EXECUTE')
  AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.privilege_type='EXECUTE' AND (a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))
    OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND a.is_grantable))))
 THEN RAISE EXCEPTION 'Duplicate capability owner/body/settings/ACL differ'; END IF;
END $capability$;

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
DO $dependencies$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_duplicate13_scope ORDER BY name LOOP
  EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
  IF (SELECT md5((jsonb_build_object(
 'owner',c.relowner::regrole::text,'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'identity',a.attidentity,'generated',a.attgenerated,'not_null',a.attnotnull,
   'default_hash',md5(pg_get_expr(d.adbin,d.adrelid)),
   'acl',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
     FROM aclexplode(a.attacl) x )) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'acl',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
   FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x ),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,
   'permissive',p.polpermissive,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),
   'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb)
   FROM pg_policy p WHERE p.polrelid=c.oid ),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
   'definition',md5(pg_get_triggerdef(t.oid)),'function',md5(pg_get_functiondef(t.tgfoid))) ORDER BY t.tgname),'[]'::jsonb)
   FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname),'[]'::jsonb)
   FROM pg_constraint k WHERE k.conrelid=c.oid)))::text) FROM pg_class c WHERE c.oid=to_regclass(r.name)) IS DISTINCT FROM r.fingerprint
  THEN RAISE EXCEPTION 'Duplicate dependency schema/ACL/policy/trigger differs: %',r.name; END IF;
 END LOOP;
 FOR r IN SELECT * FROM jsonb_to_recordset('[{"signature":"public.set_updated_at()","owner":"hod_migration","definer":false,"sha256":"199f5c02bd7c5ee76f3d2ba98482eddd62afcaa2b4915baed2a47fe3383b428e"},{"signature":"public.catalog_navbar_source_delete_guard_v1()","owner":"hod_migration","definer":false,"sha256":"02b3bef8c58fa618d5c60463eff5bca4e85d779e1724d7428c888d6e67654b53"},{"signature":"public.set_product_faq_items_updated_at()","owner":"hod_migration","definer":false,"sha256":"533e5092ef9e704579ae02529061591cc2f5c2a8a82012ce1cdb1e2d4d733425"},{"signature":"public.validate_product_metal_selection()","owner":"hod_migration","definer":false,"sha256":"372030e389693822d0e580b41b496fdae3043234a4dfd920d51c2d0f685950a9"},{"signature":"public.enforce_collection_checkout_off()","owner":"hod_migration","definer":false,"sha256":"05a0bc84c022094e71b616b95fde5f45469c7ec88b7bfb3d5d60fd6b347cbecc"},{"signature":"public.validate_product_classification()","owner":"hod_migration","definer":false,"sha256":"9f582a283391ca00eb12c21a3cd23c7163ecb405e0f5a396ca6e284e460ad146"},{"signature":"public.validate_product_content_rule_refs()","owner":"hod_migration","definer":false,"sha256":"38e6c90aac3d7b75bcfcbb206030a5eae47668e9a2055da39c15604dc721915b"},{"signature":"public.duplicate_product(uuid,uuid,uuid)","owner":"hod_migration","definer":true,"sha256":"6399ed7f5ef20c613fa12f50f7c3bc3161c43d48a5a668ece29f19d3761ec337"}]'::jsonb) AS x(signature text,owner text,definer boolean,sha256 text) LOOP
  IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(r.signature) AND p.proowner::regrole::text=r.owner
   AND p.prosecdef=r.definer AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.sha256)
  THEN RAISE EXCEPTION 'Shared duplicate routine differs: %',r.signature; END IF;
 END LOOP;
 IF NOT has_function_privilege('hod_admin_app','public.duplicate_product(uuid,uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Original copy execution missing'; END IF;
END $dependencies$;
DO $capability$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid,text,text)')
  AND p.proowner::regrole::text='hod_migration' AND p.prosecdef AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof
  AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND p.prokind='f' AND p.provolatile='v' AND p.proparallel='u'
  AND p.pronargdefaults=0 AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='95f14575c52b893d8f0a1bef069d307e50eaa3db211c0e7a2470945d3fc86ed3'
  AND has_function_privilege('hod_admin_app',p.oid,'EXECUTE')
  AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.privilege_type='EXECUTE' AND (a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))
    OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND a.is_grantable))))
 THEN RAISE EXCEPTION 'Duplicate capability owner/body/settings/ACL differ'; END IF;
END $capability$;
RESET ROLE;
COMMIT;
SELECT jsonb_build_object('database',current_database(),'installed',true,'capability','admin_product_duplicate_prepare_v1',
 'owner_rollback_probe_passed',true,'fixture_rows_absent',true,'existing_business_rows_changed',false,
 'sequence_counters_may_advance',true,'providers_switched',false,'legacy_copier_changed',false,
 'next','Agent verifies installed helper and runtime isolation. Concurrent-session, video/media and wider acceptance remain pending.') AS admin_duplicate_capability_setup_result;
