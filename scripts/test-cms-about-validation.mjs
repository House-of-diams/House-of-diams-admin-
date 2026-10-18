import test from 'node:test'
import assert from 'node:assert/strict'
import { cmsContentListSchemas } from '../lib/cms-content-list-schemas.ts'
import { cmsSingletonItemSchemas } from '../lib/cms-singleton-schemas.ts'

test('accepts valid About list rows', () => {
  assert.equal(cmsContentListSchemas.about_founders.safeParse([{ id: 1, name: 'A', designation: 'Founder', bio: '', image_path: '' }]).success, true)
  assert.equal(cmsContentListSchemas.about_timeline.safeParse([{ id: 1, year: '2026', label: 'Opened' }]).success, true)
  assert.equal(cmsContentListSchemas.about_values.safeParse([{ id: 1, icon_path: '', image_path: '', image_alt: '', title: 'Craft', description: 'Carefully made' }]).success, true)
})

test('rejects unknown About list fields', () => {
  const parsed = cmsContentListSchemas.about_founders.safeParse([{ id: 1, name: 'A', designation: '', bio: '', image_path: '', role: 'admin' }])
  assert.equal(parsed.success, false)
})

test('rejects excessive About field values and list sizes', () => {
  assert.equal(cmsContentListSchemas.about_timeline.safeParse([{ year: 'x'.repeat(101), label: 'Event' }]).success, false)
  assert.equal(cmsContentListSchemas.about_values.safeParse(Array.from({ length: 101 }, () => ({ icon_path: '', image_path: '', image_alt: '', title: '', description: '' }))).success, false)
})

test('accepts only supported About Wide Banner positions', () => {
  const base = { section_key: 'about_wide_banner', is_enabled: true, desktop_image_path: '', mobile_image_path: '', image_alt: '', heading: '', paragraph: '', show_button: false, button_label: '', button_link: '', sort_order: 1 }
  assert.equal(cmsSingletonItemSchemas.about_wide_banner.safeParse({ ...base, content_position: 'left' }).success, true)
  assert.equal(cmsSingletonItemSchemas.about_wide_banner.safeParse({ ...base, content_position: 'somewhere' }).success, false)
  assert.equal(cmsSingletonItemSchemas.about_wide_banner.safeParse({ ...base, content_position: 'left', button_link: 'javascript:alert(1)' }).success, false)
})

test('collection settings reject executable links and unknown fields', () => {
  const base = { page_enabled: true, show_in_footer: true, show_home_showcase: true, showcase_heading: 'Collection', showcase_subtitle: '', showcase_cta_label: 'Explore', showcase_cta_href: '/collection', showcase_image_path: '', showcase_mobile_image_path: '' }
  assert.equal(cmsSingletonItemSchemas.collection_page.safeParse(base).success, true)
  assert.equal(cmsSingletonItemSchemas.collection_page.safeParse({ ...base, showcase_cta_href: 'data:text/html,bad' }).success, false)
  assert.equal(cmsSingletonItemSchemas.collection_page.safeParse({ ...base, role: 'admin' }).success, false)
})
