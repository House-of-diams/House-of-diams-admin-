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
    else if (name === 'next/server') url = import.meta.resolve('next/server.js')
    else if (name === './product-list-reference-cache') url = 'data:text/javascript,export function invalidateProductListReferenceData(){}'
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
const {exports:{createCatalogRepository,catalogRoutines}}=await load('lib/db/admin-repositories/catalog.ts')
const {exports:{createNavbarRepository,navbarRoutines}}=await load('lib/db/admin-repositories/navbar.ts')
const {exports:{createCatalogRdsHandlers}}=await load('lib/catalog-rds-handlers.ts')
const {exports:{readCatalogDataProvider}}=await load('lib/catalog-provider.ts')
const {exports:{saveNavbar,saveNavbarItem}}=await load('lib/navbar-save.ts')
const {exports:{saveCatalogMaster,listCatalogMasters}}=await load('lib/catalog-master-save.ts')
const {exports:{loadRdsNavbarBuilderData}}=await load('lib/navbar-data.ts')
const {exports:{withAdminTransaction}}=await load('lib/db/query.ts')
const {exports:{ProductSessionError}}=await load('lib/product-session-error.ts')
const {exports:{assertMutation}}=await load('lib/auth/request-security.ts')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const revision='a'.repeat(32)
const actor={profileId:id(1),issuer:'https://admin.example/realm',subject:'verified-external-subject'}
const evidence=JSON.parse(fs.readFileSync(path.join(root,'docs/aws-phase-a/rds-targeted-live-2026-10-14.json'),'utf8'))
const snapshot={items:[],sections:[],links:[],source_items:[],featured_cards:[],revision}
const row={id:id(3),_revision:revision,name:'Name',slug:'name',status:'active',display_order:1}
function result(sql) {
  if(sql.includes('catalog_ring_snapshot_v1')||sql.includes('catalog_ring_save_v1'))return {categories:[],sizes:[],revision}
  if(sql.includes('navbar_item_snapshot_v1')||sql.includes('navbar_item_save_v1'))return {revision}
  if(sql.includes('navbar_snapshot')||sql.includes('navbar_save'))return snapshot
  if(sql.includes('_delete_'))return {ok:true,id:id(3)}
  if(sql.includes('_list_')||sql.includes('jsonb_agg(to_jsonb(r)'))return []
  return {item:row,revision}
}
function fake(run=result) {
  const calls=[]
  return {calls,db:{async query(sql,values=[]){calls.push([sql,values]);return {rows:[{result:await run(sql,values)}]}}}}
}
function harness(options={}) {
  const f=fake(options.run),events=[]
  const handler=createCatalogRdsHandlers({provider:()=>{if(options.badProvider)throw Error('SECRET');return options.provider??'rds'},
    authorize:async(req,mutation)=>{events.push(['auth',mutation]);if(options.denied)throw new ProductSessionError(options.denied);if(options.csrf&&mutation)assertMutation(req,'https://admin.example','csrf');return {actor}},
    transaction:async run=>{events.push(['begin']);try {const r=await run(f.db);events.push(['commit']);return r}catch(e){events.push(['rollback']);throw e}}})
  return {...f,handler,events}
}
const req=(resource,body,method='POST',headers={})=>new Request(`https://admin.example/api/${resource}`,{method,headers:{'content-type':'application/json',origin:'https://admin.example','x-admin-csrf':'csrf',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})})
const envelope=item=>({request_id:id(2),expected_revision:null,item})
const category={code:'name',name:'Name',slug:'name',show_in_nav:true,nav_type:'mega_menu',direct_link_url:null,display_order:1,status:'active'}
const metal={name:'Gold',slug:'gold',is_combined_option:false,display_order:1,status:'active'}
const ring={request_id:id(2),expected_revision:revision,categories:[],sizes:[],deleted_category_ids:[],deleted_size_ids:[]}
const nav={id:id(3),label:'Direct',slug:'direct',type:'direct',visible:true,url:'/direct',sections:[]}
const deleted={sections:[],links:[],source_items:[],featured_cards:[]}
const navBody={request_id:id(2),expected_revision:revision,item:nav,deleted_ids:deleted}
function access(db){return {provider:'rds',actor,catalog:createCatalogRepository(db,actor),navbar:createNavbarRepository(db,actor)}}

test('provider defaults legacy, exact RDS only; ignores client activation variables',()=>{
  assert.equal(readCatalogDataProvider({}),'supabase');assert.equal(readCatalogDataProvider({ADMIN_CATALOG_DATA_PROVIDER:'rds'}),'rds')
  assert.equal(readCatalogDataProvider({NEXT_PUBLIC_ADMIN_CATALOG_DATA_PROVIDER:'rds'}),'supabase')
  for(const value of ['RDS',' postgres ','unknown'])assert.throws(()=>readCatalogDataProvider({ADMIN_CATALOG_DATA_PROVIDER:value}))
})
test('all 18 repository calls match exact deployed names/types/order/jsonb envelopes',async()=>{
  for(const [name,routine] of Object.entries({...catalogRoutines,...navbarRoutines})){
    const audited=evidence.reviewed_routines.find(r=>r.name===name)
    assert.equal(audited.arguments,routine.args.map((n,i)=>`${n} ${routine.types[i]}`).join(', '));assert.equal(audited.returns,'jsonb')
    assert.equal(routine.sql,`SELECT public.${name}(${routine.types.map((t,i)=>`$${i+1}::${t}`).join(',')}) AS result`)
    const input=Object.fromEntries(routine.args.filter(n=>n!=='p_actor_id').map(n=>[n,n.includes('deleted_')?[]:n==='p_kind'?'category':n==='p_expected_revision'?revision:n==='p_request_id'?id(2):id(3)]))
    // Caller actor material must not override verified internal UUID.
    input.p_actor_id=id(9)
    const f=fake();await (name.startsWith('catalog')?createCatalogRepository(f.db,actor):createNavbarRepository(f.db,actor)).execute(name,input)
    const expected=routine.args.map((n,i)=>n==='p_actor_id'?actor.profileId:routine.types[i]==='jsonb'?JSON.stringify(input[n]):input[n])
    assert.deepEqual(f.calls[0][1],expected);assert.match(f.calls[0][0],new RegExp(`public\\.${name}\\(`))
  }
})
test('untrusted SQL identifiers and missing actor cannot issue a query',async()=>{
  const f=fake();await assert.rejects(()=>createCatalogRepository(f.db).execute('catalog_save_master_v1',{p_request_id:id(2),p_expected_revision:null,p_kind:'style',p_id:null,p_item:{}}))
  await assert.rejects(()=>createCatalogRepository(f.db,actor).execute('catalog_save_master_v1;DROP TABLE products',{}));assert.equal(f.calls.length,0)
})
test('hierarchy validates then binds atomic save with hostile data as parameter',async()=>{
  const h=harness();const item={...category,name:"x'); DROP TABLE products; --"}
  const r=await h.handler(req('catalog/categories',envelope(item)));assert.equal(r.status,200)
  assert.deepEqual(h.calls[0][1],[id(1),id(2),null,'category',null,JSON.stringify(item)])
  assert.ok(!h.calls[0][0].includes(item.name));assert.equal(h.calls.length,1)
})
test('hierarchy patch merges persisted fields and preserves expected revision',async()=>{
  const h=harness({run:()=>({item:{...category,id:id(3),_revision:revision,is_system_locked:false,category_lane:'standard'},revision})})
  const r=await h.handler(req('catalog/categories/'+id(3),{request_id:id(2),expected_revision:revision,item:{name:'Updated'}},'PATCH'),id(3))
  assert.equal(r.status,200);assert.equal(h.calls.length,2);assert.equal(JSON.parse(h.calls[1][1][5]).show_in_nav,true);assert.equal(h.calls[1][1][2],revision)
})
test('missing hierarchy record returns 404 without a mutation',async()=>{
  const h=harness({run:()=>({item:null,revision})});const r=await h.handler(req('catalog/options/'+id(3),{request_id:id(2),expected_revision:revision,item:{}},'PATCH'),id(3))
  assert.equal(r.status,404);assert.equal(h.calls.length,1)
})
test('create/update revision mismatch and malformed IDs reject before SQL',async()=>{
  for(const [body,rawId] of [[{...envelope(category),expected_revision:revision},undefined],[envelope(category),id(3)],[{...envelope(category),expected_revision:revision},'bad']]){
    const h=harness();assert.equal((await h.handler(req('catalog/categories',body),rawId)).status,400);assert.equal(h.calls.length,0)
  }
})
test('all master kinds preserve schemas and atomic signatures',async()=>{
  const items={ 'gst-slabs':{name:'Tax',code:'GST',percentage:3,status:'active',display_order:1},certificates:{name:'Cert',status:'active',display_order:1},'material-values':{name:'Diamond',slug:'diamond',cta_mode:'both',status:'active',display_order:1},'ring-sizes':{name:'10',slug:'10',status:'active',display_order:1},'stone-shapes':{name:'Round',slug:'round',status:'active',display_order:1},styles:{name:'Style',status:'active',display_order:1},'product-content-rules':{kind:'shipping',name:'Ship',slug:'ship',title:'Shipping',body:'Policy',status:'active',display_order:1}}
  for(const [resource,item] of Object.entries(items)){
    const h=harness();assert.equal((await h.handler(req('catalog/'+resource,envelope(item)))).status,200);assert.match(h.calls[0][0],/catalog_save_master_v1/);assert.equal(h.calls.length,1)
  }
})
test('master business validation/extra actor fields deny without queries',async()=>{
  for(const body of [envelope({name:'Tax',code:'G',percentage:101,status:'active',display_order:1}),{...envelope({name:'Cert',status:'active',display_order:1}),actor_id:id(9)}]){
    const h=harness();assert.equal((await h.handler(req('catalog/gst-slabs',body))).status,400);assert.equal(h.calls.length,0)
  }
})
test('catalog delete binds receipt/revision/kind/id and returns unchanged result',async()=>{
  for(const resource of ['categories','styles','metals']){
    const h=harness();const r=await h.handler(req('catalog/'+resource+'/'+id(3),{request_id:id(2),expected_revision:revision},'DELETE'),id(3))
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,id:id(3)});assert.deepEqual(h.calls[0][1].slice(0,3),[id(1),id(2),revision])
  }
})
test('metal composition and bigint deletion IDs remain exact strings',async()=>{
  const h=harness();const bigint='9007199254740993'
  const body={request_id:id(2),expected_revision:null,metal,parts:[{id:bigint,part_name:'Gold',percentage:100,sort_order:1}],deleted_part_ids:['9007199254740995']}
  assert.equal((await h.handler(req('catalog/metals',body))).status,200)
  assert.equal(JSON.parse(h.calls[0][1][5])[0].id,bigint);assert.deepEqual(h.calls[0][1][6],['9007199254740995']);assert.match(h.calls[0][0],/\$7::bigint\[\]/)
})
test('metal unsafe/out of range/duplicate IDs deny before SQL',async()=>{
  for(const ids of [[9007199254740992],['9223372036854775808'],['12','12'],['bad'],['1e3'],['-1']]){
    const h=harness();assert.equal((await h.handler(req('catalog/metals',{request_id:id(2),expected_revision:null,metal,parts:[],deleted_part_ids:ids}))).status,400);assert.equal(h.calls.length,0)
  }
})
test('metal/navbar bigint read projections execute routine once and retain revisions',async()=>{
  for(const [name,input,repo] of [['catalog_metal_list_v1',{},createCatalogRepository],['catalog_metal_row_v1',{p_id:id(3)},createCatalogRepository],['navbar_snapshot_v1',{},createNavbarRepository]]){
    const f=fake();await repo(f.db,actor).execute(name,input)
    assert.match(f.calls[0][0],/WITH snapshot AS MATERIALIZED/);assert.match(f.calls[0][0],/->>'id'/);assert.equal(f.calls[0][0].split('public.'+name+'(').length,2)
  }
})
test('ring save remains one atomic function with text deletion arrays/request/revision',async()=>{
  const h=harness();const body={...ring,deleted_category_ids:[id(3)],deleted_size_ids:[id(4)]}
  const r=await h.handler(req('catalog/ring-catalog',body,'PUT'));assert.equal(r.status,200);assert.equal(h.calls.length,1)
  assert.match(h.calls[0][0],/\$6::text\[\],\$7::text\[\]/);assert.deepEqual(h.calls[0][1],[id(1),id(2),revision,'[]','[]',[id(3)],[id(4)]])
})
test('ring duplicate and retained/deleted overlap fail before SQL',async()=>{
  for(const body of [{...ring,deleted_size_ids:[id(3),id(3)]},{...ring,categories:[{...row}],deleted_category_ids:[id(3)]}]){
    const h=harness();assert.equal((await h.handler(req('catalog/ring-catalog',body,'PUT'))).status,400);assert.equal(h.calls.length,0)
  }
})
test('ring read aliases preserve categories/sizes/revision',async()=>{
  for(const resource of ['ring-categories','ring-category-sizes','ring-catalog']){
    const h=harness();const r=await h.handler(req('catalog/'+resource,undefined,'GET'));assert.equal(r.status,200)
    assert.deepEqual(await r.json(),resource==='ring-catalog'?{categories:[],sizes:[],revision}:{items:[],revision})
  }
})
test('navbar item save preserves exact actor/request/revision/item and bigint deletions',async()=>{
  const h=harness();const r=await h.handler(req('navbar/'+id(3),{...navBody,deleted_ids:{...deleted,source_items:['9007199254740993']}},'PUT'),id(3))
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,revision});assert.match(h.calls[0][0],/navbar_item_save_v1/)
  assert.deepEqual(h.calls[0][1].slice(0,4),[id(1),id(2),revision,id(3)]);assert.deepEqual(h.calls[0][1][11],['9007199254740993']);assert.equal(h.calls.length,1)
})
test('full navbar helper preserves atomic full snapshot save contract',async()=>{
  const f=fake();const r=await saveNavbar(access(f.db),{request_id:id(2),expected_revision:revision,items:[nav],deleted_ids:deleted})
  assert.equal(r.status,200);assert.equal(f.calls.length,1);assert.match(f.calls[0][0],/navbar_save_v1/);assert.equal(JSON.parse(f.calls[0][1][3])[0].display_order,1)
})
test('obsolete full navbar HTTP writer retains 410 without auth or query',async()=>{
  const h=harness({denied:401});assert.equal((await h.handler(req('navbar',{},'PUT'))).status,410);assert.deepEqual(h.events,[]);assert.equal(h.calls.length,0)
})
test('navbar item ID mismatch, invalid source kinds/deletion duplicates deny',async()=>{
  const section={id:id(4),title:'Section',type:'Metal Swatches',sourceLabel:'Metal',sourceSubcategoryId:null,column:1,links:[],selectedSourceItems:[{id:'1',sourceKind:'customer',sourceItemId:id(5),label:'bad',sortOrder:1,isActive:true}]}
  for(const body of [{...navBody,item:{...nav,id:id(9)}},{...navBody,item:{...nav,type:'mega',sections:[section]}},{...navBody,deleted_ids:{...deleted,source_items:['1','1']}}]){
    const h=harness();assert.equal((await h.handler(req('navbar/'+id(3),body,'PUT'),id(3))).status,400);assert.equal(h.calls.length,0)
  }
})
test('navbar normalization filters stale allowed source kinds and retains correct bigint ID',async()=>{
  const section={id:id(4),title:'Section',type:'Stone Shapes',sourceLabel:'Shapes',sourceSubcategoryId:null,column:1,links:[],selectedSourceItems:[{id:'9007199254740993',sourceKind:'stone_shape',sourceItemId:id(5),label:'Round',sortOrder:1,isActive:true},{id:'2',sourceKind:'metal',sourceItemId:id(6),label:'stale',sortOrder:2,isActive:true}]}
  const f=fake();assert.equal((await saveNavbarItem(access(f.db),id(3),{...navBody,item:{...nav,type:'mega',sections:[section]}})).status,200)
  const sources=JSON.parse(f.calls[0][1][7]);assert.equal(sources.length,1);assert.equal(sources[0].id,'9007199254740993');assert.equal(sources[0].source_kind,'stone_shape')
})
test('item snapshot is revision-only per deployed routine (missing item SQLSTATE propagates)',async()=>{
  const f=fake();assert.deepEqual(await createNavbarRepository(f.db).execute('navbar_item_snapshot_v1',{p_item_id:id(3)}),{revision})
  assert.equal(f.calls[0][0],navbarRoutines.navbar_item_snapshot_v1.sql)
  await assert.rejects(()=>createNavbarRepository(fake(()=>{throw {code:'23503'}}).db).execute('navbar_item_snapshot_v1',{p_item_id:id(3)}))
})
test('navbar editor payload preserves full snapshot/item revisions and legacy empty fallback',async()=>{
  const f=fake(sql=>sql.includes('navbar_snapshot')?snapshot:result(sql));const payload=await loadRdsNavbarBuilderData(f.db)
  assert.equal(payload.revision,revision);assert.deepEqual(payload.itemRevisions,{});assert.ok(payload.items.length>=2);assert.deepEqual(payload.categories,[])
  const filled={...snapshot,items:[{id:id(3),label:'Direct',slug:'direct',item_type:'direct_link',linked_category_id:null,direct_link_url:'/direct',display_order:1,status:'active'}]}
  const g=fake(sql=>sql.includes('navbar_snapshot')?filled:result(sql));const populated=await loadRdsNavbarBuilderData(g.db)
  assert.equal(populated.itemRevisions[id(3)],revision);assert.equal(populated.items[0].id,id(3))
})
test('bootstrap reuses B3 reference loader, scope contracts, missing table denies',async()=>{
  const h=harness();const r=await h.handler(req('catalog/bootstrap?scope=attributes',undefined,'GET'));assert.equal(r.status,200)
  const data=await r.json();assert.deepEqual(data.ringCategories,[]);assert.deepEqual(data.ringCategorySizes,[]);assert.ok(!('categories' in data))
  const bad=harness({run:()=>{throw {code:'42P01',message:'SECRET'}}});assert.equal((await bad.handler(req('catalog/bootstrap',undefined,'GET'))).status,503);assert.ok(bad.events.some(e=>e[0]==='rollback'))
})
test('SQLSTATE conflicts/missing/permission/constraints/unavailable sanitize and rollback without fallback',async()=>{
  for(const [code,status] of [['40001',409],['PT409',409],['P0001',409],['P0002',404],['42883',503],['42501',403],['23503',400],['23505',400],['23514',400],['22023',400],['XX000',500]]){
    const h=harness({run:()=>{throw {code,message:'SECRET'}}});const r=await h.handler(req('catalog/styles',envelope({name:'Style',display_order:1,status:'active'})))
    assert.equal(r.status,status,code);assert.ok(!(await r.text()).includes('SECRET'));assert.deepEqual(h.events,[['auth',true],['begin'],['rollback']]);assert.equal(h.calls.length,1)
  }
})
test('actual B2 transaction rolls back atomic routine failure and releases client',async()=>{
  const events=[];const client={query:async(sql)=>{events.push(sql);if(sql==='BEGIN'||sql.startsWith('SET LOCAL')||sql==='ROLLBACK')return {rows:[]};if(sql.includes('session_user'))return {rows:[{login_role:'hod_admin_app',active_role:'hod_admin_app',capability_exists:true,safe_login:true,isolated_login:true,safe_capability:true,isolated_capability:true}]};throw {code:'40001'}},release:()=>events.push('release')}
  await assert.rejects(()=>withAdminTransaction({connect:async()=>client},'hod_admin_app',db=>createCatalogRepository(db,actor).execute('catalog_ring_save_v1',{p_request_id:id(2),p_expected_revision:revision,p_categories:[],p_sizes:[],p_deleted_category_ids:[],p_deleted_size_ids:[]})),{sqlState:'40001'})
  assert.equal(events.at(-2),'ROLLBACK');assert.equal(events.at(-1),'release');assert.ok(!events.includes('COMMIT'))
})
test('selected RDS denial/config failure never returns legacy sentinel or touches DB',async()=>{
  for(const options of [{denied:401},{denied:403},{denied:503},{badProvider:true}]){
    const h=harness(options);const r=await h.handler(req('catalog/styles',{}));assert.ok(r);assert.equal(r.status,options.denied??503);assert.equal(h.calls.length,0)
  }
  const legacy=harness({provider:'supabase'});assert.equal(await legacy.handler(req('catalog/styles',{})),null);assert.deepEqual(legacy.events,[])
})
test('real mutation origin/CSRF guard is mandatory before queries; browser actor never used',async()=>{
  for(const headers of [{origin:'https://evil.example'},{'x-admin-csrf':'bad'}]){
    const h=harness({csrf:true});assert.equal((await h.handler(req('catalog/categories',envelope(category),'POST',headers))).status,503);assert.equal(h.calls.length,0)
  }
  const h=harness({csrf:true});await h.handler(req('catalog/categories',envelope(category),'POST',{authorization:'Bearer forged','x-actor-id':id(9)}));assert.equal(h.calls[0][1][0],actor.profileId)
  const read=harness();await read.handler(req('catalog/styles',undefined,'GET'));assert.deepEqual(read.events[0],['auth',false])
})
test('bad result envelopes deny rather than return apparent success',async()=>{
  for(const value of [null,[],{}, {revision:'bad'}, {revision}]){
    const h=harness({run:()=>value});assert.equal((await h.handler(req('catalog/categories',envelope(category)))).status,500)
  }
  const h=harness({run:()=>({revision})});assert.equal((await h.handler(req('navbar',undefined,'GET'))).status,503)
})
test('B3 legacy bootstrap explicitly bypasses B4 provider, and all data route handlers branch',()=>{
  const product=fs.readFileSync(path.join(root,'app/api/products/bootstrap/route.ts'),'utf8');assert.ok(product.includes("@/lib/catalog-bootstrap-legacy"))
  const legacy=fs.readFileSync(path.join(root,'lib/catalog-bootstrap-legacy.ts'),'utf8');assert.ok(!legacy.includes('runCatalogRdsRoute'))
  for(const name of ['categories','subcategories','options','metals','styles','certificates','ring-catalog','ring-categories','ring-category-sizes','ring-sizes','gst-slabs','product-content-rules','material-values','stone-shapes']){
    for(const suffix of ['route.ts','[id]/route.ts']){
      const file=path.join(root,'app/api/catalog',name,suffix);if(!fs.existsSync(file))continue
      const source=fs.readFileSync(file,'utf8');assert.ok(source.includes("runtime = 'nodejs'"));const handlers=[...source.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)/g)];assert.equal(source.split('await runCatalogRdsRoute').length-1,handlers.length,file)
    }
  }
})

test('browser transport follows server contract, protects auth/CSRF, excludes media and never retries writes',async()=>{
  let source=ts.transpileModule(fs.readFileSync(path.join(root,'lib/catalog-transport.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  const legacyUrl='data:text/javascript,export const supabase={auth:{async getSession(){globalThis.__b4Legacy++;return {data:{session:{access_token:"legacy-token"}}}}}}'
  source=source.replace("import('./supabase')",`import('${legacyUrl}')`)
  const {catalogFetch,forgetCatalogRequestContext:forget}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
  const original=globalThis.fetch,calls=[];let provider='rds',sessionOk=true,contractOk=true,operationOk=true
  globalThis.__b4Legacy=0
  globalThis.fetch=async(url,options)=>{
    calls.push([url,options])
    if(url==='/api/catalog/provider')return Response.json({provider},{status:contractOk?200:503})
    if(url==='/api/auth/session')return Response.json({authenticated:sessionOk,csrfToken:'csrf'},{status:sessionOk?200:401})
    return Response.json({ok:operationOk},{status:operationOk?200:409})
  }
  try {
    const r=await catalogFetch('/api/catalog/styles',{method:'POST',body:'{}',headers:{authorization:'Bearer forged','x-admin-csrf':'forged','x-extra':'value'}})
    assert.equal(r.status,200);const [url,options]=calls.at(-1);assert.equal(url,'/api/catalog/styles');assert.equal(options.credentials,'same-origin')
    assert.equal(options.headers.get('x-admin-csrf'),'csrf');assert.equal(options.headers.has('authorization'),false);assert.equal(options.headers.get('x-extra'),'value');assert.equal(globalThis.__b4Legacy,0)
    // HOD-066: provider and CSRF are reused, so a follow-up call is a single request.
    calls.length=0;await catalogFetch('/api/navbar');assert.equal(calls.at(-1)[1].headers.has('x-admin-csrf'),false);assert.deepEqual(calls.map(([u])=>u),['/api/navbar'])
    calls.length=0;operationOk=false;assert.equal((await catalogFetch('/api/navbar/'+id(3),{method:'PUT',body:'{}'})).status,409);assert.equal(calls.filter(([u])=>u.startsWith('/api/navbar')).length,1);assert.equal(globalThis.__b4Legacy,0)
    forget();calls.length=0;sessionOk=false;assert.equal((await catalogFetch('/api/catalog/styles',{method:'POST',body:'{}'})).status,503);assert.deepEqual(calls.map(([u])=>u),['/api/catalog/provider','/api/auth/session']);assert.equal(globalThis.__b4Legacy,0)
    forget();calls.length=0;contractOk=false;assert.equal((await catalogFetch('/api/catalog/styles')).status,503);assert.equal(calls.length,1)
    forget();calls.length=0;contractOk=true;provider='invalid';assert.equal((await catalogFetch('/api/catalog/styles')).status,503);assert.equal(calls.length,1)
    forget();provider='supabase';operationOk=true;await catalogFetch('/api/catalog/styles',{method:'POST',body:'{}'});assert.equal(globalThis.__b4Legacy,1);assert.equal(calls.at(-1)[1].headers.get('authorization'),'Bearer legacy-token');assert.equal(calls.at(-1)[1].headers.has('x-admin-csrf'),false)
    for(const bad of ['https://evil.example/api/catalog/styles','/api/products','/api/catalog/styles/upload','/api/navbar/featured-image','/api/navbar/section-icon'])await assert.rejects(()=>catalogFetch(bad))
  } finally {globalThis.fetch=original;delete globalThis.__b4Legacy}
})

test('navbar rejects out of bigint range before SQL and SQL errors retain legacy safe reference messages',async()=>{
  const h=harness();assert.equal((await h.handler(req('navbar/'+id(3),{...navBody,deleted_ids:{...deleted,source_items:['9223372036854775808']}},'PUT'),id(3))).status,400);assert.equal(h.calls.length,0)
  const missing=harness({run:()=>{throw {code:'23503',message:'SECRET'}}});const r=await missing.handler(req('navbar/'+id(3),navBody,'PUT'),id(3));assert.equal(r.status,400);assert.equal((await r.json()).error,'A selected navbar value no longer exists. Reload and try again.')
})

test('navbar loader refuses content paired with newer item revisions under READ COMMITTED',async()=>{
  let snapshots=0
  const f=fake(sql=>sql.includes('navbar_snapshot')?{...snapshot,revision:++snapshots===1?revision:'b'.repeat(32)}:result(sql))
  await assert.rejects(()=>loadRdsNavbarBuilderData(f.db),/Navbar changed during loading/)
})

test('request ID replays/revisions are forwarded unchanged; app never implements receipt or retry writes',async()=>{
  const h=harness();const body={...ring,deleted_category_ids:[id(3)]}
  await h.handler(req('catalog/ring-catalog',body,'PUT'));await h.handler(req('catalog/ring-catalog',body,'PUT'))
  assert.equal(h.calls.length,2);assert.deepEqual(h.calls[0],h.calls[1])
  for(const name of ['catalog_hierarchy_save_v1','catalog_save_master_v1','catalog_metal_save_v1','catalog_ring_save_v1','navbar_save_v1','navbar_item_save_v1']){
    const definition=evidence.reviewed_routines.find(r=>r.name===name).definition
    assert.match(definition,/pg_advisory_xact_lock/);assert.match(definition,/cms_save_receipts/)
  }
})

test('legacy save/read branches retain Supabase actor and PostgREST error contracts',async()=>{
  const calls=[];let failure=null
  const legacy={user:{id:id(8)},adminClient:{async rpc(name,args){calls.push([name,args]);return {data:name.includes('_list_')?[]:{item:row,revision},error:failure}}}}
  const body=envelope({name:'Style',status:'active',display_order:1})
  const r=await saveCatalogMaster(legacy,'style',null,body);assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,item:row,revision})
  assert.equal(calls[0][0],'catalog_save_master_v1');assert.equal(calls[0][1].p_actor_id,id(8))
  failure={code:'PGRST202'};assert.equal((await saveCatalogMaster(legacy,'style',null,body)).status,503)
  failure={code:'40001'};assert.equal((await saveCatalogMaster(legacy,'style',null,body)).status,409)
  failure=null;assert.deepEqual(await (await listCatalogMasters(legacy,'style')).json(),{items:[]})
})
