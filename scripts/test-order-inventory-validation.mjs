import assert from 'node:assert/strict'
import test from 'node:test'
import { adminMutationError, inventoryUpdateSchema, orderStatusUpdateSchema } from '../lib/order-inventory-validation.ts'

test('accepts strict valid order status updates', () => {
  assert.equal(orderStatusUpdateSchema.safeParse({ status: 'processing', expected_status: 'pending', expected_courier_name: null, expected_courier_awb_number: null, courier_name: null, courier_awb_number: null }).success, true)
  assert.equal(orderStatusUpdateSchema.safeParse({ status: 'shipped', expected_status: 'processing', expected_courier_name: null, expected_courier_awb_number: null, courier_name: 'DHL', courier_awb_number: 'AWB-1' }).success, true)
})

test('rejects invalid order states and incomplete shipping details', () => {
  assert.equal(orderStatusUpdateSchema.safeParse({ status: 'paid', expected_status: 'pending', expected_courier_name: null, expected_courier_awb_number: null, courier_name: null, courier_awb_number: null }).success, false)
  assert.equal(orderStatusUpdateSchema.safeParse({ status: 'shipped', expected_status: 'processing', expected_courier_name: null, expected_courier_awb_number: null, courier_name: null, courier_awb_number: null }).success, false)
})

test('requires strict non-negative integer inventory updates', () => {
  const valid = { expected_stock: 4, stock_quantity: 8, notes: null }
  assert.equal(inventoryUpdateSchema.safeParse(valid).success, true)
  assert.equal(inventoryUpdateSchema.safeParse({ ...valid, stock_quantity: 1.5 }).success, false)
  assert.equal(inventoryUpdateSchema.safeParse({ ...valid, expected_stock: -1 }).success, false)
  assert.equal(inventoryUpdateSchema.safeParse({ ...valid, extra: true }).success, false)
})

test('maps deployment, conflict and unknown errors safely', () => {
  assert.equal(adminMutationError({ code: 'PGRST202', message: 'private' }, 'inventory').status, 503)
  assert.equal(adminMutationError({ code: '40001', message: 'private' }, 'order').status, 409)
  assert.equal(adminMutationError({ code: 'XX000', message: 'private database details' }, 'inventory').message.includes('private'), false)
})
