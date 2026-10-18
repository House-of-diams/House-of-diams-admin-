// Private setup, called by the hidden-prompt PowerShell wrapper. Never logs secrets.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'

export function parseUpstashRedisUrl(value) {
  const url = new URL(value)
  if (url.protocol!=='rediss:' || !url.hostname.endsWith('.upstash.io')
    || !url.username || !url.password || url.search || url.hash
    || !['','/'].includes(url.pathname) || (url.port && url.port!=='6379')) throw new Error('Invalid Redis URL')
  return { url, username:decodeURIComponent(url.username),password:decodeURIComponent(url.password),
    restUrl:'https://'+url.hostname }
}

async function bounded(promise) {
  let timer
  try { return await Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('Service timeout')),5000)
  })]) } finally { clearTimeout(timer) }
}

export async function deriveRestCredentials(parsed, client, fetcher=fetch) {
  await bounded(client.connect())
  if (await bounded(client.ping())!=='PONG') throw new Error('Redis proof failed')
  // Upstash's documented ACL RESTTOKEN derives a token for an existing user.
  // Does not create users, alter ACLs, write session/cache data or reset passwords.
  const token=await bounded(client.sendCommand(['ACL','RESTTOKEN',parsed.username,parsed.password]))
  if(typeof token!=='string' || token.length<16 || token.length>8192) throw new Error('REST token unavailable')
  const response=await fetcher(parsed.restUrl,{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(['PING'])})
  if(!response.ok || (await response.json()).result!=='PONG') throw new Error('REST proof failed')
  return {url:parsed.restUrl,token}
}

function dotenvValue(value) {
  if(typeof value!=='string' || !value || /[\r\n'$]/.test(value)) throw new Error('Unsupported configuration encoding')
  return "'"+value+"'"
}

async function main() {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
  const envFile=path.join(root,'.env.local')
  let client
  let temporary
  let stage='local_preconditions'
  try {
    const ignored=file=>spawnSync('git',['check-ignore','--quiet','--',file],{cwd:root,windowsHide:true}).status===0
    if(!ignored('.env.local')) throw new Error('Private file must be ignored')
    const original=fs.readFileSync(envFile,'utf8')
    if(/^\s*(?:export\s+)?(?:ADMIN_OIDC_[A-Z_]+|ADMIN_AUTH_ORIGIN|ADMIN_SESSION_[A-Z_]+|UPSTASH_REDIS_REST_[A-Z_]+)\s*=/m.test(original)) throw new Error('Existing login configuration requires review')
    const clientSecret=process.env.HOD_SETUP_KEYCLOAK_SECRET
    dotenvValue(clientSecret)
    const parsed=parseUpstashRedisUrl(process.env.HOD_SETUP_REDIS_URL)
    // Reuse the installed storefront Redis client as a dependency only.
    // No storefront files, ENV, keys or data are read/changed.
    const require=createRequire(path.join(root,'..','house-of-diams','package.json'))
    const {createClient}=require('redis')
    client=createClient({url:parsed.url.href,socket:{tls:true,servername:parsed.url.hostname,
      rejectUnauthorized:true,connectTimeout:5000,reconnectStrategy:false}})
    client.on('error',()=>{})
    stage='redis_and_rest_verification'
    const rest=await deriveRestCredentials(parsed,client)
    const settings={
      ADMIN_OIDC_ISSUER:'https://auth-uat.houseofdiams.com/realms/houseofdiams',
      ADMIN_OIDC_CLIENT_ID:'hod-admin',ADMIN_OIDC_CLIENT_SECRET:clientSecret,
      ADMIN_OIDC_ROLE_LOCATION:'realm',ADMIN_OIDC_REQUIRED_ROLE:'hod-admin',
      ADMIN_AUTH_ORIGIN:'https://manage-uat.houseofdiams.com',
      ADMIN_SESSION_MAX_SECONDS:'36000',ADMIN_SESSION_IDLE_SECONDS:'1800',ADMIN_SESSION_REVALIDATE_SECONDS:'300',
      UPSTASH_REDIS_REST_URL:rest.url,UPSTASH_REDIS_REST_TOKEN:rest.token,
      ADMIN_SESSION_NAMESPACE:'hod-admin:uat-local',ADMIN_SESSION_ENCRYPTION_KEY:randomBytes(32).toString('base64')}
    stage='private_save'
    const output=original.replace(/[\r\n]+$/,'')+'\r\n'+Object.entries(settings)
      .map(([key,value])=>key+'='+dotenvValue(value)).join('\r\n')+'\r\n'
    temporary=envFile+'.hod-login-'+randomUUID()+'.tmp'
    if(!ignored(path.basename(temporary))) throw new Error('Temporary file must be ignored')
    fs.writeFileSync(temporary,output,{encoding:'utf8',mode:0o600,flag:'wx'})
    // Do not overwrite a concurrently changed configuration file.
    if(fs.readFileSync(envFile,'utf8')!==original) throw new Error('Configuration changed during setup')
    fs.renameSync(temporary,envFile)
    temporary=undefined
    process.stdout.write(JSON.stringify({ok:true,redis_tls_ping_verified:true,redis_rest_ping_verified:true,
      private_login_inputs_saved:true,client_secret_authentication_verified:false,
      providers_changed:false,server_started:false})+'\n')
  } catch {
    process.stdout.write(JSON.stringify({ok:false,stage,code:'PRIVATE_LOGIN_SETUP_STOPPED',
      next:'No provider was activated. Return only this safe result. If Redis token derivation is rejected, obtain the REST token from the existing database dashboard.'})+'\n')
    process.exitCode=1
  } finally {
    try { if(client?.isOpen) client.destroy() } catch {}
    if(temporary) {try{fs.unlinkSync(temporary)}catch{}}
    delete process.env.HOD_SETUP_KEYCLOAK_SECRET
    delete process.env.HOD_SETUP_REDIS_URL
  }
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main()
