// Compile without a listener or external calls. Font bytes are a test fixture.
// This is compilation evidence, not browser/font/deployment acceptance.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const uatSelected=process.argv.includes('--uat-selected')
const bounded=process.argv.includes('--bounded-memory')||uatSelected
const heapMiB=uatSelected?1536:1024
const log=uatSelected?'ADMIN-UAT-selected-build.log':bounded?'ADMIN-RDS-15-bounded-build.log':'DEPLOY-READINESS-build.log'
const output=fs.openSync(path.join(root,'docs/aws-phase-d',log),'w')
try {
  const result=spawnSync(process.execPath,['--import',new URL('./offline-network-guard.mjs',import.meta.url).href,
    path.join(root,'node_modules/next/dist/bin/next'),'build','--webpack'],{
    cwd:root,windowsHide:true,stdio:['ignore',output,output],env:{...process.env,
      NEXT_TELEMETRY_DISABLED:'1',AWS_EC2_METADATA_DISABLED:'true',
      ...(bounded?{NODE_OPTIONS:((process.env.NODE_OPTIONS??'')+` --max-old-space-size=${heapMiB}`).trim(),RAYON_NUM_THREADS:'1',UV_THREADPOOL_SIZE:'2'}:{}),
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES:path.join(root,'scripts/offline-font-mock.cjs')}})
  if(bounded)fs.writeFileSync(path.join(root,'docs/aws-phase-d',uatSelected?'ADMIN-UAT-selected-build-result.json':'ADMIN-RDS-15-build-result.json'),JSON.stringify({date:'2026-10-18',
    mode:`guarded webpack; heap cap ${heapMiB}MiB, Rayon threads 1, libuv threads 2`,node:process.version,
    exit_code:result.status,signal:result.signal,error:result.error?.code??null,passed:result.status===0,
    application_config_changed:false,server_started:false},null,2)+'\n')
  if(result.error) {process.stdout.write('Offline build could not start.\n');process.exitCode=1}
  else {process.stdout.write(`Offline build exit ${result.status}; see ${log}.\n`);process.exitCode=result.status??1}
}finally{fs.closeSync(output)}
