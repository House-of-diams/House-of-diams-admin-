import assert from 'node:assert/strict'
import test from 'node:test'
import { heroSaveSchema } from '../lib/cms-hero-validation.ts'

const validPayload = {
  request_id: '11111111-1111-4111-8111-111111111111',
  expected_revision: 'a'.repeat(32),
  deleted_ids: [],
  slider_enabled: true,
  seo_title: 'Homepage',
  seo_description: 'Homepage description',
  items: [{ id: 1, sort_order: 1, image_path: 'hero/one.webp', mobile_image_path: '', headline: '', subtitle: '', button_text: 'Shop', button_link: '/shop' }],
}

test('accepts a strict revision-checked Hero payload', () => {
  assert.equal(heroSaveSchema.safeParse(validPayload).success, true)
})

test('rejects unknown mass-assigned fields', () => {
  assert.equal(heroSaveSchema.safeParse({ ...validPayload, section_key: 'other' }).success, false)
})

test('rejects IDs retained and deleted in the same request', () => {
  assert.equal(heroSaveSchema.safeParse({ ...validPayload, deleted_ids: ['1'] }).success, false)
})

test('rejects invalid revisions and excessive field values', () => {
  assert.equal(heroSaveSchema.safeParse({ ...validPayload, expected_revision: 'stale', seo_title: 'x'.repeat(121) }).success, false)
})
