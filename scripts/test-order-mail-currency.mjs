import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createSourceLoader } from './admin-rds-source-loader.mjs'

const load = createSourceLoader(fileURLToPath(new URL('..', import.meta.url)))
const { deliverOrderUpdate } = await import(await load('lib/operations-order-mail.ts'))

// HOD-016: status emails use the charged currency and amount, not the USD base.
test('status email for an INR order uses the charged amount and converted line totals', async () => {
  let sent
  const order = { id: 'o', order_number: 'HOD-1', status: 'shipped', customer_email: 'c@example.test', customer_first_name: 'C',
    customer_last_name: 'D', total_amount: 100, payment_amount: 8350, payment_currency: 'inr', exchange_rate: 83.5,
    created_at: '2026-10-19T00:00:00Z', courier_name: 'DHL', courier_awb_number: 'AWB', shipped_at: null }
  await deliverOrderUpdate({ item: order, items: [{ product_name: 'Ring', quantity: 1, line_total: 100 }] }, async (input) => { sent = input })
  assert.equal(sent.totalAmount, 8350); assert.equal(sent.currency, 'INR'); assert.equal(sent.items[0].line_total, 8350)
})

test('status email for a USD order or a legacy row without currency stays in USD', async () => {
  let sent
  const order = { id: 'o', order_number: 'HOD-2', status: 'processing', customer_email: 'c@example.test', total_amount: 120, created_at: '2026-10-19T00:00:00Z' }
  await deliverOrderUpdate({ item: order, items: [{ product_name: 'Band', quantity: 2, line_total: 60 }] }, async (input) => { sent = input })
  assert.equal(sent.totalAmount, 120); assert.equal(sent.currency, 'USD'); assert.equal(sent.items[0].line_total, 60)
})
