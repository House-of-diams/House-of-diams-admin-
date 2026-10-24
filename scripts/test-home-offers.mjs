// Offers: validation rules, and the real repository against the real SQL file in an in-memory PostgreSQL (PGlite),
// run as the admin database role so the column grants and the one-active-offer rule are what production will enforce.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSourceLoader } from './admin-rds-source-loader.mjs'

const load = createSourceLoader(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
const { homeOfferSchema, NEW_OFFER_DEFAULTS } = await import(await load('lib/home-offers-validation.ts'))
const { createHomeOffersRepository, HOME_OFFERS_NOT_READY } = await import(await load('lib/db/admin-repositories/home-offers.ts'))

const img = (name) => `https://content.houseofdiams.com/offers/${name}.webp`
const ready = { ...NEW_OFFER_DEFAULTS, name: 'Diwali gift', home_image_path: img('home'), promo_image_left_path: img('left'), promo_image_right_path: img('right') }

const forward = fs.readFileSync(new URL('../docs/sql-pending/15_home_offers.forward.sql', import.meta.url), 'utf8')
const rollback = fs.readFileSync(new URL('../docs/sql-pending/15_home_offers.rollback.sql', import.meta.url), 'utf8')

test('the SQL copy in the repo is identical to the one handed to the database owner', () => {
  for (const [name, text] of [['forward', forward], ['rollback', rollback]]) {
    const external = new URL(`../../sql-to-apply/phase-9/15_home_offers.${name}.sql`, import.meta.url)
    if (fs.existsSync(external)) assert.equal(fs.readFileSync(external, 'utf8').replace(/\r\n/g, '\n'), text.replace(/\r\n/g, '\n'), name)
  }
})

test('validation: names, labels, images and the coupon id', () => {
  assert.equal(homeOfferSchema.parse({ ...ready, name: '  Diwali  ', coupon_id: 7 }).coupon_id, '7')
  assert.equal(homeOfferSchema.parse({ ...ready, coupon_id: '9007199254740993' }).coupon_id, '9007199254740993')
  for (const bad of [{ name: '   ' }, { name: 'x'.repeat(121) }, { button_label: ' ' }, { button_label: 'x'.repeat(41) }, { coupon_id: 0 }, { coupon_id: 'abc' }, { coupon_id: 1.5 },
    { home_image_alt: 'x'.repeat(201) }, { extra: true }]) assert.throws(() => homeOfferSchema.parse({ ...ready, ...bad }), JSON.stringify(bad))
})

test('validation: only uploaded images are accepted, and an offer needs all three to be active', () => {
  for (const url of ['https://evil.example/x.webp', 'http://media.houseofdiams.com/offers/x.webp', 'https://media.houseofdiams.com/offers/x.webp?x=1', 'https://media.houseofdiams.com/offers/../x.webp', 'javascript:alert(1)', '/offers/x.webp'])
    assert.throws(() => homeOfferSchema.parse({ ...ready, home_image_path: url }), url)
  assert.doesNotThrow(() => homeOfferSchema.parse({ ...NEW_OFFER_DEFAULTS, name: 'Draft' }), 'a draft without images can be saved')
  for (const field of ['home_image_path', 'promo_image_left_path', 'promo_image_right_path']) {
    assert.throws(() => homeOfferSchema.parse({ ...ready, [field]: '', is_active: true }), /before making this offer active/, field)
    assert.doesNotThrow(() => homeOfferSchema.parse({ ...ready, [field]: '', is_active: false }), field)
  }
})

// ---- repository against the real SQL ----
async function database({ apply = true } = {}) {
  const pg = new PGlite()
  await pg.exec(`CREATE ROLE hod_migration NOLOGIN; CREATE ROLE hod_admin_app NOLOGIN; CREATE ROLE hod_app NOLOGIN;
    GRANT USAGE, CREATE ON SCHEMA public TO hod_migration; GRANT USAGE ON SCHEMA public TO hod_admin_app, hod_app;
    CREATE TABLE public.coupons (id bigint PRIMARY KEY, code text NOT NULL, title text, reward_type text NOT NULL, is_active boolean NOT NULL DEFAULT true,
      ends_at timestamptz, gift_product_id uuid, created_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE public.coupons OWNER TO hod_migration; GRANT SELECT ON public.coupons TO hod_admin_app, hod_app;
    INSERT INTO public.coupons (id, code, title, reward_type) VALUES (1, 'GIFT', 'Gift', 'free_gift'), (2, 'SAVE10', 'Ten off', 'percentage');`)
  if (apply) { await pg.exec('SET ROLE hod_migration'); await pg.exec(forward); await pg.exec('RESET ROLE') }
  return pg
}
// The repository sees the database the way the admin app does: as hod_admin_app, inside one transaction.
const asAdmin = async (pg, run) => {
  await pg.exec('BEGIN; SET LOCAL ROLE hod_admin_app')
  try { const value = await run({ query: async (sql, values) => { const result = await pg.query(sql, values); return { rows: result.rows } } }); await pg.exec('COMMIT'); return value }
  catch (error) { await pg.exec('ROLLBACK'); throw error }
}
// The editor sends the offer without its revision (that travels in a header); do the same here.
const body = ({ revision, ...rest }) => rest
const repo = (pg) => (run) => asAdmin(pg, (db) => run(createHomeOffersRepository(db)))

test('create, list, edit and delete an offer with the real column grants', async () => {
  const pg = await database(); const admin = repo(pg)
  const created = await admin((r) => r.save({ ...ready, coupon_id: 1 }))
  assert.equal(created.name, 'Diwali gift'); assert.equal(created.coupon_id, '1'); assert.equal(created.is_active, false); assert.ok(created.revision)
  assert.deepEqual((await admin((r) => r.list())).map((o) => o.id), [created.id])
  const edited = await admin((r) => r.save({ ...body(created), name: 'Renamed' }, created.revision))
  assert.equal(edited.name, 'Renamed'); assert.notEqual(edited.revision, created.revision)
  await admin((r) => r.remove(created.id))
  assert.deepEqual(await admin((r) => r.list()), [])
  await assert.rejects(admin((r) => r.remove(created.id)), /no longer exists/)
})

test('only one offer is active: activating one switches the other off', async () => {
  const pg = await database(); const admin = repo(pg)
  const first = await admin((r) => r.save({ ...ready, name: 'First', is_active: true }))
  const second = await admin((r) => r.save({ ...ready, name: 'Second', is_active: true }))
  const list = await admin((r) => r.list())
  assert.deepEqual(list.filter((o) => o.is_active).map((o) => o.name), ['Second'])
  assert.equal(list.find((o) => o.id === first.id).is_active, false)
  // Re-saving the active one as active keeps it active; deactivating leaves none.
  await admin((r) => r.save({ ...body(second), is_active: true }, second.revision))
  const refreshed = (await admin((r) => r.list())).find((o) => o.id === second.id)
  await admin((r) => r.save({ ...body(refreshed), is_active: false }, refreshed.revision))
  assert.equal((await admin((r) => r.list())).filter((o) => o.is_active).length, 0)
})

test('the database itself refuses two active offers and an active offer without images', async () => {
  const pg = await database()
  await pg.exec(`INSERT INTO public.home_offers (name, is_active, home_image_path, promo_image_left_path, promo_image_right_path) VALUES ('A', true, 'x', 'y', 'z')`)
  await assert.rejects(pg.exec(`INSERT INTO public.home_offers (name, is_active, home_image_path, promo_image_left_path, promo_image_right_path) VALUES ('B', true, 'x', 'y', 'z')`), /home_offers_one_active/)
  await assert.rejects(pg.exec(`INSERT INTO public.home_offers (name, is_active) VALUES ('C', true)`), /home_offers_active_needs_images/)
})

test('a stale editor is refused with a conflict and nothing is overwritten', async () => {
  const pg = await database(); const admin = repo(pg)
  const created = await admin((r) => r.save(ready))
  await admin((r) => r.save({ ...body(created), name: 'Changed elsewhere' }, created.revision))
  await assert.rejects(admin((r) => r.save({ ...body(created), name: 'Stale edit' }, created.revision)), (error) => error.status === 409)
  assert.equal((await admin((r) => r.list()))[0].name, 'Changed elsewhere')
})

test('deleting the coupon keeps the offer and clears its coupon', async () => {
  const pg = await database(); const admin = repo(pg)
  const created = await admin((r) => r.save({ ...ready, coupon_id: 2 }))
  await pg.exec('DELETE FROM public.coupons WHERE id = 2')
  assert.equal((await admin((r) => r.list())).find((o) => o.id === created.id).coupon_id, null)
})

test('the coupon list for the editor says which coupons give a gift', async () => {
  const pg = await database(); await pg.exec(`UPDATE public.coupons SET gift_product_id = gen_random_uuid() WHERE id = 1`)
  const coupons = await repo(pg)((r) => r.coupons())
  assert.deepEqual(coupons.map((c) => [c.code, c.has_gift]).sort(), [['GIFT', true], ['SAVE10', false]])
})

test('the website user can only read; the admin user cannot touch other columns or tables', async () => {
  const pg = await database()
  await pg.exec('SET ROLE hod_app')
  await pg.query('SELECT * FROM public.home_offers')
  await assert.rejects(pg.exec(`INSERT INTO public.home_offers (name) VALUES ('x')`), /permission denied/)
  await assert.rejects(pg.exec(`DELETE FROM public.home_offers`), /permission denied/)
  await pg.exec('RESET ROLE')
})

test('before the database update the admin gets a clear instruction, not a crash', async () => {
  const pg = await database({ apply: false })
  await assert.rejects(repo(pg)((r) => r.list()), (error) => error.status === 503 && error.message === HOME_OFFERS_NOT_READY)
})

test('rollback removes the table and the forward file refuses to run twice', async () => {
  const pg = await database()
  await pg.exec('SET ROLE hod_migration')
  await assert.rejects(pg.exec(forward), /Already applied/)
  await pg.exec('ROLLBACK')
  await pg.exec('SET ROLE hod_migration')
  await pg.exec(rollback)
  await pg.exec('RESET ROLE')
  assert.equal((await pg.query(`SELECT to_regclass('public.home_offers') AS t`)).rows[0].t, null)
})
