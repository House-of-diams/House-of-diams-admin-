import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createOrderFixture,fixtureActor as actor} from './admin-order-test-fixture.mjs'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
const change=(extra={})=>({status:'cancelled',expected_status:'pending',courier_name:null,courier_awb_number:null,expected_courier_name:null,expected_courier_awb_number:null,...extra})
async function seed(db,mode='legacy_stock'){
 const product=randomUUID(),order=randomUUID()
 await db.query(`INSERT INTO public.products(id,name,slug,sku,main_category_id,stock_quantity,base_price,status,allow_checkout)
 VALUES($1,'Order probe',$2,$2,'00000000-0000-4000-8000-000000000002',7,1,'active',false)`,[product,'AWS-PROBE-'+product])
 await db.query(`INSERT INTO public.orders(id,order_number,customer_email,customer_first_name,guest_token_hash,fulfillment_mode,payment_gateway,payment_status)
 VALUES($1,$2,'fixture@example.invalid','Fixture',repeat('a',64),$3,'razorpay','pending')`,[order,'AWS-PROBE-'+order,mode])
 await db.query('INSERT INTO public.order_items(order_id,product_id,product_name,quantity,unit_price,line_total) VALUES($1,$2,\'Order probe\',2,1,2)',[order,product])
 return {product,order}
}
async function repo(db){
 const load=createSourceLoader(process.cwd())
 return (await import(await load('lib/db/admin-repositories/orders.ts'))).createOrdersRepository(db,actor)
}
const stock=async(db,id)=>Number((await db.query('SELECT stock_quantity FROM public.products WHERE id=$1',[id])).rows[0].stock_quantity)
test('actual owner capability/repository cancel once, preserve trigger history and deny unrestricted writes',async()=>{
 const db=await createOrderFixture()
 try{
  const ids=await seed(db)
  assert.equal(await stock(db,ids.product),5)
  const api=await repo(db)
  await db.exec('SET ROLE hod_admin_app')
  const result=await api.update(ids.order.toUpperCase(),change())
  assert.equal(result.statusChanged,true);assert.equal(result.item.status,'cancelled');assert.equal(result.items.length,1)
  assert.equal(await stock(db,ids.product),7)
  assert.equal((await api.update(ids.order,change({expected_status:'cancelled'}))).statusChanged,false)
  assert.equal(await stock(db,ids.product),7)
  await assert.rejects(()=>api.update(ids.order,change()),e=>e.status===409)
  await assert.rejects(()=>api.update(ids.order,change({status:'processing',expected_status:'cancelled'})),e=>e.status===409)
  await assert.rejects(()=>db.query('UPDATE public.orders SET status=\'pending\' WHERE id=$1',[ids.order]),{code:'42501'})
  await assert.rejects(()=>db.query('UPDATE public.products SET stock_quantity=100 WHERE id=$1',[ids.product]),{code:'42501'})
  await assert.rejects(()=>db.query('INSERT INTO public.inventory_adjustments(product_id) VALUES($1)',[ids.product]),{code:'42501'})
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.order_status_history WHERE order_id=$1',[ids.order])).rows[0].n,2)
  // Existing legacy cancellation leaves the reservation active: record this
  // explicitly rather than silently changing the shared lifecycle in migration.
  assert.equal((await db.query('SELECT status FROM public.inventory_reservations WHERE order_id=$1',[ids.order])).rows[0].status,'active')
 }finally{await db.close()}
})
test('mapped issuer/subject/profile must match and remain enabled; malformed payloads and public callers denied',async()=>{
 const db=await createOrderFixture()
 try{
  const ids=await seed(db),api=await repo(db)
  await db.exec('SET ROLE hod_admin_app')
  const call=(a,p=change())=>db.query('SELECT public.admin_order_status_update_v1($1,$2,$3,$4,$5,$6)',[a.profileId,a.issuer,a.subject,ids.order,JSON.stringify(p),new Date().toISOString()])
  for(const a of [{...actor,subject:'forged'},{...actor,issuer:'https://wrong.invalid'},{...actor,profileId:randomUUID()}])await assert.rejects(()=>call(a),{code:'42501'})
  await assert.rejects(()=>call(actor,{...change(),stock_quantity:100}),{code:'22023'})
  await assert.rejects(()=>call(actor,change({status:'unknown'})),{code:'22023'})
  await assert.rejects(()=>call(actor,change({courier_name:4})),{code:'22023'})
  await assert.rejects(()=>api.update(ids.order,{...change(),actor:randomUUID()}))
  await assert.rejects(()=>api.update(randomUUID(),change()),e=>e.status===404)
  await db.exec('RESET ROLE;UPDATE public.admin_identities SET enabled=false;SET ROLE hod_admin_app')
  await assert.rejects(()=>api.update(ids.order,change()),{code:'42501'})
  await db.exec('RESET ROLE;UPDATE public.admin_identities SET enabled=true,revoked_at=now();SET ROLE hod_admin_app')
  await assert.rejects(()=>api.update(ids.order,change()),{code:'42501'})
  await db.exec('RESET ROLE;SET ROLE hod_app')
  await assert.rejects(()=>call(actor),{code:'42501'})
 }finally{await db.close()}
})
test('made-to-order shipping preserves first shipment time; stale courier and trigger failure roll back',async()=>{
 const db=await createOrderFixture()
 try{
  const ids=await seed(db,'made_to_order'),api=await repo(db)
  assert.equal(await stock(db,ids.product),7)
  await db.exec('SET ROLE hod_admin_app')
  const shipped=await api.update(ids.order,change({status:'shipped',courier_name:'DHL',courier_awb_number:'AWB'}),'2026-10-17T01:00:00Z')
  await assert.rejects(()=>api.update(ids.order,change({expected_status:'shipped'})),e=>e.status===409)
  const expected={expected_status:'shipped',expected_courier_name:'DHL',expected_courier_awb_number:'AWB',courier_name:'DHL',courier_awb_number:'AWB'}
  const repeat=await api.update(ids.order,change({...expected,status:'shipped'}),'2026-10-18T01:00:00Z')
  assert.equal(repeat.item.shipped_at,shipped.item.shipped_at)
  await api.update(ids.order,change({...expected,status:'cancelled'}))
  await api.update(ids.order,change({...expected,status:'processing',expected_status:'cancelled'}))
  assert.equal(await stock(db,ids.product),7)
  await db.exec('RESET ROLE')
  const stockIds=await seed(db)
  await db.exec(`CREATE FUNCTION public.probe_fail_inventory() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture failure';END$$;
   CREATE TRIGGER probe_fail_inventory BEFORE INSERT ON public.inventory_adjustments FOR EACH ROW EXECUTE FUNCTION public.probe_fail_inventory();SET ROLE hod_admin_app`)
  await assert.rejects(()=>api.update(stockIds.order,change()))
  await db.exec('RESET ROLE')
  assert.equal(await stock(db,stockIds.product),5)
  assert.equal((await db.query('SELECT status FROM public.orders WHERE id=$1',[stockIds.order])).rows[0].status,'pending')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.order_status_history WHERE order_id=$1',[stockIds.order])).rows[0].n,1)
 }finally{await db.close()}
})
