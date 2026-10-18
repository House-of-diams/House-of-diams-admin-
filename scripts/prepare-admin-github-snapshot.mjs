// Local packaging only: no git commit/push, AWS calls, listeners or ENV copying.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const target=path.resolve(root,'../admin-github-uat')
if(process.argv[2]!=='--prepare')throw Error('Explicit --prepare required')
if(fs.existsSync(target))throw Error('Snapshot already exists; preserve it and review before rebuilding')
const files=new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/)
 .filter(p=>p&&!p.startsWith('docs/')&&!p.startsWith('.env')&&!['ADMIN_PRODUCTION_READINESS_HANDOFF.md','GROUP5_PLAN.md'].includes(p)))
const fixtures=[
 'aws-phase-a/rds-targeted-live-2026-10-14.json','aws-migration-audit/sql-type-contract-evidence.json',
 'aws-phase-c/C1-source-hashes.csv','aws-phase-d/D1a-initial-sources.json',
 'aws-phase-d/D1e-minimum-grant-manifest.json','aws-phase-d/D1c-SQL-feature-candidates.sql',
 'aws-phase-d/D1e-SQL-lock-rights-forward.sql','aws-phase-d/D1e-SQL-lock-rights-inverse.sql',
 'aws-phase-d/D1e-source-duplicate_product.sql','aws-phase-d/D1e-SQL-duplicate-capability.sql',
 'aws-phase-d/D1e-SQL-cms-navbar-requirements.sql','aws-phase-d/D1e-SQL-cms-navbar-inverse.sql',
 'aws-phase-d/ADMIN-RDS-09-product-write-forward.sql','aws-phase-d/ADMIN-RDS-09-product-write-inverse.sql',
 'aws-phase-d/ADMIN-RDS-08-feature-read-forward.sql','aws-phase-d/ADMIN-RDS-08-feature-read-inverse.sql','aws-phase-d/ADMIN-RDS-08-feature-read-scope.json',
 ...['10-content-write','11-operations','12-order','13-duplicate','14-media'].map(n=>`aws-phase-d/ADMIN-RDS-${n}-preflight.json`),
 ...['10-content-write','11-operations-write','12-order','13-duplicate','14-media'].flatMap(n=>['forward.sql','inverse.sql','scope.json'].map(s=>`aws-phase-d/ADMIN-RDS-${n}-${s}`)),
]
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/aws-phase-d/D1e-minimum-grant-manifest.json'),'utf8'))
for(const r of manifest.routines)fixtures.push(r.source.replace(/^docs\//,''))
for(const p of fixtures)files.add('docs/'+p)
for(const p of ['ADMIN-UAT-CONFIGURATION.md','ADMIN-RDS-14-DEVOPS-HANDOFF.md','ADMIN-RDS-14-house-of-diams-policy-APPEND-REVIEW.json','ADMIN-RDS-14-house-of-diams-hod-policy-APPEND-REVIEW.json','ADMIN-RDS-14-runtime-IAM-REVIEW.json'])files.add('docs/aws-phase-d/'+p)
// Match saved private values without printing them. Public settings are not secrets.
const privateValues=[]
for(const line of fs.readFileSync(path.join(root,'.env.local'),'utf8').split(/\r?\n/)){
 const match=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
 if(!match)continue
 const [,name,raw]=match,value=raw.replace(/^['"]|['"]$/g,'')
 if(/SECRET|PASSWORD|SERVICE_ROLE_KEY|REST_TOKEN|ENCRYPTION_KEY|ACCESS_KEY_ID|SECRET_ACCESS_KEY/.test(name)&&value.length>=12)privateValues.push(value)
 if(/DATABASE_URL|REDIS_URL/.test(name))try{const password=decodeURIComponent(new URL(value).password);if(password.length>=8)privateValues.push(password)}catch{/* Not a connection URL. */}
}
const findings=[],entries=[]
for(const relative of [...files].sort()){
 const input=path.resolve(root,relative)
 if(!input.startsWith(root+path.sep)||!fs.statSync(input).isFile())throw Error('Invalid snapshot input: '+relative)
 let bytes=fs.readFileSync(input)
 if(relative==='docs/aws-phase-a/rds-targeted-live-2026-10-14.json'){
  const data=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''))
  bytes=Buffer.from(JSON.stringify({scope:'Public regression fixture: reviewed routine definitions only',reviewed_routines:data.reviewed_routines},null,2)+'\n')
 }
 if(relative==='docs/aws-phase-a/rds-admin-definition-metadata.json'){
  const data=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''))
  bytes=Buffer.from(JSON.stringify({scope:'Public regression fixture: routine definitions only',functions:data.functions},null,2)+'\n')
 }
 const content=bytes.toString('utf8')
 for(const value of privateValues)if(content.includes(value))findings.push({file:relative,reason:'saved-private-value'})
 for(const [reason,pattern] of [
  ['aws-access-key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['password-connection-url',/\b(?:postgres(?:ql)?|rediss?):\/\/[^\s:'"<>]+:[^\s'"<>@]{8,}@/],
 ]){
  const screened=reason==='password-connection-url'&&relative==='scripts/configure-admin-login-local.test.mjs'
   ?content.replaceAll(['rediss://default:','synthetic-password','@synthetic.upstash.io:6379'].join(''),'SYNTHETIC_TEST_URL'):content
  if(pattern.test(screened))findings.push({file:relative,reason})
 }
 entries.push({path:relative,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length})
}
if(findings.length){console.log(JSON.stringify({ok:false,findings}));process.exit(1)}
fs.mkdirSync(target)
for(const entry of entries){
 const output=path.join(target,entry.path);fs.mkdirSync(path.dirname(output),{recursive:true})
 const input=fs.readFileSync(path.join(root,entry.path))
 let bytes=input
 if(entry.path==='docs/aws-phase-a/rds-targeted-live-2026-10-14.json')bytes=Buffer.from(JSON.stringify({scope:'Public regression fixture: reviewed routine definitions only',reviewed_routines:JSON.parse(input.toString('utf8').replace(/^\uFEFF/,'')).reviewed_routines},null,2)+'\n')
 if(entry.path==='docs/aws-phase-a/rds-admin-definition-metadata.json')bytes=Buffer.from(JSON.stringify({scope:'Public regression fixture: routine definitions only',functions:JSON.parse(input.toString('utf8').replace(/^\uFEFF/,'')).functions},null,2)+'\n')
 fs.writeFileSync(output,bytes)
}
const report={date:'2026-10-18',target,files:entries.length,private_env_copied:false,old_history_copied:false,
 credential_screen:'saved private values and selected credential formats; not an exhaustive secret detector',entries}
fs.writeFileSync(path.join(root,'docs/aws-phase-d/ADMIN-GITHUB-SNAPSHOT-manifest.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({ok:true,target,files:entries.length,private_env_copied:false,old_history_copied:false}))
