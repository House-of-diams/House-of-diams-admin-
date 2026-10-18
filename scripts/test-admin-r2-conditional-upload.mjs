// Execute the real legacy helper with a fake command transport. No cloud calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64')
const before={...process.env}
const sent=[],clients=[]
let failure
globalThis.__r2Conditional={sent,clients,send(command){sent.push(command.input);if(failure)throw failure;return {}}}
Object.assign(process.env,{CLOUDFLARE_R2_ACCOUNT_ID:'offline-account',CLOUDFLARE_R2_ACCESS_KEY_ID:'offline-access',
 CLOUDFLARE_R2_SECRET_ACCESS_KEY:'offline-secret',CLOUDFLARE_R2_BUCKET:'offline-bucket',
 CLOUDFLARE_R2_PUBLIC_BASE_URL:'https://r2.example',CLOUDFLARE_R2_VIDEO_PREFIX:'products/videos',
 CLOUDFLARE_R2_BESPOKE_VIDEO_PREFIX:'bespoke/videos',ADMIN_AUTH_PROVIDER:'supabase',ADMIN_VIDEO_PROVIDER:'legacy'})
let code=ts.transpileModule(fs.readFileSync(path.join(root,'lib/r2.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
code=code.replace(/^import ['"]server-only['"];?\s*$/gm,'')
const sdk=data(`export class PutObjectCommand{constructor(input){this.input=input}};export class ListObjectsV2Command{};
 export class S3Client{constructor(config){globalThis.__r2Conditional.clients.push(config)}send(c){return globalThis.__r2Conditional.send(c)}}`)
const signing=data('export function getSignedUrl(){throw Error("Image signing must not run") }')
const provider=await createSourceLoader(root)('lib/video-provider.ts')
for(const [name,url] of [['@aws-sdk/client-s3',sdk],['@aws-sdk/s3-request-presigner',signing],['./video-provider',provider]])code=code.replaceAll("'"+name+"'",JSON.stringify(url)).replaceAll('"'+name+'"',JSON.stringify(url))
const helper=await import(data(code))
test.after(()=>{for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);delete globalThis.__r2Conditional})
const input={buffer:Buffer.from('offline-video-body'),extension:'mp4',folder:'products',contentType:'video/mp4'}
test('legacy video creates fresh UUID keys with a conditional Put and no copy/delete',async()=>{
 sent.length=0
 const first=await helper.uploadProductVideoToR2(input),second=await helper.uploadProductVideoToR2(input)
 assert.notEqual(first.key,second.key);assert.equal(sent.length,2)
 for(const command of sent){assert.equal(command.IfNoneMatch,'*');assert.equal(command.Bucket,'offline-bucket');assert.equal(command.ContentType,'video/mp4');assert.equal(command.Body,input.buffer);assert.match(command.Key,/^products\/videos\/[0-9a-f-]{36}\.mp4$/)}
 assert.equal(clients[0].endpoint,'https://offline-account.r2.cloudflarestorage.com')
})
test('conditional conflict propagates without an unconditional retry or URL success',async()=>{
 sent.length=0;failure=Object.assign(Error('PreconditionFailed'),{$metadata:{httpStatusCode:412}})
 try{await assert.rejects(helper.uploadProductVideoToR2(input),error=>error===failure);assert.equal(sent.length,1);assert.equal(sent[0].IfNoneMatch,'*')}finally{failure=undefined}
})
test('AWS selection prevents any legacy video storage call',async()=>{
 sent.length=0;process.env.ADMIN_VIDEO_PROVIDER='aws'
 try{await assert.rejects(helper.uploadProductVideoToR2(input),/Legacy video upload is disabled/);assert.equal(sent.length,0)}finally{process.env.ADMIN_VIDEO_PROVIDER='legacy'}
})
