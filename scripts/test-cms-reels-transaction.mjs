// In-memory PostgreSQL only. This script never loads env files or contacts Supabase.
// Install @electric-sql/pglite@0.5.8 in a temporary folder and set PGLITE_MODULE
// to its dist/index.js, or install it locally before running node --test this file.
import { before, after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite')
const db = new PGlite()
const actor = '00000000-0000-4000-8000-000000000001'
const oldCreator = '00000000-0000-4000-8000-000000000002'
const settings = { heading: 'Instagram', subtitle: '', is_enabled: true, marquee_duration_seconds: 40, pause_on_hover: true }
const entry = (code, extra = {}) => ({ instagram_url: `https://www.instagram.com/reel/${code}/`, title: code, is_enabled: true, ...extra })
const snapshot = async () => (await db.query('select public.cms_reels_snapshot_v1() as result')).rows[0].result
const save = async (base, items, options = {}) => (await db.query(
  'select public.cms_save_reels_v1($1::uuid, $2::uuid, $3, $4::jsonb, $5::jsonb, $6::uuid[]) as result',
  [options.actor ?? actor, options.requestId ?? randomUUID(), base.revision, JSON.stringify(options.section ?? settings), JSON.stringify(items), options.deleted ?? []],
)).rows[0].result
const editable = (row) => ({ id: row.id, instagram_url: row.instagram_url, title: row.title, is_enabled: row.is_enabled })

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.profiles(id uuid primary key, role text);
    insert into public.profiles values ('${actor}', 'admin');
    create table public.home_instagram_reels_section (
      section_key text primary key default 'home_instagram_reels', heading text not null,
      subtitle text not null default '', is_enabled boolean not null default true,
      marquee_duration_seconds integer not null default 40, pause_on_hover boolean not null default true,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.home_instagram_reels (
      id uuid primary key default gen_random_uuid(),
      section_key text not null references public.home_instagram_reels_section(section_key),
      instagram_url text not null, title text not null default '', display_order integer not null default 0,
      is_enabled boolean not null default true, created_by uuid, cover_image_url text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.test_write_log(table_name text);
    create function public.test_track_write() returns trigger language plpgsql as $$
    begin insert into public.test_write_log values (TG_TABLE_NAME); return null; end $$;
    create trigger test_reel_write after insert or update or delete on public.home_instagram_reels
      for each row execute function public.test_track_write();
    create trigger test_section_write after insert or update or delete on public.home_instagram_reels_section
      for each row execute function public.test_track_write();
    grant all on public.home_instagram_reels, public.home_instagram_reels_section, public.test_write_log to service_role;
    grant select on public.profiles to service_role;
  `)
  const migration = await readFile(new URL('../sql/202609240004_cms_reels_atomic_save.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // Reapplying this migration must be safe.
})
beforeEach(async () => {
  await db.exec('reset role; truncate public.home_instagram_reels, public.home_instagram_reels_section, public.cms_save_receipts, public.test_write_log;')
})
after(async () => { await db.close() })

test('inserts new rows with database IDs and preserves IDs in a mixed save', async () => {
  const first = await save(await snapshot(), [entry('A')])
  const next = await save(first, [editable(first.items[0]), entry('B')])
  assert.equal(next.items.length, 2)
  assert.equal(next.items[0].id, first.items[0].id)
  assert.match(next.items[1].id, /^[0-9a-f-]{36}$/)
})

test('unchanged save performs zero content writes and retains the revision', async () => {
  const first = await save(await snapshot(), [entry('A')])
  await db.exec('truncate public.test_write_log')
  const next = await save(first, first.items.map(editable))
  assert.equal(next.revision, first.revision)
  assert.equal((await db.query('select count(*)::integer as n from public.test_write_log')).rows[0].n, 0)
})

test('editing preserves creator, cover and creation time when they are absent from the payload', async () => {
  let first = await save(await snapshot(), [entry('A', { cover_image_url: 'https://example.com/cover.webp' })])
  await db.query('update public.home_instagram_reels set created_by = $1', [oldCreator])
  first = await snapshot()
  const next = await save(first, [{ ...editable(first.items[0]), title: 'Changed' }])
  assert.equal(next.items[0].created_by, oldCreator)
  assert.equal(next.items[0].cover_image_url, 'https://example.com/cover.webp')
  assert.equal(next.items[0].created_at, first.items[0].created_at)
})

test('reordering and explicit deletion preserve retained identities', async () => {
  const first = await save(await snapshot(), [entry('A'), entry('B'), entry('C')])
  const next = await save(first, [editable(first.items[2]), editable(first.items[0])], { deleted: [first.items[1].id] })
  assert.deepEqual(next.items.map((row) => row.id), [first.items[2].id, first.items[0].id])
  assert.deepEqual(next.items.map((row) => row.display_order), [0, 1])
})

test('rejects implicit deletion and leaves content unchanged', async () => {
  const first = await save(await snapshot(), [entry('A')])
  await assert.rejects(save(first, []), /explicitly removed/)
  assert.deepEqual(await snapshot(), first)
})

test('rejects stale browser revisions, including external direct edits', async () => {
  const first = await save(await snapshot(), [entry('A')])
  await db.exec("update public.home_instagram_reels set title = 'Other admin'")
  const latest = await snapshot()
  await assert.rejects(save(first, first.items.map(editable)), /Reload before saving/)
  assert.deepEqual(await snapshot(), latest)
})

test('retries of the same request return the same generated IDs without duplicate writes', async () => {
  const initial = await snapshot()
  const requestId = randomUUID()
  const first = await save(initial, [entry('A')], { requestId })
  await db.exec('truncate public.test_write_log')
  const retried = await save(initial, [entry('A')], { requestId })
  assert.deepEqual(retried, first)
  assert.equal((await db.query('select count(*)::integer as n from public.test_write_log')).rows[0].n, 0)
  await assert.rejects(save(initial, [entry('B')], { requestId }), /different changes/)
})

test('rejects null, foreign and duplicate IDs without changing content', async () => {
  const first = await save(await snapshot(), [entry('A')])
  for (const rows of [[entry('A', { id: null })], [entry('A', { id: randomUUID() })], [editable(first.items[0]), entry('B', { id: first.items[0].id })]]) {
    await assert.rejects(save(first, rows))
    assert.deepEqual(await snapshot(), first)
  }
})

test('rejects invalid rows, duplicate URLs and invalid settings before writes', async () => {
  const initial = await snapshot()
  for (const rows of [[entry('A'), null], [entry('A'), entry('A')], [{ ...entry('A'), is_enabled: 'yes' }]]) {
    await assert.rejects(save(initial, rows))
    assert.deepEqual(await snapshot(), initial)
  }
  await assert.rejects(save(initial, [], { section: { ...settings, marquee_duration_seconds: 10.5 } }))
  assert.deepEqual(await snapshot(), initial)
})

test('insert failure rolls back settings changes, deletions and prior row updates', async () => {
  const first = await save(await snapshot(), [entry('A'), entry('B')])
  await db.exec("alter table public.home_instagram_reels add constraint test_failure check (title <> 'FAIL')")
  try {
    await assert.rejects(save(first, [{ ...editable(first.items[0]), title: 'Updated' }, entry('C', { title: 'FAIL' })], {
      section: { ...settings, heading: 'Changed heading' }, deleted: [first.items[1].id],
    }))
    assert.deepEqual(await snapshot(), first)
  } finally {
    await db.exec('alter table public.home_instagram_reels drop constraint test_failure')
  }
})

test('only service_role can execute RPCs; non-admin actors are rejected', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    await assert.rejects(snapshot(), /permission denied/)
    await assert.rejects(save({ revision: '0'.repeat(32) }, []), /permission denied/)
    await db.exec('reset role')
  }
  await db.exec('set role service_role')
  await assert.rejects(save(await snapshot(), [], { actor: oldCreator }), /Administrator access/)
  const result = await save(await snapshot(), [entry('A')])
  assert.equal(result.items.length, 1)
  await db.exec('reset role')
})
