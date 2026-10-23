import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
const load=createSourceLoader(process.cwd())
const {adminPageDataGroup,dataSourcePresentation}=await import(await load('lib/admin-data-source.ts'))
const {createAdminDataSourceStatus,adminDataReadProbes}=await import(await load('lib/admin-data-source-status.ts'))
const request=group=>new Request('https://admin.test/api/admin/data-source-status?group='+encodeURIComponent(group))

test('page groups follow independently selected providers and identify local/demo screens',()=>{
 for(const [path,group] of [['/dashboard/products/123','products'],['/dashboard/collection-products','products'],['/dashboard/inventory','products'],['/dashboard/catalog/metals','catalog'],['/dashboard/navbar-builder','catalog'],['/dashboard/cms/about','cms'],['/dashboard/bespoke','cms'],['/dashboard','operations'],['/dashboard/settings','operations'],['/dashboard/orders/123','operations'],['/dashboard/media','demo'],['/dashboard/crm','demo'],['/dashboard/search','local'],['/dashboard/unknown','unknown']])assert.equal(adminPageDataGroup(path),group,path)
})
test('unauthenticated and invalid-group requests do not inspect configuration or query RDS',async()=>{
 let reads=0,providers=0
 for(const authorized of [false,true]){
  const handler=createAdminDataSourceStatus({authorized:async()=>authorized,provider:()=>{providers++;return 'rds'},read:async()=>{reads++}})
  const response=await handler(request('products; DROP TABLE products'))
  assert.equal(response.status,authorized?400:401);assert.deepEqual(await response.json(),{source:'unknown',checked:false})
  assert.equal(response.headers.get('cache-control'),'no-store')
 }
 assert.equal(reads,0);assert.equal(providers,0)
})
test('each RDS section performs its fixed representative read before reporting verified',async()=>{
 for(const group of Object.keys(adminDataReadProbes)){
  const queries=[]
  const handler=createAdminDataSourceStatus({authorized:async()=>true,provider:()=> 'rds',read:async sql=>{queries.push(sql)}})
  const response=await handler(request(group)),result=await response.json()
  assert.equal(response.status,200);assert.deepEqual(queries,[adminDataReadProbes[group]])
  assert.deepEqual(result,{source:'rds',checked:true,group});assert.equal(dataSourcePresentation(result.source,result.checked).text,'RDS read verified')
 }
})
test('read failure retains the selected RDS source, exposes no internals, and never claims verification',async()=>{
 const handler=createAdminDataSourceStatus({authorized:async()=>true,provider:()=> 'rds',read:async()=>{throw Error('private connection details')}})
 const response=await handler(request('cms')),value=await response.json()
 assert.equal(response.status,503);assert.deepEqual(value,{source:'rds',checked:false})
 assert.equal(dataSourcePresentation(value.source,value.checked).text,'RDS read unavailable')
 const invalid=createAdminDataSourceStatus({authorized:async()=>true,provider:()=>{throw Error('private config')},read:async()=>assert.fail()})
 assert.deepEqual(await (await invalid(request('cms'))).json(),{source:'unknown',checked:false})
})
test('route uses a read-only transaction and badge is mounted in the shared top bar',()=>{
 const route=fs.readFileSync('app/api/admin/data-source-status/route.ts','utf8')
 assert.match(route,/getAdminServerSession/);assert.match(route,/snapshot: true/)
 assert.match(fs.readFileSync('components/topbar.tsx','utf8'),/<AdminDataSourceStatus\s*\/>/)
 const component=fs.readFileSync('components/admin-data-source-status.tsx','utf8')
 assert.match(component,/controller\.abort\(\)/);assert.match(component,/result\?\.group === group/)
})
