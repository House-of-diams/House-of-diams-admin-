import test from 'node:test'
import assert from 'node:assert/strict'
import { cmsContentListSchemas } from '../lib/cms-content-list-schemas.ts'
import { cmsSingletonItemSchemas } from '../lib/cms-singleton-schemas.ts'

test('accepts valid Bespoke process and manufacturing rows', () => {
  assert.equal(cmsContentListSchemas.bespoke_process.safeParse([{ id: 1, eyebrow: 'Step 1', title: 'Design', description: 'Sketch the piece' }]).success, true)
  assert.equal(cmsContentListSchemas.bespoke_manufacturing.safeParse([{ id: 1, step: '01', eyebrow: 'Atelier', title: 'Setting', description: '', media_type: 'image', media_path: 'cms/bespoke/image.webp', image_path: 'cms/bespoke/image.webp' }]).success, true)
})

test('rejects unknown and oversized Bespoke fields', () => {
  assert.equal(cmsContentListSchemas.bespoke_process.safeParse([{ eyebrow: '', title: '', description: '', admin: true }]).success, false)
  assert.equal(cmsContentListSchemas.bespoke_process.safeParse([{ eyebrow: '', title: 'x'.repeat(501), description: '' }]).success, false)
  assert.equal(cmsContentListSchemas.bespoke_process.safeParse([{ eyebrow: '', title: '   ', description: '' }]).success, false)
})

test('rejects unsafe manufacturing media URLs', () => {
  const base = { step: '01', eyebrow: '', title: 'Video', description: '', media_type: 'video', image_path: '' }
  assert.equal(cmsContentListSchemas.bespoke_manufacturing.safeParse([{ ...base, media_path: 'javascript:alert(1)' }]).success, false)
  assert.equal(cmsContentListSchemas.bespoke_manufacturing.safeParse([{ ...base, media_path: '' }]).success, false)
  assert.equal(cmsContentListSchemas.bespoke_manufacturing.safeParse([{ ...base, media_path: 'https://cdn.example.com/video.mp4' }]).success, true)
})

test('strictly validates the Bespoke showcase singleton', () => {
  const item = { is_enabled: true, eyebrow: '', heading: 'Bespoke', subtitle: '', cta_label: '', image_path: '', mobile_image_path: '', image_alt: '', sort_order: 0 }
  assert.equal(cmsSingletonItemSchemas.bespoke_showcase.safeParse(item).success, true)
  assert.equal(cmsSingletonItemSchemas.bespoke_showcase.safeParse({ ...item, unexpected: true }).success, false)
})
