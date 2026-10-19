-- HOD-007: paid-only fulfilment states and allowed status steps in admin_order_status_update_v1.
-- Same signature, so the admin code needs no change to call it. Apply to UAT first, as hod_migration,
-- after an RDS snapshot. Rollback: 202610190028_order_status_guard.rollback.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $guard$
declare v_src text;
begin
  if current_user <> 'hod_migration' then raise exception 'Run as hod_migration'; end if;
  select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure('public.admin_order_status_update_v1(uuid,text,text,uuid,jsonb,timestamp with time zone)');
  if v_src is null then raise exception 'admin_order_status_update_v1 is missing'; end if;
  if position('A reviewed stock reservation is required to reopen this order.' in v_src) = 0 or position('HOD-007' in v_src) > 0 then
    raise exception 'Installed order function differs from the reviewed version; inspect before applying';
  end if;
end $guard$;

CREATE OR REPLACE FUNCTION public.admin_order_status_update_v1(p_actor_id uuid, p_issuer text, p_subject text, p_order_id uuid, p_change jsonb, p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
 -- HOD-007: fulfilment states need a paid order, and status moves only along
 -- allowed steps (one step back is allowed to correct a mistake).
 IF v_status<>v_before.status::text THEN
  IF v_status IN ('processing','shipped','delivered') AND coalesce(v_before.payment_status::text,'')<>'paid' THEN
   RAISE EXCEPTION 'Only paid orders can be processed, shipped or delivered.' USING ERRCODE='PT422'; END IF;
  IF NOT ((v_before.status::text='pending' AND v_status IN ('processing','cancelled'))
       OR (v_before.status::text='processing' AND v_status IN ('shipped','cancelled'))
       OR (v_before.status::text='shipped' AND v_status IN ('delivered','processing'))
       OR (v_before.status::text='cancelled' AND v_status='pending')) THEN
   RAISE EXCEPTION 'This status change is not allowed.' USING ERRCODE='PT423'; END IF;
 END IF;
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
$function$;

commit;
