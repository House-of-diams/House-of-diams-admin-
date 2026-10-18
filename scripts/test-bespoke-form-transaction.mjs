import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const actor = '00000000-0000-4000-8000-000000000022'
const listKeys = ['guarantees', 'pieceTypes', 'stoneOptions', 'caratOptions', 'metalOptions']
const tableNames = [
  'bespoke_form_guarantees',
  'bespoke_form_piece_types',
  'bespoke_form_stone_options',
  'bespoke_form_carat_options',
  'bespoke_form_metal_options',
]

const snapshot = async () => (await db.query('select public.bespoke_form_snapshot_v1() result')).rows[0].result

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create type bespoke_status as enum('active','hidden');
    create table profiles(id uuid primary key,role text not null);
    insert into profiles values('${actor}','admin');
    create table cms_save_receipts(
      actor_id uuid,request_id uuid,operation text,payload_hash text,result jsonb,
      created_at timestamptz default now(),primary key(actor_id,request_id)
    );
    create table bespoke_form_settings(
      id uuid primary key default gen_random_uuid(),intro_heading text,intro_subtitle text,footer_note text,
      status bespoke_status not null default 'active',created_at timestamptz default now(),updated_at timestamptz default now()
    );
    ${tableNames.map((table) => `create table ${table}(
      id uuid primary key default gen_random_uuid(),label text not null unique,display_order int not null,
      status bespoke_status not null default 'active',created_at timestamptz default now(),updated_at timestamptz default now()
    );`).join('\n')}
  `)
  const migration = await readFile(new URL('../sql/202609260016_bespoke_form_atomic_save.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration)
})

beforeEach(async () => {
  await db.exec(`truncate ${tableNames.join(',')},bespoke_form_settings,cms_save_receipts cascade`)
})

after(async () => db.close())

const emptyLists = () => Object.fromEntries(listKeys.map((key) => [key, []]))
const emptyDeleted = () => Object.fromEntries(listKeys.map((key) => [key, []]))

async function seed() {
  const settingsId = randomUUID()
  const guaranteeId = randomUUID()
  await db.query(
    "insert into bespoke_form_settings(id,intro_heading,intro_subtitle,footer_note,status) values($1,'Create yours','Intro','Footer','active')",
    [settingsId]
  )
  await db.query(
    "insert into bespoke_form_guarantees(id,label,display_order,status) values($1,'Insured shipping',1,'active')",
    [guaranteeId]
  )
  return { settingsId, guaranteeId }
}

function settings(id, heading = 'Create yours') {
  return { id, intro_heading: heading, intro_subtitle: 'Intro', footer_note: 'Footer', status: 'active' }
}

function guarantee(id, label = 'Insured shipping') {
  return { id, label, display_order: 1, status: 'active' }
}

async function save(before, nextSettings, lists, deleted = emptyDeleted(), requestId = randomUUID(), actorId = actor) {
  return (await db.query(
    'select public.bespoke_form_save_v1($1,$2,$3,$4,$5,$6) result',
    [actorId, requestId, before.revision, JSON.stringify(nextSettings), JSON.stringify(lists), JSON.stringify(deleted)]
  )).rows[0].result
}

test('updates rows in place and assigns IDs only to new rows', async () => {
  const ids = await seed()
  const before = await snapshot()
  const lists = emptyLists()
  lists.guarantees = [guarantee(ids.guaranteeId, 'Updated shipping')]
  lists.pieceTypes = [{ label: 'Ring', display_order: 1, status: 'active' }]
  const result = await save(before, settings(ids.settingsId, 'Updated heading'), lists)
  assert.equal(result.settings.id, ids.settingsId)
  assert.equal(result.guarantees[0].id, ids.guaranteeId)
  assert.equal(result.guarantees[0].label, 'Updated shipping')
  assert.match(result.pieceTypes[0].id, /^[0-9a-f-]{36}$/)
})

test('duplicate retries are idempotent', async () => {
  const ids = await seed()
  const before = await snapshot()
  const lists = emptyLists()
  lists.guarantees = [guarantee(ids.guaranteeId)]
  lists.metalOptions = [{ label: 'Platinum', display_order: 1, status: 'active' }]
  const requestId = randomUUID()
  const first = await save(before, settings(ids.settingsId), lists, emptyDeleted(), requestId)
  const retry = await save(before, settings(ids.settingsId), lists, emptyDeleted(), requestId)
  assert.deepEqual(retry, first)
  assert.equal((await db.query('select count(*) count from bespoke_form_metal_options')).rows[0].count, 1)
})

test('implicit deletion and stale revisions are rejected without data loss', async () => {
  const ids = await seed()
  const before = await snapshot()
  await assert.rejects(save(before, settings(ids.settingsId), emptyLists()), /only be removed explicitly/)
  const lists = emptyLists()
  lists.guarantees = [guarantee(ids.guaranteeId)]
  await save(before, settings(ids.settingsId, 'First save'), lists)
  await assert.rejects(save(before, settings(ids.settingsId, 'Stale save'), lists), /changed since you opened it/)
  assert.equal((await snapshot()).settings.intro_heading, 'First save')
})

test('explicit deletion works and a late failure rolls back every change', async () => {
  let ids = await seed()
  let before = await snapshot()
  const deleted = emptyDeleted()
  deleted.guarantees = [ids.guaranteeId]
  const result = await save(before, settings(ids.settingsId), emptyLists(), deleted)
  assert.equal(result.guarantees.length, 0)

  ids = await seed()
  before = await snapshot()
  const lists = emptyLists()
  lists.guarantees = [
    guarantee(ids.guaranteeId, 'Duplicate'),
    { label: 'Duplicate', display_order: 2, status: 'active' },
  ]
  await assert.rejects(save(before, settings(ids.settingsId, 'Must roll back'), lists), /unique|duplicate/i)
  const afterFailure = await snapshot()
  assert.equal(afterFailure.settings.intro_heading, 'Create yours')
  assert.equal(afterFailure.guarantees[0].label, 'Insured shipping')
})

test('non-admin callers are denied', async () => {
  const ids = await seed()
  const before = await snapshot()
  const lists = emptyLists()
  lists.guarantees = [guarantee(ids.guaranteeId)]
  await assert.rejects(
    save(before, settings(ids.settingsId), lists, emptyDeleted(), randomUUID(), randomUUID()),
    /Administrator access is required/
  )
})

test('public database roles cannot execute the snapshot or save functions', async () => {
  await db.exec('set role anon')
  try {
    await assert.rejects(db.query('select public.bespoke_form_snapshot_v1()'), /permission denied/i)
  } finally {
    await db.exec('reset role')
  }
})
