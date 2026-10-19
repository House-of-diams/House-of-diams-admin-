import fs from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

// HOD-007: admin_order_status_update_v1 allows fulfilment states only for paid
// orders and only along allowed steps. In-memory PostgreSQL only.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const sql = fs.readFileSync(new URL('../sql/202610190028_order_status_guard.forward.sql', import.meta.url), 'utf8')
const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'), sql.lastIndexOf('commit;'))

test('order status moves need payment and follow allowed steps', async () => {
  const db = new PGlite()
  await db.exec(`
    create table profiles (id uuid primary key, role text);
    create table admin_identities (issuer text, subject text, profile_id uuid, enabled boolean, revoked_at timestamptz);
    create table products (id uuid primary key);
    create table orders (id uuid primary key, order_number text, status text, payment_status text, fulfillment_mode text,
      courier_name text, courier_awb_number text, shipped_at timestamptz, customer_email text, customer_first_name text,
      customer_last_name text, total_amount numeric, payment_amount numeric, payment_currency text, gateway_payload jsonb, created_at timestamptz default now());
    create table order_items (id uuid primary key default gen_random_uuid(), order_id uuid, product_id uuid, quantity int, created_at timestamptz default now());
    insert into profiles values ('00000000-0000-4000-8000-00000000000a', 'admin');
    insert into admin_identities values ('iss', 'sub', '00000000-0000-4000-8000-00000000000a', true, null);
    insert into orders (id, order_number, status, payment_status, fulfillment_mode) values
      ('00000000-0000-4000-8000-000000000001', 'UNPAID', 'pending', 'pending', 'made_to_order'),
      ('00000000-0000-4000-8000-000000000002', 'PAID', 'pending', 'paid', 'made_to_order');
    update orders set total_amount = 100, payment_amount = 8350, payment_currency = 'INR', gateway_payload = '{"totals":{"exchangeRate":83.5}}';`)
  await db.exec(fn.replace("SET search_path TO 'pg_catalog', 'pg_temp'", ''))
  const move = (order, from, to, courier = null, awb = null, expCourier = null, expAwb = null) => db.query(
    `select public.admin_order_status_update_v1('00000000-0000-4000-8000-00000000000a','iss','sub',$1::uuid,$2::jsonb,now()) r`,
    [order, JSON.stringify({ status: to, expected_status: from, courier_name: courier, courier_awb_number: awb,
      expected_courier_name: expCourier, expected_courier_awb_number: expAwb })])
  const UNPAID = '00000000-0000-4000-8000-000000000001', PAID = '00000000-0000-4000-8000-000000000002'
  for (const to of ['processing', 'shipped', 'delivered']) {
    await assert.rejects(move(UNPAID, 'pending', to, 'DHL', 'AWB1'), /Only paid orders/, `unpaid -> ${to}`)
  }
  await move(UNPAID, 'pending', 'cancelled')
  await assert.rejects(move(PAID, 'pending', 'delivered'), /not allowed/, 'cannot skip to delivered')
  await assert.rejects(move(PAID, 'pending', 'shipped', 'DHL', 'AWB1'), /not allowed/, 'cannot skip processing')
  const processed = (await move(PAID, 'pending', 'processing')).rows[0].r.item
  assert.equal(Number(processed.payment_amount), 8350); assert.equal(processed.payment_currency, 'INR'); assert.equal(Number(processed.exchange_rate), 83.5)
  await move(PAID, 'processing', 'shipped', 'DHL', 'AWB1')
  await move(PAID, 'shipped', 'shipped', 'FedEx', 'AWB2', 'DHL', 'AWB1')
  await move(PAID, 'shipped', 'processing', null, null, 'FedEx', 'AWB2')
  await move(PAID, 'processing', 'shipped', 'FedEx', 'AWB2')
  await move(PAID, 'shipped', 'delivered', 'FedEx', 'AWB2', 'FedEx', 'AWB2')
  await assert.rejects(move(PAID, 'delivered', 'pending', null, null, 'FedEx', 'AWB2'), /not allowed/, 'delivered is final')
  await move(UNPAID, 'cancelled', 'pending')
  assert.equal((await db.query(`select status from orders where id=$1`, [PAID])).rows[0].status, 'delivered')
})
