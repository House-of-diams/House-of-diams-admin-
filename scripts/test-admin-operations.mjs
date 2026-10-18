// Actual-source offline adapters only. No listener, real fetch, database, Redis or browser.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const modules=new Map()
const urlFor=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64')
const adapter=urlFor(`export async function authorizeProductRequest(...args){return globalThis.__b6.authorize(...args)};export async function adminTransaction(run){return globalThis.__b6.transaction(run)};export async function assertAdmin(...args){return globalThis.__b6.legacy(...args)};export async function sendOrderStatusUpdateEmail(...args){return globalThis.__b6.send(...args)};export function buildAdminClient(){throw Error('offline media')}`)
async function load(relative){
 const filename=path.resolve(root,relative)
 if(modules.has(filename))return modules.get(filename)
 let code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 for(const match of [...code.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)]){
  const name=match[1];let url
  if(name==='./supabase')url=urlFor("export const supabase={auth:{async getSession(){globalThis.__b6LegacyCalls++;return {data:{session:{access_token:'legacy-token'}}}}}}")
  else if(name==='server-only')url=urlFor('export {}')
  else if(name==='next/server')url=import.meta.resolve('next/server.js')
  else if(name.endsWith('/cms-auth')||name==='./cms-auth'||name==='./db/pool'||name==='./product-session-runtime'||name==='@/lib/email')url=adapter
  else if(name.startsWith('.')||name.startsWith('@/')){
   let target=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(filename),name)
   if(!path.extname(target))target+='.ts'
   url=(await load(target)).url
  }else url=import.meta.resolve(name)
  code=code.replaceAll(`'${name}'`,`'${url}'`).replaceAll(`"${name}"`,`"${url}"`)
 }

 const url=urlFor(code);const value={url,exports:await import(url)};modules.set(filename,value);return value
}
const get=async file=>(await load(file)).exports
const {createOperationsRoute,operationsError}=await get('lib/operations-route.ts')
const {readOperationsProvider}=await get('lib/operations-provider.ts')
const {createOrdersRepository}=await get('lib/db/admin-repositories/orders.ts')
const {createCouponsRepository}=await get('lib/db/admin-repositories/coupons.ts')
const {createCustomersRepository}=await get('lib/db/admin-repositories/customers.ts')
const {createEnquiriesRepository}=await get('lib/db/admin-repositories/enquiries.ts')
const {createNotificationsRepository}=await get('lib/db/admin-repositories/notifications.ts')
const {createSettingsRepository}=await get('lib/db/admin-repositories/settings.ts')
const {dashboardSources}=await get('lib/db/admin-repositories/dashboard.ts')
const {exactId}=await get('lib/db/admin-repositories/operations-shared.ts')
const {deliverOrderUpdate}=await get('lib/operations-order-mail.ts')
const {withAdminTransaction}=await get('lib/db/query.ts')
const {ProductSessionError}=await get('lib/product-session-error.ts')
const {assertMutation}=await get('lib/auth/request-security.ts')
const {operationsFetch}=await get('lib/operations-transport.ts')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const actor={profileId:id(1),issuer:'https://admin.example/realm',subject:'verified-admin'}
const req=(method='GET',body,url='/api/orders')=>new Request('https://admin.example'+url,{method,headers:{origin:'https://admin.example','x-admin-csrf':'csrf','content-type':'application/json',authorization:'Bearer untrusted'},...(body===undefined?{}:{body:JSON.stringify(body)})})
const order={id:id(2),order_number:'ORD-1',customer_first_name:'A',customer_last_name:'B',customer_email:'customer@example.test',total_amount:45.25,payment_status:'paid',status:'pending',created_at:'2026-10-15T00:00:00Z',courier_name:null,courier_awb_number:null,shipped_at:null}
const input={status:'cancelled',expected_status:'pending',expected_courier_name:null,expected_courier_awb_number:null,courier_name:null,courier_awb_number:null}
const coupon={code:'save10',title:' Save ',reward_type:'percentage',discount_type:'percentage',discount_value:10,minimum_order_amount:0,gift_product_id:null,gift_variant_id:'',gift_variant_data:{},gift_banner_image_url:null,banner_enabled:false,banner_title:null,banner_description:null,starts_at:null,ends_at:null,featured_priority:0,usage_limit:null,is_active:true}
const settings={whatsapp_number:'1234',default_gst_slab_id:null,maintenance_mode_enabled:false,maintenance_mode_message:'Maintenance',estimated_delivery_text:'3 weeks'}
function dbFake(run=()=>[]) {const calls=[];return {calls,db:{async query(sql,values=[]){calls.push([sql,values]);return {rows:await run(sql,values)}}}}}
const json=item=>({item:JSON.stringify(item)})
function harness(options={}){
 const events=[];const f=dbFake(options.query)
 const deps={provider:()=>{if(options.bad)throw Error('config-secret');return options.provider??'rds'},authorize:async(request,mutation)=>{events.push(['auth',mutation]);if(options.denied)throw new ProductSessionError(options.denied);if(mutation){try{assertMutation(request,'https://admin.example','csrf')}catch{throw new ProductSessionError(403)}}return {actor}},legacy:async()=>{events.push(['legacy']);return {error:Response.json({error:'legacy'},{status:401})}},transaction:async run=>{events.push(['begin']);try{const result=await run(f.db);if(options.commitFail)throw Error('commit failed');events.push(['commit']);return result}catch(e){events.push(['rollback']);throw e}}}
 return {...f,events,deps,route:createOperationsRoute(deps)}
}
test('exact server-only operations provider default, selected mode and invalid configuration',()=>{
 assert.equal(readOperationsProvider({}),'supabase');assert.equal(readOperationsProvider({ADMIN_OPERATIONS_DATA_PROVIDER:''}),'supabase');assert.equal(readOperationsProvider({ADMIN_OPERATIONS_DATA_PROVIDER:'rds'}),'rds');assert.equal(readOperationsProvider({NEXT_PUBLIC_ADMIN_OPERATIONS_DATA_PROVIDER:'rds'}),'supabase')
 for(const value of ['RDS',' rds','postgres'])assert.throws(()=>readOperationsProvider({ADMIN_OPERATIONS_DATA_PROVIDER:value}))
})
test('legacy default calls only legacy; config failure never falls back',async()=>{
 for(const options of [{provider:'supabase'},{bad:true}]){const h=harness(options);const response=await h.route(req(),async()=>{throw Error('must not run')});assert.equal(response.status,options.bad?503:401);assert.deepEqual(h.events,options.bad?[]:[['legacy']]);assert.equal(h.calls.length,0)}
})
test('real mapped actor is used; bearer/request actor never selects notification owner',async()=>{
 const h=harness();const response=await h.route(req('POST',{actor:id(8)}),async a=>Response.json(await createNotificationsRepository(a.db,a.actor).mark({notificationKey:`order:${id(2)}`})))
 assert.equal(response.status,200);assert.equal(h.calls[0][1][0],actor.profileId);assert.notEqual(h.calls[0][1][0],id(8));assert.deepEqual(h.events,[['auth',true],['begin'],['commit']])
})
test('missing/disabled/revoked session errors deny before DB and no legacy fallback',async()=>{
 for(const denied of [401,403,503]){const h=harness({denied});assert.equal((await h.route(req(),async()=>Response.json({ok:true}))).status,denied);assert.equal(h.calls.length,0);assert.equal(h.events.some(e=>e[0]==='legacy'),false)}
})
test('mutation origin/CSRF/unsafe method reject before DB',async()=>{
 for(const headers of [{origin:'https://evil.test','x-admin-csrf':'csrf'},{origin:'https://admin.example','x-admin-csrf':'bad'},{origin:'https://admin.example','x-admin-csrf':'csrf','sec-fetch-site':'cross-site'}]){const h=harness();const r=new Request('https://admin.example/api/orders',{method:'POST',headers});assert.equal((await h.route(r,async()=>Response.json({ok:true}))).status,403);assert.equal(h.calls.length,0)}
 // The production composition maps B1 mutation failures to 403.
 assert.throws(()=>assertMutation(req('TRACE'),'https://admin.example','csrf'))
})
test('safe response mapping never leaks raw SQL/details',async()=>{
 for(const [code,status]of [['42501',403],['42P01',503],['42703',503],['42883',503],['40001',409],['40P01',409],['23505',409],['23503',409],['P0002',404],['23514',400]]){const response=operationsError({code,message:'SECRET SQL'});assert.equal(response.status,status);assert.equal((await response.text()).includes('SECRET'),false);assert.equal(response.headers.get('cache-control'),'no-store')}
})
test('query failure caught by caller still rolls back and does not become empty success',async()=>{
 const h=harness({query:()=>{throw {code:'42501'}}});const response=await h.route(req(),async a=>{try{await a.db.query('SELECT private')}catch{}return Response.json({items:[]})});assert.equal(response.status,403);assert.deepEqual(h.events,[['auth',false],['begin'],['rollback']])
})
test('order pagination binds offsets and preserves totals beyond last page',async()=>{
 const f=dbFake(()=>[{total:'41',items:'[]'}]);assert.deepEqual(await createOrdersRepository(f.db).list(4),{items:[],page:4,pageSize:20,total:41,totalPages:3});assert.deepEqual(f.calls[0][1],[60]);assert.match(f.calls[0][0],/count\(\*\).*public.orders/)
 for(const page of [0,-1,1.5,100001,Infinity])await assert.rejects(()=>createOrdersRepository(f.db).list(page))
})
test('order list currency/customer/item counts retain legacy envelope',async()=>{
 const f=dbFake(()=>[{total:'1',items:JSON.stringify([{...order,items:3}])}]);const data=await createOrdersRepository(f.db).list();assert.equal(data.items[0].total,45.25);assert.equal(data.items[0].customer,'A B');assert.equal(data.items[0].items,3)
})
test('order detail preserves line/love-letter shapes and sanitizes HTML; absent order is 404',async()=>{
 const f=dbFake(sql=>sql.includes('public.orders ')?[json(order)]:sql.includes('order_love_letters')?[json({id:id(3),final_letter_html:'<p>Hello<script>bad()</script></p>'})]:[json({product_name:'Ring',quantity:2,line_total:45.25,variant_data:{color:'gold'}})])
 const result=await createOrdersRepository(f.db).detail(id(2));assert.equal(result.items[0].variant_data.color,'gold');assert.equal(result.loveLetter.final_letter_html.includes('script'),false);assert.equal(result.order.id,id(2))
 await assert.rejects(()=>createOrdersRepository(dbFake().db).detail(id(2)),e=>e.status===404)
})
test('order expected-value conflicts preserve 409/404 and never update stock/history manually',async()=>{
 for(const code of ['P0002','40001','PT409']){const f=dbFake(()=>{throw {code}});await assert.rejects(()=>createOrdersRepository(f.db,actor).update(id(2),input),e=>e.status===(code==='P0002'?404:409));assert.equal(f.calls.some(([s])=>s.startsWith('UPDATE')),false)}
 const f=dbFake(()=>[json({item:{...order,status:'cancelled'},items:[],statusChanged:true})]);const result=await createOrdersRepository(f.db,actor).update(id(2),input,'2026-10-15T01:00:00Z');assert.equal(result.statusChanged,true);assert.equal(f.calls.length,1);assert.equal(f.calls.some(([s])=>/UPDATE public.products|INSERT INTO public.inventory|order_status_history/.test(s)),false);assert.match(f.calls[0][0],/admin_order_status_update_v1/);assert.deepEqual(f.calls[0][1].slice(0,4),[actor.profileId,actor.issuer,actor.subject,id(2)]);assert.equal(JSON.parse(f.calls[0][1][4]).expected_status,'pending')
 const missing=dbFake();await assert.rejects(()=>createOrdersRepository(missing.db).update(id(2),input),e=>e.status===403);assert.equal(missing.calls.length,0)
})
test('shipped timestamp preservation and guarded-update race failure',async()=>{
 const f=dbFake(()=>[json({item:{...order,status:'shipped'},items:[],statusChanged:true})]);await createOrdersRepository(f.db,actor).update(id(2),{...input,status:'shipped',courier_name:'DHL',courier_awb_number:'AWB'},'2026-10-15T01:00:00Z');assert.match(f.calls[0][0],/admin_order_status_update_v1/);assert.equal(f.calls[0][1][5],'2026-10-15T01:00:00Z');assert.equal(JSON.parse(f.calls[0][1][4]).courier_name,'DHL')
 const race=dbFake(()=>{throw {code:'40001'}});await assert.rejects(()=>createOrdersRepository(race.db,actor).update(id(2),input),e=>e.status===409)
})

test('missing order capability fails closed without mail, legacy fallback or direct-write retry',async()=>{
 const h=harness({query:()=>{throw {code:'42883',message:'private SQL'}}})
 const response=await h.route(req('PATCH',input),async a=>{
  const result=await createOrdersRepository(a.db,a.actor).update(id(2),input)
  a.afterCommit(async()=>{h.events.push(['mail']);return Response.json(result)})
  return Response.json(result)
 })
 assert.equal(response.status,503);assert.equal(h.calls.length,1)
 assert.match(h.calls[0][0],/admin_order_status_update_v1/)
 assert.equal(h.events.some(e=>e[0]==='mail'||e[0]==='legacy'),false)
 assert.equal(h.events.at(-1)[0],'rollback');assert.equal((await response.text()).includes('private SQL'),false)
})
test('mail runs only after successful commit; delivery failure preserves successful update',async()=>{
 for(const commitFail of [false,true]){const h=harness({commitFail});const response=await h.route(req('PATCH',input),async a=>{a.afterCommit(async()=>{h.events.push(['mail']);return deliverOrderUpdate({item:order,items:[]},async()=>{throw Error('smtp-secret')})});return Response.json({pending:true})});assert.equal(response.status,commitFail?503:200);assert.equal(h.events.some(e=>e[0]==='mail'),!commitFail);if(!commitFail){assert.ok(h.events.findIndex(e=>e[0]==='commit')<h.events.findIndex(e=>e[0]==='mail'));assert.equal((await response.json()).emailStatus,'failed')}}
 let payload;const r=await deliverOrderUpdate({item:order,items:[{product_name:'Ring',quantity:'2',line_total:'45.25'}]},async p=>{payload=p});assert.equal((await r.json()).emailStatus,'sent');assert.equal(payload.items[0].quantity,2)
})
test('coupon validation rejects invalid rewards/schedule/unsafe IDs before writes',async()=>{
 for(const raw of [{...coupon,discount_value:101},{...coupon,starts_at:'invalid'},{...coupon,starts_at:'2026-10-15',ends_at:'2026-10-14'},{...coupon,id:9007199254740992}]){const f=dbFake();await assert.rejects(()=>createCouponsRepository(f.db).save(raw));assert.equal(f.calls.length,0)}
})
test('coupon saves exact ID and fixed payload without resetting usage/redemptions',async()=>{
 const f=dbFake(()=>[{item:'{"id":9223372036854775807}'}]);const result=await createCouponsRepository(f.db).save({...coupon,id:'9223372036854775807'});assert.equal(result.id,'9223372036854775807');assert.equal(f.calls[0][1][1],'9223372036854775807');assert.equal(JSON.parse(f.calls[0][1][0]).code,'SAVE10');assert.doesNotMatch(f.calls[0][0],/usage_count|coupon_redemptions/)
 for(const bad of ['1;DELETE','0','-1','9223372036854775808',9007199254740992])assert.throws(()=>exactId(bad))
})
test('coupon gift requires active stock and exact product variant association',async()=>{
 const raw={...coupon,reward_type:'free_gift',minimum_order_amount:20,gift_product_id:id(4),gift_variant_data:{variant_id:id(5)}}
 for(const mode of ['missing-product','wrong-variant','ok']){const f=dbFake(sql=>sql.includes('public.products')?(mode==='missing-product'?[]:[{id:id(4)}]):sql.includes('product_metal_variants')?[{id:mode==='wrong-variant'?id(6):id(5)}]:[json({id:1})]);if(mode==='ok'){await createCouponsRepository(f.db).save(raw);const payload=JSON.parse(f.calls.at(-1)[1][0]);assert.equal(payload.discount_value,0);assert.equal(payload.gift_product_id,id(4))}else{await assert.rejects(()=>createCouponsRepository(f.db).save(raw),e=>e.status===400);assert.equal(f.calls.some(([s])=>s.startsWith('INSERT')),false)}}
 const f=dbFake(sql=>sql.includes('product_metal_variants')?[{id:id(5)}]:[{id:id(4)}]);await assert.rejects(()=>createCouponsRepository(f.db).save({...raw,gift_variant_data:{}}),e=>e.status===400)
})
test('actual B2 transaction rolls back coupon association/save failure and releases connection',async()=>{
 const events=[];const principal={login_role:'hod_admin_app',active_role:'hod_admin_app',capability_exists:true,safe_login:true,isolated_login:true,safe_capability:true,isolated_capability:true}
 const pool={async connect(){return {async query(sql){events.push(sql);if(sql.startsWith('SELECT session_user'))return {rows:[principal]};if(sql.startsWith('INSERT INTO public.coupons'))throw {code:'23503'};return {rows:[]}},release(discard){events.push(['release',discard])}}}}
 await assert.rejects(()=>withAdminTransaction(pool,'hod_admin_app',db=>createCouponsRepository(db).save(coupon)));assert.equal(events.includes('COMMIT'),false);assert.ok(events.includes('ROLLBACK'));assert.equal(events.at(-1)[0],'release')
})
test('coupon deletion parameterized, not-found and referenced errors propagate',async()=>{
 const f=dbFake(()=>[{id:'1'}]);assert.deepEqual(await createCouponsRepository(f.db).remove('1'),{ok:true});assert.deepEqual(f.calls[0][1],['1']);await assert.rejects(()=>createCouponsRepository(dbFake().db).remove(1),e=>e.status===404)
})
test('notification read markers use stable actor and idempotent insert without overwriting timestamps',async()=>{
 const f=dbFake();const repo=createNotificationsRepository(f.db,actor);await repo.mark({notificationKey:`contact:${id(7)}`},'2026-10-15T00:00:00Z');await repo.mark({notificationKey:`contact:${id(7)}`});assert.equal(f.calls[0][1][0],actor.profileId);assert.match(f.calls[0][0],/ON CONFLICT\(admin_user_id,notification_key\) DO NOTHING/);assert.doesNotMatch(f.calls[0][0],/DO UPDATE/);await assert.rejects(()=>repo.mark({notificationKey:`contact:${id(7)}`,admin_user_id:id(9)}))
})
function notificationDb(){return dbFake(sql=>sql.includes('to_regclass')?[{present:false}]:sql.includes('admin_notification_reads')?[{notification_key:`order:${id(2)}`}]:sql.includes('public.orders')?[json(order)]:sql.includes('contact_submissions')?[json({id:id(3),full_name:'X',email:'x@example.test',phone:null,topic:'Product Enquiry: Ring',message:'Interested',status:'new',created_at:'2026-10-15T02:00:00Z'})]:[])}
test('notification sorting, limited source counts, actor read ownership and read-all batching',async()=>{
 const f=notificationDb();const repo=createNotificationsRepository(f.db,actor);const data=await repo.read();assert.equal(data.items[0].type,'product');assert.equal(data.counts.all,2);assert.equal(data.unreadCounts.all,1);assert.equal(data.newsletterEnabled,false);assert.equal(f.calls.find(([s])=>s.startsWith('SELECT notification_key'))[1][0],actor.profileId);assert.deepEqual(await repo.markAll(),{ok:true,count:1});assert.deepEqual(f.calls.at(-1)[1].slice(0,2),[actor.profileId,[`product:${id(3)}`]])
})
test('optional enquiry relations absent disable feature; present-but-denied never returns empty success',async()=>{
 const absent=dbFake(sql=>sql.includes('to_regclass')?[{present:false}]:[]);const data=await createEnquiriesRepository(absent.db).sources();assert.equal(data.newsletterResult.enabled,false);assert.equal(data.promotionResult.enabled,false)
 const denied=dbFake(sql=>{if(sql.includes('to_regclass'))return [{present:true}];if(sql.includes('newsletter_submissions'))throw {code:'42501'};return []});await assert.rejects(()=>createEnquiriesRepository(denied.db).sources());assert.equal(denied.calls.some(([s])=>s.includes('promotion_popup_responses')),false)
})
test('promotion questions/answers preserve labels and exact foreign IDs; required questions failure propagates',async()=>{
 const {presentEnquiries}=await get('lib/operations-presenters.ts');const f=dbFake(sql=>sql.includes('to_regclass')?[{present:true}]:sql.includes('promotion_popup_responses')?[json({id:id(4),promotion_id:'9223372036854775807',email:'a@example.test',answers:{style:['Ring','Gold']},coupon_revealed:true,created_at:'2026-10-15T00:00:00Z'})]:sql.includes('promotion_popup_questions')?[json({promotion_id:'9223372036854775807',field_key:'style',question:'Style?'})]:[]);const result=presentEnquiries(await createEnquiriesRepository(f.db).sources());assert.deepEqual(result.items[0].answers,[{label:'Style?',value:'Ring, Gold'}]);assert.equal(result.counts.promotion,1)
})
test('contact pagination binds page and page size and has honest empty-page counts',async()=>{
 const f=dbFake(()=>[{total:'101',items:'[]'}]);assert.equal((await createEnquiriesRepository(f.db).contactPage(3,25)).total,101);assert.deepEqual(f.calls[0][1],[25,50]);await assert.rejects(()=>createEnquiriesRepository(f.db).contactPage(1,101))
})
test('customer read model uses identity FK only, stored verification/first-seen and no auth/email linkage',async()=>{
 const customer={id:id(9),email:'shared@example.test',name:'A',firstSeenAt:'2026-10-14',emailVerified:true};const f=dbFake(()=>[json(customer)]);assert.deepEqual(await createCustomersRepository(f.db).list(),[customer]);assert.match(f.calls[0][0],/p.identity_id=i.id/);assert.match(f.calls[0][0],/'firstSeenAt',i.created_at/);assert.doesNotMatch(f.calls[0][0],/auth\.users|customer_sessions|subject|p.email|confirmed|active/)
 await createCustomersRepository(f.db).orders(id(9));assert.match(f.calls[1][0],/customer_identity_id=\$1::uuid/);assert.deepEqual(f.calls[1][1],[id(9)])
})
test('customer metric separates identities, guest orders and historical owner orders; missing schema fails closed',async()=>{
 const f=dbFake(()=>[{identities:'2',guest_orders:'5',legacy_account_orders:'3'}]);assert.deepEqual(await createCustomersRepository(f.db).metrics(),{persistedCustomerIdentities:2,guestOrders:5,legacyAccountOrders:3,historicalRegistrations:null});assert.match(f.calls[0][0],/user_id IS NULL AND customer_identity_id IS NULL AND guest_token_hash IS NOT NULL/);assert.doesNotMatch(f.calls[0][0],/count\(DISTINCT.*email|auth\.users/)
 const missing=dbFake(()=>{throw {code:'42703'}});await assert.rejects(()=>createCustomersRepository(missing.db).metrics())
})
test('dashboard summaries share one SQL snapshot and retain explicit customer metric label',async()=>{
 const f=dbFake(()=>[json({products:2,orders:3,identities:1,guestOrders:2,revenue:[],recent:[],items:[]})]);const data=await dashboardSources(f.db);assert.equal(f.calls.length,1);assert.equal(data.customerLabel,'Customer identities');assert.match(data.customerNote,/2 guest orders/);assert.equal(data.customerCount,1)
})
test('settings preserve fixed key, defaults, GST validation and parameterized update-or-insert',async()=>{
 const empty=dbFake();const repo=createSettingsRepository(empty.db);assert.equal((await repo.read()).estimated_delivery_text,'Approximately 3 to 4 weeks');await repo.save(settings);assert.match(empty.calls.at(-1)[0],/^INSERT INTO public.site_settings/);assert.equal(empty.calls.at(-1)[1][0],'global_site_settings');assert.equal(JSON.parse(empty.calls.at(-1)[1][1]).whatsapp_number,'1234')
 const f=dbFake();await assert.rejects(()=>createSettingsRepository(f.db).save({...settings,default_gst_slab_id:id(3)}),e=>e.status===400);assert.equal(f.calls.some(([s])=>s.startsWith('UPDATE')),false)
})
test('selected RDS client transport uses same-origin cookies/CSRF and no Supabase token or fallback',async()=>{
 const original=globalThis.fetch;const calls=[];globalThis.__b6LegacyCalls=0
 try{globalThis.fetch=async(url,options)=>{calls.push([url,options]);if(url==='/api/operations/provider')return Response.json({provider:'rds'});if(url==='/api/auth/session')return Response.json({authenticated:true,csrfToken:'real-csrf'});return Response.json({ok:true})};await operationsFetch('/api/orders/'+id(2),{method:'PATCH',headers:{authorization:'Bearer forged','x-admin-csrf':'forged'},body:'{}'});assert.equal(globalThis.__b6LegacyCalls,0);assert.equal(calls.at(-1)[1].headers.get('authorization'),null);assert.equal(calls.at(-1)[1].headers.get('x-admin-csrf'),'real-csrf');assert.equal(calls.at(-1)[1].credentials,'same-origin');globalThis.fetch=async()=>{throw Error('offline')};assert.equal((await operationsFetch('/api/settings',{method:'POST'})).status,503);assert.equal(globalThis.__b6LegacyCalls,0);for(const path of ['https://evil.test/api/orders','/api/products/media','/api/orders/../settings','/api/settings#x'])await assert.rejects(()=>operationsFetch(path))}finally{globalThis.fetch=original}
})
test('actual selected RDS password route returns unavailable without privileged Supabase/password calls',async()=>{
 const h=harness();globalThis.__b6={authorize:h.deps.authorize,transaction:h.deps.transaction,legacy:()=>{throw Error('legacy must not run')}};const old=process.env.ADMIN_OPERATIONS_DATA_PROVIDER;process.env.ADMIN_OPERATIONS_DATA_PROVIDER='rds'
 try{const route=await get('app/api/settings/password/route.ts');const response=await route.POST(req('POST',{currentPassword:'secret'},'/api/settings/password'));assert.equal(response.status,503);assert.match((await response.json()).error,/self-service/);assert.equal(h.calls.length,0)}finally{if(old===undefined)delete process.env.ADMIN_OPERATIONS_DATA_PROVIDER;else process.env.ADMIN_OPERATIONS_DATA_PROVIDER=old}
})
test('actual order routes execute RDS list/detail/update with committed email result',async()=>{
 const h=harness({query:sql=>sql.startsWith('WITH page')?[{total:'1',items:JSON.stringify([{...order,items:1}])}]:sql.includes('admin_order_status_update_v1')?[json({item:{...order,status:'cancelled'},items:[],statusChanged:true})]:sql.includes('public.orders ')?[json(order)]:[]});const deliveries=[]
 globalThis.__b6={authorize:h.deps.authorize,transaction:h.deps.transaction,legacy:()=>{throw Error('legacy must not run')},send:async p=>{assert.ok(h.events.some(e=>e[0]==='commit'));deliveries.push(p)}}
 const old=process.env.ADMIN_OPERATIONS_DATA_PROVIDER;process.env.ADMIN_OPERATIONS_DATA_PROVIDER='rds'
 try{const list=await get('app/api/orders/route.ts');assert.equal((await (await list.GET(req())).json()).items[0].orderNumber,'ORD-1');const detail=await get('app/api/orders/[id]/route.ts');const context={params:Promise.resolve({id:id(2)})};assert.equal((await detail.GET(req(),context)).status,200);const result=await detail.PATCH(req('PATCH',input,'/api/orders/'+id(2)),context);assert.equal(result.status,200);assert.equal((await result.json()).emailStatus,'sent');assert.equal(deliveries.length,1);assert.equal((await detail.GET(req(),{params:Promise.resolve({id:'invalid'})})).status,400)}finally{if(old===undefined)delete process.env.ADMIN_OPERATIONS_DATA_PROVIDER;else process.env.ADMIN_OPERATIONS_DATA_PROVIDER=old}
})
test('actual coupon, settings, notification and contact routes use scoped RDS repositories',async()=>{
 const h=harness({query:sql=>sql.startsWith('WITH page')?[{total:'0',items:'[]'}]:sql.startsWith('INSERT INTO public.coupons')?[json({id:1})]:sql.startsWith('DELETE FROM public.coupons')?[{id:'1'}]:[]});globalThis.__b6={authorize:h.deps.authorize,transaction:h.deps.transaction,legacy:()=>{throw Error('legacy must not run')}};const old=process.env.ADMIN_OPERATIONS_DATA_PROVIDER;process.env.ADMIN_OPERATIONS_DATA_PROVIDER='rds'
 try{const coupons=await get('app/api/coupons/route.ts');assert.equal((await coupons.GET(req())).status,200);assert.equal((await coupons.POST(req('POST',coupon,'/api/coupons'))).status,200);const remove=await get('app/api/coupons/[id]/route.ts');assert.equal((await remove.DELETE(req('DELETE',undefined,'/api/coupons/1'),{params:Promise.resolve({id:'1'})})).status,200);const settingsRoute=await get('app/api/settings/route.ts');assert.equal((await settingsRoute.POST(req('POST',settings,'/api/settings'))).status,200);const mark=await get('app/api/notifications/read/route.ts');assert.equal((await mark.POST(req('POST',{notificationKey:`order:${id(2)}`},'/api/notifications/read'))).status,200);const contact=await get('app/api/cms/contact/submissions/route.ts');assert.equal((await contact.GET(req('GET',undefined,'/api/cms/contact/submissions?page=1&pageSize=25'))).status,200);assert.equal((await contact.GET(req('GET',undefined,'/api/cms/contact/submissions?page=1.5'))).status,400)}finally{if(old===undefined)delete process.env.ADMIN_OPERATIONS_DATA_PROVIDER;else process.env.ADMIN_OPERATIONS_DATA_PROVIDER=old}
})
test('route-specific SQLSTATE contracts remain safe after rollback',async()=>{
 for(const [path,code,status]of [['/api/orders/'+id(2),'23503',400],['/api/settings','23503',400],['/api/coupons','23505',409],['/api/coupons/1','23503',409]]){const r=operationsError({code,message:'PRIVATE SQL'},req('POST',{},path));assert.equal(r.status,status);assert.equal((await r.text()).includes('PRIVATE'),false)}
})
test('client legacy contract lazily obtains bearer and selected provider failures never retry',async()=>{
 const original=globalThis.fetch;const calls=[];globalThis.__b6LegacyCalls=0
 try{globalThis.fetch=async(url,options)=>{calls.push([url,options]);return url==='/api/operations/provider'?Response.json({provider:'supabase'}):Response.json({error:'conflict'},{status:409})};const result=await operationsFetch('/api/coupons',{method:'POST',body:'{}'});assert.equal(result.status,409);assert.equal(globalThis.__b6LegacyCalls,1);assert.equal(calls.length,2);assert.equal(calls[1][1].headers.get('authorization'),'Bearer legacy-token')}finally{globalThis.fetch=original}
})
test('notification required marker failure and promotion-question failure cannot masquerade as empty',async()=>{
 const f=dbFake(sql=>{if(sql.includes('to_regclass'))return [{present:false}];if(sql.includes('admin_notification_reads'))throw {code:'42P01'};return []});await assert.rejects(()=>createNotificationsRepository(f.db,actor).read())
 const q=dbFake(sql=>{if(sql.includes('to_regclass'))return [{present:true}];if(sql.includes('promotion_popup_questions'))throw {code:'42501'};return []});await assert.rejects(()=>createEnquiriesRepository(q.db).sources())
})
