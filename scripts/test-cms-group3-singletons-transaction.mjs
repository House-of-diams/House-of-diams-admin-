// In-memory PostgreSQL only. Never loads env files or contacts Supabase.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const actor = '00000000-0000-4000-8000-000000000003'
const snapshot = async (kind) => (await db.query('select public.cms_singleton_snapshot_v1($1) result', [kind])).rows[0].result
const save = async (kind, before, item, requestId = randomUUID()) =>
  (await db.query('select public.cms_save_singleton_v1($1,$2,$3,$4,$5) result', [actor, requestId, before.revision, kind, JSON.stringify(item)])).rows[0].result

const examples = {
  about_hero: { section_key: 'about_hero', is_enabled: true, media_type: 'image', desktop_media_path: 'hero.webp', mobile_media_path: '', video_poster_path: '', media_alt: 'Hero', show_text_overlay: true, heading: 'About', paragraph: 'Story', show_button: true, button_label: 'Read', button_link: '/about', overlay_position: 'left', overlay_scrim_enabled: true },
  about_wide_banner: { section_key: 'about_wide_banner', is_enabled: true, desktop_image_path: 'wide.webp', mobile_image_path: '', image_alt: 'Wide', heading: 'Craft', paragraph: 'Details', show_button: false, button_label: '', button_link: '', content_position: 'bottom-center', sort_order: 1 },
  blog_hero: { is_enabled: true, heading: 'Journal', paragraph: 'Stories', button_label: 'Explore', button_link: '/blog', desktop_image_path: 'blog.webp', desktop_image_alt: 'Journal', mobile_image_path: '', mobile_image_alt: '' },
  education_hero: { is_enabled: true, heading: 'Education', paragraph: 'Learn', button_label: 'Explore', button_link: '/education', desktop_image_path: 'education.webp', desktop_image_alt: 'Education', mobile_image_path: '', mobile_image_alt: '' },
  contact_hero: { section_key: 'contact_hero', eyebrow: 'Contact', heading: 'Speak with us', subtitle: 'We are here.' },
  bespoke_showcase: { is_enabled: true, eyebrow: 'Atelier', heading: 'One of one', subtitle: 'Made for you', cta_label: 'Begin', image_path: 'bespoke.webp', mobile_image_path: '', image_alt: 'Bespoke', sort_order: 1 },
  collection_page: { page_enabled: true, show_in_footer: true, show_home_showcase: true, showcase_heading: 'Collection', showcase_subtitle: 'Explore', showcase_cta_label: 'View', showcase_cta_href: '/collection', showcase_image_path: 'collection.webp', showcase_mobile_image_path: '' },
  hiphop_showcase: { is_enabled: true, eyebrow: 'Hip Hop', heading_line_1: 'Ice', heading_line_2: 'That', heading_emphasis: 'Speaks', cta_label: 'Shop', cta_link: '/hiphop', image_path: 'hiphop.webp', image_alt: 'Hip Hop' },
}

const tableByKind = {
  about_hero: 'about_hero', about_wide_banner: 'about_wide_banner', blog_hero: 'blog_page_hero', education_hero: 'education_page_hero',
  contact_hero: 'contact_hero', bespoke_showcase: 'home_bespoke_showcase_section', collection_page: 'collection_page_config', hiphop_showcase: 'hiphop_showcase_section',
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.profiles(id uuid primary key,role text not null);
    insert into public.profiles values('${actor}','admin');
    create table public.cms_save_receipts(actor_id uuid,request_id uuid,operation text,payload_hash text,result jsonb,created_at timestamptz default now(),primary key(actor_id,request_id));
    create table public.about_hero(id bigint generated always as identity primary key,section_key text unique not null,is_enabled boolean not null,media_type text not null,desktop_media_path text,mobile_media_path text,video_poster_path text,media_alt text not null,show_text_overlay boolean not null,heading text not null,paragraph text not null,show_button boolean not null,button_label text not null,button_link text not null,overlay_position text not null,overlay_scrim_enabled boolean not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.about_wide_banner(id bigint generated always as identity primary key,section_key text unique not null,is_enabled boolean not null,desktop_image_path text,mobile_image_path text,image_alt text,heading text,paragraph text,show_button boolean not null,button_label text,button_link text,content_position text not null,sort_order integer not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.blog_page_hero(id smallint primary key,is_enabled boolean not null,heading text not null,paragraph text,button_label text,button_link text,desktop_image_path text,desktop_image_alt text,mobile_image_path text,mobile_image_alt text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.education_page_hero(id smallint primary key,is_enabled boolean not null,heading text not null,paragraph text,button_label text,button_link text,desktop_image_path text,desktop_image_alt text,mobile_image_path text,mobile_image_alt text,updated_at timestamptz default now());
    create table public.contact_hero(id bigint generated always as identity primary key,section_key text unique not null,eyebrow text not null,heading text not null,subtitle text not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.home_bespoke_showcase_section(id uuid primary key default '10000000-0000-4000-8000-000000000001',section_key text unique not null,is_enabled boolean not null,eyebrow text not null,heading text not null,subtitle text not null,cta_label text not null,image_path text,mobile_image_path text,image_alt text not null,sort_order integer not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.collection_page_config(id uuid primary key default '10000000-0000-4000-8000-000000000002',section_key text unique not null,page_enabled boolean not null,show_in_footer boolean not null,show_home_showcase boolean not null,showcase_heading text,showcase_subtitle text,showcase_cta_label text,showcase_cta_href text,showcase_image_path text,showcase_mobile_image_path text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.hiphop_showcase_section(id bigint generated always as identity primary key,section_key text unique not null,is_enabled boolean not null,eyebrow text not null,heading_line_1 text not null,heading_line_2 text not null,heading_emphasis text not null,cta_label text not null,cta_link text not null,image_path text not null,image_alt text not null,created_at timestamptz default now(),updated_at timestamptz default now());
  `)
  const migration = await readFile(new URL('../sql/202609250008_cms_group3_singletons_atomic_save.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration)
})

beforeEach(async () => {
  await db.exec('truncate public.about_hero,public.about_wide_banner,public.blog_page_hero,public.education_page_hero,public.contact_hero,public.home_bespoke_showcase_section,public.collection_page_config,public.hiphop_showcase_section,public.cms_save_receipts restart identity cascade')
})

after(async () => db.close())

test('all eight singleton kinds create and update without replacing their IDs', async () => {
  for (const [kind, item] of Object.entries(examples)) {
    let state = await snapshot(kind)
    state = await save(kind, state, item)
    const firstId = (await db.query(`select id::text id from public.${tableByKind[kind]}`)).rows[0].id
    state = await save(kind, state, { ...item, ...(kind === 'contact_hero' ? { heading: 'Updated heading' } : { is_enabled: false }) })
    const secondId = (await db.query(`select id::text id from public.${tableByKind[kind]}`)).rows[0].id
    assert.equal(secondId, firstId, `${kind} replaced its stored row`)
    assert.match(state.revision, /^[a-f0-9]{32}$/)
  }
})

test('stale revisions are rejected without changing content', async () => {
  const empty = await snapshot('contact_hero')
  const saved = await save('contact_hero', empty, examples.contact_hero)
  await assert.rejects(save('contact_hero', empty, { ...examples.contact_hero, heading: 'Stale' }), /changed since/)
  assert.deepEqual(await snapshot('contact_hero'), saved)
})

test('retries are idempotent and reused request IDs cannot carry different changes', async () => {
  const before = await snapshot('blog_hero')
  const requestId = randomUUID()
  const first = await save('blog_hero', before, examples.blog_hero, requestId)
  assert.deepEqual(await save('blog_hero', before, examples.blog_hero, requestId), first)
  await assert.rejects(save('blog_hero', before, { ...examples.blog_hero, heading: 'Different' }, requestId), /different changes/)
  assert.equal((await db.query('select count(*)::int count from public.blog_page_hero')).rows[0].count, 1)
})

test('a late constraint failure rolls back the row and save receipt', async () => {
  let state = await snapshot('about_wide_banner')
  state = await save('about_wide_banner', state, examples.about_wide_banner)
  await db.exec("alter table public.about_wide_banner add constraint reject_failure check(heading <> 'FAIL')")
  const requestId = randomUUID()
  try {
    await assert.rejects(save('about_wide_banner', state, { ...examples.about_wide_banner, heading: 'FAIL' }, requestId))
    assert.deepEqual(await snapshot('about_wide_banner'), state)
    assert.equal((await db.query('select count(*)::int count from public.cms_save_receipts where request_id=$1', [requestId])).rows[0].count, 0)
  } finally {
    await db.exec('alter table public.about_wide_banner drop constraint reject_failure')
  }
})

test('public roles cannot execute snapshot or save functions', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    await assert.rejects(snapshot('contact_hero'), /permission denied/)
    await db.exec('reset role')
  }
})
