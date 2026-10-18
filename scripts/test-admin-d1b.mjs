// In-process actual-source deletion recovery tests. No listener or external I/O.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { randomBytes } from 'node:crypto'
const data = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
const modules = new Map()
const root = process.cwd()
let pageAuthorize
let dbQuery = async () => { throw Error('Unconfigured offline DB') }
globalThis.__d1b = { authorize: (...a) => pageAuthorize(...a), transaction: run => run({ query: (...a) => dbQuery(...a) }) }
async function load(file) {
  file = path.resolve(root, file)
  if (modules.has(file)) return modules.get(file)
  const source = fs.readFileSync(file, 'utf8')
  let code = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  for (const name of new Set([...code.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)].map(m => m[1]))) {
    let url
    if (name === 'server-only') url = data('export {}')
    else if (name.endsWith('product-server-request')) url = data('export const authorizeProductPage=(...a)=>globalThis.__d1b.authorize(...a)')
    else if (name.endsWith('/db/pool') || name === './db/pool') url = data('export const adminTransaction=run=>globalThis.__d1b.transaction(run);export const adminQuery=(...a)=>globalThis.__d1b.transaction(db=>db.query(...a))')
    else if (name.endsWith('product-session-runtime')) url = data('export const authorizeProductRequest=(...a)=>globalThis.__d1b.authorize(...a)')
    else if (name === 'next/navigation') url = data('export const useRouter=()=>({replace(){},push(){}});export const usePathname=()=>"/dashboard";export const redirect=path=>{throw Error("Redirect:"+path)}')
    else if (name === 'next/headers') url = data('export async function cookies(){throw Error("Unexpected legacy cookies")}; export async function headers(){throw Error("Injected page adapter required")}')
    else if (name === './supabase' || name === '@/lib/supabase') url = data('throw Error("Unexpected legacy browser client")')
    else if (name === '@supabase/supabase-js') url = data('export function createClient(){throw Error("Unexpected legacy HTTP client")}')
    else if (name === '@supabase/ssr') url = data('export function createServerClient(){throw Error("Unexpected legacy session client")}')
    else if (name === './keycloak' && file.endsWith('session.ts')) url = data(`import {randomBytes,createHash} from 'node:crypto';export const randomSecret=()=>randomBytes(32).toString('base64url');export const digest=x=>createHash('sha256').update(x).digest('base64url')`)
    else if (name.startsWith('.') || name.startsWith('@/')) {
      let p = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name)
      if (!path.extname(p)) p += fs.existsSync(p + '.ts') ? '.ts' : '.tsx'
      url = (await load(p)).url
    } else url = import.meta.resolve(name === 'next/server' ? 'next/server.js' : name === 'next/navigation' ? 'next/navigation.js' : name === 'next/link' ? 'next/link.js' : name)
    code = code.replaceAll("'" + name + "'", "'" + url + "'").replaceAll('"' + name + '"', '"' + url + '"')
  }
  const url = data(code), result = { url, exports: await import(url), source }
  modules.set(file, result)
  return result
}
globalThis.fetch = async () => { throw Error('Network forbidden') }

const { createSessions } = (await load('lib/auth/session.ts')).exports
const { createAuthHandlers } = (await load('lib/auth/handlers.ts')).exports
const { logoutAdmin } = (await load('lib/admin-auth-client.ts')).exports
const issuer = 'https://auth-uat.houseofdiams.com/realms/houseofdiams', origin = 'https://manage-uat.houseofdiams.com'
const profileId = '71ab01bc-4160-40a9-80cb-7519f88e91ab'
function fixture() {
  let enabled = true, revokedAt = null, role = 'admin', logoutFails = false
  const rows = new Map()
  const secret = () => randomBytes(32).toString('base64url')
  const copy = x => structuredClone(x)
  const store = {
    async create(k, value) { if (rows.has(k)) return false; rows.set(k, { data: copy(value), version: secret() }); return true },
    async get(k) { return copy(rows.get(k) ?? null) },
    async consume(k, v) { const x = rows.get(k); if (!x || x.version !== v) return null; rows.delete(k); return copy(x.data) },
    async replace(k, v, value) { if (rows.get(k)?.version !== v) return false; rows.set(k, { data: copy(value), version: secret() }); return true },
    async delete(k) { rows.delete(k) },
  }
  const config = { issuer, clientId: 'hod-admin', origin, requiredClientRole: 'hod-admin', sessionMaxSeconds: 3600, sessionIdleSeconds: 600, revalidateSeconds: 60 }
  const deps = { config, store, now: () => 1800000000000,
    lookup: async () => [{ issuer, subject: 'external-subject', profileId, enabled, revokedAt, profileRole: role }],
    oidc: { validate: async () => ({ issuer, subject: 'external-subject', audiences: ['hod-admin'], clientId: 'hod-admin', clientRoles: ['hod-admin'], expiresAt: 1800000300, verified: true }), logout: async () => { if (logoutFails) throw Error('offline upstream failure') } },
  }
  const sessions = createSessions(deps)
  return { rows, store, deps, sessions, handlers: createAuthHandlers(deps), disable: () => { enabled = false }, revoke: () => { revokedAt = '2026-10-15' }, demote: () => { role = 'customer' }, failLogout: () => { logoutFails = true } }
}
async function established() {
  const f = fixture()
  const { cookie, session } = await f.sessions.establish({ accessToken: 'fixture', refreshToken: 'refresh', idToken: 'id' }, 'nonce')
  const request = (method = 'GET', patch = {}) => new Request(origin + '/api/auth/account', { method, headers: { cookie: '__Host-hod_admin_session=' + cookie, origin, 'x-admin-csrf': session.csrf, ...patch } })
  return { ...f, request, cookie, session }
}


const challengeRequest = f => new Request(origin + '/api/auth/logout-challenge', {method:'POST',headers:{origin,cookie:'__Host-hod_admin_session='+f.cookie,'sec-fetch-site':'same-origin','x-admin-logout-intent':'local-signout'}})
const proof = async f => {const r=await f.handlers.logoutChallenge(challengeRequest(f));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const b=await r.json();assert.deepEqual(Object.keys(b),['logoutCsrfToken']);assert.notEqual(b.logoutCsrfToken,f.session.csrf);return b.logoutCsrfToken}
const logoutRequest = (f, token) => new Request(origin+'/api/auth/logout',{method:'POST',headers:{origin,cookie:'__Host-hod_admin_session='+f.cookie,'x-admin-logout-csrf':token}})
for (const state of ['disable','revoke','demote']) test(state+' mapping denies business session but can delete only own session', async()=>{
 const f=await established();f[state]();assert.equal((await f.handlers.session(f.request())).status,401)
 const token=await proof(f)
 await assert.rejects(f.sessions.authorize(new Request(origin+'/api/products',{method:'POST',headers:{origin,cookie:'__Host-hod_admin_session='+f.cookie,'x-admin-csrf':token}}),true))
 const r=await f.handlers.logout(logoutRequest(f,token));assert.equal(r.status,200);assert.deepEqual(await r.json(),{authenticated:false,upstreamLogout:true});assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal(f.rows.size,0)
 assert.equal((await f.handlers.logoutChallenge(challengeRequest(f))).status,403);assert.equal((await f.handlers.logout(logoutRequest(f,token))).status,403)
})
test('deletion proof never authorizes business even while mapping enabled',async()=>{const f=await established();const token=await proof(f);await assert.rejects(f.sessions.authorize(new Request(origin+'/api/products',{method:'POST',headers:{origin,cookie:'__Host-hod_admin_session='+f.cookie,'x-admin-csrf':token}}),true));assert.equal((await f.handlers.session(f.request())).status,200)})
test('challenge rejects cross origin, missing origin, wrong site, wrong method, absent intent/cookie and duplicate cookie',async()=>{
 const f=await established();for(const [method,patch] of [['GET',{}],['POST',{origin:'https://evil.invalid'}],['POST',{origin:''}],['POST',{'sec-fetch-site':'cross-site'}],['POST',{'x-admin-logout-intent':''}],['POST',{cookie:''}],['POST',{cookie:'__Host-hod_admin_session='+f.cookie+'; __Host-hod_admin_session='+f.cookie}]]){const headers=Object.fromEntries(challengeRequest(f).headers);Object.assign(headers,patch);assert.equal((await f.handlers.logoutChallenge(new Request(origin+'/api/auth/logout-challenge',{method,headers}))).status,403)}assert.equal(f.rows.size,1)
})
test('challenge is read only, no lookup/refresh/upstream/TTL extension and supports process replacement',async()=>{
 const f=await established();const before=structuredClone([...f.rows]);f.deps.lookup=()=>{throw Error('No identity lookup permitted')};f.deps.oidc.refresh=()=>{throw Error('No refresh permitted')};f.deps.oidc.logout=()=>{throw Error('No upstream permitted')};const token=await proof(f);assert.deepEqual([...f.rows],before);const other=createAuthHandlers(f.deps);const r=await other.logoutChallenge(challengeRequest(f));assert.equal((await r.json()).logoutCsrfToken,token)
})
test('proof bound to session, bad proof/origin/method denied without deletion',async()=>{
 const f=await established(),g=await established(),token=await proof(f);assert.equal((await g.handlers.logout(logoutRequest(g,token))).status,403);for(const r of [logoutRequest(f,'x'.repeat(43)),new Request(origin+'/api/auth/logout',{method:'GET',headers:Object.fromEntries(logoutRequest(f,token).headers)}),new Request(origin+'/api/auth/logout',{method:'POST',headers:{...Object.fromEntries(logoutRequest(f,token).headers),origin:'https://evil.invalid'}})])assert.equal((await f.handlers.logout(r)).status,403);assert.equal(f.rows.size,1);assert.equal(g.rows.size,1)
})
test('upstream failure reported only after atomic local deletion',async()=>{
 const f=await established();f.disable();f.deps.oidc.logout=async()=>{assert.equal(f.rows.size,0);throw Error('Upstream unavailable')};const r=await f.handlers.logout(logoutRequest(f,await proof(f)));assert.equal(r.status,502);assert.deepEqual(await r.json(),{authenticated:false,upstreamLogout:false});assert.equal(f.rows.size,0)
})
test('recovery consume retries metadata conflict, refresh CAS cannot resurrect removed session',async()=>{
 const f=await established(),token=await proof(f),key=f.sessions.sessionKey(f.cookie),old=await f.store.get(key),consume=f.store.consume;let first=true;f.store.consume=async(k,v)=>{if(first){first=false;await f.store.replace(k,v,{...old.data,lastSeen:old.data.lastSeen+1});return null}return consume(k,v)};assert.equal((await f.handlers.logout(logoutRequest(f,token))).status,200);assert.equal(await f.store.replace(key,old.version,old.data),false)
})
test('store failure cannot claim success or erase cookie',async()=>{
 const f=await established(),token=await proof(f);f.store.consume=()=>{throw Error('Store down')};const r=await f.handlers.logout(logoutRequest(f,token));assert.equal(r.status,403);assert.equal(r.headers.get('set-cookie'),null);assert.equal(f.rows.size,1)
})
test('actual client uses deletion-only recovery after denied mapping, no business/logout replay',async()=>{
 const f=await established();f.revoke();f.failLogout();const calls=[];globalThis.fetch=async(url,init={})=>{calls.push(url);if(url==='/api/auth/provider')return Response.json({provider:'keycloak'});const r=new Request(origin+url,{...init,headers:{...init.headers,origin,cookie:'__Host-hod_admin_session='+f.cookie}});if(url==='/api/auth/session')return f.handlers.session(r);if(url==='/api/auth/logout-challenge')return f.handlers.logoutChallenge(r);if(url==='/api/auth/logout')return f.handlers.logout(r);throw Error('Unexpected request')};assert.deepEqual(await logoutAdmin(),{upstreamLogout:false});assert.deepEqual(calls,['/api/auth/provider','/api/auth/session','/api/auth/logout-challenge','/api/auth/logout']);assert.equal(f.rows.size,0)
})
test('client challenge failure remains honest and never posts logout',async()=>{
 const calls=[];globalThis.fetch=async url=>{calls.push(url);if(url==='/api/auth/provider')return Response.json({provider:'keycloak'});return Response.json({error:'Denied'},{status:403})};await assert.rejects(logoutAdmin(),/Unable to confirm/);assert.deepEqual(calls,['/api/auth/provider','/api/auth/session','/api/auth/logout-challenge'])
})
