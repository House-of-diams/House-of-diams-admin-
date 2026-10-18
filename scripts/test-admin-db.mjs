import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import ts from 'typescript'
import { rootCertificates } from 'node:tls'
const load = async (file, dependencies = {}) => {
  let code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  for (const [name, url] of Object.entries(dependencies)) code = code.replaceAll(`'${name}'`, `'${url}'`)
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  return {exports: await import(url), url}
}
const errors = await load('../lib/db/errors.ts')
const {exports:{withAdminTransaction, queryAdmin}} = await load('../lib/db/query.ts', {'./errors':errors.url})
const {exports:{readAdminDbConfig}} = await load('../lib/db/config.ts')
const {exports:{createAdminIdentityLookup,identityLookupSql}} = await load('../lib/db/admin-repositories/identity-core.ts')
const env = {ADMIN_DATABASE_URL:'postgres://hod_admin_app:secret@127.0.0.1:15432/hod_staging',ADMIN_DB_LOGIN_ROLE:'hod_admin_app',ADMIN_DB_TLS_CA_FILE:'ca.pem',ADMIN_DB_TLS_EXPECTED_HOST:'db.example.rds.amazonaws.com'}
const readCa = () => rootCertificates.join('\n')
function fake(options={}) {
  const calls=[]; let released
  const principal={login_role:'hod_admin_app',active_role:'hod_admin_app',safe_login:true,isolated_login:true,safe_capability:true,isolated_capability:true,capability_exists:true,...options.principal}
  const client={async query(text,values){calls.push([text,values]); if(options.fail===text) throw Object.assign(new Error('SECRET SQL'),{code:'42501'}); if(text.startsWith('SELECT session_user')) return {rows:[principal]}; return {rows:options.rows??[]}},release(value){released=value}}
  return {pool:{async connect(){return client}}, calls,get released(){return released}}
}
test('bounded config verifies CA and expected hostname through loopback; rejects URL TLS bypasses',()=>{
  const c=readAdminDbConfig(env,readCa); assert.equal(c.pool.max,5); assert.equal(c.pool.ssl.rejectUnauthorized,true)
  assert.equal(c.pool.ssl.servername,env.ADMIN_DB_TLS_EXPECTED_HOST)
  assert.equal(readAdminDbConfig({...env,ADMIN_DATABASE_URL:env.ADMIN_DATABASE_URL.replace('127.0.0.1','localhost')},readCa).pool.host,'127.0.0.1')
  assert.throws(()=>readAdminDbConfig({...env,ADMIN_DATABASE_URL:env.ADMIN_DATABASE_URL.replace('127.0.0.1','192.0.2.1')},readCa),/configuration/)
  assert.ok(c.pool.ssl.checkServerIdentity('127.0.0.1',{subject:{CN:'wrong.example'},subjectaltname:'DNS:wrong.example'}))
  assert.equal(c.pool.ssl.checkServerIdentity('127.0.0.1',{subject:{CN:env.ADMIN_DB_TLS_EXPECTED_HOST},subjectaltname:`DNS:${env.ADMIN_DB_TLS_EXPECTED_HOST}`}),undefined)
  for(const changes of [{ADMIN_DB_TLS_EXPECTED_HOST:''},{ADMIN_DATABASE_URL:env.ADMIN_DATABASE_URL+'?sslmode=disable'},{ADMIN_DB_LOGIN_ROLE:'hod_app'},{ADMIN_DATABASE_URL:'postgres://hod_migration:secret@db.example/db',ADMIN_DB_LOGIN_ROLE:'hod_migration'},{ADMIN_DB_TLS_CA_FILE:''}]) {
    assert.throws(()=>readAdminDbConfig({...env,...changes},path=>{if(!path)throw Error();return readCa()}),/configuration/)
  }
  assert.throws(()=>readAdminDbConfig(env,()=> 'garbage'),/configuration/)
})
test('transaction binds values, commits, SET LOCAL role and releases',async()=>{
  const f=fake({rows:[{value:1}]}); const values=["subject'; DROP TABLE profiles; --"]
  assert.deepEqual(await queryAdmin(f.pool,'hod_admin_app','SELECT $1',values),[{value:1}])
  assert.deepEqual(f.calls.at(-2),['SELECT $1',values]); assert.equal(f.calls.at(-1)[0],'COMMIT');assert.equal(f.released,false)
  assert.ok(f.calls.some(([sql])=>sql==='SET LOCAL ROLE hod_admin_app'))
})

test('repeatable write is explicit; read snapshots stay read-only and contradictory options fail before connecting',async()=>{
 for(const [options,begin] of [[{repeatableWrite:true},'BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE'],[{snapshot:true},'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY']]){
  const f=fake();await withAdminTransaction(f.pool,'hod_admin_app',async()=>1,options);assert.equal(f.calls[0][0],begin);assert.equal(f.calls.at(-1)[0],'COMMIT')
 }
 const f=fake();await assert.rejects(()=>withAdminTransaction(f.pool,'hod_admin_app',async()=>1,{snapshot:true,repeatableWrite:true}),{kind:'invalid'});assert.equal(f.calls.length,0)
})
test('denies elevated/mismatched/nonisolated principals before business SQL',async()=>{
  for(const principal of [{login_role:'hod_app'},{active_role:'hod_migration'},{safe_login:false},{safe_capability:false},{isolated_capability:false},{isolated_login:false},{capability_exists:false}]) {
    const f=fake({principal}); await assert.rejects(()=>queryAdmin(f.pool,'hod_admin_app','BUSINESS'),{kind:'permission'});assert.equal(f.calls.at(-1)[0],'ROLLBACK');assert.equal(f.released,true);assert.ok(!f.calls.some(([s])=>s==='BUSINESS'))
  }
})
test('rollback and release on callback/commit failure; discard rollback failure',async()=>{
  for(const fail of ['BUSINESS','COMMIT']) {const f=fake({fail});await assert.rejects(()=>queryAdmin(f.pool,'hod_admin_app','BUSINESS'),{kind:'permission'});assert.equal(f.calls.at(-1)[0],'ROLLBACK');assert.equal(f.released,false)}
  const f=fake({fail:'ROLLBACK'});await assert.rejects(()=>withAdminTransaction(f.pool,'hod_admin_app',async()=>{throw Error('private')}),/Admin database operation failed/);assert.equal(f.released,true)
})
test('identity uses scoped parameter binding and preserves UUID/revocation state',async()=>{
  const rows=[{issuer:'issuer',subject:'subject',profile_id:'12345678-1234-4234-9234-123456789abc',enabled:true,revoked_at:null,profile_role:'admin'}]
  let call;const lookup=createAdminIdentityLookup({async query(...args){call=args;return {rows}}})
  const result=await lookup('issuer',"subject' OR true --");assert.deepEqual(call,[identityLookupSql,['issuer',"subject' OR true --"]]);assert.equal(result[0].profileId,rows[0].profile_id)
  assert.deepEqual(await lookup('','subject'),[])
  const missing=createAdminIdentityLookup({async query(){throw Object.assign(Error('missing'),{code:'42883'})}});await assert.rejects(()=>missing('issuer','subject'))
})
test('SQLSTATE mapping is sanitized and preserves conflict/permission/missing-function classifications',()=>{
  for(const [code,kind] of [['40001','conflict'],['PT409','conflict'],['42501','permission'],['42883','unavailable'],['23503','invalid']]) {const e=errors.exports.mapAdminDbError({code,message:'SECRET'});assert.equal(e.kind,kind);assert.equal(e.sqlState,code);assert.ok(!e.message.includes('SECRET'))}
})

const identitySource = ts.transpileModule(fs.readFileSync(new URL('../lib/auth/identity.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const identityPolicy = await load('../lib/auth/admin-identity-core.ts')
const resolverCode = identitySource.replace("import 'server-only';",'').replace("'./admin-identity-core'",`'${identityPolicy.url}'`)
const {resolveAdminActor} = await import('data:text/javascript;base64,'+Buffer.from(resolverCode).toString('base64'))
test('resolver rechecks expiry after delayed lookup and skips DB for invalid sessions',async()=>{
  const now=Math.floor(Date.now()/1000)
  const policy={issuer:'https://issuer.example',clientId:'hod-admin',requiredClientRole:'hod-admin'}
  const session={issuer:policy.issuer,subject:'subject',clientId:'hod-admin',audiences:['hod-admin'],clientRoles:['hod-admin'],expiresAt:now+60}
  const record={issuer:session.issuer,subject:session.subject,profileId:'12345678-1234-4234-9234-123456789abc',enabled:true,revokedAt:null,profileRole:'admin'}
  assert.equal((await resolveAdminActor(session,policy,async()=>[record])).profileId,record.profileId)
  await assert.rejects(()=>resolveAdminActor(session,policy,async()=>{throw Error('unavailable')}))
  let called=false;assert.equal(await resolveAdminActor(null,policy,async()=>{called=true;return [record]}),null);assert.equal(called,false)
  const original=Date.now
  try {assert.equal(await resolveAdminActor(session,policy,async()=>{Date.now=()=> (now+120)*1000;return [record]},now),null)} finally {Date.now=original}
})
test('singleton pool is lazy, reused and closed without opening a listener',async()=>{
  const originalEnv={...process.env}
  Object.assign(process.env,env)
  globalThis.__b2PoolTest={created:0,ended:0}
  const fakePg='data:text/javascript;base64,'+Buffer.from(`export class Pool {constructor(config){globalThis.__b2PoolTest.created++;globalThis.__b2PoolTest.config=config}on(){}async connect(){throw Error('offline')}async end(){globalThis.__b2PoolTest.ended++}}`).toString('base64')
  const fakeFs='data:text/javascript;base64,'+Buffer.from(`export const readFileSync=()=>${JSON.stringify(readCa())}`).toString('base64')
  let code=ts.transpileModule(fs.readFileSync(new URL('../lib/db/pool.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("import 'server-only';",'')
  const config=await load('../lib/db/config.ts')
  const query=await load('../lib/db/query.ts',{'./errors':errors.url})
  for(const [name,url] of Object.entries({'pg':fakePg,'node:fs':fakeFs,'./config':config.url,'./query':query.url}))code=code.replaceAll(`'${name}'`,`'${url}'`)
  try {
    const pool=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
    assert.equal(globalThis.__b2PoolTest.created,0)
    await assert.rejects(()=>pool.adminQuery('SELECT 1'));await assert.rejects(()=>pool.adminQuery('SELECT 1'))
    assert.equal(globalThis.__b2PoolTest.created,1);await pool.closeAdminPool();assert.equal(globalThis.__b2PoolTest.ended,1)
    await assert.rejects(()=>pool.adminQuery('SELECT 1'));assert.equal(globalThis.__b2PoolTest.created,2);await pool.closeAdminPool()
  } finally {for(const key of Object.keys(env)){if(originalEnv[key]===undefined)delete process.env[key];else process.env[key]=originalEnv[key]}delete globalThis.__b2PoolTest}
})
