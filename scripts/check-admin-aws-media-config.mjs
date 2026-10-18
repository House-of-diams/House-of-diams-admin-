// Read-only AWS CLI audit of the two known buckets. No object bytes, writes or listeners.
// Uses the current CLI identity; this is not proof of the deployed application's role.
import fs from 'node:fs'
import {spawn} from 'node:child_process'
const buckets=['house-of-diams','house-of-diams-hod']
async function aws(args){
 return new Promise(resolve=>{
  let stdout='',stderr='',finished=false
  const child=spawn('aws',[...args,'--region','us-east-1','--output','json','--no-cli-pager'],{
   windowsHide:true,env:{...process.env,AWS_MAX_ATTEMPTS:'1',AWS_EC2_METADATA_DISABLED:'true'},stdio:['ignore','pipe','pipe']})
  const timer=setTimeout(()=>{child.kill();done({ok:false,code:'TIMEOUT'})},25000)
  function done(result){if(!finished){finished=true;clearTimeout(timer);resolve(result)}}
  child.stdout.on('data',d=>{stdout+=d.toString();if(stdout.length>2_000_000){child.kill();done({ok:false,code:'OUTPUT_LIMIT'})}})
  child.stderr.on('data',d=>{if(stderr.length<10000)stderr+=d.toString()})
  child.on('error',()=>done({ok:false,code:'CLI_NOT_AVAILABLE'}))
  child.on('close',code=>{
   if(code!==0){const match=stderr.match(/\((AccessDenied|AccessDeniedException|NoSuchBucketPolicy|NoSuchLifecycleConfiguration|ReplicationConfigurationNotFoundError|ExpiredToken|InvalidAccessKeyId|NoSuchBucket|AllAccessDisabled)\)/)
    const fallback=/aws (?:sso )?login|session.{0,80}expir|expir.{0,80}session|invalid_grant/i.test(stderr)?'AWS_LOGIN_REQUIRED'
     :/unable to locate credentials/i.test(stderr)?'CREDENTIALS_UNAVAILABLE':'AWS_READ_NOT_VERIFIED'
    return done({ok:false,code:match?.[1]??fallback})}
   try{done({ok:true,data:JSON.parse(stdout||'{}')})}catch{done({ok:false,code:'INVALID_JSON'})}
  })
 })
}
function policySummary(data){
 const policy=JSON.parse(data.Policy)
 const statements=Array.isArray(policy.Statement)?policy.Statement:[policy.Statement]
 return {statement_count:statements.length,statements:statements.filter(Boolean).map(s=>({
  sid:s.Sid??null,effect:s.Effect,actions:s.Action??null,resources:s.Resource??null,all_principals:s.Principal==='*',
  cloudfront_service_principal:s.Principal?.Service==='cloudfront.amazonaws.com',
  cloudfront_source_arns:Object.values(s.Condition??{}).flatMap(v=>[v?.['AWS:SourceArn']??v?.['aws:SourceArn']].flat())
   .filter(v=>typeof v==='string'&&/^arn:aws:cloudfront::\d{12}:distribution\/[A-Z0-9]+$/.test(v)),
  conditional_write_conditions:Object.fromEntries(Object.entries(s.Condition??{}).map(([op,values])=>[op,
   Object.fromEntries(Object.entries(values).filter(([key])=>key==='s3:if-none-match'||key==='s3:if-match'))]).filter(([,v])=>Object.keys(v).length)),
  other_condition_keys:Object.entries(s.Condition??{}).flatMap(([op,v])=>Object.keys(v).filter(k=>k!=='s3:if-none-match'&&k!=='s3:if-match').map(k=>op+':'+k))
 }))}
}
const identity=await aws(['sts','get-caller-identity'])
const results=[]
for(const bucket of buckets){
 const operations=[['policy','get-bucket-policy'],['lifecycle','get-bucket-lifecycle-configuration'],['versioning','get-bucket-versioning'],['encryption','get-bucket-encryption'],['replication','get-bucket-replication']]
 const rows=await Promise.all(operations.map(async([name,operation])=>{
  const result=await aws(['s3api',operation,'--bucket',bucket])
  if(result.ok&&name==='policy')try{result.data=policySummary(result.data)}catch{return [name,{ok:false,code:'POLICY_NOT_PARSED'}]}
  return [name,result]
 }))
 const row={bucket,...Object.fromEntries(rows)}
 // Replication rules contain account/bucket metadata only; do not save access
 // tokens, arbitrary policy conditions or custom origin header values.
 results.push(row)
}
const distributionIds=[...new Set(results.flatMap(r=>r.policy.ok?r.policy.data.statements.flatMap(s=>s.cloudfront_source_arns.map(a=>a.split('/').at(-1))):[]))]
const cloudfront=[]
for(const id of distributionIds){
 const result=await aws(['cloudfront','get-distribution-config','--id',id])
 if(!result.ok){cloudfront.push({id,...result});continue}
 const c=result.data.DistributionConfig
 cloudfront.push({id,ok:true,enabled:c.Enabled,aliases:c.Aliases?.Items??[],
  origins:(c.Origins?.Items??[]).map(o=>({id:o.Id,domain:o.DomainName,path:o.OriginPath??'',oac:o.OriginAccessControlId??null,
   oai:o.S3OriginConfig?.OriginAccessIdentity??null,custom_header_count:o.CustomHeaders?.Quantity??0})),
  default_behavior:{target:c.DefaultCacheBehavior?.TargetOriginId,viewer_protocol:c.DefaultCacheBehavior?.ViewerProtocolPolicy,
   allowed_methods:c.DefaultCacheBehavior?.AllowedMethods?.Items??[],cache_policy:c.DefaultCacheBehavior?.CachePolicyId??null},
  behaviors:(c.CacheBehaviors?.Items??[]).map(b=>({path:b.PathPattern,target:b.TargetOriginId,viewer_protocol:b.ViewerProtocolPolicy,allowed_methods:b.AllowedMethods?.Items??[]}))})
}
const report={scope:'Current CLI identity only; read-only bucket configuration, not task-role or immutability acceptance',
 identity:identity.ok?{ok:true,account:identity.data.Account,arn:identity.data.Arn}:identity,buckets:results,cloudfront,
 cloud_resources_changed:false,objects_read_or_written:false,providers_changed:false,server_started:false}
fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-14-aws-config-audit.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({identity_verified:identity.ok,buckets:results.map(r=>({bucket:r.bucket,
 checks:Object.fromEntries(['policy','lifecycle','versioning','encryption','replication'].map(k=>[k,r[k].ok?'READ':r[k].code]))})),
 cloudfront_configs_read:cloudfront.filter(c=>c.ok).length,
 cloud_resources_changed:false,objects_read_or_written:false}))
