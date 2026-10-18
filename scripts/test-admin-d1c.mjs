// Actual TypeScript source, injected in-process boundaries only. No listener/client discovery.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { createHash } from 'node:crypto'
const data = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64')
const modules = new Map()
let state, rejectAuth, calls, headOverride, failPut, failReserve, failAdmit, failAfterAdmit, enabled, listItems
globalThis.__d1c = {
  async authorize() { if (rejectAuth) throw rejectAuth; return { actor } },
  async transaction(run) { return run(db) },
  async send(command) {
    calls.push(command)
    const { input } = command
    if (command.constructor.name === 'PutObjectCommand') {
      if (failPut) throw Error('Put failed')
      if (state.objects.has(input.Key)) throw Error('Precondition failed')
      state.objects.set(input.Key, { ContentLength: input.ContentLength, ContentType: input.ContentType, ChecksumSHA256: input.ChecksumSHA256, VersionId: 'v1' })
      return { VersionId: 'v1' }
    }
    if (command.constructor.name === 'ListObjectsV2Command') return { Contents: listItems.filter(item => item.Key.startsWith(input.Prefix)) }
    if (headOverride) return headOverride
    return state.objects.get(input.Key) ?? {}
  },
}
async function load(file) {
  file = path.resolve(file)
  if (modules.has(file)) return modules.get(file)
  let code = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022 } }).outputText
  for (const name of new Set([...code.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]))) {
    let url
    if (name==='server-only') url=data('export {}')
    else if (name==='@aws-sdk/client-s3') url=data(`export {PutObjectCommand,HeadObjectCommand,ListObjectsV2Command} from ${JSON.stringify(import.meta.resolve(name))};export class S3Client {send(c){return globalThis.__d1c.send(c)}}`)
    else if (name.endsWith('/product-session-runtime') || name==='./product-session-runtime') url=data('export const authorizeProductRequest=(...a)=>globalThis.__d1c.authorize(...a)')
    else if (name==='./db/pool' || name==='../pool') url=data('export const adminTransaction=(...a)=>globalThis.__d1c.transaction(...a)')
    else if (name.startsWith('.')||name.startsWith('@/')) {
      let next=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(file),name)
      if (!path.extname(next)) next+='.ts'
      url=(await load(next)).url
    } else url=import.meta.resolve(name==='next/server'?'next/server.js':name)
    code=code.replaceAll("'"+name+"'","'"+url+"'").replaceAll('"'+name+'"','"'+url+'"')
  }
  const url=data(code+'\n//# sourceURL='+file.replaceAll('\\','/')), result={url,exports:await import(url)};modules.set(file,result);return result
}
const admission=(await load('lib/video-admission.ts')).exports
const runtime=(await load('lib/video-admission-runtime.ts')).exports
const library=(await load('lib/video-library.ts')).exports
const route=(await load('lib/video-route.ts')).exports
const selection=(await load('app/api/products/videos/select/route.ts')).exports
const saves=(await load('lib/video-save-admission.ts')).exports
const products=(await load('lib/db/admin-repositories/products.ts')).exports
const cms=(await load('lib/db/admin-repositories/cms.ts')).exports
const bespoke=(await load('lib/db/admin-repositories/bespoke.ts')).exports
const { ProductSessionError }=(await load('lib/product-session-error.ts')).exports
const source={bucket:'house-of-diams',baseUrl:'https://media.houseofdiams.com',prefix:'products/videos/'}
const actor={profileId:'71ab01bc-4160-40a9-80cb-7519f88e91ab',issuer:'https://issuer.example',subject:'subject'}
const operation='71ab01bc-4160-40a9-80cb-7519f88e91ab'
const bytes=Buffer.from([0,0,0,12,0x66,0x74,0x79,0x70,0,0,0,0])
const env={ADMIN_VIDEO_PROVIDER:'aws',ADMIN_VIDEO_ROUTING_VERIFIED:'true',ADMIN_IMAGE_CONTENT_ROUTING_VERIFIED:'true',AWS_MEDIA_BUCKET:source.bucket,NEXT_PUBLIC_MEDIA_CDN_BASE_URL:source.baseUrl,AWS_CONTENT_BUCKET:'house-of-diams-hod',AWS_CONTENT_CDN_BASE_URL:'https://content.houseofdiams.com',ADMIN_VIDEO_ADMISSION_PROVIDER:'rds',ADMIN_VIDEO_IMMUTABILITY_VERIFIED:'true',ADMIN_VIDEO_ADMISSION_POLICY:'test-v1'}
Object.assign(env,{ADMIN_AUTH_PROVIDER:'keycloak',ADMIN_PRODUCT_DATA_PROVIDER:'rds',ADMIN_CMS_DATA_PROVIDER:'rds',ADMIN_CATALOG_DATA_PROVIDER:'rds',ADMIN_OPERATIONS_DATA_PROVIDER:'rds',ADMIN_IMAGE_PROVIDER:'aws'})
const copy=o=>structuredClone(o)
const repo={
  async reserve(record){if(failReserve)throw Error('reserve');const old=state.records.get(record.operationId);if(old)return {record:copy(old),created:false};state.records.set(record.operationId,copy(record));return {record:copy(record),created:true}},
  async admit(record){if(failAdmit)throw Error('admit');const old=state.records.get(record.operationId);if(old?.status!=='pending')throw Error('transition');state.records.set(record.operationId,copy(record));if(failAfterAdmit)throw Error('ambiguous commit');return copy(record)},
  async reject(id){for(const row of state.records.values())if(row.id===id&&row.status==='pending')row.status='rejected'},
  async find(url){return copy([...state.records.values()].find(r=>r.url===url)??null)},
}
// SQL-boundary fixture executes the actual repository's parameter contract, never SQL itself.
const db={async query(sql,values=[]){
  state.sql.push(sql)
  if(sql.includes('FROM admin_media.policy'))return {rows:enabled?[{policy:'test-v1',sources:state.sources}]:[]}
  if(sql.startsWith('INSERT INTO admin_media.admissions')){
    const [id,operationId,actorId,bucket,key,url,sha256,size,mime,policy,verifier,actorIssuer,actorSubject]=values
    const existed=state.records.has(operationId),r=await repo.reserve({id,operationId,actorId,actorIssuer,actorSubject,bucket,key,url,sha256,size,mime,policy,verifier,evidence:'new-upload-intent',status:'pending',version:null})
    return {rows:existed?[]:[r.record]}
  }
  if(sql.includes('FROM admin_media.admissions'))return {rows:[...state.records.values()].filter(r=>sql.includes('operation_id=')?r.operationId===values[0]:r.url===values[0]).map(copy)}
  if(sql.startsWith('UPDATE admin_media.admissions')){
    const row=[...state.records.values()].find(r=>r.id===values[0]);if(!row||row.status!=='pending')return {rows:[]}
    if(sql.includes("status='rejected'")){await repo.reject(row.id);return {rows:[]}}
    return {rows:[await repo.admit({...row,version:values[1],status:'admitted'})]}
  }
  if(sql.includes('admin_product_save_v1'))return {rows:[{result:{id:'saved'}}]}
  if(sql==='SELECT id FROM public.products WHERE id=$1::uuid FOR UPDATE')return {rows:state.previous?[{id:actor.profileId}]:[]}
  if(sql.includes('FROM public.products p WHERE'))return {rows:state.previous?[{item:state.previous}]:[]}
  if(sql.includes('FROM public.product_'))return {rows:[]}
  if(sql.includes('cms_singleton_snapshot_v1'))return {rows:[{result:JSON.stringify({revision:'a'.repeat(32),item:state.previous})}]}
  if(sql.includes('cms_save_singleton_v1'))return {rows:[{result:JSON.stringify({revision:'b'.repeat(32),item:JSON.parse(values[4])})}]}
  if(sql.includes('bespoke_portfolio_items'))return {rows:[{item:state.previous??{id:'saved'}}]}
  throw Error('Unexpected SQL boundary: '+sql)
}}
function reset(){Object.assign(process.env,env);state={objects:new Map(),records:new Map(),sql:[],previous:null,sources:[source]};calls=[];rejectAuth=null;headOverride=null;failPut=false;failReserve=false;failAdmit=false;failAfterAdmit=false;enabled=true;listItems=[];library.invalidateAwsVideoLibrary()}
const service=()=>admission.createVideoAdmission(repo,c=>globalThis.__d1c.send(c),'test-v1')
const upload=()=>service().upload(source,bytes,'video/mp4',actor,operation)
async function listed(record){listItems=[{Key:record.key,Size:record.size}];return library.getAwsVideoLibrary(true)}
globalThis.fetch=async()=>{throw Error('External network prohibited')}
test('admission configuration defaults inactive and incomplete requests fail closed',()=>{assert.equal(admission.admissionPolicy({}),null);assert.throws(()=>admission.admissionPolicy({ADMIN_VIDEO_ADMISSION_PROVIDER:'rds'}));assert.equal(admission.admissionPolicy(env),'test-v1')})
test('upload uses durable reserve -> conditional Put -> exact Head -> durable admit; fresh-instance listing selects',async()=>{reset();const r=await upload();assert.equal(r.status,'admitted');assert.equal(calls[0].input.IfNoneMatch,'*');assert.equal((await listed(r))[0].admissionId,r.id);library.invalidateAwsVideoLibrary();assert.equal((await listed(r))[0].verification,'admitted')})
for(const field of ['ChecksumSHA256','ContentLength','ContentType','VersionId'])test('Head identity mismatch '+field+' never admits after Put or restart',async()=>{reset();headOverride={ChecksumSHA256:createHash('sha256').update(bytes).digest('base64'),ContentLength:bytes.length,ContentType:'video/mp4',VersionId:'v1',[field]:'wrong'};await assert.rejects(upload());const r=[...state.records.values()][0];assert.equal(r.status,'rejected');assert.equal((await listed(r))[0].verification,'unknown')})
for(const status of ['pending','rejected','retired','missing'])test(status+' registry record cannot select even with valid object Head',async()=>{reset();const r=await upload();if(status==='missing')state.records.clear();else state.records.get(operation).status=status;assert.equal((await listed(r))[0].verification,'unknown');await assert.rejects(runtime.resolveAdmittedVideo(r.url,r.id))})
test('same operation/tuple retry after process reconstruction returns exact immutable identity without Put',async()=>{reset();const first=await upload();const second=await service().upload(source,bytes,'video/mp4',actor,operation);assert.equal(second.id,first.id);assert.equal(calls.filter(c=>c.constructor.name==='PutObjectCommand').length,1)})
test('concurrent same operation has one publisher; pending retry cannot succeed or overwrite',async()=>{reset();const results=await Promise.allSettled([upload(),upload()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls.filter(c=>c.constructor.name==='PutObjectCommand').length,1)})
test('operation reuse with different tuple or actor denies without storage',async()=>{reset();await upload();const n=calls.length;await assert.rejects(service().upload(source,Buffer.concat([bytes,Buffer.from([1])]),'video/mp4',actor,operation));await assert.rejects(service().upload(source,bytes,'video/mp4',{...actor,profileId:'other'},operation));assert.equal(calls.length,n)})
test('crashed pending reservation remains nonselectable and is never automatically re-Put',async()=>{reset();await upload();const r=state.records.get(operation);r.status='pending';calls=[];await assert.rejects(upload());assert.equal(calls.length,0)})
test('registry failure before Put performs zero object commands',async()=>{reset();failReserve=true;await assert.rejects(upload());assert.equal(calls.length,0)})
for(const failure of ['put','admit','after-admit'])test('registry/object failure '+failure+' has no success; retry cannot resurrect rejected record',async()=>{reset();failPut=failure==='put';failAdmit=failure==='admit';failAfterAdmit=failure==='after-admit';await assert.rejects(upload());const r=state.records.get(operation);assert.equal(r.status,failure==='after-admit'?'admitted':'rejected');if(r.status==='rejected')await assert.rejects(upload())})
test('policy revocation and immutable identity change defeat cached listing/selection',async()=>{reset();const r=await upload();assert.equal((await listed(r))[0].verification,'admitted');enabled=false;assert.equal((await library.getAwsVideoLibrary())[0].verification,'unknown');await assert.rejects(runtime.resolveAdmittedVideo(r.url));enabled=true;state.objects.set(r.key,{ContentLength:r.size,ContentType:r.mime,ChecksumSHA256:'forged',VersionId:'v1'});await assert.rejects(runtime.resolveAdmittedVideo(r.url))})
test('selection actual route authenticates; forged ID/boolean/URL rejected',async()=>{reset();const r=await upload();const request=body=>new Request('https://admin.example/api/products/videos/select',{method:'POST',body:JSON.stringify(body)});assert.equal((await selection.POST(request({url:r.url,admissionId:r.id}))).status,200);for(const body of [{url:r.url,admissionId:'forged'},{url:r.url,admissionId:r.id,approved:true},{url:r.url+'?bad',admissionId:r.id}])assert.equal((await selection.POST(request(body))).status,409);rejectAuth=new ProductSessionError(403);assert.equal((await selection.POST(request({url:r.url,admissionId:r.id}))).status,403)})
test('actual mixed upload route returns admitted only after durable record and never on commit failure',async()=>{reset();async function request(){const f=new FormData();f.set('kind','video');f.set('folder','products');f.set('file',new File([bytes],'v.mp4',{type:'video/mp4'}));const response=new Response(f),body=await response.arrayBuffer();return new Request('https://admin.example/api/products/media',{method:'POST',body,headers:{'x-admin-video-upload':'1','content-type':response.headers.get('content-type'),'content-length':String(body.byteLength)}})}const response=await route.selectedMixedVideo(await request(),'product');assert.equal(response.status,201);assert.equal((await response.json()).admission,'admitted');failAdmit=true;assert.equal((await route.selectedMixedVideo(await request(),'product')).status,500)})
test('actual product repository validates new AWS references and preserves images/plain media',async()=>{reset();const r=await upload();assert.deepEqual(await products.createProductRepository(db).save(actor,{payload:{video_path:r.url}}),{id:'saved'});await assert.rejects(products.createProductRepository(db).save(actor,{payload:{video_path:r.url.replace('.mp4','other.mp4')}}));await products.createProductRepository(db).save(actor,{payload:{image_path:'https://media.houseofdiams.com/products/images/new.webp'}})})
test('historical unchanged video/JSONB survives inactive admission, moved/new reference fails',async()=>{reset();delete process.env.ADMIN_VIDEO_ADMISSION_PROVIDER;const old={item:{desktop_media_path:source.baseUrl+'/products/videos/old.mp4'}};await saves.enforceVideoSave(db,old,old);await assert.rejects(saves.enforceVideoSave(db,{item:{mobile_media_path:old.item.desktop_media_path}},old));assert.equal(state.sql.length,0)})
test('actual CMS repository loads authoritative snapshot before save; historical unchanged allowed',async()=>{reset();state.previous={desktop_media_path:source.baseUrl+'/products/videos/old.mp4'};delete process.env.ADMIN_VIDEO_ADMISSION_PROVIDER;const repository=cms.createCmsRepository(db,actor);await repository.execute('cms_save_singleton_v1',{p_request_id:operation,p_kind:'about_hero',p_expected_revision:'a'.repeat(32),p_item:state.previous});await assert.rejects(repository.execute('cms_save_singleton_v1',{p_request_id:operation,p_kind:'about_hero',p_expected_revision:'a'.repeat(32),p_item:{desktop_media_path:source.baseUrl+'/products/videos/new.mp4'}}))})
test('actual bespoke save rejects unadmitted paste and accepts admitted canonical URL',async()=>{reset();const r=await upload();await bespoke.createBespokeRepository(db).save('item',{media_type:'video',media_path:r.url});await assert.rejects(bespoke.createBespokeRepository(db).save('item',{media_type:'video',media_path:r.url+'?fake'}))})
test('malformed AWS paste does not bypass canonical validation; nonvideo images are unaffected',async()=>{reset();await assert.rejects(saves.enforceVideoSave(db,{video_path:source.baseUrl+'/products/videos/x.mp4?fake'},null));await saves.enforceVideoSave(db,{image_path:source.baseUrl+'/products/images/x.jpg'},null)})
test('current policy source removal defeats cached listing and persistence',async()=>{reset();const r=await upload();await listed(r);state.sources=[];assert.equal((await library.getAwsVideoLibrary())[0].verification,'unknown');await assert.rejects(products.createProductRepository(db).save(actor,{payload:{video_path:r.url}}))})
test('actual existing product save preserves unchanged historical video after mapping-safe authoritative read',async()=>{reset();state.previous={video_path:source.baseUrl+'/products/videos/historical.mp4'};delete process.env.ADMIN_VIDEO_ADMISSION_PROVIDER;await products.createProductRepository(db).save(actor,{productId:actor.profileId,payload:state.previous});assert(state.sql.some(s=>s.endsWith('FOR UPDATE')));await assert.rejects(products.createProductRepository(db).save(actor,{productId:actor.profileId,payload:{video_path:source.baseUrl+'/products/videos/new.mp4'}}))})
test('encoded AWS video extensions and extensionless explicit video slots cannot bypass admission',async()=>{reset();for(const next of [{video_path:source.baseUrl+'/products/videos/new%2Emp4'},{media_type:'video',media_path:source.baseUrl+'/products/videos/opaque'}])await assert.rejects(saves.enforceVideoSave(db,next,null))})
test('duplicate semantic IDs with conflicting references are rejected rather than overwriting slot evidence',()=>{reset();assert.throws(()=>saves.videoReferenceSlots([{id:'same',video_path:source.baseUrl+'/products/videos/a.mp4'},{id:'same',video_path:source.baseUrl+'/products/videos/b.mp4'}]))})
test('incomplete/partial provider activation cannot enable admission',()=>{assert.throws(()=>admission.admissionPolicy({...env,ADMIN_CMS_DATA_PROVIDER:'supabase'}));assert.throws(()=>admission.admissionPolicy({...env,ADMIN_AUTH_PROVIDER:'supabase'}))})
