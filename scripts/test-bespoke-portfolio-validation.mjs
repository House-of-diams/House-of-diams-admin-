import assert from 'node:assert/strict'
import test from 'node:test'
import {
  portfolioCategoryCreateSchema,
  portfolioCategoryUpdateSchema,
  portfolioItemCreateSchema,
  portfolioItemUpdateSchema,
  portfolioMutationError,
} from '../lib/bespoke-portfolio-validation.ts'

const revision = '2026-09-26T12:00:00.000+00:00'
const category = () => ({ name: 'Engagement Rings', slug: 'engagement-rings', display_order: 1, status: 'active' })
const item = () => ({
  title: 'Solitaire Ring',
  tag: 'Signature',
  category_id: '11111111-1111-4111-8111-111111111111',
  media_type: 'image',
  media_path: 'bespoke/images/11111111-1111-4111-8111-111111111111.webp',
  thumbnail_path: 'https://cdn.example.com/solitaire.webp',
  gem_style: 'round',
  gem_color: '#20304A',
  dark_theme: false,
  short_description: 'A custom solitaire ring.',
  display_order: 1,
  status: 'active',
})

test('accepts allow-listed category create and update payloads', () => {
  assert.equal(portfolioCategoryCreateSchema.safeParse(category()).success, true)
  assert.equal(portfolioCategoryUpdateSchema.safeParse({ ...category(), expected_updated_at: revision }).success, true)
})

test('rejects category mass assignment and malformed values', () => {
  assert.equal(portfolioCategoryCreateSchema.safeParse({ ...category(), id: crypto.randomUUID() }).success, false)
  assert.equal(portfolioCategoryCreateSchema.safeParse({ ...category(), slug: '../private' }).success, false)
  assert.equal(portfolioCategoryCreateSchema.safeParse({ ...category(), status: 'published' }).success, false)
})

test('validates item relationships, locations, revisions, and exact fields', () => {
  assert.equal(portfolioItemCreateSchema.safeParse(item()).success, true)
  assert.equal(portfolioItemUpdateSchema.safeParse({ ...item(), expected_updated_at: revision }).success, true)
  assert.equal(portfolioItemCreateSchema.safeParse({ ...item(), category_id: 'not-a-uuid' }).success, false)
  assert.equal(portfolioItemCreateSchema.safeParse({ ...item(), media_path: '../../secret.svg' }).success, false)
  assert.equal(portfolioItemCreateSchema.safeParse({ ...item(), created_at: revision }).success, false)
})

test('requires HTTPS for external and video media', () => {
  assert.equal(portfolioItemCreateSchema.safeParse({ ...item(), media_path: 'http://cdn.example.com/image.webp' }).success, false)
  assert.equal(portfolioItemCreateSchema.safeParse({ ...item(), media_type: 'video', media_path: 'bespoke/images/11111111-1111-4111-8111-111111111111.webp' }).success, false)
  assert.equal(portfolioItemCreateSchema.safeParse({ ...item(), media_type: 'video', media_path: 'https://cdn.example.com/video.mp4' }).success, true)
})

test('maps conflicts and unknown database failures without leaking provider details', () => {
  assert.deepEqual(portfolioMutationError({ code: '23505', message: 'private index name' }, 'category', 'save'), {
    status: 409,
    message: 'A portfolio category with this slug already exists.',
  })
  assert.equal(portfolioMutationError({ code: '23503', message: 'private relation' }, 'category', 'delete').status, 409)
  assert.equal(portfolioMutationError({ code: 'XX000', message: 'private database details' }, 'item', 'save').message.includes('private'), false)
})
