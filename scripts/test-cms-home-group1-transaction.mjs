// In-memory PostgreSQL only. Never loads env files or contacts Supabase.
import { before, after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const actor = '00000000-0000-4000-8000-000000000001'
const rpc = async (kind, before, section, items, deleted = [], requestId = randomUUID()) =>
  (await db.query('select public.cms_save_home_group1_v1($1,$2,$3,$4,$5,$6,$7) result',
    [actor, requestId, before.revision, kind, JSON.stringify(section), JSON.stringify(items), deleted])).rows[0].result
const snapshot = async (kind) => (await db.query('select public.cms_home_group1_snapshot_v1($1) result', [kind])).rows[0].result

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create type public.cms_status as enum ('active','hidden');
    create table public.profiles(id uuid primary key, role text not null);
    insert into public.profiles values ('${actor}','admin');
    create table public.cms_save_receipts(actor_id uuid,request_id uuid,operation text,payload_hash text,result jsonb,created_at timestamptz default now(),primary key(actor_id,request_id));
    create table public.homepage_hero(id bigint generated always as identity primary key,section_key text unique not null,eyebrow text default '',headline text default '',subtitle text default '',is_active boolean default true,slider_enabled boolean default false,seo_title text,seo_description text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.homepage_hero_slider_items(id bigint generated always as identity primary key,hero_id bigint references public.homepage_hero,sort_order integer not null,image_path text not null default '',mobile_image_path text not null default '',headline text,subtitle text,button_text text not null default '',button_link text not null default '',created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.collection_items(id bigint generated always as identity primary key,sort_order integer not null,label text not null,title text not null,description text not null,image_path text not null,link text not null);
    create table public.certifications_section(id bigint generated always as identity primary key,section_key text unique not null,eyebrow text not null,heading text not null);
    create table public.certifications_items(id bigint generated always as identity primary key,sort_order integer not null,title text not null,description text not null,badge text not null,icon_path text not null);
    create table public.catalog_stone_shapes(id uuid primary key,status text not null default 'active');
    create table public.discover_shapes_items(id uuid primary key default gen_random_uuid(),title text not null,description text not null default '',image_path text not null,image_alt text,shape_id uuid references public.catalog_stone_shapes,sort_order integer not null default 0,status text not null default 'active',created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.products(id uuid primary key,status text not null);
    create table public.cms_home_bestsellers(id uuid primary key default gen_random_uuid(),eyebrow text,heading text not null,status public.cms_status not null default 'active',cta_label text,cta_href text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.cms_home_bestseller_products(id uuid primary key default gen_random_uuid(),section_id uuid references public.cms_home_bestsellers,product_id uuid references public.products,display_order integer not null default 0,display_title text,display_image_path text,created_at timestamptz default now());
    create table public.catalog_categories(id uuid primary key,status text not null);
    create table public.catalog_subcategories(id uuid primary key,status text not null);
    create table public.catalog_options(id uuid primary key,status text not null);
    create table public.homepage_shop_by_category(id bigint generated always as identity primary key,section_key text unique not null,heading text not null,shop_all_label text,shop_all_link text,is_enabled boolean not null,desktop_columns smallint not null,tablet_columns smallint not null,mobile_columns smallint not null,display_order integer default 2,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.homepage_shop_by_category_items(id bigint generated always as identity primary key,section_id bigint references public.homepage_shop_by_category,item_type text not null,category_id uuid references public.catalog_categories,subcategory_id uuid references public.catalog_subcategories,option_id uuid references public.catalog_options,display_order integer not null,is_active boolean not null,created_at timestamptz default now(),updated_at timestamptz default now());
  `)
  await db.exec(await readFile(new URL('../sql/202609240005_cms_home_group1_atomic_save.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../sql/202609240005_cms_home_group1_atomic_save.sql', import.meta.url), 'utf8'))
})
beforeEach(async () => {
  await db.exec(`truncate public.homepage_hero_slider_items,public.homepage_hero,public.collection_items,public.certifications_items,public.certifications_section,public.discover_shapes_items,public.cms_home_bestseller_products,public.cms_home_bestsellers,public.homepage_shop_by_category_items,public.homepage_shop_by_category,public.products,public.catalog_stone_shapes,public.catalog_categories,public.catalog_subcategories,public.catalog_options,public.cms_save_receipts restart identity cascade`)
})
after(async()=>db.close())

test('hero preserves existing IDs, creates new IDs and deletes explicitly', async () => {
  await db.exec("insert into public.homepage_hero(section_key) values('home_hero')")
  let before=await snapshot('hero')
  let saved=await rpc('hero',before,{slider_enabled:true,seo_title:'T',seo_description:'D'},[{image_path:'a',mobile_image_path:'m',headline:'H',subtitle:'S',button_text:'B',button_link:'/x'}])
  const id=saved.items[0].id
  saved=await rpc('hero',saved,{slider_enabled:true,seo_title:'T',seo_description:'D'},[{id:String(id),image_path:'b',mobile_image_path:'m',headline:'H',subtitle:'S',button_text:'B',button_link:'/x'},{image_path:'c',mobile_image_path:'',headline:'',subtitle:'',button_text:'',button_link:''}])
  assert.equal(saved.items[0].id,id); assert.equal(saved.items.length,2)
  const removed=await rpc('hero',saved,{slider_enabled:true,seo_title:'T',seo_description:'D'},[saved.items[1]], [String(id)])
  assert.equal(removed.items.length,1)
})

test('collection, certifications and shapes preserve identities', async () => {
  let s=await snapshot('collection')
  s=await rpc('collection',s,null,[{label:'L',title:'T',description:'D',image_path:'i',link:'/'}])
  const collectionId=s.items[0].id
  s=await rpc('collection',s,null,[{id:String(collectionId),label:'L2',title:'T',description:'D',image_path:'i',link:'/'}])
  assert.equal(s.items[0].id,collectionId)
  let c=await snapshot('certifications')
  c=await rpc('certifications',c,{eyebrow:'E',heading:'H'},[{title:'T',description:'',badge:'',icon_path:'i'}])
  const certId=c.items[0].id
  c=await rpc('certifications',c,{eyebrow:'E',heading:'H'},[{...c.items[0],id:String(certId),title:'T2'}])
  assert.equal(c.items[0].id,certId)
  const shapeId=randomUUID(); await db.query("insert into public.catalog_stone_shapes values($1,'active')",[shapeId])
  let d=await snapshot('discover_shapes')
  d=await rpc('discover_shapes',d,null,[{title:'Round',description:'',image_path:'i',image_alt:'Round',shape_id:shapeId}])
  const cardId=d.items[0].id
  d=await rpc('discover_shapes',d,null,[{...d.items[0],id:cardId,title:'Round 2'}])
  assert.equal(d.items[0].id,cardId)
})

test('bestsellers and shop preserve link row identities', async () => {
  const product=randomUUID(); await db.query("insert into public.products values($1,'active')",[product])
  let b=await snapshot('bestsellers')
  b=await rpc('bestsellers',b,{eyebrow:'E',heading:'H',cta_label:'View',cta_href:'/shop'},[{product_id:product,display_title:'',display_image_path:''}])
  const linkId=b.items[0].id
  b=await rpc('bestsellers',b,{eyebrow:'E',heading:'H',cta_label:'View',cta_href:'/shop'},[{...b.items[0],id:linkId,display_title:'Custom'}])
  assert.equal(b.items[0].id,linkId)
  const category=randomUUID(); await db.query("insert into public.catalog_categories values($1,'active')",[category])
  let s=await snapshot('shop_by_category')
  const section={heading:'Shop',shop_all_label:'All',shop_all_link:'/shop',is_enabled:true,desktop_columns:5,tablet_columns:3,mobile_columns:2}
  s=await rpc('shop_by_category',s,section,[{item_type:'category',category_id:category,subcategory_id:null,option_id:null,is_active:true}])
  const itemId=s.items[0].id
  s=await rpc('shop_by_category',s,section,[{...s.items[0],id:String(itemId),is_active:false}])
  assert.equal(s.items[0].id,itemId)
})

test('stale revisions and implicit deletes are rejected without data loss', async () => {
  let before=await snapshot('collection')
  let saved=await rpc('collection',before,null,[{label:'L',title:'T',description:'D',image_path:'i',link:'/'}])
  await assert.rejects(rpc('collection',before,null,[]),/changed since/)
  await assert.rejects(rpc('collection',saved,null,[]),/explicitly removed/)
  assert.deepEqual(await snapshot('collection'),saved)
})

test('a late constraint failure rolls the full section save back', async () => {
  let before=await snapshot('collection')
  let saved=await rpc('collection',before,null,[{label:'L',title:'T',description:'D',image_path:'i',link:'/'}])
  await db.exec("alter table public.collection_items add constraint no_fail check(title <> 'FAIL')")
  try {
    await assert.rejects(rpc('collection',saved,null,[{id:String(saved.items[0].id),label:'Changed',title:'T',description:'D',image_path:'i',link:'/'},{label:'X',title:'FAIL',description:'D',image_path:'i',link:'/'}]))
    assert.deepEqual(await snapshot('collection'),saved)
  } finally { await db.exec('alter table public.collection_items drop constraint no_fail') }
})

test('same request retry is idempotent and public roles cannot execute functions', async () => {
  const before=await snapshot('collection'), requestId=randomUUID(), items=[{label:'L',title:'T',description:'D',image_path:'i',link:'/'}]
  const first=await rpc('collection',before,null,items,[],requestId)
  assert.deepEqual(await rpc('collection',before,null,items,[],requestId),first)
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`)
    await assert.rejects(snapshot('collection'),/permission denied/)
    await db.exec('reset role')
  }
})
