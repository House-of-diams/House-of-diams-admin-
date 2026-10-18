// D1e fixture augmentation: original B3 suite immutable; new required prepare capability returns an empty media graph. All original test cases/assertions retained.
// Offline actual-source tests. No sockets, fetch network, Redis, browser or listeners.
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sentinel = 'data:text/javascript,export {}'
const unavailable = 'data:text/javascript,export async function authorizeProductRequest(){throw Error("offline")};export async function adminTransaction(){throw Error("offline")}'
const modules = new Map()
async function load(relative) {
  const filename = path.resolve(root, relative)
  if (modules.has(filename)) return modules.get(filename)
  let code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  const imports = [...code.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)]
  for (const match of imports) {
    const name = match[1]
    let url
    if (name === 'server-only') url = sentinel
    else if (name.endsWith('/db/pool') || name === './db/pool' || name === './product-session-runtime') url = unavailable
    else if (name.startsWith('.') || name.startsWith('@/')) {
      let target = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name)
      if (!path.extname(target)) target += '.ts'
      url = (await load(target)).url
    } else url = import.meta.resolve(name)
    code = code.replaceAll(`'${name}'`, `'${url}'`).replaceAll(`"${name}"`, `"${url}"`)
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  const loaded = {url, exports: await import(url)}
  modules.set(filename, loaded)
  return loaded
}
const {exports:{createProductRepository}} = await load('lib/db/admin-repositories/products.ts')
const {exports:{createInventoryRepository}} = await load('lib/db/admin-repositories/inventory.ts')
const {exports:{loadRdsProductList,loadRdsProductSummaries}} = await load('lib/db/admin-repositories/product-list.ts')
const {exports:{findRdsProductId,loadRdsProductEditor}} = await load('lib/db/admin-repositories/product-editor.ts')
const {exports:{saveRdsProduct}} = await load('lib/db/admin-repositories/product-save.ts')
const {exports:{loadRdsProductBootstrap}} = await load('lib/db/admin-repositories/product-bootstrap.ts')
const {exports:{createProductRdsHandlers}} = await load('lib/product-rds-handlers.ts')
const {exports:{readProductDataProvider}} = await load('lib/product-provider.ts')
const {exports:{withAdminTransaction}} = await load('lib/db/query.ts')
const {exports:{productPayloadSchema}} = await load('lib/product-payload-validation.ts')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const actor = {profileId:id(1),issuer:'https://admin.example/realm',subject:'external-subject'}
const evidence = JSON.parse(fs.readFileSync(path.join(root,'docs/aws-phase-a/rds-targeted-live-2026-10-14.json'),'utf8'))
function fake(run = () => [{result:{ok:true}}]) {
  const calls=[]
  return { calls, db:{ async query(sql, values=[]){ calls.push([sql,values]); return { rows: sql.includes('admin_product_duplicate_prepare_v1') ? [{result:{graph:{product:{id:values[0]},metal_media:[],variants:[],media_items:[],product_metal_selections:[],product_material_value_selections:[],product_stone_shapes:[],product_subcategory_links:[],product_option_links:[],product_purity_prices:[],product_faq_items:[]}}}] : await run(sql,values) } } } }
}
function harness(options={}) {
  const f=fake(options.run), calls=[]
  const handler=createProductRdsHandlers({ provider:()=>options.provider??'rds',
    authorize:async(request,mutation)=>{calls.push(['auth',mutation,request.headers.get('x-admin-csrf')]); if(options.denied)throw Error('SECRET'); return {actor}},
    transaction:async run=>{calls.push(['transaction']);return run(f.db)} })
  return {...f,callsAuth:calls,handler}
}
const req = (body,method='POST',url='https://admin.example/api/products')=>new Request(url,{method,headers:{'content-type':'application/json','x-admin-csrf':'csrf'},...(body!==undefined?{body:JSON.stringify(body)}:{})})
// Use the existing validated fixture literal without executing its test module.
const fixtureSource=fs.readFileSync(path.join(root,'scripts/test-product-payload-validation.mjs'),'utf8')
const fixture=Function('id',fixtureSource.slice(fixtureSource.indexOf('function payload()'),fixtureSource.indexOf("test('accepts the current"))+';return payload()')(id)
function payload(){return productPayloadSchema.parse(structuredClone(fixture))}

test('provider defaults legacy and denies unknown activation; no public env fallback',()=>{
  assert.equal(readProductDataProvider({}),'supabase');assert.equal(readProductDataProvider({ADMIN_PRODUCT_DATA_PROVIDER:'rds'}),'rds')
  for(const value of ['RDS',' postgres ','bogus'])assert.throws(()=>readProductDataProvider({ADMIN_PRODUCT_DATA_PROVIDER:value}))
  assert.equal(readProductDataProvider({NEXT_PUBLIC_ADMIN_PRODUCT_DATA_PROVIDER:'rds'}),'supabase')
})
test('save binds exact audited v1 actor/product/slug/payload; hostile data stays in parameters',async()=>{
  const f=fake();const body=payload();body.name="a'); DROP TABLE products; --"
  await createProductRepository(f.db).save(actor,{payload:body,slug:'new-slug'})
  assert.match(f.calls[0][0],/public.admin_product_save_v1\(\$1::uuid,\$2::uuid,\$3::text,\$4::jsonb\)/)
  assert.deepEqual(f.calls[0][1],[actor.profileId,null,'new-slug',JSON.stringify(body)])
  assert.ok(!f.calls[0][0].includes(body.name));assert.equal(evidence.reviewed_routines.find(r=>r.name==='admin_product_save_v1').arguments,'p_actor_id uuid, p_product_id uuid, p_slug text, p_payload jsonb')
})
test('bulk price preserves expected prices/request IDs and all audited argument positions',async()=>{
  const f=fake();const input={requestId:id(2),lane:'collection',operation:'increase_amount',value:3,ids:[id(3)],expectedPrices:[{id:id(3),price:5}]}
  await createProductRepository(f.db).bulkPrice(actor,input)
  assert.deepEqual(f.calls[0][1],[id(1),id(2),'collection','increase_amount',3,[id(3)],JSON.stringify(input.expectedPrices)])
  assert.match(f.calls[0][0],/\$5::numeric,\$6::uuid\[\],\$7::jsonb/)
  await createProductRepository(f.db).bulkPrice(actor,input);assert.deepEqual(f.calls[1],f.calls[0])
  // Replays are delegated to the existing atomic receipt routine, never implemented locally.
})
test('bulk deletion and draft activation preserve receipt IDs and lane',async()=>{
  const f=fake();const input={requestId:id(2),lane:'standard',ids:[id(3)]};const repo=createProductRepository(f.db)
  await repo.bulkDelete(actor,input);await repo.activateDrafts(actor,input)
  for(const call of f.calls)assert.deepEqual(call[1],[id(1),id(2),'standard',[id(3)]])
  assert.ok(f.calls[0][0].includes('admin_product_bulk_delete_v1'));assert.ok(f.calls[1][0].includes('admin_product_activate_drafts_v1'))
})
test('duplicate binds source/request/admin rather than actor-first and preserves table result',async()=>{
  const item={product_id:id(4),slug:'copy',lane:'collection'};const f=fake(()=>[item])
  assert.deepEqual(await createProductRepository(f.db).duplicate(actor,id(2),id(3)),item)
  assert.deepEqual(f.calls[0][1],[id(2),id(3),id(1)])
  assert.equal(evidence.reviewed_routines.find(r=>r.name==='duplicate_product').arguments,'p_source_product_id uuid, p_request_id uuid, p_admin_id uuid')
})
test('stock routine preserves expected/new stock, notes and unchanged envelope',async()=>{
  const item={product_id:id(2),stock_quantity:5,updated_at:'2026-10-14T00:00:00Z',unchanged:true};const f=fake(()=>[{result:item}])
  assert.deepEqual(await createInventoryRepository(f.db).setStock(actor,id(2),{expected_stock:5,stock_quantity:5,notes:''}),item)
  assert.deepEqual(f.calls[0][1],[id(1),id(2),5,5,null]);assert.match(f.calls[0][0],/\$3::integer,\$4::integer,\$5::text/)
})
test('inventory read keeps ordering, stock thresholds, linked labels and literal case-insensitive search',async()=>{
  const base={id:id(2),name:'Pendant',slug:'pendant',sku:null,updated_at:new Date('2026-10-14T00:00:00Z'),category_path:'Jewellery > Rings',linked_subcategories:['Other'],linked_options:['Square']}
  const f=fake(()=>[0,5,6].map(stock=>({...base,stock_quantity:stock})))
  const rows=await createInventoryRepository(f.db).list(' OTHER ')
  assert.deepEqual(rows.map(r=>r.status),['out-of-stock','low-stock','in-stock']);assert.equal(rows[0].categoryPath,'Jewellery > Rings | Linked: Other, Square')
  assert.equal(rows[0].sku,'');assert.equal(rows[0].updatedAt,'2026-10-14T00:00:00.000Z');assert.match(f.calls[0][0],/ORDER BY p.updated_at DESC/)
  assert.deepEqual(await createInventoryRepository(f.db).list('%'),[])
})
test('paged list binds lane/search/limit/offset, count and stable two-key ordering',async()=>{
  const f=fake(sql=>sql.includes('count(*)')?[{total:'41'}]:[{item:{id:id(2),categoryPath:'Jewellery'},metals:['Gold'],linked_subcategories:['Rings'],linked_options:[]}])
  const result=await loadRdsProductList(f.db,'hiphop',3,"x'_%")
  assert.equal(result.total,41);assert.equal(result.totalPages,3);assert.equal(result.items[0].categoryPath,'Jewellery | Linked: Rings')
  assert.deepEqual(f.calls[1][1],['hiphop',"%x'_%%",20,40]);assert.match(f.calls[1][0],/ORDER BY p.created_at DESC,p.id DESC/)
  const empty=fake(sql=>sql.includes('count(*)')?[{total:'0'}]:[]);assert.equal((await loadRdsProductList(empty.db,undefined)).totalPages,1)
})
test('slug lookup never casts arbitrary slug as UUID, prefers existing slug then UUID',async()=>{
  const f=fake(()=>[]);assert.equal(await findRdsProductId(f.db,"bad'; --"),null);assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0][1],["bad'; --"])
  await findRdsProductId(f.db,id(2));assert.match(f.calls.at(-1)[0],/id=\$1::uuid/)
})
test('editor preserves media/variant/dropdown references and sort contracts',async()=>{
  const f=fake(sql=>{
    if(sql.includes('FROM public.products p'))return [{item:{id:id(2),base_price:123,image_1_path:'products/original.webp'}}]
    if(sql.includes('product_metal_variants'))return [{item:{id:id(3),metal_id:id(4),price:120,is_default:true,sort_order:1}}]
    if(sql.includes('product_variant_media_items'))return [{item:{variant_id:id(3),media_path:'products/variant.webp'}},{item:{variant_id:null,is_default_fallback:true,media_path:'products/default.webp'}}]
    if(sql.includes('product_custom_dropdown_options'))return [{item:{id:id(6),dropdown_id:id(5),label:'Small'}}]
    if(sql.includes('product_custom_dropdowns'))return [{item:{id:id(5),label:'Size'}}]
    return []
  })
  const item=await loadRdsProductEditor(f.db,id(2));assert.equal(item.image_1_path,'products/original.webp');assert.equal(item.metal_variants[0].media_items[0].media_path,'products/variant.webp');assert.equal(item.default_variant_media_items[0].media_path,'products/default.webp');assert.equal(item.custom_dropdowns[0].options[0].dropdown_id,id(5))
  assert.ok(f.calls.every(([,v])=>v.length===1));assert.ok(f.calls.some(([s])=>s.includes('ORDER BY display_order')))
})
test('product save validates references then normalizes default variant and uses one atomic function',async()=>{
  const f=fake((sql)=>{
    if(sql.includes('SELECT id FROM public.catalog_categories'))return [{id:id(1)}]
    if(sql.startsWith('SELECT id FROM public.catalog_metals'))return [{id:id(3)}]
    if(sql.includes('admin_product_save_v1'))return [{result:{id:id(2)}}]
    return []
  });const body=payload();body.metal_variants=[{metal_id:id(3),price:123,is_default:true,sort_order:1,media_items:[]}]
  const result=await saveRdsProduct(f.db,actor,body,id(2));assert.equal(result.data.id,id(2));const last=f.calls.at(-1);const sent=JSON.parse(last[1][3]);assert.equal(sent.base_price,123);assert.deepEqual(sent.metal_ids,[id(3)]);assert.equal(last[1][2],null)
  assert.equal(f.calls.filter(([s])=>s.includes('admin_product_save_v1')).length,1);assert.ok(!f.calls.some(([s])=>/^(INSERT|UPDATE|DELETE)/.test(s)))
})
test('absent or mismatched catalog references prevent save; retired slug cannot be reused',async()=>{
  const denied=fake(()=>[]);assert.match((await saveRdsProduct(denied.db,actor,payload(),null)).error,/no longer exists/);assert.ok(!denied.calls.some(([s])=>s.includes('admin_product_save')))
  const f=fake(sql=>sql.includes('catalog_categories')?[{id:id(1)}]:sql.includes('seo_redirects')?[{source_path:'/shop/atomic-test-product'}]:sql.includes('admin_product_save')?[{result:{ok:true}}]:[])
  await saveRdsProduct(f.db,actor,payload(),null);assert.equal(f.calls.at(-1)[1][2],'atomic-test-product-2')
})
test('form bootstrap uses audited read functions only and rejects missing references rather than fallback',async()=>{
  const f=fake(sql=>[{result:sql.includes('ring_snapshot')?{categories:[],sizes:[]}:[]}]);const result=await loadRdsProductBootstrap(f.db,'all')
  assert.ok(result.categories&&result.ringCategories&&result.productContentRules);assert.ok(f.calls.every(([s])=>s.startsWith('SELECT ')));assert.ok(f.calls.some(([s,v])=>s.includes('catalog_master_list_v1')&&v[0]==='content_rule'))
  assert.equal(evidence.reviewed_routines.find(r=>r.name==='catalog_hierarchy_list_v1').arguments,'p_kind text')
  await assert.rejects(()=>loadRdsProductBootstrap(fake(()=>[]).db,'basics'))
})
test('legacy branch is chosen before authorization/DB; selected RDS failures never return null',async()=>{
  const legacy=harness({provider:'supabase'});assert.equal(await legacy.handler('inventory-stock',req({}),id(2)),null);assert.deepEqual(legacy.callsAuth,[])
  const denied=harness({denied:true});assert.equal((await denied.handler('inventory-stock',req({}),id(2))).status,503);assert.equal(denied.calls.length,0)
  const bad=createProductRdsHandlers({provider:()=>{throw Error('SECRET')},authorize:()=>{throw Error('unexpected')},transaction:()=>{throw Error('unexpected')}});assert.equal((await bad('price',req({}))).status,503)
})
test('route validates payloads/UUIDs, requires mutation authorization and ignores browser actor',async()=>{
  const h=harness();const response=await h.handler('inventory-stock',req({expected_stock:0,stock_quantity:4,actorId:id(9)}),id(2))
  assert.equal(response.status,400);assert.equal(h.calls.length,0);assert.deepEqual(h.callsAuth[0],['auth',true,'csrf'])
  assert.equal((await h.handler('duplicate',req({requestId:id(3)}),'invalid')).status,400)
})
test('route stock/conflict/not-found/permission SQLSTATE envelopes retain safe status and no SQL details',async()=>{
  for(const [code,status] of [['40001',409],['P0002',404],['22023',400],['42501',403],['42883',503],['ECONNREFUSED',503]]){
    const h=harness({run:()=>{throw Object.assign(Error('SECRET CONNECTION SQL'),{code})}})
    const response=await h.handler('inventory-stock',req({expected_stock:2,stock_quantity:3}),id(2));assert.equal(response.status,status);assert.ok(!(await response.text()).includes('SECRET'));assert.equal(h.calls.length,1)
  }
})
test('route success uses mapped internal UUID and preserves duplicate/status outcomes',async()=>{
  const h=harness({run:sql=>sql.includes('duplicate_product')?[{product_id:id(4),slug:'draft',lane:'standard'}]:[{id:id(2),product_lane:'standard'}]})
  const response=await h.handler('duplicate',req({requestId:id(3)}),id(2));assert.equal(response.status,201);assert.equal((await response.json()).item.product_id,id(4));assert.deepEqual(h.calls.at(-1)[1],[id(2),id(3),id(1)])
  const conflict=harness({run:sql=>sql.startsWith('UPDATE')?[]:[{id:id(2)}]});assert.equal((await conflict.handler('status',req({status:'draft',expected_status:'active'},'PATCH'),id(2))).status,409)
  const absent=harness({run:()=>[]});assert.equal((await absent.handler('status',req({status:'draft',expected_status:'active'},'PATCH'),id(2))).status,404)
})
test('B2 transaction rollback protects atomic mutations and releases on SQLSTATE conflict',async()=>{
  const calls=[];let released
  const client={async query(sql){calls.push(sql);if(sql.startsWith('SELECT session_user'))return {rows:[{login_role:'hod_admin_app',active_role:'hod_admin_app',capability_exists:true,safe_login:true,isolated_login:true,safe_capability:true,isolated_capability:true}]};if(sql.includes('admin_product_bulk_delete'))throw Object.assign(Error('SECRET'),{code:'40001'});return {rows:[]}},release(value){released=value}}
  await assert.rejects(()=>withAdminTransaction({connect:async()=>client},'hod_admin_app',db=>createProductRepository(db).bulkDelete(actor,{requestId:id(2),ids:[id(3)],lane:'standard'})),{sqlState:'40001'})
  assert.equal(calls.at(-1),'ROLLBACK');assert.ok(!calls.includes('COMMIT'));assert.equal(released,false)
})
test('all scoped data API methods dispatch before legacy auth; media paths retain original gates',()=>{
  const routes=['products/route.ts','products/[id]/route.ts','products/by-slug/[slug]/route.ts','products/[id]/duplicate/route.ts','products/[id]/status/route.ts','products/list/route.ts','products/bulk-price/route.ts','products/bulk-delete/route.ts','products/activate-drafts/route.ts','inventory/route.ts','inventory/[id]/route.ts']
  for(const route of routes){const source=fs.readFileSync(path.join(root,'app/api',route),'utf8');for(const match of source.matchAll(/export async function (GET|POST|PATCH|DELETE)\(/g)){const section=source.slice(match.index);assert.ok(section.indexOf('runProductRdsRoute(')<section.indexOf('await assertAdmin(request)'))}}
  assert.ok(!fs.readFileSync(path.join(root,'app/api/products/media/route.ts'),'utf8').includes('runProductRdsRoute'))
})

test('summary read preserves the unpaginated response envelope and ordered metal labels',async()=>{
  const f=fake(()=>[{item:{id:id(2),purities:[],metals:['Gold'],shapes:[],materialValues:[]}}]);assert.equal((await loadRdsProductSummaries(f.db))[0].id,id(2));assert.match(f.calls[0][0],/ORDER BY ms.id/);assert.match(f.calls[0][0],/ORDER BY p.created_at DESC/);assert.deepEqual(f.calls[0][1],[])
})

test('scoped session composition uses actual B1 cookie/CSRF/mapping validation, never a request bearer', async()=>{
  const session = await load('lib/auth/session.ts')
  const keycloak = await load('lib/auth/keycloak.ts')
  const errorModule = await load('lib/product-session-error.ts')
  const cookie='c'.repeat(43), csrf='s'.repeat(43), seconds=Math.floor(Date.now()/1000)
  const config={issuer:actor.issuer,clientId:'hod-admin',requiredClientRole:'hod-admin',origin:'https://admin.example',sessionMaxSeconds:3600,sessionIdleSeconds:600,revalidateSeconds:300}
  const claims={issuer:actor.issuer,subject:actor.subject,audiences:['hod-admin'],clientId:'hod-admin',clientRoles:['hod-admin'],expiresAt:seconds+1000}
  let record={version:'v',data:{claims,tokens:{accessToken:'protected-verified-token',refreshToken:'protected-refresh',idToken:'protected-id'},csrf,createdAt:seconds,lastSeen:seconds,checkedAt:seconds,expiresAt:seconds+1200,refreshing:false}}
  let enabled=true
  const store={async get(key){assert.equal(key,`session:${keycloak.exports.digest(cookie)}`);return record},async replace(key,version,data){if(!record||record.version!==version)return false;record={version:'v2',data};return true},async consume(){record=null;return null}}
  const mapping={issuer:actor.issuer,subject:actor.subject,profileId:id(1),enabled:true,revokedAt:null,profileRole:'admin'}
  globalThis.__b3Session={config,store,lookup:async()=>[{...mapping,enabled}]}
  const stub=(name,value)=>'data:text/javascript;base64,'+Buffer.from(`export const ${name}=${value}`).toString('base64')
  let code=ts.transpileModule(fs.readFileSync(path.join(root,'lib/product-session-runtime.ts'),'utf8').replace("import 'server-only'",''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  const deps={'./auth/config':stub('readAuthConfig','()=>globalThis.__b3Session.config'),'./auth/keycloak':stub('createKeycloak','()=>({refresh:async()=>{throw Error("unexpected refresh")}})'),'./auth/session-store':stub('createSessionStore','()=>globalThis.__b3Session.store'),'./auth/session':session.url,'./db/admin-repositories/identity':stub('lookupAdminIdentity','(...args)=>globalThis.__b3Session.lookup(...args)'),'./product-session-error':errorModule.url}
  for(const [name,url]of Object.entries(deps))code=code.replaceAll(`'${name}'`,`'${url}'`)
  const runtime=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
  const request=(headers={})=>new Request('https://admin.example/api/inventory/'+id(2),{method:'PATCH',headers:{cookie:`__Host-hod_admin_session=${cookie}`,origin:config.origin,'x-admin-csrf':csrf,...headers}})
  try {
    const result=await runtime.authorizeProductRequest(request(),true);assert.deepEqual(result.actor,actor)
    await assert.rejects(()=>runtime.authorizeProductRequest(request({'x-admin-csrf':'wrong'}),true),{status:403})
    await assert.rejects(()=>runtime.authorizeProductRequest(request({origin:'https://attacker.example'}),true),{status:403})
    enabled=false;await assert.rejects(()=>runtime.authorizeProductRequest(request(),true),{status:403});enabled=true
    await assert.rejects(()=>runtime.authorizeProductRequest(request({cookie:'',authorization:'Bearer browser-token'}),true),{status:401})
    assert.equal(record.data.tokens.accessToken,'protected-verified-token')
  } finally {delete globalThis.__b3Session}
})

test('browser transport follows server contract, uses cookie CSRF, never exposes tokens or falls back/retries',async()=>{
  let legacyCalls=0
  globalThis.__b3TransportLegacy=async()=>{legacyCalls++;return {data:{session:{access_token:'legacy-token'}}}}
  let code=ts.transpileModule(fs.readFileSync(path.join(root,'lib/product-transport.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  const stub='data:text/javascript,export const supabase={auth:{getSession:()=>globalThis.__b3TransportLegacy()}}'
  code=code.replaceAll("'./supabase'",`'${stub}'`)
  const transport=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
  const original=globalThis.fetch;const calls=[];let provider='rds',sessionOk=true
  globalThis.fetch=async(url,options)=>{
    calls.push([url,options])
    if(url==='/api/products/provider')return Response.json({provider})
    if(url==='/api/auth/session')return Response.json(sessionOk?{authenticated:true,csrfToken:'csrf'}:{error:'Unauthorized'},{status:sessionOk?200:401})
    return Response.json({error:'conflict'},{status:409})
  }
  try {
    const response=await transport.productFetch('/api/inventory/'+id(2),{method:'PATCH',body:'{}',headers:{authorization:'evil','x-admin-csrf':'evil'}})
    assert.equal(response.status,409);assert.equal(legacyCalls,0);assert.equal(calls.length,3)
    assert.equal(calls[2][1].headers.get('authorization'),null);assert.equal(calls[2][1].headers.get('x-admin-csrf'),'csrf');assert.equal(calls[2][1].credentials,'same-origin')
    sessionOk=false;await assert.rejects(()=>transport.productFetch('/api/products',{method:'POST',body:'{}'}));assert.equal(legacyCalls,0);assert.equal(calls.filter(([url])=>url==='/api/products').length,0)
    provider='bogus';await assert.rejects(()=>transport.productRequestHeaders());assert.equal(legacyCalls,0)
    provider='supabase';const headers=await transport.productRequestHeaders();assert.equal(headers.get('authorization'),'Bearer legacy-token');assert.equal(headers.get('x-admin-csrf'),null);assert.equal(legacyCalls,1)
    await assert.rejects(()=>transport.productFetch('https://attacker.example/api/products',{method:'POST'}));assert.equal(legacyCalls,1)
  }finally{globalThis.fetch=original;delete globalThis.__b3TransportLegacy}
})

test('single deletion remains idempotent and read-by-id/slug retain their legacy absence statuses',async()=>{
  const h=harness({run:()=>[]});const deleted=await h.handler('single-delete',req(undefined,'DELETE'),id(2));assert.equal(deleted.status,200);assert.deepEqual(await deleted.json(),{ok:true});assert.equal(h.calls.length,1);assert.match(h.calls[0][0],/^DELETE/)
  const byId=await h.handler('read-id',req(undefined,'GET'),id(2));assert.equal(byId.status,500)
  const bySlug=await h.handler('read-slug',req(undefined,'GET'),'missing-slug');assert.equal(bySlug.status,404)
})

test('stock UUID result validation accepts canonical PostgreSQL case without changing binding',async()=>{
  const product='ABCDEFAB-ABCD-4ABC-8ABC-ABCDEFABCDEF';const f=fake(()=>[{result:{product_id:product.toLowerCase(),stock_quantity:2,updated_at:'2026-10-14T00:00:00Z',unchanged:false}}]);await createInventoryRepository(f.db).setStock(actor,product,{expected_stock:1,stock_quantity:2});assert.equal(f.calls[0][1][1],product)
})
