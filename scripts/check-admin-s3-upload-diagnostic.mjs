// Explicitly authorized diagnostic: fresh UUID objects only; no DB/provider/policy changes.
// Tiny container-header fixture tests transport, not playable media or application login.
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {randomUUID,createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {S3Client,PutObjectCommand,HeadObjectCommand,GetObjectCommand,DeleteObjectCommand,ListObjectsV2Command} from '@aws-sdk/client-s3'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
import {mediaSources} from './admin-media-schema-sql.mjs'

const imageMode=process.argv[2]==='--fresh-image-probe'
if(!imageMode&&process.argv[2]!=='--fresh-object-probe'){console.log('{"ok":false,"code":"EXPLICIT_MODE_REQUIRED"}');process.exit(1)}
const require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const file=imageMode?'docs/aws-phase-d/ADMIN-AWS-image-routing-diagnostic.json':'docs/aws-phase-d/ADMIN-RDS-14-s3-upload-diagnostic.json'
const report={date:'2026-10-18',fixture_type:imageMode?'one-pixel WebP':'MP4 container header',scope:'Actual backend AWS SDK credential chain; synthetic transport fixture, not enabled app publication or hosted runtime acceptance',
 identity:null,credential_chain_verified:false,sources:[],providers_changed:false,database_changed:false,policies_changed:false,server_started:false}
const safeError=e=>({ok:false,code:/^[A-Za-z][A-Za-z0-9_]{0,90}$/.test(e?.name??'')?e.name:'DIAGNOSTIC_FAILURE',
 http_status:e?.$metadata?.httpStatusCode??null,request_id:e?.$metadata?.requestId??null,
 reason:/no identity-based policy allows/i.test(e?.message??'')?'NO_IDENTITY_BASED_ALLOW':/explicit deny in an identity-based policy/i.test(e?.message??'')?'EXPLICIT_IDENTITY_DENY':/explicit deny in a resource-based policy/i.test(e?.message??'')?'EXPLICIT_RESOURCE_DENY':/no resource-based policy allows/i.test(e?.message??'')?'NO_RESOURCE_BASED_ALLOW':null})
function save(){fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n')}
async function identity(credentials){
 return new Promise(resolve=>{
  const child=spawn('aws',['sts','get-caller-identity','--region','us-east-1','--output','json','--no-cli-pager'],{windowsHide:true,
   env:{...process.env,AWS_ACCESS_KEY_ID:credentials.accessKeyId,AWS_SECRET_ACCESS_KEY:credentials.secretAccessKey,
    AWS_SESSION_TOKEN:credentials.sessionToken??'',AWS_EC2_METADATA_DISABLED:'true',AWS_MAX_ATTEMPTS:'1'},stdio:['ignore','pipe','pipe']})
  let output='',done=false;const timer=setTimeout(()=>{child.kill();finish({ok:false,code:'IDENTITY_TIMEOUT'})},20000)
  function finish(value){if(!done){done=true;clearTimeout(timer);resolve(value)}}
  child.stdout.on('data',data=>{if(output.length<20000)output+=data.toString()})
  child.stderr.on('data',()=>{})
  child.on('error',()=>finish({ok:false,code:'IDENTITY_CLI_UNAVAILABLE'}))
  child.on('close',code=>{try{if(code!==0)throw Error();const parsed=JSON.parse(output);finish({ok:true,account:parsed.Account,arn:parsed.Arn})}catch{finish({ok:false,code:'IDENTITY_NOT_VERIFIED'})}})
 })
}
let client,initial
try{
 if(process.env.AWS_REGION&&process.env.AWS_REGION!=='us-east-1')throw Object.assign(Error(),{name:'UnexpectedRegion'})
 // Resolve the same region/default credential chain used by lib/video-storage.ts.
 initial=new S3Client({region:process.env.AWS_REGION||'us-east-1',maxAttempts:1})
 const credentials=await initial.config.credentials()
 report.credential_chain_verified=true
 report.identity=await identity(credentials)
 save()
 if(!report.identity.ok)throw Object.assign(Error(),{name:'IdentityNotVerified'})
 client=new S3Client({region:'us-east-1',credentials,maxAttempts:1})
 const load=createSourceLoader(process.cwd())
 const {createVideoStorage}=await import(await load('lib/video-storage.ts'))
 const body=imageMode?await (await import('sharp')).default({create:{width:1,height:1,channels:3,background:'#ffffff'}}).webp().toBuffer()
  :Buffer.from([0,0,0,24,0x66,0x74,0x79,0x70,0x69,0x73,0x6f,0x6d,0,0,0,0,0x69,0x73,0x6f,0x6d,0x6d,0x70,0x34,0x32])
 const mime=imageMode?'image/webp':'video/mp4'
 const sources=imageMode?[
  {bucket:'house-of-diams',baseUrl:'https://media.houseofdiams.com',prefix:'products/images/'},
  {bucket:'house-of-diams-hod',baseUrl:'https://content.houseofdiams.com',prefix:'about/hero/image/'}]:mediaSources
 const mediaUploader=imageMode?(await import(await load('lib/s3-media.ts'))).createMediaUploader:null
 const checksum=createHash('sha256').update(body).digest('base64')
 for(const source of sources){
  const id=randomUUID(),key=source.prefix+id+(imageMode?'.webp':'.mp4')
  const row={bucket:source.bucket,prefix:source.prefix,key,fixture_bytes:body.length,fixture_sha256:checksum,operations:[],object_created:false,cleanup:null}
  report.sources.push(row);save()
  let putResult
  async function send(command){
   const op={operation:command.constructor.name,if_none_match:command.input.IfNoneMatch??null}
   row.operations.push(op)
   try{const result=await client.send(command,{abortSignal:AbortSignal.timeout(20000)});Object.assign(op,{ok:true,http_status:result.$metadata?.httpStatusCode,request_id:result.$metadata?.requestId})
    if(command instanceof PutObjectCommand){putResult=result;row.object_created=true;row.version_id=result.VersionId??null;save()}
    return result
   }catch(error){Object.assign(op,safeError(error));throw error}finally{save()}
  }
  try{
   const result=mediaUploader?await mediaUploader(send)(key,body,mime,source,true):await createVideoStorage(send).upload(source,body,mime,id)
   row.actual_repository_upload_verified=(result.key??result.path)===key
   const object=await send(new GetObjectCommand({Bucket:source.bucket,Key:key,ChecksumMode:'ENABLED'}))
   const read=Buffer.from(await object.Body.transformToByteArray())
   row.s3_bytes_verified=read.equals(body)&&object.ContentType===mime&&object.ChecksumSHA256===checksum
   // Repeating the *same* conditional create may only be rejected; never omit the header.
   try{await send(new PutObjectCommand({Bucket:source.bucket,Key:key,Body:body,ContentType:mime,ContentLength:body.length,ChecksumSHA256:checksum,IfNoneMatch:'*'}));row.conditional_retry_rejected=false}
   catch(error){row.conditional_retry_rejected=error.name==='PreconditionFailed'&&error.$metadata?.httpStatusCode===412}
   try{await send(new ListObjectsV2Command({Bucket:source.bucket,Prefix:source.prefix,MaxKeys:1}));row.prefix_listing_verified=true}catch{row.prefix_listing_verified=false}
   try{
    const response=await fetch(result.url,{headers:{Range:'bytes=0-11'},signal:AbortSignal.timeout(20000),redirect:'error'})
    const bytes=Buffer.from(await response.arrayBuffer())
    row.cdn={status:response.status,content_type:response.headers.get('content-type'),content_range:response.headers.get('content-range'),
     range_verified:response.status===206&&bytes.equals(body.subarray(0,12))&&response.headers.get('content-type')===mime}
   }catch{row.cdn={ok:false,code:'CDN_NOT_VERIFIED'}}
  }catch(error){row.upload_path_error=safeError(error)}
  finally{
   if(row.object_created){
    // Delete only the exact newly created version (or conditional current object).
    // No guessed/legacy key cleanup, no extra IAM grants, no automatic policy changes.
    const input={Bucket:source.bucket,Key:key,...(putResult?.VersionId?{VersionId:putResult.VersionId}:{IfMatch:putResult?.ETag})}
    if(!input.VersionId&&!input.IfMatch)row.cleanup={ok:false,code:'NO_SAFE_CLEANUP_IDENTITY'}
    else try{
     await send(new DeleteObjectCommand(input))
     try{await send(new HeadObjectCommand({Bucket:source.bucket,Key:key,...(input.VersionId?{VersionId:input.VersionId}:{})}));row.cleanup={ok:false,code:'FIXTURE_STILL_PRESENT'}}
     catch(error){row.cleanup={ok:['NotFound','NoSuchKey','NoSuchVersion'].includes(error.name)&&error.$metadata?.httpStatusCode===404,code:error.name}}
    }catch(error){row.cleanup=safeError(error)}
   }else row.cleanup={ok:true,not_needed:true,scope:'No successful PutObject recorded; ambiguous transport failures require separate inspection'}
   save()
  }
 }
 report.completed=true
}catch(error){report.failure=safeError(error);report.completed=false;process.exitCode=1}
finally{client?.destroy();initial?.destroy();save()}
console.log(JSON.stringify({identity:report.identity,credential_chain_verified:report.credential_chain_verified,failure:report.failure??null,
 sources:report.sources.map(r=>({bucket:r.bucket,prefix:r.prefix,upload_verified:r.actual_repository_upload_verified??false,error:r.upload_path_error??null,
  conditional_retry_rejected:r.conditional_retry_rejected??false,cleanup:r.cleanup})),providers_changed:false,policies_changed:false,server_started:false}))
