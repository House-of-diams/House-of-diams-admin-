import assert from 'node:assert/strict'
import test from 'node:test'
import { bespokeSubmissionQuerySchema, notificationReadSchema, notificationWriteError } from '../lib/admin-read-validation.ts'

test('accepts known notification keys and rejects arbitrary keys', () => {
  assert.equal(notificationReadSchema.safeParse({ notificationKey: 'order:00000000-0000-4000-8000-000000000001' }).success, true)
  assert.equal(notificationReadSchema.safeParse({ notificationKey: 'unknown:anything' }).success, false)
  assert.equal(notificationReadSchema.safeParse({ notificationKey: 'order:00000000-0000-4000-8000-000000000001', admin_user_id: 'other' }).success, false)
})

test('validates submission filters and date order', () => {
  assert.equal(bespokeSubmissionQuerySchema.safeParse({ from: '2026-09-01', to: '2026-09-30', q: 'ring' }).success, true)
  assert.equal(bespokeSubmissionQuerySchema.safeParse({ from: '2026-09-31' }).success, false)
  assert.equal(bespokeSubmissionQuerySchema.safeParse({ from: '2026-10-01', to: '2026-09-01' }).success, false)
  assert.equal(bespokeSubmissionQuerySchema.safeParse({ q: 'x'.repeat(201) }).success, false)
})

test('does not expose notification database errors', () => {
  assert.equal(notificationWriteError({ code: 'XX000', message: 'private table details' }).message.includes('private'), false)
})
