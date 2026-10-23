// Actual-source, in-process C1 tests. No sockets, listeners, cloud, credential resolution or live storage.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import ts from 'typescript'
import sharp from 'sharp'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64')
const calls=[]
let legacyS3=false
let storeFailure=false, legacyCalls=0, authFailure=null
const actor={profileId:'71ab01bc-4160-40a9-80cb-7519f88e91ab',issuer:'https://admin.example/realm',subject:'verified-subject'}
const fixture={configured:()=>legacyS3,async authorize(request,mutation){calls.push(['auth',mutation]);if(authFailure)throw authFailure;return {actor}},async upload(key,body,type,target){calls.push(['upload',key,body,type,target]);if(storeFailure)throw Error('PRIVATE STORAGE DETAIL');return {path:key,url:(target?.baseUrl??'https://media.houseofdiams.com')+'/'+key}},async legacy(){legacyCalls++;return {adminClient:{storage:{from(){return {async upload(){return {error:null}},getPublicUrl(key){return {data:{publicUrl:'https://legacy.example/'+key}}}}}}}}}}
globalThis.__c1=fixture
const cache=new Map()
async function load(relative,{actualS3=false}={}){
 const filename=path.resolve(root,relative),cacheKey=filename+actualS3
 if(cache.has(cacheKey))return cache.get(cacheKey)
 let code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 const imports=[...code.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)]
 for(const match of imports){const name=match[1];let url
  if(name==='server-only')url=data('export {}')
  else if(name.endsWith('/product-session-runtime')||name==='./product-session-runtime')url=data('export const authorizeProductRequest=(...args)=>globalThis.__c1.authorize(...args)')
  else if(name.endsWith('/cms-auth')||name==='./cms-auth')url=data('export const assertAdmin=(...args)=>globalThis.__c1.legacy(...args)')
  else if(name==='@/lib/r2')url=data('export const invalidateCentralVideoLibrary=()=>globalThis.__c1.videoInvalidated=true;export const uploadProductVideoToR2=async()=>({url:"https://legacy-r2.example/video.mp4"});export const createPresignedProductImageUpload=async()=>{throw Error("not invoked")};export const isR2Configured=()=>false')
  else if(name==='./supabase'||name==='@/lib/supabase')url=data('throw Error("Supabase must not load in selected AWS image mode")')
  else if(!actualS3&&(name==='./s3-media'||name==='@/lib/s3-media'))url=data('export const isS3MediaConfigured=()=>globalThis.__c1.configured();export const uploadMediaToS3=(...args)=>globalThis.__c1.upload(...args)')
  else if(name.startsWith('.')||name.startsWith('@/')){let target=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(filename),name);if(!path.extname(target))target+='.ts';url=(await load(target,{actualS3})).url}
  else url=import.meta.resolve(name==='next/server'?'next/server.js':name)
  code=code.replaceAll("'"+name+"'","'"+url+"'").replaceAll('"'+name+'"','"'+url+'"')
 }
 const url=data(code),result={url,exports:await import(url)};cache.set(cacheKey,result);return result
}
const {exports:provider}=await load('lib/image-provider.ts')
const {exports:storage}=await load('lib/s3-media.ts',{actualS3:true})
const {exports:validation}=await load('lib/image-validation.ts')
const {exports:reference}=await load('lib/image-reference.ts')
const {exports:route}=await load('lib/image-route.ts')
const {exports:mixed}=await load('lib/image-mixed-route.ts')
const {exports:{ProductSessionError}}=await load('lib/product-session-error.ts')
const {exports:client}=await load('lib/image-transport.ts')
const {exports:cmsClient}=await load('lib/cms-direct-upload-client.ts')
const png=await sharp({create:{width:12,height:8,channels:3,background:'#ff0000'}}).png().toBuffer()
const key='hero/71ab01bc-4160-40a9-80cb-7519f88e91ab.webp'
const target={bucket:'house-of-diams-hod',baseUrl:'https://content.houseofdiams.com'}
const config={bucket:'hod',maxBytes:1024*1024,rasterWidth:6,preserveAspectRatio:true,allowSvg:true,buildPath:()=>key}
const awsEnv={ADMIN_IMAGE_PROVIDER:'aws',ADMIN_IMAGE_CONTENT_ROUTING_VERIFIED:'true',AWS_MEDIA_BUCKET:'house-of-diams',NEXT_PUBLIC_MEDIA_CDN_BASE_URL:'https://media.houseofdiams.com',AWS_CONTENT_BUCKET:target.bucket,AWS_CONTENT_CDN_BASE_URL:target.baseUrl}
Object.assign(process.env,awsEnv)
globalThis.fetch=async()=>{throw Error('Network forbidden in offline C1 tests')}
async function request(file=new File([png],'image.png',{type:'image/png'}),fields={},headers={}){
 const form=new FormData();form.set('file',file);for(const [k,v]of Object.entries(fields))form.set(k,v)
 const encoded=new Response(form),body=await encoded.arrayBuffer()
 return new Request('https://admin.example/api/cms/uploads/hero',{method:'POST',headers:{'content-type':encoded.headers.get('content-type'),'content-length':String(body.byteLength),'origin':'https://admin.example','x-admin-csrf':'real-test-csrf',...headers},body})
}
function reset(){legacyS3=false;calls.length=0;legacyCalls=0;authFailure=null;storeFailure=false;Object.assign(process.env,awsEnv)}
test('server image mode remains legacy by default, independent from all data/public flags',()=>{
 assert.equal(provider.readImageProvider({}),'legacy');assert.equal(provider.readImageProvider({ADMIN_IMAGE_PROVIDER:''}),'legacy');assert.equal(provider.readImageProvider({ADMIN_IMAGE_PROVIDER:'legacy'}),'legacy');assert.equal(provider.readImageProvider({ADMIN_IMAGE_PROVIDER:'aws'}),'aws');assert.equal(provider.readImageProvider({ADMIN_PRODUCT_DATA_PROVIDER:'rds',NEXT_PUBLIC_ADMIN_IMAGE_PROVIDER:'aws'}),'legacy')
 for(const value of ['s3','AWS',' aws ','supabase','unknown'])assert.throws(()=>provider.readImageProvider({ADMIN_IMAGE_PROVIDER:value}))
})
test('exact product/content targets require independent explicit configuration and content routing review',()=>{
 assert.deepEqual(provider.imageTarget('product',awsEnv),{bucket:'house-of-diams',baseUrl:'https://media.houseofdiams.com'});assert.deepEqual(provider.imageTarget('content',awsEnv),target)
 for(const patch of [{AWS_CONTENT_BUCKET:'house-of-diams'},{AWS_CONTENT_CDN_BASE_URL:'https://media.houseofdiams.com'},{ADMIN_IMAGE_CONTENT_ROUTING_VERIFIED:undefined},{AWS_MEDIA_BUCKET:undefined}])assert.throws(()=>provider.imageTarget(patch.AWS_MEDIA_BUCKET===undefined&&Object.hasOwn(patch,'AWS_MEDIA_BUCKET')?'product':'content',{...awsEnv,...patch}))
})
test('actual SDK commands bind exact target/key/bytes/checksum/conditional write and enabled Head verification',async()=>{
 const sent=[],body=Buffer.from('image bytes'),checksum=createHash('sha256').update(body).digest('base64')
 const upload=storage.createMediaUploader(async command=>{sent.push(command);return command.constructor.name==='HeadObjectCommand'?{ContentLength:body.length,ContentType:'image/webp',ChecksumSHA256:checksum}:{}})
 assert.deepEqual(await upload(key,body,'image/webp',target),{path:key,url:target.baseUrl+'/'+key})
 assert.equal(sent[0].constructor.name,'PutObjectCommand');assert.deepEqual(sent[0].input,{Bucket:target.bucket,Key:key,Body:body,ContentType:'image/webp',CacheControl:'public, max-age=86400',ChecksumSHA256:checksum,IfNoneMatch:'*'})
 assert.deepEqual(sent[1].input,{Bucket:target.bucket,Key:key,ChecksumMode:'ENABLED'})
})
for(const [name,patch]of [['size',{ContentLength:999}],['checksum',{ChecksumSHA256:'wrong'}],['missing checksum',{ChecksumSHA256:undefined}],['type',{ContentType:'image/png'}]])test('Head '+name+' mismatch never returns success',async()=>{
 const body=Buffer.from('image'),good={ContentLength:body.length,ContentType:'image/webp',ChecksumSHA256:createHash('sha256').update(body).digest('base64')}
 await assert.rejects(storage.createMediaUploader(async c=>c.constructor.name==='HeadObjectCommand'?{...good,...patch}:{})(key,body,'image/webp',target))
})
test('conditional collision/Put failure performs no Head, retry, overwrite or cleanup',async()=>{
 const sent=[];await assert.rejects(storage.createMediaUploader(async c=>{sent.push(c);throw Object.assign(Error('collision'),{name:'PreconditionFailed'})})(key,Buffer.from('x'),'image/webp',target));assert.equal(sent.length,1);assert.equal(sent[0].input.IfNoneMatch,'*')
})
test('selected object key/MIME/empty validation fails before sending any command',async()=>{
 let count=0;const upload=storage.createMediaUploader(async()=>{count++;return {}})
 for(const k of ['../'+key,'/'+key,'hero//'+key,'hero/known.webp',key+'?signature=x','hero/%2e%2e/x.webp','x'.repeat(513)+'/'+key])await assert.rejects(upload(k,Buffer.from('x'),'image/webp',target))
 await assert.rejects(upload(key,Buffer.alloc(0),'image/webp',target));await assert.rejects(upload(key,Buffer.from('x'),'video/mp4',target));assert.equal(count,0)
})
test('strict SVG accepts basic shapes, safe fragment use/gradient and rejects executable/XML/reference bypasses',()=>{
 for(const svg of ['<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1"/></svg>','<svg><defs><linearGradient id="a"><stop offset="1"/></linearGradient></defs><rect fill="url(#a)"/><use href="#a"/></svg>'])assert.equal(validation.validateAwsSvg(Buffer.from(svg)),true,svg)
 for(const svg of ['<svg><script>alert(1)</script></svg>','<svg onload="x"/>','<svg><use href=javascript:alert(1) /></svg>','<svg><use href="&#106;avascript:alert(1)"/></svg>','<svg><foreignObject/></svg>','<!DOCTYPE svg><svg/>','<svg><image href="https://evil/x"/></svg>','<svg><rect style="fill:red"/></svg>','<svg><use href="//evil"/></svg>','<svg><g></svg>','<svg/><svg/>','<svg><path fill="url(https://evil)"/></svg>','<svg><path d="x" d="y"/></svg>'])assert.equal(validation.validateAwsSvg(Buffer.from(svg)),false,svg)
})
test('selected handler uses B1 mutation authorization before validation/storage and no Supabase mirror',async()=>{
 reset();const response=await route.handleImageUpload(await request(),config);assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{provider:'s3',path:target.baseUrl+'/'+key,url:target.baseUrl+'/'+key});assert.equal(legacyCalls,0);assert.deepEqual(calls[0],['auth',true]);assert.deepEqual(calls[1][4],target)
 const output=calls[1][2];assert.deepEqual(output,await sharp(png,{failOn:'warning',limitInputPixels:40_000_000}).rotate().resize({width:6,fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer())
})
for(const status of [401,403,503])test('actual route authorization '+status+' denies before parsing/storage, with safe errors',async()=>{
 reset();authFailure=new ProductSessionError(status);const response=await route.handleImageUpload(await request(),config);assert.equal(response.status,status);assert.equal(calls.length,1);assert.equal(legacyCalls,0);assert.ok(!(await response.text()).includes(actor.subject))
})
test('unknown mode and missing selected target fail closed without legacy auth/storage',async()=>{
 reset();process.env.ADMIN_IMAGE_PROVIDER='unknown';assert.equal((await route.handleImageUpload(await request(),config)).status,503);assert.equal(calls.length,0);assert.equal(legacyCalls,0)
 reset();delete process.env.AWS_CONTENT_BUCKET;assert.equal((await route.handleImageUpload(await request(),config)).status,503);assert.equal(calls.filter(c=>c[0]==='upload').length,0);assert.equal(legacyCalls,0)
})
test('selected write/verification failure gives generic 500 and never calls legacy/fallback',async()=>{
 reset();storeFailure=true;const response=await route.handleImageUpload(await request(),config);assert.equal(response.status,500);assert.equal(legacyCalls,0);assert.equal(calls.filter(c=>c[0]==='upload').length,1);assert.ok(!(await response.text()).includes('PRIVATE'))
})
test('legacy default still authenticates and stores using its existing response shape',async()=>{
 reset();delete process.env.ADMIN_IMAGE_PROVIDER;const response=await route.handleImageUpload(await request(),config);assert.equal(response.status,201);assert.deepEqual(await response.json(),{path:key,url:'https://legacy.example/'+key});assert.equal(legacyCalls,1);assert.equal(calls.length,0)
})
for(const [name,file,headers,status]of [
 ['missing length',new File([png],'a',{type:'image/png'}),{'content-length':''},411],
 ['oversize body header',new File([png],'a',{type:'image/png'}),{'content-length':String(3*1024*1024)},413],
 ['wrong MIME',new File([png],'a',{type:'image/jpeg'}),{},400],
 ['unsupported MIME',new File([png],'a',{type:'application/octet-stream'}),{},400],
 ['empty file',new File([],'a',{type:'image/png'}),{},400],
 ['unsafe SVG',new File(['<svg onload="x"/>'],'a',{type:'image/svg+xml'}),{},400],
 ['corrupt raster',new File(['bogus'],'a',{type:'image/png'}),{},400],
 ['file bytes',new File([Buffer.alloc(1024*1024+1)],'a',{type:'image/png'}),{},413],
])test('actual upload rejects '+name+' before storage',async()=>{reset();const response=await route.handleImageUpload(await request(file,{},headers),config);assert.equal(response.status,status);assert.equal(calls.filter(c=>c[0]==='upload').length,0)})
test('stream bounds cannot be bypassed with a false Content-Length',async()=>{
 const raw=await request(new File([Buffer.alloc(3*1024*1024)],'x',{type:'image/png'}),{},{'content-length':'20'})
 reset();assert.equal((await route.handleImageUpload(raw,config)).status,413);assert.equal(calls.filter(c=>c[0]==='upload').length,0)
})
test('real Sharp preserves EXIF orientation, cover dimensions and the 40M input pixel ceiling',async()=>{
 reset();const jpeg=await sharp({create:{width:12,height:8,channels:3,background:'#fff'}}).jpeg().withMetadata({orientation:6}).toBuffer()
 assert.equal((await route.handleImageUpload(await request(new File([jpeg],'a',{type:'image/jpeg'})),{...config,rasterWidth:2200})).status,201)
 assert.deepEqual([(await sharp(calls[1][2]).metadata()).width,(await sharp(calls[1][2]).metadata()).height],[8,12])
 reset();assert.equal((await route.handleImageUpload(await request(),{...config,rasterWidth:4,rasterHeight:5,rasterFit:'cover'})).status,201);const m=await sharp(calls[1][2]).metadata();assert.deepEqual([m.width,m.height],[4,5])
 const huge=await sharp({create:{width:6401,height:6401,channels:3,background:'#fff'}}).png().toBuffer();reset();assert.equal((await route.handleImageUpload(await request(new File([huge],'large',{type:'image/png'})),config)).status,400);assert.equal(calls.filter(c=>c[0]==='upload').length,0)
})
test('mixed routes bind folder/kind, use product vs content target, and reject legacy-image bypass',async()=>{
 reset();assert.equal(await mixed.selectedMixedImage(await request(),'product'),null)
 const response=await mixed.selectedMixedImage(await request(undefined,{kind:'image',folder:'hiphop'},{'x-admin-image-upload':'1'}),'product');assert.equal(response.status,201);assert.equal(calls[1][4].bucket,'house-of-diams');assert.match(calls[1][1],/^hiphop\/images\/[0-9a-f-]+\.webp$/)
 reset();assert.equal((await mixed.selectedMixedImage(await request(undefined,{kind:'video',folder:'products'},{'x-admin-image-upload':'1'}),'product')).status,400);assert.equal(calls.filter(c=>c[0]==='upload').length,0);assert.equal(mixed.denyLegacyImageInAwsMode().status,409)
 reset();const about=await mixed.selectedMixedImage(await request(undefined,{kind:'poster'},{'x-admin-image-upload':'1'}),'about');assert.equal(about.status,200);assert.equal(calls[1][4].bucket,target.bucket);assert.match(calls[1][1],/^about\/hero\/poster\//)
 process.env.ADMIN_IMAGE_PROVIDER='legacy';assert.equal(await mixed.selectedMixedImage(await request(),'about'),null);assert.equal(mixed.denyLegacyImageInAwsMode(),null)
})
test('AWS direct image signing explicitly denies after authorization and never issues tokens',async()=>{
 reset();const response=await route.denyAwsImageSigning(await request());assert.equal(response.status,503);assert.deepEqual(calls,[['auth',true]]);assert.equal(legacyCalls,0)
})
test('canonical/legacy preview resolver preserves origins, query strings, blobs and rejects traversal/schemes',()=>{
 for(const value of ['https://content.houseofdiams.com/hero/a.webp','https://media.houseofdiams.com/products/a.webp','https://old.supabase.co/storage/v1/object/public/hod/x.svg?v=1','https://r2.example/old.webp?cache=1','https://external.example/x.png','/images/local.png','blob:https://admin.example/id'])assert.equal(reference.resolveImageReference(value,'https://legacy.example/hod'),value)
 assert.equal(reference.resolveImageReference('hero/old.webp?x=1','https://legacy.example/hod'),'https://legacy.example/hod/hero/old.webp?x=1')
 for(const value of ['../x','hero/%2e%2e/x','//evil/x','javascript:alert(1)','data:text/html,<script>','https://user:password@host/x','hero\\x'])assert.equal(reference.resolveImageReference(value,'https://legacy.example'),null)
})
async function withFetch(run,fn){const original=globalThis.fetch;globalThis.fetch=run;try{return await fn()}finally{globalThis.fetch=original}}
test('client selected AWS protocol uses same-origin session CSRF, original file/fields, canonical URL and no signing/bearer',async()=>{
 const sent=[];const result=await withFetch(async(url,init)=>{sent.push([url,init]);if(url==='/api/images/provider')return Response.json({provider:'aws'});if(url==='/api/auth/session')return Response.json({authenticated:true,csrfToken:'csrf'});return Response.json({provider:'s3',path:target.baseUrl+'/'+key,url:target.baseUrl+'/'+key},{status:201})},()=>client.tryUploadAwsImage(new File([png],'a',{type:'image/png'}),'/api/cms/uploads/hero',{kind:'image'}))
 assert.equal(result,target.baseUrl+'/'+key);assert.deepEqual(sent.map(s=>s[0]),['/api/images/provider','/api/auth/session','/api/cms/uploads/hero']);assert.equal(sent[2][1].credentials,'same-origin');assert.equal(sent[2][1].headers['x-admin-csrf'],'csrf');assert.equal(sent[2][1].headers.authorization,undefined);assert.equal(sent[2][1].body.get('kind'),'image')
})
for(const mode of ['unknown','failed-session','failed-upload','invalid-canonical'])test('client '+mode+' fails without fallback or Supabase import',async()=>{
 const sent=[];await assert.rejects(withFetch(async(url)=>{sent.push(url);if(url==='/api/images/provider')return Response.json({provider:mode==='unknown'?'unknown':'aws'});if(url==='/api/auth/session')return Response.json(mode==='failed-session'?{}:{authenticated:true,csrfToken:'csrf'});if(mode==='invalid-canonical')return Response.json({provider:'s3',path:'https://evil.example/x',url:'https://evil.example/x'});return Response.json({error:'Upload failed'},{status:500})},()=>cmsClient.uploadCmsAssetDirectWithFallback({file:new File([png],'a',{type:'image/png'}),signEndpoint:'/api/cms/uploads/hero/sign',fallbackEndpoint:'/api/cms/uploads/hero'})))
 assert.ok(!sent.some(s=>s.endsWith('/sign')));assert.ok(sent.length<=3)
})
test('client default explicitly yields legacy and rejects external/traversal endpoint before fetch',async()=>{
 await withFetch(async()=>Response.json({provider:'legacy'}),async()=>{assert.equal(await client.tryUploadAwsImage(new File([png],'a'),'/api/cms/uploads/hero'),null)})
 await assert.rejects(client.tryUploadAwsImage(new File([png],'a'),'https://evil.example/api/cms/uploads/hero'));await assert.rejects(client.tryUploadAwsImage(new File([png],'a'),'/api/cms/uploads/../hero'))
})
// Additional route-family contracts execute real route source with the same injected auth/S3 adapters.
const cmsCases=[['hero','hero',30,6400,true],['about-wide-banner','about/wide-banner',8,2400],['bespoke-hero','bespoke-hero',5,2200,true],['bespoke-process','bespoke-process',5,1400,true],['bespoke-showcase','bespoke-showcase',30,6400,true],['blog','blogs',5,2200,true],['certifications','certifications',5,800,true],['checkout-result','checkout-result',8,2200],['collection','collection',30,1600,true],['collection-page','collection-page',30,6400,true],['contact','contact',1,512,true,true],['couples','couples',5,1600,true],['discover-rings','home/discover-rings',5,1600],['discover-shapes','home/discover-shapes',5,1600],['education','education',5,2200,true],['faq-category','support/faq-categories',5,1200,true],['hiphop-hero','hiphop-hero',5,2200,true],['hiphop-showcase','hiphop-showcase',5,2200,true],['home-bestsellers','home/bestsellers',5,2200,true],['promotion-popup','promotion-popup',5,1600,true],['service-banner','service-banner',8,1800],['summary-icon','summary-icons',2,512,true]]
for(const [name,prefix,max,width,allowSvg,svgOnly]of cmsCases)test('actual CMS '+name+' route preserves target/prefix/size/format contract',async()=>{
 reset();const {exports:handler}=await load('app/api/cms/uploads/'+name+'/route.ts');const source=fs.readFileSync(path.join(root,'app/api/cms/uploads/'+name+'/route.ts'),'utf8');assert.ok(source.includes('maxBytes: '+max+' * 1024 * 1024'));assert.ok(source.includes('width: '+width));assert.equal(source.includes('allowSvg: true'),!!allowSvg)
 const svg=new File(['<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1"/></svg>'],'icon.svg',{type:'image/svg+xml'})
 const response=await handler.POST(await request(svgOnly?svg:undefined));assert.equal(response.status,201);assert.equal(calls[1][4].bucket,target.bucket);assert.match(calls[1][1],new RegExp('^'+prefix+'/[0-9a-f-]+\\.'+(svgOnly?'svg':'webp')+'$'));assert.equal(legacyCalls,0)
 reset();const denied=await handler.POST(await request(new File([Buffer.alloc(max*1024*1024+1)],'large',{type:'image/png'})));assert.equal(denied.status,413);assert.equal(calls.filter(c=>c[0]==='upload').length,0)
})
for(const [name,fields,svgOnly,prefix]of [
 ['app/api/catalog/categories/upload/route.ts',{slug:'Fine Rings',variant:'mobile'},false,'category-banners/fine-rings/mobile-'],
 ['app/api/catalog/subcategories/upload/route.ts',{},false,'catalog/subcategories/'],['app/api/catalog/options/upload/route.ts',{},false,'catalog/options/'],['app/api/catalog/styles/upload/route.ts',{},true,'catalog/styles/'],['app/api/catalog/stone-shapes/upload/route.ts',{},true,'catalog/stone-shapes/'],['app/api/navbar/section-icon/route.ts',{},true,'navbar/sections/'],['app/api/navbar/featured-image/route.ts',{},false,'navbar/featured/'],['app/api/cms/uploads/values/route.ts',{kind:'image'},false,'values/images/']
])test('actual '+name+' image branch retains validation/key/target contract',async()=>{
 reset();const {exports:handler}=await load(name);const file=svgOnly?new File(['<svg><path d="M0 0"/></svg>'],'x',{type:'image/svg+xml'}):undefined;const response=await handler.POST(await request(file,fields));assert.equal(response.status,201);assert.ok(calls[1][1].startsWith(prefix));assert.equal(calls[1][4].bucket,target.bucket);assert.equal(legacyCalls,0)
})
test('actual category and values forms reject missing/hostile selectors, invalid variants and oversized icons',async()=>{
 const category=(await load('app/api/catalog/categories/upload/route.ts')).exports,values=(await load('app/api/cms/uploads/values/route.ts')).exports
 for(const fields of [{},{slug:'../',variant:'desktop'},{slug:'ok',variant:'tablet'},{slug:'x'.repeat(121),variant:'desktop'}]){reset();assert.equal((await category.POST(await request(undefined,fields))).status,400);assert.equal(calls.filter(c=>c[0]==='upload').length,0)}
 reset();assert.equal((await values.POST(await request(undefined,{kind:'icon'}))).status,400)
 reset();const icon=new File(['<svg>'+ ' '.repeat(512*1024)+'</svg>'],'icon',{type:'image/svg+xml'});assert.equal((await values.POST(await request(icon,{kind:'icon'}))).status,400);assert.equal(calls.filter(c=>c[0]==='upload').length,0)
})
test('selected client upload activity is ended on failure and legacy does not enter AWS activity',async()=>{
 const activity=[];const hooks={start:()=>activity.push('start'),finish:ok=>activity.push(ok)}
 await assert.rejects(withFetch(async url=>url==='/api/images/provider'?Response.json({provider:'aws'}):Response.json({},{status:401}),()=>client.tryUploadAwsImage(new File([png],'a'),'/api/cms/uploads/hero',{},hooks)));assert.deepEqual(activity,['start',false])
 activity.length=0;await withFetch(async()=>Response.json({provider:'legacy'}),()=>client.tryUploadAwsImage(new File([png],'a'),'/api/cms/uploads/hero',{},hooks));assert.deepEqual(activity,[])
})
test('legacy configured S3 still writes and mirrors, rather than being forced back to Supabase',async()=>{
 reset();process.env.ADMIN_IMAGE_PROVIDER='legacy';legacyS3=true;const response=await route.handleImageUpload(await request(),config);assert.equal(response.status,201);assert.deepEqual(await response.json(),{provider:'s3',path:key,url:'https://media.houseofdiams.com/'+key});assert.equal(legacyCalls,1);assert.equal(calls.filter(c=>c[0]==='upload').length,1)
})
test('actual mixed product/about/bespoke routes independently use AWS images and leave unmarked video on legacy auth',async()=>{
 for(const [file,fields,prefix]of [['app/api/products/media/route.ts',{kind:'image',folder:'products'},'products/images/'],['app/api/bespoke/media/route.ts',{kind:'image'},'bespoke/images/'],['app/api/cms/uploads/about-hero/route.ts',{kind:'poster'},'about/hero/poster/']]){
  const handler=(await load(file)).exports;reset();const image=await handler.POST(await request(undefined,fields,{'x-admin-image-upload':'1'}));assert.equal(image.status,file.includes('about-hero')?200:201);assert.equal(legacyCalls,0);assert.ok(calls[1][1].startsWith(prefix))
  reset();const bypass=await handler.POST(await request(undefined,fields));assert.equal(bypass.status,409);assert.equal(calls.filter(c=>c[0]==='upload').length,0)
 }
 const mp4=new File([Buffer.from([0,0,0,12,0x66,0x74,0x79,0x70,0,0,0,0])],'video.mp4',{type:'video/mp4'})
 reset();const products=(await load('app/api/products/media/route.ts')).exports;const video=await products.POST(await request(mp4,{kind:'video',folder:'products'}));assert.equal(video.status,201);assert.equal((await video.json()).provider,'r2');assert.equal(legacyCalls,1);assert.equal(calls.length,0);assert.equal(fixture.videoInvalidated,true)
 reset();const about=(await load('app/api/cms/uploads/about-hero/route.ts')).exports;const aboutVideo=await about.POST(await request(mp4,{kind:'video'}));assert.equal(aboutVideo.status,200);assert.equal(legacyCalls,1);assert.equal(calls.length,0)
})
test('all actual image sign routes explicitly deny AWS before legacy token/provider code',async()=>{
 const signFiles=fs.readdirSync(path.join(root,'app/api/cms/uploads')).filter(name=>fs.existsSync(path.join(root,'app/api/cms/uploads',name,'sign/route.ts'))).map(name=>'app/api/cms/uploads/'+name+'/sign/route.ts').concat('app/api/products/media/sign/route.ts')
 for(const file of signFiles){reset();const handler=(await load(file)).exports;const response=await handler.POST(await request());assert.equal(response.status,503,file);assert.equal(legacyCalls,0,file);assert.deepEqual(calls,[['auth',true]],file);assert.ok(!(await response.text()).includes('token'))}
})
test('canonical AWS protocol rejects signed URLs, credentials and suffix-host confusion',()=>{
 assert.equal(reference.isCanonicalAwsImageReference(target.baseUrl+'/'+key),true)
 for(const value of [target.baseUrl+'/'+key+'?X-Amz-Signature=x',target.baseUrl+'/'+key+'#x','https://content.houseofdiams.com.evil.example/'+key,'https://x@content.houseofdiams.com/'+key,'https://content.houseofdiams.com:444/'+key])assert.equal(reference.isCanonicalAwsImageReference(value),false)
})
test('image authorization composes actual B1 session/origin/CSRF and enabled internal mapping; bearer/body actor cannot substitute',async()=>{
 const {createSessions}=(await load('lib/auth/session.ts')).exports
 const {SESSION_COOKIE}=(await load('lib/auth/request-security.ts')).exports
 const seconds=1800000000,rows=new Map();let version=0,enabled=true
 const copy=x=>structuredClone(x),store={async create(k,d){if(rows.has(k))return false;rows.set(k,{version:String(++version),data:copy(d)});return true},async get(k){return rows.has(k)?copy(rows.get(k)):null},async consume(k,v){const x=rows.get(k);if(!x||x.version!==v)return null;rows.delete(k);return copy(x.data)},async replace(k,v,d){const x=rows.get(k);if(!x||x.version!==v)return false;rows.set(k,{version:String(++version),data:copy(d)});return true},async delete(k){rows.delete(k)}}
 const config={origin:'https://admin.example',issuer:actor.issuer,clientId:'hod-admin',requiredClientRole:'hod-admin',sessionIdleSeconds:600,sessionMaxSeconds:3600,revalidateSeconds:60}
 const claims={issuer:actor.issuer,subject:actor.subject,clientId:'hod-admin',audiences:['hod-admin'],clientRoles:['hod-admin'],expiresAt:seconds+300}
 const sessions=createSessions({config,store,oidc:{async validate(){return claims}},lookup:async()=>[{...actor,enabled,revokedAt:null,profileRole:'admin'}],now:()=>seconds*1000})
 const issued=await sessions.establish({accessToken:'injected-validated-access',idToken:'injected-validated-id',refreshToken:'offline-refresh'},'offline-nonce')
 const original=fixture.authorize;fixture.authorize=async(req,mutation)=>{calls.push(['auth',mutation]);try{return await sessions.authorize(req,mutation)}catch(error){throw new ProductSessionError(error.message==='Session missing'?401:403)}}
 const headers={cookie:SESSION_COOKIE+'='+issued.cookie,'x-admin-csrf':issued.session.csrf,origin:config.origin}
 try{
  reset();let response=await route.handleImageUpload(await request(undefined,{actor:'browser-controlled',profileId:'browser-controlled'},headers),configImage());assert.equal(response.status,201);assert.equal(legacyCalls,0)
  for(const patch of [{'x-admin-csrf':'wrong'},{origin:'https://evil.example'},{cookie:'',authorization:'Bearer browser-supabase-token'}]){reset();response=await route.handleImageUpload(await request(undefined,{}, {...headers,...patch}),configImage());assert.equal(response.status,patch.cookie===''?401:403);assert.equal(calls.filter(c=>c[0]==='upload').length,0);assert.equal(legacyCalls,0)}
  enabled=false;reset();response=await route.handleImageUpload(await request(undefined,{},headers),configImage());assert.equal(response.status,403);assert.equal(calls.filter(c=>c[0]==='upload').length,0)
 }finally{fixture.authorize=original}
 function configImage(){return {bucket:'hod',maxBytes:1024*1024,rasterWidth:6,preserveAspectRatio:true,buildPath:()=>key}}
})
test('owned image clients have no eager Supabase import; actual selected upload functions return before legacy token/storage use',async()=>{
 const manifest=fs.readFileSync(path.join(root,'docs/aws-phase-c/C1-source-hashes.csv'),'utf8').trim().split(/\r?\n/).slice(1).map(x=>x.split(',')[0]);
 for(const file of manifest.filter(f=>f.endsWith('.tsx')||f==='lib/couples-cms.ts')){
  const sf=ts.createSourceFile(file,fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true)
  for(const statement of sf.statements)if(ts.isImportDeclaration(statement))assert.notEqual(statement.moduleSpecifier.text,'@/lib/supabase',file)
 }
 const cases=[['components/product-form.tsx','uploadMedia',[new File([png],'a',{type:'image/png'}),'image','products'],{path:target.baseUrl+'/'+key,provider:'s3'}],['components/blog-editor-page.tsx','uploadBlogMedia',[new File([png],'a',{type:'image/png'})],target.baseUrl+'/'+key],['components/education-editor-page.tsx','uploadEducationMedia',[new File([png],'a',{type:'image/png'})],target.baseUrl+'/'+key],['components/navbar-builder-editor.tsx','uploadFeaturedImage',[new File([png],'a',{type:'image/png'})],target.baseUrl+'/'+key],['app/dashboard/catalog/[slug]/page-client.tsx','uploadCategoryBanner',[new File([png],'a',{type:'image/png'}),'slug','desktop'],target.baseUrl+'/'+key]]
 for(const [file,name,args,expected]of cases){const sf=ts.createSourceFile(file,fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true);let selected
  function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(sf)===name&&n.initializer&&ts.isArrowFunction(n.initializer))selected=n.initializer;if(ts.isFunctionDeclaration(n)&&n.name?.text===name)selected=n;ts.forEachChild(n,visit)}visit(sf);assert.ok(selected,name)
  const js=ts.transpileModule('const selected = ('+selected.getText(sf)+');',{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  let uploaded=0;const fn=Function('tryUploadAwsImage',js+'\nreturn selected')(async()=>{uploaded++;return target.baseUrl+'/'+key});assert.deepEqual(await fn(...args),expected);assert.equal(uploaded,1)
 }
})

test('stored relative media keys resolve against the AWS media CDN (never the page origin or Supabase)',()=>{
 // Regression: a key such as catalog/styles/x.svg used to resolve relative to /dashboard/catalog/ and 404 in the admin.
 assert.equal(reference.resolveStoredImage('catalog/styles/x.svg'),'https://media.houseofdiams.com/catalog/styles/x.svg')
 assert.equal(reference.resolveStoredImage('/images/local.png'),'/images/local.png')
 assert.equal(reference.resolveStoredImage('https://content.houseofdiams.com/hero/a.webp'),'https://content.houseofdiams.com/hero/a.webp')
 assert.equal(reference.resolveStoredImage('../x'),null)
 assert.equal(reference.resolveStoredImage(''),null)
})
