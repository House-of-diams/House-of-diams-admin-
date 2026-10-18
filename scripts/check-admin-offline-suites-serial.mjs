// Same suite inventory/conditions as run-admin-tests; one Node parent per file
// bounds retained test-runner memory and preserves the failing file/exit status.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const render=new Set(['test-admin-integration.mjs','test-admin-d1a.mjs','test-admin-d1b.mjs','test-admin-d1c.mjs','test-admin-d1e.mjs'])
const files=fs.readdirSync(path.join(root,'scripts')).filter(name=>(/^test.*\.mjs$/.test(name)||name.endsWith('.test.mjs'))&&name!=='test-admin-d1e-prior-products.mjs').sort()
const folder=path.join(root,'docs/aws-phase-d/ADMIN-RDS-15-serial-test-logs')
fs.mkdirSync(folder,{recursive:true})
const report={date:'2026-10-18',mode:'same full inventory; serial per-file Node test runner',files:[],completed:false,server_started:false}
const save=()=>fs.writeFileSync(path.join(root,'docs/aws-phase-d/ADMIN-RDS-15-offline-tests.json'),JSON.stringify(report,null,2)+'\n')
for(const file of files){
 const log=fs.openSync(path.join(folder,file+'.log'),'w')
 const result=spawnSync(process.execPath,['--import',new URL('./offline-network-guard.mjs',import.meta.url).href,
  ...(render.has(file)?[]:['--conditions=react-server']),'--experimental-strip-types','--test','--test-reporter=tap','--test-concurrency=1',path.join(root,'scripts',file)],
 {cwd:root,env:{...process.env,PGLITE_MODULE:fileURLToPath(import.meta.resolve('@electric-sql/pglite'))},stdio:['ignore',log,log],windowsHide:true,timeout:180000})
 fs.closeSync(log)
 const text=fs.readFileSync(path.join(folder,file+'.log'),'utf8')
 const count=key=>Number(text.match(new RegExp('^# '+key+' (\\d+)\\s*$','m'))?.[1]??0)
 const entry={file,group:render.has(file)?'render':'core',exit_code:result.status,signal:result.signal,error:result.error?.code??null,
  tests:count('tests'),passed:count('pass'),failed:count('fail'),cancelled:count('cancelled'),skipped:count('skipped')}
 report.files.push(entry);save();console.log(JSON.stringify(entry))
 if(result.status!==0||entry.failed||entry.cancelled||!entry.tests){process.exitCode=1;break}
}
report.completed=report.files.length===files.length&&report.files.every(r=>r.exit_code===0&&r.tests>0&&!r.failed&&!r.cancelled)
report.totals=Object.fromEntries(['tests','passed','failed','cancelled','skipped'].map(key=>[key,report.files.reduce((n,r)=>n+r[key],0)]))
save();console.log(JSON.stringify({completed:report.completed,files:report.files.length,...report.totals}))
if(!report.completed)process.exitCode=1
