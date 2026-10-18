import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
const source=fs.readFileSync('lib/supabase.ts','utf8')
function fixture(env={}){
 let calls=0,args
 const auth={getSession:async()=>({data:{session:null}})}
 const actual={auth,from(name){assert.equal(this,actual);return {relation:name}},storage:{}}
 const createBrowserClient=(...values)=>{calls++;args=values;return actual}
 let code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 code=code.replace(/^import .*createBrowserClient.*\r?\n/m,'').replace('export const supabase','const supabase')
 const value=new Function('createBrowserClient','process',code+'\nreturn supabase')(createBrowserClient,{env})
 return {value,auth,get calls(){return calls},get args(){return args}}
}
test('importing retained legacy browser module needs no Supabase keys or client side effects',()=>{
 const f=fixture();assert.equal(f.calls,0);assert.ok(f.value)
})
test('actual SSR dependency and browser module import succeed offline without legacy credentials',async()=>{
 const names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY']
 const previous=names.map(name=>process.env[name])
 try{
  for(const name of names)delete process.env[name]
  const load=createSourceLoader(process.cwd())
  const browserModule=await import(await load('lib/supabase.ts'))
  assert.equal(typeof browserModule.supabase,'object')
  assert.throws(()=>browserModule.supabase.auth,/Missing Supabase environment variables/)
 }finally{names.forEach((name,i)=>{if(previous[i]===undefined)delete process.env[name];else process.env[name]=previous[i]})}
})
test('first legacy use retains missing-configuration error instead of creating an invalid client',()=>{
 const f=fixture();assert.throws(()=>f.value.auth,/Missing Supabase environment variables/);assert.equal(f.calls,0)
})
test('legacy auth/queries initialize once, keep nested auth API and bind client methods',async()=>{
 const f=fixture({NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-only'})
 assert.equal(f.calls,0);assert.equal(f.value.auth,f.auth);assert.equal((await f.value.auth.getSession()).data.session,null)
 assert.deepEqual(f.value.from('products'),{relation:'products'});assert.equal(f.calls,1)
 assert.deepEqual(f.args,['https://fixture.supabase.test','fixture-only'])
})
