// Owner-run acceptance: only fresh fixture IDs; all rows roll back before COMMIT.
export const orderOwnerProbeSql=`
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
`
