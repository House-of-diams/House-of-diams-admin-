// Offline actual-source tests for the education hubs editor backend. No sockets or listeners.
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modules = new Map()
async function load(relative) {
  const filename = path.resolve(root, relative)
  if (modules.has(filename)) return modules.get(filename)
  let code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  for (const match of [...code.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)]) {
    const name = match[1]
    let url
    if (name === 'server-only') url = 'data:text/javascript,export {}'
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
const {exports:{loadEducationHubs,saveEducationHub,educationHubSaveSchema}}=await load('lib/education-hubs-save.ts')

const hubRow=(o={})=>({id:'1',slug:'diamond-4cs',name:'Diamond 4Cs',intro_html:'',pillar_post_id:null,seo_title:'',seo_description:'',seo_h1:'',seo_indexable:true,is_published:false,sort_order:1,...o})
function fakeDb(state={}){
  const calls=[];const s={hubs:[hubRow()],posts:[{id:'10',title:'Clarity',slug:'diamond-clarity',hub_id:'1'},{id:'11',title:'Other',slug:'other-guide',hub_id:null}],failInsert:false,...state}
  return {calls,store:s,db:{async query(sql,values=[]){
    calls.push([sql,values])
    if(/FROM public\.education_posts WHERE slug/.test(sql))return {rows:s.posts.filter(p=>p.slug===values[0]).map(p=>({id:p.id}))}
    if(/FROM public\.education_posts WHERE id/.test(sql))return {rows:s.posts.filter(p=>p.id===String(values[0])).map(p=>({id:p.id,hub_id:p.hub_id}))}
    if(/FROM public\.education_hubs WHERE id/.test(sql))return {rows:s.hubs.filter(h=>h.id===String(values[0]))}
    if(/FROM public\.education_hubs/.test(sql)&&/^\s*SELECT/.test(sql))return {rows:s.hubs}
    if(/FROM public\.education_posts/.test(sql)&&/^\s*SELECT/.test(sql))return {rows:s.posts}
    if(/INSERT INTO public\.education_hubs/.test(sql)){if(s.failInsert)throw Object.assign(new Error('dup'),{code:'23505'});return {rows:[{id:'2'}]}}
    if(/UPDATE public\.education_hubs/.test(sql))return {rows:s.hubs.some(h=>h.id===String(values[0]))?[{id:values[0]}]:[]}
    return {rows:[]}
  }}}
}
const hub=(o={})=>({id:null,slug:'metals',name:'Metals',intro_html:'<p>About metals</p>',pillar_post_id:null,seo_title:'',seo_description:'',seo_h1:'',seo_indexable:true,is_published:false,sort_order:2,...o})
async function body(f,h,expected){const {revision}=await loadEducationHubs(f.db);return {expected_revision:expected??revision,hub:h}}
const writes=f=>f.calls.filter(c=>/INSERT INTO|UPDATE public/.test(c[0]))

test('load returns the hubs, the article list for the pillar choice and a stable revision',async()=>{
  const f=fakeDb();const a=await loadEducationHubs(f.db),b=await loadEducationHubs(f.db)
  assert.equal(a.hubs.length,1);assert.equal(a.posts.length,2);assert.match(a.revision,/^[a-f0-9]{32}$/);assert.equal(a.revision,b.revision)
})
test('create binds every value as a parameter, locks first, sanitizes the intro and returns the fresh list',async()=>{
  const f=fakeDb();const input=await body(f,hub({name:"x'); DROP TABLE education_hubs; --",intro_html:'<p onclick="x()">a</p><script>alert(1)</script>'}));f.calls.length=0
  const result=await saveEducationHub(f.db,input)
  assert.match(f.calls[0][0],/pg_advisory_xact_lock/)
  const insert=f.calls.find(c=>/INSERT INTO public\.education_hubs/.test(c[0]));assert.ok(insert)
  assert.ok(!insert[0].includes('DROP'));assert.ok(insert[1].includes("x'); DROP TABLE education_hubs; --"))
  assert.ok(insert[1].every(v=>typeof v!=='string'||!/script|onclick/i.test(v)),'intro is sanitized')
  assert.match(result.revision,/^[a-f0-9]{32}$/)
})
test('update changes the row by id; a stale revision is refused with 409 and writes nothing',async()=>{
  const f=fakeDb();await saveEducationHub(f.db,await body(f,hub({id:1,slug:'diamond-4cs',name:'Renamed'})))
  assert.ok(f.calls.some(c=>/UPDATE public\.education_hubs/.test(c[0])))
  const g=fakeDb();const stale=await body(g,hub({id:1,slug:'diamond-4cs'}),'0'.repeat(32));g.calls.length=0
  await assert.rejects(()=>saveEducationHub(g.db,stale),e=>e.status===409);assert.equal(writes(g).length,0)
})
test('a hub address can never change after creation (it would break links with no redirect)',async()=>{
  const f=fakeDb();const input=await body(f,hub({id:1,slug:'new-address'}));f.calls.length=0
  await assert.rejects(()=>saveEducationHub(f.db,input),e=>e.status===400&&/address/i.test(e.message));assert.equal(writes(f).length,0)
})
test('a hub address may not equal an existing article address',async()=>{
  const f=fakeDb();const input=await body(f,hub({slug:'diamond-clarity'}));f.calls.length=0
  await assert.rejects(()=>saveEducationHub(f.db,input),e=>e.status===400&&/article/i.test(e.message));assert.equal(writes(f).length,0)
})
test('the pillar article must belong to the hub',async()=>{
  const f=fakeDb()
  await assert.rejects(async()=>saveEducationHub(f.db,await body(f,hub({id:1,slug:'diamond-4cs',pillar_post_id:11}))),e=>e.status===400&&/pillar/i.test(e.message))
  await assert.rejects(async()=>saveEducationHub(f.db,await body(f,hub({id:1,slug:'diamond-4cs',pillar_post_id:999}))),e=>e.status===400)
  assert.equal(writes(f).length,0)
  await saveEducationHub(f.db,await body(f,hub({id:1,slug:'diamond-4cs',pillar_post_id:10})))
  assert.ok(f.calls.some(c=>/UPDATE public\.education_hubs/.test(c[0])))
})
test('a new hub cannot name a pillar article (it has no articles yet)',async()=>{
  const f=fakeDb();await assert.rejects(async()=>saveEducationHub(f.db,await body(f,hub({pillar_post_id:10}))),e=>e.status===400);assert.equal(writes(f).length,0)
})
test('hostile or malformed input is rejected before any SQL',async()=>{
  const base=hub()
  const bad=[{...base,slug:'Bad Slug'},{...base,slug:'a--b'},{...base,slug:'-a'},{...base,slug:'../x'},{...base,slug:'x'.repeat(81)},{...base,slug:''},{...base,name:''},{...base,name:'   '},{...base,name:'x'.repeat(121)},
    {...base,intro_html:'x'.repeat(20001)},{...base,seo_title:'x'.repeat(121)},{...base,seo_description:'x'.repeat(501)},{...base,seo_h1:'x'.repeat(161)},{...base,seo_indexable:'yes'},{...base,is_published:1},
    {...base,sort_order:1.5},{...base,sort_order:'a'},{...base,sort_order:2_000_000_000_000},{...base,pillar_post_id:'abc'},{...base,pillar_post_id:-1},{...base,extra:true},{...base,id:0},{...base,id:'1; DROP'}]
  for(const h of bad){const f=fakeDb();const input={expected_revision:'a'.repeat(32),hub:h};await assert.rejects(()=>saveEducationHub(f.db,input),undefined,JSON.stringify(h).slice(0,80));assert.equal(f.calls.length,0,JSON.stringify(h).slice(0,80))}
  for(const input of [null,'text',{},{hub:base},{expected_revision:'nope',hub:base},{expected_revision:'a'.repeat(32),hub:base,extra:1}]){const f=fakeDb();await assert.rejects(()=>saveEducationHub(f.db,input));assert.equal(f.calls.length,0)}
  assert.ok(educationHubSaveSchema.safeParse({expected_revision:'a'.repeat(32),hub:base}).success)
})
test('a duplicate address from the database is passed up as a database error, not swallowed',async()=>{
  const f=fakeDb({failInsert:true});await assert.rejects(async()=>saveEducationHub(f.db,await body(f,hub())),e=>e.code==='23505')
})
test('updating a hub that no longer exists is a 404 and writes nothing else',async()=>{
  const f=fakeDb({hubs:[]});await assert.rejects(async()=>saveEducationHub(f.db,await body(f,hub({id:1,slug:'diamond-4cs'}))),e=>e.status===404)
})
