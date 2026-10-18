import assert from 'node:assert/strict'
import { cmsSingletonItemSchemas } from '../lib/cms-singleton-schemas.ts'
import { cmsContentListSchemas } from '../lib/cms-content-list-schemas.ts'
import {
  faqCategoryDeleteSchema, faqCategorySaveSchema, supportAnnouncementItemSchema,
  supportAnnouncementParentSchema, supportFaqItemSchema, supportFaqParentSchema,
} from '../lib/cms-support-schemas.ts'

const uuid = '00000000-0000-4000-8000-000000000001'
const revision = 'a'.repeat(32)

assert.equal(cmsSingletonItemSchemas.contact_hero.safeParse({ section_key: 'contact_hero', eyebrow: 'Contact', heading: 'Talk to us', subtitle: 'We can help.' }).success, true)
assert.equal(cmsSingletonItemSchemas.contact_hero.safeParse({ eyebrow: '', heading: '', subtitle: '' }).success, false)
assert.equal(cmsContentListSchemas.contact_info.safeParse([{ id: 1, label: 'Email', value: 'help@example.com', note: '', href: 'mailto:help@example.com', icon_path: 'contact/email.svg' }]).success, true)
assert.equal(cmsContentListSchemas.contact_info.safeParse([{ label: 'Email', value: '', note: '', href: '', icon_path: '', unexpected: true }]).success, false)
assert.equal(cmsContentListSchemas.contact_info.safeParse([{ label: 'Email', value: 'Help', note: '', href: 'javascript:alert(1)', icon_path: '' }]).success, false)

assert.equal(supportAnnouncementParentSchema.safeParse({ is_active: true, autoplay: true, speed_ms: 3000 }).success, true)
assert.equal(supportAnnouncementItemSchema.safeParse({ id: '1', message: 'Free shipping', link_url: '/shipping', open_in_new_tab: false, sort_order: 1, is_active: true }).success, true)
assert.equal(supportAnnouncementItemSchema.safeParse({ message: '', link_url: '', open_in_new_tab: false, sort_order: 1, is_active: true }).success, false)
assert.equal(supportAnnouncementItemSchema.safeParse({ message: 'Unsafe', link_url: 'javascript:alert(1)', open_in_new_tab: false, sort_order: 1, is_active: true }).success, false)
assert.equal(supportFaqParentSchema.safeParse({ title: 'Questions', subtitle: 'Answers' }).success, true)
assert.equal(supportFaqItemSchema.safeParse({ id: '1', question: 'How?', answer: 'Like this.', sort_order: 1, is_active: true, category_id: null, catalog_category_id: uuid }).success, true)

const categoryItem = { name: 'Orders', slug: 'orders', description: '', image_path: null, image_alt: 'Orders', sort_order: 1, is_active: true }
assert.equal(faqCategorySaveSchema.safeParse({ request_id: uuid, id: null, expected_revision: null, item: categoryItem }).success, true)
assert.equal(faqCategorySaveSchema.safeParse({ request_id: uuid, id: 4, expected_revision: null, item: categoryItem }).success, false)
assert.equal(faqCategorySaveSchema.safeParse({ request_id: uuid, id: null, expected_revision: revision, item: categoryItem }).success, false)
assert.equal(faqCategoryDeleteSchema.safeParse({ request_id: uuid, id: 4, expected_revision: revision }).success, true)

console.log('Contact and Support CMS validation tests passed.')
