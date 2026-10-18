// In-memory PostgreSQL only. Never loads env files or contacts Supabase.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const actor = '00000000-0000-4000-8000-000000000002'
const snapshot = async (kind) => (await db.query('select public.cms_content_list_snapshot_v1($1) result', [kind])).rows[0].result
const save = async (kind, before, items, deleted = [], requestId = randomUUID()) =>
  (await db.query('select public.cms_save_content_list_v1($1,$2,$3,$4,$5,$6) result',
    [actor, requestId, before.revision, kind, JSON.stringify(items), deleted])).rows[0].result

const examples = {
  about_values: { icon_path: 'icon.svg', image_path: '', image_alt: '', title: 'Quality', description: 'Made well' },
  about_timeline: { year: '2026', label: 'Opened' },
  about_founders: { name: 'Founder', designation: 'CEO', bio: 'Bio', image_path: 'founder.webp' },
  contact_info: { label: 'Email', value: 'hello@example.com', note: 'Replies soon', href: 'mailto:hello@example.com', icon_path: 'mail.svg' },
  bespoke_process: { eyebrow: 'Step one', title: 'Consult', description: 'Talk with us' },
  bespoke_manufacturing: { step: '01', eyebrow: 'Workshop', title: 'Craft', description: 'Made by hand', image_path: 'craft.webp', media_type: 'image', media_path: 'craft.webp' },
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.profiles(id uuid primary key, role text not null);
    insert into public.profiles values ('${actor}','admin');
    create table public.cms_save_receipts(actor_id uuid,request_id uuid,operation text,payload_hash text,result jsonb,created_at timestamptz default now(),primary key(actor_id,request_id));
    create table public.about_values(id bigint generated always as identity primary key,sort_order integer not null,title text not null,description text not null,icon_path text not null,image_path text,image_alt text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.about_timeline(id bigint generated always as identity primary key,sort_order integer not null,year text not null,label text not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.about_founders(id bigint generated always as identity primary key,sort_order integer not null,name text not null,designation text not null,bio text not null,image_path text not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.contact_info(id bigint generated always as identity primary key,sort_order integer not null,label text not null,value text not null,note text not null,href text not null,icon_path text not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.bespoke_process_cards(id bigint generated always as identity primary key,sort_order integer not null,eyebrow text not null,title text not null,description text not null,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.bespoke_process_steps(id bigint generated always as identity primary key,sort_order integer not null,step text not null,eyebrow text not null,title text not null,description text not null,image_path text not null,media_type text not null default 'image',media_path text,created_at timestamptz default now(),updated_at timestamptz default now());
  `)
  const migration = await readFile(new URL('../sql/202609240006_cms_content_lists_group2_atomic_save.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration)
})

beforeEach(async () => {
  await db.exec('truncate public.about_values,public.about_timeline,public.about_founders,public.contact_info,public.bespoke_process_cards,public.bespoke_process_steps,public.cms_save_receipts restart identity cascade')
})

after(async () => db.close())

test('all six list kinds preserve IDs and support explicit creation and deletion', async () => {
  for (const [kind, example] of Object.entries(examples)) {
    let state = await snapshot(kind)
    state = await save(kind, state, [example])
    const originalId = state.items[0].id
    state = await save(kind, state, [{ ...state.items[0], id: String(originalId) }, example])
    assert.equal(state.items[0].id, originalId, `${kind} changed an existing ID`)
    assert.equal(state.items.length, 2)
    state = await save(kind, state, [{ ...state.items[1], id: String(state.items[1].id) }], [String(originalId)])
    assert.equal(state.items.length, 1)
    assert.notEqual(state.items[0].id, originalId)
  }
})

test('stale revisions and implicit deletions are rejected without changing data', async () => {
  const empty = await snapshot('about_timeline')
  const saved = await save('about_timeline', empty, [examples.about_timeline])
  await assert.rejects(save('about_timeline', empty, []), /changed since/)
  await assert.rejects(save('about_timeline', saved, []), /explicitly removed/)
  assert.deepEqual(await snapshot('about_timeline'), saved)
})

test('invalid rows are rejected instead of silently filtered', async () => {
  const before = await snapshot('contact_info')
  await assert.rejects(save('contact_info', before, [{ label: 'Email' }]), /must be valid/)
  assert.deepEqual(await snapshot('contact_info'), before)
})

test('a late database failure rolls the complete save back', async () => {
  let state = await snapshot('about_values')
  state = await save('about_values', state, [examples.about_values])
  await db.exec("alter table public.about_values add constraint reject_failure check(title <> 'FAIL')")
  try {
    await assert.rejects(save('about_values', state, [
      { ...state.items[0], id: String(state.items[0].id), title: 'Changed' },
      { ...examples.about_values, title: 'FAIL' },
    ]))
    assert.deepEqual(await snapshot('about_values'), state)
  } finally {
    await db.exec('alter table public.about_values drop constraint reject_failure')
  }
})

test('retries are idempotent and public roles cannot execute the functions', async () => {
  const before = await snapshot('bespoke_process')
  const requestId = randomUUID()
  const first = await save('bespoke_process', before, [examples.bespoke_process], [], requestId)
  assert.deepEqual(await save('bespoke_process', before, [examples.bespoke_process], [], requestId), first)
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    await assert.rejects(snapshot('bespoke_process'), /permission denied/)
    await db.exec('reset role')
  }
})
