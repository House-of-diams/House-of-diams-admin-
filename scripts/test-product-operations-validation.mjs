import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activateDraftsSchema,
  bulkDeleteSchema,
  bulkPriceSchema,
  duplicateProductSchema,
  productMediaSignSchema,
  productOperationError,
  productStatusSchema,
  productVideoContentsMatch,
  videoLibraryQuerySchema,
} from '../lib/product-operations-validation.ts'

const id1 = '11111111-1111-4111-8111-111111111111'
const id2 = '22222222-2222-4222-8222-222222222222'
const requestId = '33333333-3333-4333-8333-333333333333'

test('strictly validates single-product status and duplicate operations', () => {
  assert.equal(productStatusSchema.safeParse({ status: 'draft', expected_status: 'active' }).success, true)
  assert.equal(productStatusSchema.safeParse({ status: 'active', expected_status: 'draft' }).success, false)
  assert.equal(productStatusSchema.safeParse({ status: 'draft', expected_status: 'active', id: id1 }).success, false)
  assert.equal(duplicateProductSchema.safeParse({ requestId }).success, true)
  assert.equal(duplicateProductSchema.safeParse({ requestId, sourceId: id1 }).success, false)
})

test('requires exact, unique product selections and explicit destructive intent', () => {
  assert.equal(bulkDeleteSchema.safeParse({ requestId, ids: [id1, id2], lane: 'standard', confirmation: 'DELETE_PRODUCTS' }).success, true)
  assert.equal(bulkDeleteSchema.safeParse({ requestId, ids: [id1, id1], lane: 'standard', confirmation: 'DELETE_PRODUCTS' }).success, false)
  assert.equal(bulkDeleteSchema.safeParse({ requestId, ids: [id1], lane: 'standard', confirmation: 'yes' }).success, false)
  assert.equal(activateDraftsSchema.safeParse({ requestId, ids: [id1], lane: 'hiphop', confirmation: 'ACTIVATE_DRAFTS' }).success, true)
})

test('validates price verification rows and operation bounds', () => {
  const valid = { requestId, ids: [id1, id2], expectedPrices: [{ id: id1, price: 100 }, { id: id2, price: 200 }], lane: 'standard', operation: 'increase_percent', value: 10, confirmation: 'ADJUST_BASE_PRICES' }
  assert.equal(bulkPriceSchema.safeParse(valid).success, true)
  assert.equal(bulkPriceSchema.safeParse({ ...valid, expectedPrices: [{ id: id1, price: 100 }] }).success, false)
  assert.equal(bulkPriceSchema.safeParse({ ...valid, expectedPrices: [{ id: id1, price: 100 }, { id: id1, price: 200 }] }).success, false)
  assert.equal(bulkPriceSchema.safeParse({ ...valid, operation: 'decrease_percent', value: 100 }).success, false)
})

test('restricts signed uploads and video library query fields', () => {
  assert.equal(productMediaSignSchema.safeParse({ folder: 'products', contentType: 'image/webp', declaredSize: 1024, productKey: 'ring-123' }).success, true)
  assert.equal(productMediaSignSchema.safeParse({ folder: '../private', contentType: 'image/webp', declaredSize: 1024, productKey: 'ring-123' }).success, false)
  assert.equal(productMediaSignSchema.safeParse({ folder: 'products', contentType: 'image/svg+xml', declaredSize: 1024, productKey: 'ring-123' }).success, false)
  assert.equal(videoLibraryQuerySchema.safeParse({ refresh: '1' }).success, true)
  assert.equal(videoLibraryQuerySchema.safeParse({ refresh: '1', prefix: '../' }).success, false)
})

test('checks common video container signatures', () => {
  const mp4 = Buffer.alloc(12); mp4.write('ftyp', 4, 'ascii')
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00])
  assert.equal(productVideoContentsMatch('video/mp4', mp4), true)
  assert.equal(productVideoContentsMatch('video/webm', webm), true)
  assert.equal(productVideoContentsMatch('video/mp4', Buffer.from('not a video')), false)
})

test('maps database failures without exposing provider details', () => {
  assert.equal(productOperationError({ code: 'PGRST202', message: 'private schema details' }, 'price').status, 503)
  assert.equal(productOperationError({ code: '40001', message: 'private row details' }, 'activate').status, 409)
  assert.equal(productOperationError({ code: 'XX000', message: 'private database details' }, 'delete').message.includes('private'), false)
})
