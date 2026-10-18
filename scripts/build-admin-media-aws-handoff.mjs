// Review artifacts only. Never invokes AWS or applies/replaces bucket policies.
import fs from 'node:fs'
import {mediaSources} from './admin-media-schema-sql.mjs'
const buckets=[...new Set(mediaSources.map(s=>s.bucket))]
for(const bucket of buckets){
 const resources=mediaSources.filter(s=>s.bucket===bucket).map(s=>`arn:aws:s3:::${bucket}/${s.prefix}*`)
 const statements=[
  {Sid:'HodVideo14RequireConditionalCreate',Effect:'Deny',Principal:'*',Action:'s3:PutObject',Resource:resources,Condition:{Null:{'s3:if-none-match':'true'}}},
  {Sid:'HodVideo14RejectReplacementCondition',Effect:'Deny',Principal:'*',Action:'s3:PutObject',Resource:resources,Condition:{StringNotEquals:{'s3:if-none-match':'*'}}},
  {Sid:'HodVideo14RetainCanonicalBytes',Effect:'Deny',Principal:'*',Action:['s3:DeleteObject','s3:DeleteObjectVersion','s3:ReplicateObject','s3:ReplicateDelete'],Resource:resources},
 ]
 fs.writeFileSync(`docs/aws-phase-d/ADMIN-RDS-14-${bucket}-policy-APPEND-REVIEW.json`,JSON.stringify({Version:'2012-10-17',Statement:statements},null,2)+'\n')
}
const statements=buckets.flatMap(bucket=>{
 const sources=mediaSources.filter(s=>s.bucket===bucket),resources=sources.map(s=>`arn:aws:s3:::${bucket}/${s.prefix}*`)
 return [
  {Sid:'List'+bucket.replaceAll('-',''),Effect:'Allow',Action:'s3:ListBucket',Resource:`arn:aws:s3:::${bucket}`,Condition:{StringEquals:{'s3:prefix':sources.map(s=>s.prefix)}}},
  {Sid:'Head'+bucket.replaceAll('-',''),Effect:'Allow',Action:'s3:GetObject',Resource:resources},
  {Sid:'Create'+bucket.replaceAll('-',''),Effect:'Allow',Action:'s3:PutObject',Resource:resources,Condition:{StringEquals:{'s3:if-none-match':'*'}}},
 ]
})
fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-14-runtime-IAM-REVIEW.json',JSON.stringify({Version:'2012-10-17',Statement:statements},null,2)+'\n')
console.log(JSON.stringify({review_files:3,buckets,cloud_resources_changed:false}))
