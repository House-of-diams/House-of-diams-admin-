// In-memory PostgreSQL only. Never loads env files or contacts Supabase.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const actor = '00000000-0000-4000-8000-000000000002'
const productId = '10000000-0000-4000-8000-000000000001'
const categoryId = '20000000-0000-4000-8000-000000000001'

const post = (title = 'Article') => ({
  slug_base: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title, title_html: title,
  card_title: '', subtitle: 'Subtitle', category: 'Guides', catalog_category_id: categoryId,
  author: 'Admin', date_label: 'Today', read_time: '5 min', bg_key: 'bg-0', bg_color: '#fff',
  hero_image_path: '', card_image_path: '', hero_image_alt: '', body_html: '<p>Body</p>',
  is_published: true, sort_order: 1,
})
const tags = [{ tag: 'Guide' }]
const products = [{ product_id: productId }]
const blocks = [{ block_type: 'text', heading: '', body_html: '<p>Block</p>', image_path: '', image_alt: '', image_caption: '', is_enabled: true }]

async function articleSnapshot(kind, id) {
  return (await db.query('select public.cms_article_snapshot_v1($1,$2) result', [kind, id])).rows[0].result
}
async function articleSave(kind, id, revision, articlePost, articleTags, articleProducts, articleBlocks, deleted = [[], [], []], requestId = randomUUID()) {
  return (await db.query('select public.cms_save_article_v1($1,$2,$3,$4::bigint,$5,$6,$7,$8,$9,$10,$11,$12) result',
    [actor,requestId,kind,id,revision,JSON.stringify(articlePost),JSON.stringify(articleTags),JSON.stringify(articleProducts),JSON.stringify(articleBlocks),...deleted])).rows[0].result
}
async function docsSnapshot(slug = 'shipping') {
  return (await db.query('select public.cms_docs_snapshot_v1($1) result', [slug])).rows[0].result
}
async function docsSave(before, page, docsBlocks, deleted = [], requestId = randomUUID(), slug = 'shipping') {
  return (await db.query('select public.cms_save_docs_page_v1($1,$2,$3,$4,$5,$6,$7) result',
    [actor,requestId,slug,before.revision,JSON.stringify(page),JSON.stringify(docsBlocks),deleted])).rows[0].result
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.profiles(id uuid primary key,role text not null);
    insert into public.profiles values('${actor}','admin');
    create table public.cms_save_receipts(actor_id uuid,request_id uuid,operation text,payload_hash text,result jsonb,created_at timestamptz default now(),primary key(actor_id,request_id));
    create table public.products(id uuid primary key,slug text,name text,base_price numeric,status text);
    insert into public.products values('${productId}','ring','Ring',100,'active');
    create table public.catalog_categories(id uuid primary key,name text); insert into public.catalog_categories values('${categoryId}','Rings');
    create table public.support_faq_categories(id bigint generated always as identity primary key,name text); insert into public.support_faq_categories(name) values('Returns');

    create table public.blog_posts(id bigint generated always as identity primary key,slug text not null,title text not null,title_html text not null,card_title text,subtitle text not null,category text not null,catalog_category_id uuid,author text not null,date_label text not null,read_time text not null,bg_key text not null,bg_color text not null,hero_image_path text not null,card_image_path text,hero_image_alt text,body_html text not null,is_published boolean not null,sort_order integer not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.blog_post_tags(id bigint generated always as identity primary key,post_id bigint not null references public.blog_posts(id),tag text not null,sort_order integer not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.blog_post_products(id bigint generated always as identity primary key,post_id bigint not null references public.blog_posts(id),product_id uuid not null references public.products(id),sort_order integer not null,created_at timestamptz default now());
    create table public.blog_post_content_blocks(id bigint generated always as identity primary key,post_id bigint not null references public.blog_posts(id),block_type text not null,sort_order integer not null,heading text,body_html text,image_path text,image_alt text,image_caption text,is_enabled boolean not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.education_posts(id bigint generated always as identity primary key,slug text not null,title text not null,title_html text not null,card_title text,subtitle text not null,category text not null,author text not null,date_label text not null,read_time text not null,bg_key text not null,bg_color text not null,hero_image_path text not null,card_image_path text,hero_image_alt text,body_html text not null,is_published boolean not null,sort_order integer not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.education_post_tags(id bigint generated always as identity primary key,post_id bigint not null references public.education_posts(id),tag text not null,sort_order integer not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.education_post_products(id bigint generated always as identity primary key,post_id bigint not null references public.education_posts(id),product_id uuid not null references public.products(id),sort_order integer not null,created_at timestamptz default now());
    create table public.education_post_content_blocks(id bigint generated always as identity primary key,post_id bigint not null references public.education_posts(id),block_type text not null,sort_order integer not null,heading text,body_html text,image_path text,image_alt text,image_caption text,is_enabled boolean not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.docs_pages(id bigint generated always as identity primary key,slug text not null,title text not null,eyebrow text not null,subtitle text not null,faq_category_id bigint,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.docs_blocks(id bigint generated always as identity primary key,page_id bigint not null references public.docs_pages(id),sort_order integer not null,heading text not null,description text not null,body text not null,created_at timestamptz default now(),updated_at timestamptz default now());
    insert into public.docs_pages(slug,title,eyebrow,subtitle) values('shipping','Shipping','Help','Shipping information');
  `)
  const migration = await readFile(new URL('../sql/202609240007_cms_articles_docs_atomic_save.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration)
})

beforeEach(async () => {
  await db.exec(`truncate public.blog_post_content_blocks,public.blog_post_products,public.blog_post_tags,public.blog_posts,
    public.education_post_content_blocks,public.education_post_products,public.education_post_tags,public.education_posts,
    public.docs_blocks,public.cms_save_receipts restart identity cascade;
    update public.docs_pages set title='Shipping',eyebrow='Help',subtitle='Shipping information',faq_category_id=null,updated_at=now();`)
})
after(async () => db.close())

for (const kind of ['blog','education']) {
  test(`${kind} create and update preserve every relation ID`, async () => {
    let state = await articleSave(kind,null,null,post(kind),tags,products,blocks)
    const ids = [state.post.id,state.tags[0].id,state.products[0].id,state.content_blocks[0].id]
    state = await articleSave(kind,state.post.id,state.revision,{...post(kind),subtitle:'Changed'},
      [{id:String(state.tags[0].id),tag:'Updated'}],[{id:String(state.products[0].id),product_id:productId}],
      [{...blocks[0],id:String(state.content_blocks[0].id)}])
    assert.deepEqual([state.post.id,state.tags[0].id,state.products[0].id,state.content_blocks[0].id],ids)
    assert.equal(state.post.subtitle,'Changed')
  })
}

test('article stale writes and implicit relation deletion change nothing', async () => {
  const created = await articleSave('blog',null,null,post(),tags,products,blocks)
  await assert.rejects(articleSave('blog',created.post.id,created.revision,post(),[],created.products,created.content_blocks),/explicitly removed/)
  const updated = await articleSave('blog',created.post.id,created.revision,{...post(),subtitle:'New'},created.tags,created.products,created.content_blocks)
  await assert.rejects(articleSave('blog',created.post.id,created.revision,{...post(),subtitle:'Stale'},updated.tags,updated.products,updated.content_blocks),/changed since/)
  assert.equal((await articleSnapshot('blog',created.post.id)).post.subtitle,'New')
})

test('article retries are idempotent and late failures roll back the parent', async () => {
  const requestId=randomUUID()
  const first=await articleSave('blog',null,null,post(),tags,products,blocks,[[],[],[]],requestId)
  assert.deepEqual(await articleSave('blog',null,null,post(),tags,products,blocks,[[],[],[]],requestId),first)
  await db.exec("alter table public.blog_post_content_blocks add constraint reject_failure check(body_html <> '<p>FAIL</p>')")
  try {
    await assert.rejects(articleSave('blog',first.post.id,first.revision,{...post(),subtitle:'Must roll back'},first.tags,first.products,[{...blocks[0],id:String(first.content_blocks[0].id),body_html:'<p>FAIL</p>'}]))
    assert.equal((await articleSnapshot('blog',first.post.id)).post.subtitle,'Subtitle')
  } finally { await db.exec('alter table public.blog_post_content_blocks drop constraint reject_failure') }
})

test('article deletion is revision checked and atomic', async () => {
  const state=await articleSave('education',null,null,post('Delete'),tags,products,blocks)
  await assert.rejects(db.query('select public.cms_delete_article_v1($1,$2,$3,$4,$5)',[actor,randomUUID(),'education',state.post.id,'00000000000000000000000000000000']),/changed since/)
  const deleted=(await db.query('select public.cms_delete_article_v1($1,$2,$3,$4,$5) result',[actor,randomUUID(),'education',state.post.id,state.revision])).rows[0].result
  assert.equal(deleted.ok,true)
  await assert.rejects(articleSnapshot('education',state.post.id),/not found/)
})

test('slug collisions are serialized into distinct stable URLs', async () => {
  const first=await articleSave('blog',null,null,post('Same title'),tags,products,blocks)
  const second=await articleSave('blog',null,null,post('Same title'),tags,products,blocks)
  assert.equal(first.post.slug,'same-title')
  assert.equal(second.post.slug,'same-title-2')
})

test('a parent delete failure restores all article children', async () => {
  const state=await articleSave('blog',null,null,post('Protected'),tags,products,blocks)
  await db.exec(`create table delete_guard(post_id bigint references public.blog_posts(id)); insert into delete_guard values(${state.post.id})`)
  try {
    await assert.rejects(db.query('select public.cms_delete_article_v1($1,$2,$3,$4,$5)',[actor,randomUUID(),'blog',state.post.id,state.revision]))
    const after=await articleSnapshot('blog',state.post.id)
    assert.equal(after.tags.length,1)
    assert.equal(after.products.length,1)
    assert.equal(after.content_blocks.length,1)
  } finally { await db.exec('drop table delete_guard') }
})

test('docs preserve block IDs, require explicit deletion, and reject stale saves', async () => {
  let state=await docsSnapshot()
  state=await docsSave(state,{title:'Shipping',eyebrow:'Help',subtitle:'Updated',faq_category_id:null},[{heading:'When',description:'Soon',body:'<p>Body</p>'}])
  const id=state.blocks[0].id
  const stale=state
  state=await docsSave(state,{title:'Shipping',eyebrow:'Help',subtitle:'Again',faq_category_id:null},[{id:String(id),heading:'When',description:'Later',body:'<p>Body</p>'}])
  assert.equal(state.blocks[0].id,id)
  await assert.rejects(docsSave(stale,{title:'Shipping',eyebrow:'Help',subtitle:'Stale',faq_category_id:null},stale.blocks),/changed since/)
  await assert.rejects(docsSave(state,{title:'Shipping',eyebrow:'Help',subtitle:'Implicit',faq_category_id:null},[]),/explicitly removed/)
})

test('docs retries are idempotent and a late block failure rolls back the page', async () => {
  const before=await docsSnapshot()
  const requestId=randomUUID()
  const page={title:'Shipping',eyebrow:'Help',subtitle:'Saved once',faq_category_id:null}
  const first=await docsSave(before,page,[{heading:'One',description:'Description',body:'<p>Body</p>'}],[],requestId)
  assert.deepEqual(await docsSave(before,page,[{heading:'One',description:'Description',body:'<p>Body</p>'}],[],requestId),first)
  await db.exec("alter table public.docs_blocks add constraint reject_docs_failure check(heading <> 'FAIL')")
  try {
    await assert.rejects(docsSave(first,{...page,subtitle:'Must roll back'},[{id:String(first.blocks[0].id),heading:'FAIL',description:'Description',body:'<p>Body</p>'}]))
    assert.equal((await docsSnapshot()).page.subtitle,'Saved once')
  } finally { await db.exec('alter table public.docs_blocks drop constraint reject_docs_failure') }
})

test('public roles cannot execute Group 4 RPCs', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`)
    await assert.rejects(docsSnapshot(),/permission denied/)
    await db.exec('reset role')
  }
})
