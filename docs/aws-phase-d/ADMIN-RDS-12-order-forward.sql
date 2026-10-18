-- ADMIN-RDS-12: one admin-only order update capability; no general write grants.
-- Run ENTIRE file once: HOD Staging / hod_staging / hod_dev_migration.
-- Includes fresh inactive test product/orders ONLY inside a rolled-back savepoint.
-- Existing storefront functions, triggers, ACLs and business rows stay unchanged.
BEGIN;
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
CREATE TEMP TABLE admin_order12_scope ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset('[{"name":"public.admin_identities","fingerprint":"400755f0312e93f7dbd85f8a17b2ca4d"},{"name":"public.catalog_categories","fingerprint":"4b9b6a9a939f3efe1b615d500babdbf1"},{"name":"public.catalog_options","fingerprint":"587d9bf02227a15a765315ab5ed22bf7"},{"name":"public.catalog_subcategories","fingerprint":"633678d059813e1acdca093d415f9680"},{"name":"public.inventory_adjustments","fingerprint":"1c6d0ae65624437d8e335ca58d3b50ac"},{"name":"public.inventory_reservations","fingerprint":"769ff7869e8626fc26b5f3c81a47f56c"},{"name":"public.order_items","fingerprint":"215e78211f3c1b7b259d7ba4e1ddf8e8"},{"name":"public.orders","fingerprint":"6056b68ee3e1cb5b2ed2e3cb61c8079e"},{"name":"public.order_status_history","fingerprint":"2666faf6ebe26d914a22dfc97ce2ae25"},{"name":"public.product_content_rules","fingerprint":"707e134376cd742d2736ecd375eaaf19"},{"name":"public.products","fingerprint":"4e1df9cba8c0e21ec3d241b36d352eef"},{"name":"public.profiles","fingerprint":"bfd124193706eeffda3f6a0e0cb04f47"}]'::jsonb) AS s(name text,fingerprint text);
DO $tables$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_order12_scope ORDER BY name LOOP
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
  THEN RAISE EXCEPTION 'Order dependency schema/trigger/policy/ACL differs: %',r.name; END IF;
 END LOOP;
END $tables$;
DO $triggers$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM jsonb_to_recordset('[{"signature":"public.set_updated_at()","owner":"hod_migration","definer":false,"sha256":"199f5c02bd7c5ee76f3d2ba98482eddd62afcaa2b4915baed2a47fe3383b428e"},{"signature":"public.catalog_navbar_source_delete_guard_v1()","owner":"hod_migration","definer":false,"sha256":"02b3bef8c58fa618d5c60463eff5bca4e85d779e1724d7428c888d6e67654b53"},{"signature":"public.reserve_pending_order_item()","owner":"hod_migration","definer":true,"sha256":"2a3801e2e1c943f453ac4dc0ec9c0f260b3c303cfd16de42763966e4aa080575"},{"signature":"public.apply_order_stock_on_create()","owner":"hod_migration","definer":false,"sha256":"81a1d02fb4104c5cc696ad057549913bf6bca6117ea81d5f7c7623ae84bd802f"},{"signature":"public.record_order_status_history()","owner":"hod_migration","definer":true,"sha256":"40ba57642b790d2c11dc47df6ec3c2d297b0ac6fb4707d5008c177179cf49127"},{"signature":"public.restore_order_stock_on_cancel()","owner":"hod_migration","definer":false,"sha256":"040e78cfe6f3dcd16da2892d5a2e04ec0c7ed1f867a838c9dc46a9a3ce555c3a"},{"signature":"public.enforce_collection_checkout_off()","owner":"hod_migration","definer":false,"sha256":"05a0bc84c022094e71b616b95fde5f45469c7ec88b7bfb3d5d60fd6b347cbecc"},{"signature":"public.validate_product_classification()","owner":"hod_migration","definer":false,"sha256":"9f582a283391ca00eb12c21a3cd23c7163ecb405e0f5a396ca6e284e460ad146"},{"signature":"public.validate_product_content_rule_refs()","owner":"hod_migration","definer":false,"sha256":"38e6c90aac3d7b75bcfcbb206030a5eae47668e9a2055da39c15604dc721915b"}]'::jsonb)
 AS x(signature text,owner text,definer boolean,sha256 text) LOOP
 IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(r.signature) AND p.proowner::regrole::text=r.owner
 AND p.prosecdef=r.definer AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.sha256)
 THEN RAISE EXCEPTION 'Shared order dependency function differs: %',r.signature; END IF;
 END LOOP; END $triggers$;
DO $absent$ BEGIN IF to_regprocedure('public.admin_order_status_update_v1(uuid,text,text,uuid,jsonb,timestamp with time zone)') IS NOT NULL THEN
 RAISE EXCEPTION 'Order capability already exists; do not replay'; END IF; END $absent$;
CREATE FUNCTION public.admin_order_status_update_v1(
 p_actor_id uuid,p_issuer text,p_subject text,p_order_id uuid,p_change jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $order12$
DECLARE
 v_before public.orders%ROWTYPE; v_after public.orders%ROWTYPE;
 v_status text; v_expected text; v_courier text; v_awb text; v_expected_courier text; v_expected_awb text;
 v_items jsonb;
BEGIN
 IF p_actor_id IS NULL OR p_issuer IS NULL OR p_subject IS NULL
 OR length(p_issuer) NOT BETWEEN 1 AND 2048 OR length(p_subject) NOT BETWEEN 1 AND 512 THEN
  RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.admin_identities m JOIN public.profiles p ON p.id=m.profile_id
 WHERE m.issuer=p_issuer AND m.subject=p_subject AND m.profile_id=p_actor_id
 AND m.enabled AND m.revoked_at IS NULL AND p.role::text='admin' FOR SHARE OF m,p;
 IF NOT FOUND THEN RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE='42501'; END IF;
 IF p_order_id IS NULL OR p_now IS NULL OR NOT isfinite(p_now)
 OR jsonb_typeof(p_change) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Invalid order update.' USING ERRCODE='22023'; END IF;
 IF NOT (p_change ?& ARRAY['status','expected_status','courier_name','courier_awb_number','expected_courier_name','expected_courier_awb_number'])
 OR EXISTS(SELECT FROM jsonb_object_keys(p_change) k WHERE k<>ALL(ARRAY['status','expected_status','courier_name','courier_awb_number','expected_courier_name','expected_courier_awb_number']))
 OR jsonb_typeof(p_change->'status')<>'string' OR jsonb_typeof(p_change->'expected_status')<>'string'
 OR EXISTS(SELECT FROM unnest(ARRAY['courier_name','courier_awb_number','expected_courier_name','expected_courier_awb_number']) k
  WHERE jsonb_typeof(p_change->k) NOT IN ('string','null')) THEN
  RAISE EXCEPTION 'Invalid order update.' USING ERRCODE='22023'; END IF;
 v_status:=p_change->>'status';v_expected:=p_change->>'expected_status';
 IF v_status<>ALL(ARRAY['pending','processing','shipped','delivered','cancelled'])
 OR v_expected<>ALL(ARRAY['pending','processing','shipped','delivered','cancelled'])
 OR length(coalesce(p_change->>'courier_name',''))>200 OR length(coalesce(p_change->>'expected_courier_name',''))>200
 OR length(coalesce(p_change->>'courier_awb_number',''))>500 OR length(coalesce(p_change->>'expected_courier_awb_number',''))>500 THEN
  RAISE EXCEPTION 'Invalid order update.' USING ERRCODE='22023'; END IF;
 v_courier:=nullif(btrim(p_change->>'courier_name'),'');v_awb:=nullif(btrim(p_change->>'courier_awb_number'),'');
 v_expected_courier:=nullif(btrim(p_change->>'expected_courier_name'),'');v_expected_awb:=nullif(btrim(p_change->>'expected_courier_awb_number'),'');
 IF v_status='shipped' AND (v_courier IS NULL OR v_awb IS NULL) THEN
  RAISE EXCEPTION 'Shipping requires courier and tracking details.' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_before FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.' USING ERRCODE='P0002'; END IF;
 IF v_before.status::text<>v_expected OR v_before.courier_name IS DISTINCT FROM v_expected_courier
 OR v_before.courier_awb_number IS DISTINCT FROM v_expected_awb THEN
  RAISE EXCEPTION 'Order changed. Reload before saving.' USING ERRCODE='40001'; END IF;
 IF v_before.status::text='cancelled' AND v_status<>'cancelled' AND v_before.fulfillment_mode IS DISTINCT FROM 'made_to_order' THEN
  RAISE EXCEPTION 'A reviewed stock reservation is required to reopen this order.' USING ERRCODE='PT409'; END IF;
 -- Freeze the selected order's line graph for the response/trigger chain.
 PERFORM 1 FROM public.order_items i WHERE i.order_id=p_order_id ORDER BY i.id FOR SHARE OF i;
 -- Existing restoration iterates lines in storage order. Acquire product locks
 -- in one stable order first, avoiding opposite product-lock ordering here.
 IF v_before.status::text<>'cancelled' AND v_status='cancelled' AND v_before.fulfillment_mode IS DISTINCT FROM 'made_to_order' THEN
  IF EXISTS(SELECT FROM public.order_items i WHERE i.order_id=p_order_id AND i.product_id IS NOT NULL AND i.quantity<=0) THEN
   RAISE EXCEPTION 'Invalid stock-backed order quantities.' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.products p WHERE p.id IN(SELECT i.product_id FROM public.order_items i WHERE i.order_id=p_order_id)
   ORDER BY p.id FOR UPDATE OF p;
 END IF;
 UPDATE public.orders SET status=(jsonb_populate_record(NULL::public.orders,jsonb_build_object('status',v_status))).status,
 courier_name=v_courier,courier_awb_number=v_awb,
 shipped_at=CASE WHEN v_status='shipped' THEN coalesce(shipped_at,p_now) ELSE shipped_at END
 WHERE id=p_order_id RETURNING * INTO v_after;
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at,i.id),'[]'::jsonb) INTO v_items
 FROM public.order_items i WHERE i.order_id=p_order_id;
 RETURN jsonb_build_object('item',jsonb_build_object(
  'id',v_after.id,'status',v_after.status,'order_number',v_after.order_number,'customer_email',v_after.customer_email,
  'customer_first_name',v_after.customer_first_name,'customer_last_name',v_after.customer_last_name,
  'total_amount',v_after.total_amount,'created_at',v_after.created_at,'courier_name',v_after.courier_name,
  'courier_awb_number',v_after.courier_awb_number,'shipped_at',v_after.shipped_at),
  'items',v_items,'statusChanged',v_before.status IS DISTINCT FROM v_after.status);
END;
$order12$;
REVOKE ALL ON FUNCTION public.admin_order_status_update_v1(uuid,text,text,uuid,jsonb,timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_order_status_update_v1(uuid,text,text,uuid,jsonb,timestamp with time zone) TO hod_admin_app;
DO $capability$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.admin_order_status_update_v1(uuid,text,text,uuid,jsonb,timestamp with time zone)')
  AND p.proowner::regrole::text='hod_migration' AND p.prosecdef AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof
  AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND p.prokind='f' AND p.provolatile='v' AND p.proparallel='u'
  AND p.pronargdefaults=0 AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='0f170a012d0fa8168b99d3521121bd4ad195a2e907320aee062ab07e2b8a86b4'
  AND has_function_privilege('hod_admin_app',p.oid,'EXECUTE')
  AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.privilege_type='EXECUTE' AND (a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))
    OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND a.is_grantable))))
 THEN RAISE EXCEPTION 'Order capability owner/body/settings/ACL differ'; END IF;
END $capability$;

CREATE TEMP TABLE admin_order12_probe ON COMMIT DROP AS
 SELECT gen_random_uuid() AS product_id,gen_random_uuid() AS order_id,gen_random_uuid() AS mto_order_id,
 gen_random_uuid() AS line_id,gen_random_uuid() AS mto_line_id,'AWS-PROBE-'||gen_random_uuid()::text AS marker,
 m.profile_id AS actor_id,m.issuer,m.subject,
 (SELECT c.id FROM public.catalog_categories c WHERE c.status::text='active'
  AND coalesce(c.category_lane,'standard')='standard' ORDER BY c.id LIMIT 1) AS category_id
 FROM public.admin_identities m JOIN public.profiles p ON p.id=m.profile_id
 WHERE m.issuer='https://auth-uat.houseofdiams.com/realms/houseofdiams'
 AND m.subject='1167a5b6-9fcb-45d1-b7d8-53e95cd49704' AND m.enabled AND m.revoked_at IS NULL AND p.role::text='admin';
DO $probe_guard$ DECLARE r record; BEGIN
 IF (SELECT count(*) FROM admin_order12_probe)<>1 THEN RAISE EXCEPTION 'Expected enabled admin mapping is missing'; END IF;
 SELECT * INTO r FROM admin_order12_probe;
 IF r.category_id IS NULL OR EXISTS(SELECT FROM public.products WHERE id=r.product_id)
 OR EXISTS(SELECT FROM public.orders WHERE id IN(r.order_id,r.mto_order_id))
 OR EXISTS(SELECT FROM public.order_items WHERE id IN(r.line_id,r.mto_line_id))
 THEN RAISE EXCEPTION 'Probe prerequisite/collision; nothing committed'; END IF;
END $probe_guard$;
SAVEPOINT admin_order12_acceptance;
DO $probe$ DECLARE r record; result jsonb; same jsonb; shipped jsonb; change jsonb;
 v_ship_time timestamptz:=clock_timestamp(); BEGIN
 SELECT * INTO r FROM admin_order12_probe;
 INSERT INTO public.products(id,name,slug,sku,main_category_id,stock_quantity,base_price,status,product_lane,allow_checkout)
 VALUES(r.product_id,r.marker,lower(r.marker),r.marker,r.category_id,7,1,'draft','standard',false);
 INSERT INTO public.orders(id,order_number,customer_email,customer_first_name,guest_token_hash,fulfillment_mode,payment_gateway,payment_status)
 VALUES(r.order_id,r.marker,'migration-probe@example.invalid','Migration probe',encode(sha256(convert_to(r.order_id::text,'UTF8')),'hex'),'legacy_stock','razorpay','pending'),
 (r.mto_order_id,r.marker||'-MTO','migration-probe@example.invalid','Migration probe',encode(sha256(convert_to(r.mto_order_id::text,'UTF8')),'hex'),'made_to_order','razorpay','pending');
 INSERT INTO public.order_items(id,order_id,product_id,product_name,quantity,unit_price,line_total)
 VALUES(r.line_id,r.order_id,r.product_id,r.marker,2,1,2),(r.mto_line_id,r.mto_order_id,r.product_id,r.marker,2,1,2);
 IF (SELECT stock_quantity FROM public.products WHERE id=r.product_id)<>5
 OR NOT EXISTS(SELECT FROM public.inventory_reservations WHERE order_id=r.order_id AND product_id=r.product_id AND status='active' AND quantity=2)
 OR EXISTS(SELECT FROM public.inventory_reservations WHERE order_id=r.mto_order_id)
 THEN RAISE EXCEPTION 'Existing order creation stock/reservation contract differs'; END IF;
 change:=jsonb_build_object('status','cancelled','expected_status','pending','courier_name',null,'courier_awb_number',null,'expected_courier_name',null,'expected_courier_awb_number',null);
 result:=public.admin_order_status_update_v1(r.actor_id,r.issuer,r.subject,r.order_id,change,v_ship_time);
 IF result->'item'->>'status'<>'cancelled' OR result->>'statusChanged'<>'true'
 OR jsonb_array_length(result->'items')<>1 OR (SELECT stock_quantity FROM public.products WHERE id=r.product_id)<>7
 THEN RAISE EXCEPTION 'Cancellation result/stock differs'; END IF;
 same:=public.admin_order_status_update_v1(r.actor_id,r.issuer,r.subject,r.order_id,jsonb_set(change,'{expected_status}','"cancelled"'),v_ship_time);
 IF same->>'statusChanged'<>'false' OR (SELECT stock_quantity FROM public.products WHERE id=r.product_id)<>7
 OR (SELECT count(*) FROM public.order_status_history WHERE order_id=r.order_id)<>2
 THEN RAISE EXCEPTION 'Repeat cancellation changed stock/history'; END IF;
 BEGIN
  PERFORM public.admin_order_status_update_v1(r.actor_id,r.issuer,r.subject,r.order_id,change,v_ship_time);
  RAISE EXCEPTION 'Stale order update accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.admin_order_status_update_v1(r.actor_id,r.issuer,r.subject,r.order_id,
   change||jsonb_build_object('status','processing','expected_status','cancelled'),v_ship_time);
  RAISE EXCEPTION 'Stock-backed cancelled order reopened';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.admin_order_status_update_v1(r.actor_id,r.issuer,r.subject||'-unmapped',r.order_id,change,v_ship_time);
  RAISE EXCEPTION 'Unmapped actor accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 change:=change||jsonb_build_object('status','shipped','courier_name','Probe courier','courier_awb_number','PROBE-TRACKING');
 shipped:=public.admin_order_status_update_v1(r.actor_id,r.issuer,r.subject,r.mto_order_id,change,v_ship_time);
 same:=public.admin_order_status_update_v1(r.actor_id,r.issuer,r.subject,r.mto_order_id,
  change||jsonb_build_object('expected_status','shipped','expected_courier_name','Probe courier','expected_courier_awb_number','PROBE-TRACKING'),v_ship_time+interval '1 day');
 IF shipped->'item'->>'shipped_at' IS DISTINCT FROM same->'item'->>'shipped_at'
 OR same->>'statusChanged'<>'false' OR (SELECT stock_quantity FROM public.products WHERE id=r.product_id)<>7
 THEN RAISE EXCEPTION 'Made-to-order shipment/retry contract differs'; END IF;
 -- Preserve and flag the existing reservation behavior; do not silently redesign it.
 IF NOT EXISTS(SELECT FROM public.inventory_reservations WHERE order_id=r.order_id AND status='active')
 THEN RAISE EXCEPTION 'Reviewed reservation lifecycle changed'; END IF;
END $probe$;
ROLLBACK TO SAVEPOINT admin_order12_acceptance;
RELEASE SAVEPOINT admin_order12_acceptance;
DO $cleanup$ DECLARE r record; BEGIN
 SELECT * INTO r FROM admin_order12_probe;
 IF EXISTS(SELECT FROM public.products WHERE id=r.product_id)
 OR EXISTS(SELECT FROM public.orders WHERE id IN(r.order_id,r.mto_order_id))
 OR EXISTS(SELECT FROM public.order_items WHERE id IN(r.line_id,r.mto_line_id))
 OR EXISTS(SELECT FROM public.inventory_adjustments WHERE product_id=r.product_id OR order_id IN(r.order_id,r.mto_order_id))
 OR EXISTS(SELECT FROM public.inventory_reservations WHERE product_id=r.product_id OR order_id IN(r.order_id,r.mto_order_id))
 OR EXISTS(SELECT FROM public.order_status_history WHERE order_id IN(r.order_id,r.mto_order_id))
 THEN RAISE EXCEPTION 'Order probe cleanup not verified; transaction must not commit'; END IF;
END $cleanup$;
DO $tables$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM admin_order12_scope ORDER BY name LOOP
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
  THEN RAISE EXCEPTION 'Order dependency schema/trigger/policy/ACL differs: %',r.name; END IF;
 END LOOP;
END $tables$;
DO $triggers$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM jsonb_to_recordset('[{"signature":"public.set_updated_at()","owner":"hod_migration","definer":false,"sha256":"199f5c02bd7c5ee76f3d2ba98482eddd62afcaa2b4915baed2a47fe3383b428e"},{"signature":"public.catalog_navbar_source_delete_guard_v1()","owner":"hod_migration","definer":false,"sha256":"02b3bef8c58fa618d5c60463eff5bca4e85d779e1724d7428c888d6e67654b53"},{"signature":"public.reserve_pending_order_item()","owner":"hod_migration","definer":true,"sha256":"2a3801e2e1c943f453ac4dc0ec9c0f260b3c303cfd16de42763966e4aa080575"},{"signature":"public.apply_order_stock_on_create()","owner":"hod_migration","definer":false,"sha256":"81a1d02fb4104c5cc696ad057549913bf6bca6117ea81d5f7c7623ae84bd802f"},{"signature":"public.record_order_status_history()","owner":"hod_migration","definer":true,"sha256":"40ba57642b790d2c11dc47df6ec3c2d297b0ac6fb4707d5008c177179cf49127"},{"signature":"public.restore_order_stock_on_cancel()","owner":"hod_migration","definer":false,"sha256":"040e78cfe6f3dcd16da2892d5a2e04ec0c7ed1f867a838c9dc46a9a3ce555c3a"},{"signature":"public.enforce_collection_checkout_off()","owner":"hod_migration","definer":false,"sha256":"05a0bc84c022094e71b616b95fde5f45469c7ec88b7bfb3d5d60fd6b347cbecc"},{"signature":"public.validate_product_classification()","owner":"hod_migration","definer":false,"sha256":"9f582a283391ca00eb12c21a3cd23c7163ecb405e0f5a396ca6e284e460ad146"},{"signature":"public.validate_product_content_rule_refs()","owner":"hod_migration","definer":false,"sha256":"38e6c90aac3d7b75bcfcbb206030a5eae47668e9a2055da39c15604dc721915b"}]'::jsonb)
 AS x(signature text,owner text,definer boolean,sha256 text) LOOP
 IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(r.signature) AND p.proowner::regrole::text=r.owner
 AND p.prosecdef=r.definer AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.sha256)
 THEN RAISE EXCEPTION 'Shared order dependency function differs: %',r.signature; END IF;
 END LOOP; END $triggers$;
DO $capability$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.admin_order_status_update_v1(uuid,text,text,uuid,jsonb,timestamp with time zone)')
  AND p.proowner::regrole::text='hod_migration' AND p.prosecdef AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof
  AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND p.prokind='f' AND p.provolatile='v' AND p.proparallel='u'
  AND p.pronargdefaults=0 AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='0f170a012d0fa8168b99d3521121bd4ad195a2e907320aee062ab07e2b8a86b4'
  AND has_function_privilege('hod_admin_app',p.oid,'EXECUTE')
  AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.privilege_type='EXECUTE' AND (a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))
    OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app') AND a.is_grantable))))
 THEN RAISE EXCEPTION 'Order capability owner/body/settings/ACL differ'; END IF;
END $capability$;
RESET ROLE;
COMMIT;
SELECT jsonb_build_object('database',current_database(),'installed',true,'capability','admin_order_status_update_v1',
 'owner_rollback_probe_passed',true,'fixture_rows_absent',true,'direct_order_stock_grants_added',false,
 'existing_business_rows_changed',false,'sequence_counters_may_advance',true,'providers_switched',false,
 'reservation_lifecycle','Existing active reservation behavior retained; separate acceptance pending',
 'next','Agent verifies isolated runtime capability; hosted route/mail/concurrency and wider migration gates remain pending.') AS admin_order_capability_setup_result;
