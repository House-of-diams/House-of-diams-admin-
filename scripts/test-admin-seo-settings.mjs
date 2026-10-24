// Offline actual-source tests for the SEO settings editor backend. No sockets or listeners.
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sentinel = 'data:text/javascript,export {}'
const modules = new Map()
async function load(relative) {
  const filename = path.resolve(root, relative)
  if (modules.has(filename)) return modules.get(filename)
  let code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  for (const match of [...code.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)]) {
    const name = match[1]
    let url
    if (name === 'server-only') url = sentinel
    else if (name.startsWith('.') || name.startsWith('@/')) {
      let target = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name)
      if (!path.extname(target)) target += '.ts'
      url = (await load(target)).url
    } else url = import.meta.resolve(name)
    code = code.replaceAll(`'${name}'`, `'${url}'`).replaceAll(`"${name}"`, `"${url}"`)
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  const loaded = {url, exports: await import(url)}
  modules.set(filename, loaded)
  return loaded
}
const {exports:{loadSeoSettings,saveSeoSettings,seoSettingsSaveSchema,pageSeoKeys}}=await load('lib/seo-settings-save.ts')

const site={org_name:'House of Diams',org_logo_path:'/images/logo.png',org_same_as:['https://www.instagram.com/hod'],default_og_image_path:'',google_site_verification:'abc_DEF-123',bing_site_verification:''}
const pageRow=key=>({page_key:key,seo_title:'',seo_description:'',og_image_path:'',seo_indexable:true})
function fakeDb(state={}){
  const calls=[];const store={pages:pageSeoKeys.map(pageRow),site:{...site},...state}
  return {calls,store,db:{async query(sql,values=[]){
    calls.push([sql,values])
    if(/FROM public\.page_seo/.test(sql)&&/^\s*SELECT/.test(sql))return {rows:store.pages}
    if(/FROM public\.site_settings/.test(sql))return {rows:store.noSite?[]:[store.site]}
    if(/UPDATE public\.page_seo/.test(sql))return {rows:store.pages.some(p=>p.page_key===values[0])?[{page_key:values[0]}]:[]}
    if(/UPDATE public\.site_settings/.test(sql))return {rows:store.noSite?[]:[{settings_key:'global_site_settings'}]}
    return {rows:[]}
  }}}
}
async function validBody(f){const {revision}=await loadSeoSettings(f.db);return {expected_revision:revision,pages:[{...pageRow('about'),seo_title:'About House of Diams'}],site}}

test('load returns every page, the site details and a stable revision',async()=>{
  const f=fakeDb();const a=await loadSeoSettings(f.db);const b=await loadSeoSettings(f.db)
  assert.equal(a.pages.length,13);assert.match(a.revision,/^[a-f0-9]{32}$/);assert.equal(a.revision,b.revision)
  assert.notEqual(a.revision,(await loadSeoSettings(fakeDb({site:{...site,org_name:'Other'}}).db)).revision)
})
test('load fails clearly when the site settings row is missing',async()=>{
  await assert.rejects(()=>loadSeoSettings(fakeDb({noSite:true}).db),/not set up/)
})
test('save binds every value as a parameter, takes the lock first and returns the fresh snapshot',async()=>{
  const f=fakeDb();const body=await validBody(f);f.calls.length=0
  body.pages[0].seo_title="x'); DROP TABLE page_seo; --"
  const result=await saveSeoSettings(f.db,body)
  assert.match(f.calls[0][0],/pg_advisory_xact_lock/)
  const update=f.calls.find(c=>/UPDATE public\.page_seo/.test(c[0]));assert.equal(update[1][1],body.pages[0].seo_title);assert.ok(!update[0].includes('DROP'))
  const siteUpdate=f.calls.find(c=>/UPDATE public\.site_settings/.test(c[0]));assert.deepEqual(siteUpdate[1][3],['https://www.instagram.com/hod'])
  assert.match(result.revision,/^[a-f0-9]{32}$/)
})
test('a stale revision is refused with 409 and writes nothing',async()=>{
  const f=fakeDb();const body=await validBody(f);body.expected_revision='0'.repeat(32);f.calls.length=0
  await assert.rejects(()=>saveSeoSettings(f.db,body),e=>e.status===409)
  assert.ok(!f.calls.some(c=>/UPDATE/.test(c[0])))
})
test('hostile or malformed input is rejected before any SQL',async()=>{
  const base=await validBody(fakeDb())
  const bad=[
    {...base,pages:[{...pageRow('admin')}]},{...base,pages:[{...pageRow('about'),seo_title:'x'.repeat(121)}]},{...base,pages:[{...pageRow('about'),seo_description:'x'.repeat(501)}]},
    {...base,pages:[pageRow('about'),pageRow('about')]},{...base,pages:[{...pageRow('about'),extra:1}]},{...base,pages:[{...pageRow('about'),seo_indexable:'no'}]},
    {...base,pages:[{...pageRow('about'),og_image_path:'javascript:alert(1)'}]},{...base,pages:[{...pageRow('about'),og_image_path:'//evil.example/x.png'}]},
    {...base,site:{...site,org_logo_path:'data:text/html,<script>'}},{...base,site:{...site,org_same_as:['http://insecure.example']}},{...base,site:{...site,org_same_as:['javascript:alert(1)']}},
    {...base,site:{...site,org_same_as:Array(21).fill('https://a.example')}},{...base,site:{...site,google_site_verification:'"><script>alert(1)</script>'}},{...base,site:{...site,bing_site_verification:'<meta name=x>'}},
    {...base,site:{...site,unknown:1}},{...base,expected_revision:'nope'},{...base,extra:true},null,'text',
  ]
  for(const input of bad){const f=fakeDb();await assert.rejects(()=>saveSeoSettings(f.db,input),undefined,JSON.stringify(input)?.slice(0,90));assert.equal(f.calls.length,0)}
  assert.ok(seoSettingsSaveSchema.safeParse(base).success)
})
test('unknown page rows and a missing site row fail loudly instead of silently succeeding',async()=>{
  const missingPage=fakeDb({pages:pageSeoKeys.filter(k=>k!=='about').map(pageRow)});const body=await validBody(missingPage)
  await assert.rejects(()=>saveSeoSettings(missingPage.db,body),e=>e.status===404)
})
