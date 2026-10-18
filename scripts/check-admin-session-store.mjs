// Explicit live test: only random diagnostic keys in the configured admin namespace.
// No browser login, real user tokens, app server or unrelated Redis data.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { createSourceLoader } from './admin-rds-source-loader.mjs'

if(process.argv[2]!=='--run-fixtures') {
  process.stdout.write('{"ok":false,"code":"EXPLICIT_FIXTURE_MODE_REQUIRED"}\n')
  process.exit(1)
}
const require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env')
  .loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const keys=[]
let store
let stage='configuration'
let result
try {
  const source=createSourceLoader(process.cwd())
  const {createSessionStore}=await import(await source('lib/auth/session-store.ts'))
  // A process-local test argument only. No file/provider/policy flag is changed.
  const env={...process.env,ADMIN_SESSION_STORAGE_VERIFIED:'true'}
  store=createSessionStore(env)
  const other=createSessionStore(env)
  const key='flow:'+randomBytes(32).toString('base64url')
  const expiryKey='session:'+randomBytes(32).toString('base64url')
  keys.push(key,expiryKey)
  const marker='synthetic-diagnostic-'+randomBytes(16).toString('hex')
  stage='create_and_cross_adapter_read'
  if(!await store.create(key,{marker,revision:1},60)) throw new Error('Create failed')
  if(await other.create(key,{marker:'unexpected'},60)) throw new Error('NX failed')
  const first=await other.get(key)
  if(first?.data.marker!==marker || first.data.revision!==1) throw new Error('Read failed')
  stage='ciphertext_and_cas'
  const response=await fetch(env.UPSTASH_REDIS_REST_URL,{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+env.UPSTASH_REDIS_REST_TOKEN,'Content-Type':'application/json'},
    body:JSON.stringify(['GET',env.ADMIN_SESSION_NAMESPACE+':'+key])})
  if(!response.ok) throw new Error('Ciphertext inspection failed')
  const raw=(await response.json()).result
  if(typeof raw!=='string' || raw.includes(marker) || !JSON.parse(raw).sealed) throw new Error('Plaintext leaked')
  if(await store.replace(key,randomBytes(32).toString('base64url'),{marker,revision:2},60)) throw new Error('Stale CAS accepted')
  if(!await store.replace(key,first.version,{marker,revision:2},60)) throw new Error('CAS failed')
  const changed=await other.get(key)
  if(changed?.data.revision!==2 || changed.version===first.version) throw new Error('Version not advanced')
  stage='consume_and_deleted_key_protection'
  if(await store.consume(key,first.version)!==null) throw new Error('Stale consume accepted')
  const consumed=await other.consume(key,changed.version)
  if(consumed?.marker!==marker || await store.get(key)!==null) throw new Error('Consume failed')
  if(await store.replace(key,changed.version,{marker,revision:3},60)) throw new Error('Deleted key resurrected')
  stage='ttl'
  if(!await other.create(expiryKey,{marker:'expiry-only'},1)) throw new Error('Expiry create failed')
  await new Promise(resolve=>setTimeout(resolve,1500))
  if(await store.get(expiryKey)!==null) throw new Error('Expired key still available')
  result={ok:true,encrypted_storage_verified:true,cross_adapter_read_verified:true,
    atomic_create_verified:true,cas_verified:true,atomic_consume_verified:true,
    deleted_key_resurrection_denied:true,ttl_verified:true,
    real_user_sessions_used:false,verification_flags_changed:false,providers_changed:false,server_started:false}
} catch {
  result={ok:false,stage,code:'ADMIN_SESSION_STORE_TEST_FAILED',providers_changed:false,server_started:false}
  process.exitCode=1
} finally {
  let cleanup=true
  for(const key of keys) try {
    if(!store) {cleanup=false;continue}
    await store.delete(key)
    if(await store.get(key)!==null) cleanup=false
  }catch{cleanup=false}
  if(result){result.diagnostic_keys_cleanup_verified=cleanup
    if(!cleanup){result.ok=false;process.exitCode=1}}
}
fs.writeFileSync('docs/aws-phase-d/DEPLOY-READINESS-live-session-store.json',JSON.stringify(result,null,2)+'\n')
process.stdout.write(JSON.stringify(result)+'\n')
