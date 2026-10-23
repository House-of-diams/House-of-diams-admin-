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
const adapter=urlFor(`export async function authorizeProductRequest(...args){return globalThis.__b5.authorize(...args)};export async function adminTransaction(run){return globalThis.__b5.transaction(run)};export async function assertAdmin(...args){return globalThis.__b5.legacy(...args)};export function buildAdminClient(){throw Error('offline media')}`)
async function load(relative){
 const filename=path.resolve(root,relative)
 if(modules.has(filename))return modules.get(filename)
 let code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 for(const match of [...code.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)]){
  const name=match[1];let url
  if(name==='server-only')url=urlFor('export {}')
  else if(name==='next/server')url=import.meta.resolve('next/server.js')
  else if(name.endsWith('/cms-auth')||name==='./cms-auth'||name==='./db/pool'||name==='./product-session-runtime')url=adapter
  else if(name.startsWith('.')||name.startsWith('@/')){
   let target=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(filename),name)
   if(!path.extname(target))target+='.ts'
   url=(await load(target)).url
  }else url=import.meta.resolve(name)
  code=code.replaceAll(`'${name}'`,`'${url}'`).replaceAll(`"${name}"`,`"${url}"`)
 }
 if(filename.endsWith('cms-transport.ts')) code=code.replace("import('./supabase')", "import('"+urlFor("export const supabase={auth:{async getSession(){globalThis.__b5LegacyCalls++;return {data:{session:{access_token:'legacy-token'}}}}}}")+"')")
 const url=urlFor(code);const value={url,exports:await import(url)};modules.set(filename,value);return value
}
const get=async file=>(await load(file)).exports
const {createCmsRepository,cmsRoutines}=await get('lib/db/admin-repositories/cms.ts')
const {createCmsDataRoute}=await get('lib/cms-rds-handlers.ts')
const {readCmsDataProvider}=await get('lib/cms-provider.ts')
const {saveCmsSingleton}=await get('lib/cms-singleton-save.ts')
const {saveCmsContentList}=await get('lib/cms-content-list-save.ts')
const {saveCmsRelational}=await get('lib/cms-relational-save.ts')
const {saveCmsArticle}=await get('lib/cms-article-save.ts')
const {saveCmsDocs}=await get('lib/cms-docs-save.ts')
const {saveBespokeForm}=await get('lib/bespoke-form-save.ts')
const {saveBespokeHero}=await get('lib/bespoke-hero-save.ts')
const {createBespokeRepository}=await get('lib/db/admin-repositories/bespoke.ts')
const {runBespokeData}=await get('lib/bespoke-rds-data.ts')
const {sanitizeCmsHtml}=await get('lib/cms-html.ts')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const revision='a'.repeat(32)
const actor={profileId:id(1),issuer:'https://admin.example/realm',subject:'verified-subject'}
const evidence=JSON.parse(fs.readFileSync(path.join(root,'docs/aws-phase-a/rds-targeted-live-2026-10-14.json'),'utf8'))
function fixture(name){
 if(name==='cms_support_faq_categories_v1')return []
 if(name==='cms_save_support_faq_category_v1')return {category:{id:1,_revision:revision}}
 if(name.includes('delete_'))return {ok:true,id:1,deleted_id:1}
 return {item:null,items:[],section:null,parent:null,revision,post:{id:1,slug:'article'},tags:[],products:[],content_blocks:[],page:{slug:'terms'},blocks:[],settings:{status:'active'},guarantees:[],pieceTypes:[],stoneOptions:[],caratOptions:[],metalOptions:[]}
}
function fake(run=(sql)=>fixture(sql.match(/public\.(\w+)\(/)?.[1]??'')){
 const calls=[];return {calls,db:{async query(sql,values=[]){calls.push([sql,values]);return {rows:[{result:await run(sql,values)}]}}}}
}
function harness(options={}){
 const f=fake(options.run),events=[]
 const deps={provider:()=>{if(options.badProvider)throw Error('SECRET');return options.provider??'rds'},
 authorize:async(request,mutation)=>{events.push(['auth',mutation]);if(options.denied){const {ProductSessionError}=await get('lib/product-session-error.ts');throw new ProductSessionError(options.denied)};return {actor}},
 transaction:async run=>{events.push(['begin']);try{const r=await run(f.db);events.push(['commit']);return r}catch(e){events.push(['rollback']);throw e}},
 legacy:async()=>{events.push(['legacy']);return options.legacy??{error:Response.json({error:'denied'},{status:401})}}}
 return {...f,events,deps,route:createCmsDataRoute(deps)}
}
const req=(url='/api/cms/about/values',body,method='POST')=>new Request('https://admin.example'+url,{method,headers:{origin:'https://admin.example','x-admin-csrf':'csrf','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
const access=db=>({provider:'rds',actor,cms:createCmsRepository(db,actor),db})
const env={request_id:id(2),expected_revision:revision}
const article={...env,post:{slug:'',title:'Title',title_html:'<strong>Title</strong><script>bad()</script>',card_title:'',subtitle:'Subtitle',category:'',catalog_category_id:null,author:'',date_label:'',read_time:'',bg_key:'',bg_color:'',hero_image_path:'',card_image_path:'',hero_image_alt:'',body_html:'<p onclick="bad()">Body</p>',is_published:true,sort_order:1},tags:[],products:[],content_blocks:[{block_type:'text',heading:'',body_html:'<p>First</p>',image_path:'',image_alt:'',image_caption:'',is_enabled:true},{block_type:'text',heading:'',body_html:'<p>Second</p>',image_path:'',image_alt:'',image_caption:'',is_enabled:true}],deleted_tag_ids:[],deleted_product_ids:[],deleted_block_ids:[]}

test('server provider defaults legacy, exact inactive RDS only, unknown denies',()=>{
 assert.equal(readCmsDataProvider({}),'supabase');assert.equal(readCmsDataProvider({ADMIN_CMS_DATA_PROVIDER:'rds'}),'rds')
 assert.equal(readCmsDataProvider({NEXT_PUBLIC_ADMIN_CMS_DATA_PROVIDER:'rds'}),'supabase')
 for(const value of ['RDS','postgres',' rds '])assert.throws(()=>readCmsDataProvider({ADMIN_CMS_DATA_PROVIDER:value}))
})
test('22 deployed CMS/bespoke routine names, ordered types and parameter bindings match live metadata',async()=>{
 assert.equal(Object.keys(cmsRoutines).length,22)
 for(const [name,routine] of Object.entries(cmsRoutines)){
  const audited=evidence.reviewed_routines.find(f=>f.name===name)
  assert.equal(audited.arguments,routine.args.map((key,i)=>key+' '+routine.types[i]).join(', '));assert.equal(audited.returns,'jsonb')
  assert.equal(routine.sql,`SELECT public.${name}(${routine.types.map((type,i)=>`$${i+1}::${type}`).join(',')}) AS result`)
  const input={}
  for(const [i,key]of routine.args.entries())if(key!=='p_actor_id')input[key]=key==='p_kind'?(name.includes('singleton')?'about_hero':name.includes('content_list')?'about_values':name.includes('home_group1')?'hero':name.includes('relational')?'faq':'blog'):key==='p_expected_revision'?revision:key==='p_request_id'?id(2):routine.types[i]==='jsonb'?{ordered:['first','second']}:routine.types[i].endsWith('[]')?[]:routine.types[i]==='bigint'?'9223372036854775807':'terms'
  input.p_actor_id=id(9)
  const f=fake();await createCmsRepository(f.db,actor).execute(name,input)
  assert.deepEqual(f.calls[0][1],routine.args.map((key,i)=>key==='p_actor_id'?actor.profileId:routine.types[i]==='jsonb'?JSON.stringify(input[key]):input[key]));assert.equal(f.calls.length,1)
 }
})
test('unsupported identifiers/kinds and missing trusted actor reject before SQL',async()=>{
 const f=fake(),repo=createCmsRepository(f.db)
 await assert.rejects(()=>repo.execute('cms_save_singleton_v1',{...env,p_kind:'about_hero',p_item:{}}))
 await assert.rejects(()=>repo.execute('cms_singleton_snapshot_v1',{p_kind:'about_hero;DROP TABLE profiles'}))
 await assert.rejects(()=>repo.execute('cms_singleton_snapshot_v1;DROP TABLE profiles',{}))
 assert.equal(f.calls.length,0)
})
test('bigint call arguments remain exact; unsafe JS IDs are refused',async()=>{
 const f=fake();await createCmsRepository(f.db,actor).execute('cms_delete_article_v1',{p_request_id:id(2),p_kind:'blog',p_post_id:'9223372036854775807',p_expected_revision:revision})
 assert.equal(f.calls[0][1][3],'9223372036854775807')
 await assert.rejects(()=>createCmsRepository(f.db,actor).execute('cms_delete_article_v1',{p_request_id:id(2),p_kind:'blog',p_post_id:Number.MAX_SAFE_INTEGER+1,p_expected_revision:revision}))
 const bad=fake(()=>({item:{id:Number.MAX_SAFE_INTEGER+1},revision}));await assert.rejects(()=>createCmsRepository(bad.db).execute('cms_singleton_snapshot_v1',{p_kind:'about_hero'}))
})
test('malformed or empty repository results cannot masquerade as successful empty content',async()=>{
 for(const result of [null,{},[],{revision:'bad'},{category:{_revision:'bad'}}]){
  const f=fake(()=>result);await assert.rejects(()=>createCmsRepository(f.db).execute('cms_singleton_snapshot_v1',{p_kind:'about_hero'}))
 }
})
test('legacy mode calls only real legacy authorization; RDS never falls back on failure',async()=>{
 const legacy=harness({provider:'supabase'});assert.equal((await legacy.route(req(),()=>{throw Error('should not run')})).status,401);assert.deepEqual(legacy.events,[['legacy']])
 for(const denied of [401,403,503]){const h=harness({denied});assert.equal((await h.route(req(),()=>{throw Error('should not run')})).status,denied);assert.equal(h.calls.length,0);assert.ok(!h.events.some(e=>e[0]==='legacy'))}
 const bad=harness({badProvider:true});assert.equal((await bad.route(req(),()=>{throw Error('should not run')})).status,503)
})
test('mutation/read authorization flags and caught SQL errors force rollback before mapping',async()=>{
 const h=harness({run:()=>{throw Object.assign(Error('SECRET SQL'),{code:'42P01'})}})
 const response=await h.route(req(undefined,undefined,'GET'),async a=>{try{await a.cms.execute('cms_singleton_snapshot_v1',{p_kind:'about_hero'})}catch{}return Response.json({items:[]})})
 assert.equal(response.status,503);assert.deepEqual(h.events,[['auth',false],['begin'],['rollback']]);assert.ok(!(await response.text()).includes('SECRET'))
 const good=harness();await good.route(req(),async()=>Response.json({ok:true}));assert.deepEqual(good.events,[['auth',true],['begin'],['commit']])
})
test('SQLSTATE conflict, missing, permission, validation and missing routines remain safe',async()=>{
 for(const [code,status] of [['40001',409],['P0002',404],['42501',403],['22023',400],['42883',503],['42P01',503]]){
  const h=harness({run:()=>{throw Object.assign(Error('SECRET driver detail'),{code})}})
  const r=await h.route(req('/api/cms/blog/posts/1'),a=>saveCmsArticle(a,'blog',1,article))
  assert.equal(r.status,status,code);assert.ok(!JSON.stringify(await r.json()).includes('SECRET'));assert.equal(h.events.at(-1)[0],'rollback')
 }
})
test('list save rejects duplicate/retained-deleted IDs and preserves request/revision/deleted arrays',async()=>{
 const f=fake(),a=access(f.db),envelope={requestId:id(2),revision,deletedIds:['9']}
 const r=await saveCmsContentList(a,'about_values',envelope,[{id:1,title:'first'},{id:2,title:'second'}]);assert.equal(r.status,200)
 assert.deepEqual(f.calls[0][1],[id(1),id(2),revision,'about_values',JSON.stringify([{id:1,title:'first'},{id:2,title:'second'}]),['9']])
 assert.equal((await saveCmsContentList(a,'about_values',envelope,[{id:1},{id:1}])).status,400)
 assert.equal((await saveCmsContentList(a,'about_values',{...envelope,deletedIds:['1']},[{id:1}])).status,400);assert.equal(f.calls.length,1)
})
test('article save preserves block order/deletion/request reuse and sanitizes executable HTML',async()=>{
 const f=fake();const a=access(f.db)
 assert.equal((await saveCmsArticle(a,'blog',1,article)).status,200)
 const values=f.calls[0][1];assert.equal(values[1],id(2));assert.equal(values[4],revision)
 assert.equal(JSON.parse(values[5]).title_html,'<strong>Title</strong>');assert.equal(JSON.parse(values[5]).body_html,'<p>Body</p>')
 assert.deepEqual(JSON.parse(values[8]).map(b=>b.body_html),['<p>First</p>','<p>Second</p>'])
 await saveCmsArticle(a,'blog',1,article);assert.deepEqual(f.calls[0],f.calls[1])
 assert.equal((await saveCmsArticle(a,'blog',null,article)).status,400)
})
test('docs retains block/deletion order with server HTML sanitation',async()=>{
 const f=fake();const body={...env,page:{title:'Terms',eyebrow:'Legal',subtitle:'Terms'},blocks:[{id:1,heading:'One',description:'',body:'<p onclick="evil()">Safe<script>evil()</script></p>'}],deleted_block_ids:['2']}
 const r=await saveCmsDocs(access(f.db),'terms',body);assert.equal(r.status,200)
 assert.equal(JSON.parse(f.calls[0][1][5])[0].body,'<p>Safe</p>');assert.deepEqual(f.calls[0][1][6],['2'])
 assert.equal(sanitizeCmsHtml('<a href="javascript:evil()">bad</a>'),'<a>bad</a>')
})
test('Bespoke form exact five-group allowlist/deleted IDs and request are retained',async()=>{
 const f=fake();const keys=['guarantees','pieceTypes','stoneOptions','caratOptions','metalOptions'];const lists=Object.fromEntries(keys.map(key=>[key,[{id:id(3),label:key,display_order:0,status:'active'}]]));const deleted_ids=Object.fromEntries(keys.map(key=>[key,[id(4)]]))
 const body={...env,settings:{intro_heading:'',intro_subtitle:'',footer_note:'',status:'active'},lists,deleted_ids}
 assert.equal((await saveBespokeForm(access(f.db),body)).status,200)
 assert.deepEqual(JSON.parse(f.calls[0][1][4]),lists);assert.deepEqual(JSON.parse(f.calls[0][1][5]),deleted_ids)
 assert.equal((await saveBespokeForm(access(f.db),{...body,lists:{...lists,other:[]}})).status,400)
 assert.equal((await saveBespokeForm(access(f.db),{...body,deleted_ids:{...deleted_ids,guarantees:[id(3)]}})).status,400);assert.equal(f.calls.length,1)
 const definition=evidence.reviewed_routines.find(f=>f.name==='bespoke_form_save_v1').definition
 for(const table of ['bespoke_form_guarantees','bespoke_form_piece_types','bespoke_form_stone_options','bespoke_form_carat_options','bespoke_form_metal_options'])assert.ok(definition.includes(table))
})
test('Bespoke hero cleans client IDs and preserves UUID deletions and ordering',async()=>{
 const f=fake();const item={heading_line_1:'Bespoke',slider_enabled:true,status:'active'}
 const r=await saveBespokeHero(access(f.db),{...env,item,items:[{id:id(3),clientId:'client',sort_order:1,image_path:'x',button_text:'View',button_link:'/bespoke'}],deleted_ids:[id(4)]})
 assert.equal(r.status,200);assert.equal(JSON.parse(f.calls[0][1][4])[0].clientId,undefined);assert.deepEqual(f.calls[0][1][5],[id(4)])
})
test('singleton and relational validation happens before any SQL',async()=>{
 const f=fake();assert.equal((await saveCmsSingleton(access(f.db),'blog_hero',{...env,item:{bad:true}})).status,400)
 assert.equal((await saveCmsRelational(access(f.db),'checkout_result',{...env,parent:{},items:[],deleted_ids:[]})).status,400);assert.equal(f.calls.length,0)
})
test('portfolio optimistic update binds JSON/UUID/timestamp, no caller SQL identifiers',async()=>{
 const calls=[];const db={async query(sql,values){calls.push([sql,values]);return {rows:[]}}};const repo=createBespokeRepository(db)
 assert.equal(await repo.save('category',{name:"x'); DROP TABLE profiles; --",slug:'x',image_path:null,display_order:0,status:'active'},id(3),'2026-10-15T00:00:00Z','2026-10-15T01:00:00Z'),null)
 assert.match(calls[0][0],/updated_at=\$3::timestamptz/);assert.ok(!calls[0][0].includes('DROP TABLE'));assert.equal(calls[0][1][1],id(3));assert.equal(calls[0][1][2],'2026-10-15T00:00:00Z')
})
test('Bespoke submission filters apply date bounds before limit and literal in-memory search',async()=>{
 const calls=[];const row={id:id(1),full_name:'Alice',email:'alice@example.test',message:'100% custom'}
 const repo=createBespokeRepository({async query(sql,values){calls.push([sql,values]);return {rows:[{item:row}]}}})
 assert.equal((await repo.submissions({from:'2026-10-01',to:'2026-10-15',q:'100%'})).length,1)
 assert.equal(calls[0][1][0],'2026-10-01T00:00:00.000Z');assert.match(calls[0][0],/ORDER BY created_at DESC LIMIT 1000/)
 assert.equal((await repo.submissions({q:'_'})).length,0)
})
test('actual route singleton/list/reels/FAQ validation uses scoped real wrapper and injected dependencies',async()=>{
 const old=process.env.ADMIN_CMS_DATA_PROVIDER;process.env.ADMIN_CMS_DATA_PROVIDER='rds'
 try{
  const h=harness();globalThis.__b5=h.deps
  const hero=await get('app/api/cms/home/hero/route.ts');const r=await hero.GET(req('/api/cms/home/hero',undefined,'GET'));assert.equal(r.status,200);assert.deepEqual(h.events[0],['auth',false])
  const values=await get('app/api/cms/about/values/route.ts');const bad=await values.POST(req(undefined,{...env,deleted_ids:[],items:[{title:''}]}));assert.equal(bad.status,400)
  const reels=await get('app/api/cms/home/reels/route.ts');assert.equal((await reels.POST(req('/api/cms/home/reels',{}))).status,400)
  const faq=await get('app/api/cms/support/faq/categories/route.ts');assert.equal((await faq.DELETE(req('/api/cms/support/faq/categories',{}))).status,409)
 }finally{if(old===undefined)delete process.env.ADMIN_CMS_DATA_PROVIDER;else process.env.ADMIN_CMS_DATA_PROVIDER=old;delete globalThis.__b5}
})
test('Bespoke route invalid IDs/payloads reject without SQL',async()=>{
 const f=fake();assert.equal((await runBespokeData(req('/api/bespoke/portfolio-items/no',{},'PATCH'),access(f.db),'no')).status,400)
 assert.equal((await runBespokeData(req('/api/bespoke/submissions/no',undefined,'GET'),access(f.db),'no')).status,400);assert.equal(f.calls.length,0)
})

test('client RDS transport follows server contract, cookie/CSRF, strips caller bearer and never uses legacy',async()=>{
 const {cmsFetch,forgetCmsRequestContext}=await get('lib/cms-transport.ts');forgetCmsRequestContext();const original=globalThis.fetch;const calls=[];globalThis.__b5LegacyCalls=0
 globalThis.fetch=async(url,options={})=>{calls.push([url,options]);return Response.json(url==='/api/cms/provider'?{provider:'rds'}:url==='/api/auth/session'?{authenticated:true,csrfToken:'server-csrf'}:{ok:true})}
 try{const r=await cmsFetch('/api/cms/about/values',{method:'POST',headers:{authorization:'Bearer attacker','x-admin-csrf':'attacker'},body:'{}'});assert.equal(r.status,200);const options=calls.at(-1)[1];assert.equal(options.credentials,'same-origin');assert.equal(options.headers.get('authorization'),null);assert.equal(options.headers.get('x-admin-csrf'),'server-csrf');assert.equal(globalThis.__b5LegacyCalls,0)}finally{globalThis.fetch=original;delete globalThis.__b5LegacyCalls}
})
test('client rejects the removed legacy provider and still rejects media, B6 and traversal paths',async()=>{
 const {cmsFetch,forgetCmsRequestContext}=await get('lib/cms-transport.ts');forgetCmsRequestContext();const original=globalThis.fetch;const calls=[];globalThis.__b5LegacyCalls=0
 globalThis.fetch=async(url,options={})=>{calls.push([url,options]);return Response.json(url==='/api/cms/provider'?{provider:'supabase'}:{items:[]})}
 try{assert.equal((await cmsFetch('/api/bespoke/portfolio-items')).status,503);assert.equal(globalThis.__b5LegacyCalls,0);assert.equal(calls.length,1)
  for(const url of ['/api/bespoke/media','/api/cms/uploads/hero','/api/cms/contact/submissions','/api/cms/../../orders','https://evil.test/api/cms/about/hero'])await assert.rejects(()=>cmsFetch(url))
 }finally{globalThis.fetch=original;delete globalThis.__b5LegacyCalls}
})
test('client missing session/config/network failure denies without cross-provider retries',async()=>{
 const {cmsFetch,forgetCmsRequestContext}=await get('lib/cms-transport.ts');forgetCmsRequestContext();const original=globalThis.fetch;const calls=[]
 globalThis.fetch=async(url)=>{calls.push(url);return Response.json(url==='/api/cms/provider'?{provider:'rds'}:{authenticated:false},{status:url==='/api/auth/session'?401:200})}
 try{assert.equal((await cmsFetch('/api/cms/about/hero',{method:'POST'})).status,503);assert.deepEqual(calls,['/api/cms/provider','/api/auth/session'])}finally{globalThis.fetch=original}
})
test('real B1 origin/CSRF guard rejects missing CSRF before CMS database work',async()=>{
 const {assertMutation}=await get('lib/auth/request-security.ts');const h=harness();h.deps.authorize=async(request,mutation)=>{if(mutation){try{assertMutation(request,'https://admin.example','csrf')}catch{const {ProductSessionError}=await get('lib/product-session-error.ts');throw new ProductSessionError(403)}}return {actor}}
 const route=createCmsDataRoute(h.deps)
 const r=await route(new Request('https://admin.example/api/cms/about/hero',{method:'POST',headers:{origin:'https://evil.test'}}),async()=>Response.json({ok:true}))
 assert.equal(r.status,403);assert.equal(h.calls.length,0);assert.equal(h.events.length,0)
})
test('pending manual retry keeps exact request IDs until changes or successful confirmation',async()=>{
 const {createCmsPendingSave}=await get('lib/cms-pending-save.ts');const pending=createCmsPendingSave()
 const first=JSON.stringify({request_id:id(2),expected_revision:revision,deleted_ids:[id(3)],items:[{label:'first'}]})
 assert.equal(pending.prepare(first),first);assert.equal(pending.prepare(JSON.stringify({...JSON.parse(first),request_id:id(4)})),first)
 const changed=JSON.stringify({...JSON.parse(first),request_id:id(4),items:[{label:'changed'}]});assert.equal(pending.prepare(changed),changed)
 pending.clear();assert.equal(pending.prepare(first),first)
})

test('legacy helper preserves actor, RPC envelope and PostgREST migration/conflict responses',async()=>{
 const calls=[];const legacy={user:{id:id(7)},adminClient:{async rpc(name,args){calls.push([name,args]);return {data:{item:null,revision},error:null}}}}
 const item={is_enabled:true,heading:'Blog',paragraph:'',button_label:'',button_link:'',desktop_image_path:'',desktop_image_alt:'',mobile_image_path:'',mobile_image_alt:''}
 assert.equal((await saveCmsSingleton(legacy,'blog_hero',{...env,item})).status,200)
 assert.equal(calls[0][0],'cms_save_singleton_v1');assert.equal(calls[0][1].p_actor_id,id(7));assert.equal(calls[0][1].p_request_id,id(2))
 for(const [code,status]of [['PGRST202',503],['40001',409]]){legacy.adminClient.rpc=async()=>({data:null,error:{code}});assert.equal((await saveCmsSingleton(legacy,'blog_hero',{...env,item})).status,status)}
})
test('actual FAQ create accepts its category revision envelope; relational and reference failures deny',async()=>{
 const old=process.env.ADMIN_CMS_DATA_PROVIDER;process.env.ADMIN_CMS_DATA_PROVIDER='rds'
 try{
  const h=harness();globalThis.__b5=h.deps;const faq=await get('app/api/cms/support/faq/categories/route.ts')
  const body={request_id:id(2),expected_revision:null,id:null,item:{name:'Care',slug:'care',description:'',image_path:null,image_alt:'',sort_order:0,is_active:true}}
  const r=await faq.POST(req('/api/cms/support/faq/categories',body));assert.equal(r.status,200);assert.equal((await r.json()).category._revision,revision)
  const failed=harness({run:()=>{throw Object.assign(Error('SECRET'),{code:'42P01'})}});globalThis.__b5=failed.deps
  const posts=await get('app/api/cms/blog/posts/route.ts');const denied=await posts.GET(req('/api/cms/blog/posts',undefined,'GET'));assert.equal(denied.status,503);assert.equal(failed.events.at(-1)[0],'rollback');assert.ok(!failed.events.some(e=>e[0]==='legacy'))
 }finally{if(old===undefined)delete process.env.ADMIN_CMS_DATA_PROVIDER;else process.env.ADMIN_CMS_DATA_PROVIDER=old;delete globalThis.__b5}
})
test('actual B2 transaction rolls back after B5 catches a failed query in a route',async()=>{
 const {withAdminTransaction}=await get('lib/db/query.ts');const calls=[];let released=false
 const client={async query(sql){calls.push(sql);if(sql.includes('session_user::text'))return {rows:[{login_role:'hod_admin_login_test',active_role:'hod_admin_login_test',safe_login:true,isolated_login:true,safe_capability:true,isolated_capability:true,capability_exists:true}]};if(sql.includes('public.cms_'))throw Object.assign(Error('SQL failure'),{code:'42883'});return {rows:[]}},release(){released=true}}
 const route=createCmsDataRoute({provider:()=> 'rds',authorize:async()=>({actor}),legacy:async()=>{throw Error('no fallback')},transaction:run=>withAdminTransaction({connect:async()=>client},'hod_admin_login_test',run)})
 const r=await route(req(undefined,undefined,'GET'),async access=>{try{await access.cms.execute('cms_singleton_snapshot_v1',{p_kind:'about_hero'})}catch{}return Response.json({item:null})})
 assert.equal(r.status,503);assert.equal(calls.at(-1),'ROLLBACK');assert.ok(!calls.includes('COMMIT'));assert.equal(released,true)
})

test('RDS JSON text preserves full bigint IDs without changing strings, revisions or ordinary numbers',async()=>{
 const {parseCmsJson,readCmsId,compareCmsIds,cmsIdSchema}=await get('lib/cms-id-safety.ts')
 const raw='{"item":{"id":9223372036854775807,"category_id":9007199254740993,"sort_order":1,"body":"escaped \\\"id\\\":9223372036854775807"},"revision":"'+revision+'"}'
 const parsed=parseCmsJson(raw);assert.equal(parsed.item.id,'9223372036854775807');assert.equal(parsed.item.category_id,'9007199254740993');assert.equal(parsed.item.sort_order,1);assert.equal(parsed.revision,revision);assert.equal(parsed.item.body,'escaped "id":9223372036854775807')
 assert.equal(readCmsId(parsed.item.id),'9223372036854775807');assert.equal(readCmsId('1'),1);assert.equal(compareCmsIds('9223372036854775807',1),1)
 assert.equal(cmsIdSchema.safeParse('9223372036854775808').success,false);assert.equal(cmsIdSchema.safeParse(Number.MAX_SAFE_INTEGER+1).success,false)
 const f=fake(()=>raw);const result=await createCmsRepository(f.db).execute('cms_singleton_snapshot_v1',{p_kind:'about_hero'});assert.equal(result.item.id,'9223372036854775807');assert.match(f.calls[0][0],/result::text/);assert.equal((f.calls[0][0].match(/public.cms_singleton_snapshot_v1/g)||[]).length,1)
})
test('full bigint article ID is retained through actual route and deletion response',async()=>{
 const old=process.env.ADMIN_CMS_DATA_PROVIDER;process.env.ADMIN_CMS_DATA_PROVIDER='rds'
 try{
  const h=harness({run:()=>'{"ok":true,"deleted_id":9223372036854775807}'});globalThis.__b5=h.deps
  const route=await get('app/api/cms/blog/posts/[id]/route.ts');const r=await route.DELETE(req('/api/cms/blog/posts/9223372036854775807',env,'DELETE'),{params:Promise.resolve({id:'9223372036854775807'})})
  assert.equal(r.status,200);assert.equal(h.calls[0][1][3],'9223372036854775807');assert.equal((await r.json()).deleted_id,'9223372036854775807')
 }finally{if(old===undefined)delete process.env.ADMIN_CMS_DATA_PROVIDER;else process.env.ADMIN_CMS_DATA_PROVIDER=old;delete globalThis.__b5}
})

test('full bigint list and FAQ IDs survive actual validators, SQL bindings and response envelopes',async()=>{
 const old=process.env.ADMIN_CMS_DATA_PROVIDER;process.env.ADMIN_CMS_DATA_PROVIDER='rds';const max='9223372036854775807'
 try{
  const h=harness({run:sql=>sql.includes('cms_save_content_list')?'{"items":[{"id":9223372036854775807}],"revision":"'+revision+'"}':'{"category":{"id":9223372036854775807,"_revision":"'+revision+'"}}'});globalThis.__b5=h.deps
  const values=await get('app/api/cms/about/values/route.ts');const result=await values.POST(req('/api/cms/about/values',{...env,deleted_ids:[],items:[{id:max,icon_path:'',image_path:'',image_alt:'',title:'Value',description:''}]}))
  assert.equal(result.status,200);assert.equal((await result.json()).items[0].id,max);assert.equal(JSON.parse(h.calls[0][1][4])[0].id,max)
  const faq=await get('app/api/cms/support/faq/categories/route.ts');const response=await faq.POST(req('/api/cms/support/faq/categories',{...env,id:max,item:{name:'Care',slug:'care',description:'',image_path:null,image_alt:'',sort_order:0,is_active:true}}))
  assert.equal(response.status,200);assert.equal((await response.json()).category.id,max);assert.equal(h.calls[1][1][3],max)
 }finally{if(old===undefined)delete process.env.ADMIN_CMS_DATA_PROVIDER;else process.env.ADMIN_CMS_DATA_PROVIDER=old;delete globalThis.__b5}
})
test('full bigint docs page relation/block IDs remain strings and sort orders stay numeric',async()=>{
 const max='9223372036854775807',f=fake();const r=await saveCmsDocs(access(f.db),'returns',{...env,page:{title:'Returns',eyebrow:'Legal',subtitle:'Returns',faq_category_id:max},blocks:[{id:max,heading:'Heading',description:'',body:'<p>Body</p>'}],deleted_block_ids:['9007199254740993']})
 assert.equal(r.status,200);assert.equal(JSON.parse(f.calls[0][1][4]).faq_category_id,max);assert.equal(JSON.parse(f.calls[0][1][5])[0].id,max);assert.deepEqual(f.calls[0][1][6],['9007199254740993'])
})
