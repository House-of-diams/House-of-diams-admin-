import assert from 'node:assert/strict'
import {
  checkoutResultItemSchema, checkoutResultParentSchema, promotionItemSchema, promotionParentSchema,
  serviceBannerItemSchema, serviceBannerParentSchema, summaryItemSchema, summaryParentSchema,
} from '../lib/cms-shared-schemas.ts'

const uuid = '00000000-0000-4000-8000-000000000001'
assert.equal(checkoutResultParentSchema.safeParse({ main_banner_image_path: '', main_banner_image_alt: '', secondary_banner_image_path: '', secondary_banner_image_alt: '', secondary_eyebrow: '', secondary_heading: '', secondary_paragraph: '', is_enabled: true }).success, true)
assert.equal(checkoutResultItemSchema.safeParse({ state: 'success', eyebrow: '', heading: '', paragraph: '', order_button_label: '', is_enabled: true }).success, true)
assert.equal(checkoutResultItemSchema.safeParse({ state: 'unknown', eyebrow: '', heading: '', paragraph: '', order_button_label: '', is_enabled: true }).success, false)

const promotion = { label: '', title: '', description: '', cta_text: '', cta_link: '/shop', cta_action: 'redirect', selected_coupon_id: null, image_path: '', mobile_image_path: '', image_alt: '', image_only_mode: false, is_active: true, show_once_per_session: true }
assert.equal(promotionParentSchema.safeParse(promotion).success, true)
assert.equal(promotionParentSchema.safeParse({ ...promotion, cta_link: 'javascript:alert(1)' }).success, false)
const optionQuestion = { id: null, field_key: 'ring_size', question: 'Ring size?', input_type: 'options', options: [{ id: 'a', label: 'Small', value: 'small' }, { id: 'b', label: 'Large', value: 'large' }], allow_multiple: false, validation_pattern: '', validation_message: '', is_required: true, is_active: true, sort_order: 1 }
assert.equal(promotionItemSchema.safeParse(optionQuestion).success, true)
assert.equal(promotionItemSchema.safeParse({ ...optionQuestion, options: optionQuestion.options.slice(0, 1) }).success, false)

assert.equal(serviceBannerParentSchema.safeParse({ image_path: '', image_alt: '', is_enabled: true }).success, true)
assert.equal(serviceBannerItemSchema.safeParse({ id: uuid, title: 'Shipping', paragraph: 'Details', sort_order: 1, is_active: true }).success, true)
assert.equal(serviceBannerItemSchema.safeParse({ title: '', paragraph: '', sort_order: 1, is_active: true }).success, false)
assert.equal(summaryParentSchema.safeParse({ heading: 'Details', is_enabled: true }).success, true)
assert.equal(summaryItemSchema.safeParse({ id: uuid, sort_order: 1, icon_url: 'https://example.com/icon.svg', pointer_text: 'Certified', video_url: '', video_link_text: '' }).success, true)
assert.equal(summaryItemSchema.safeParse({ sort_order: 1, icon_url: '', pointer_text: 'Certified', video_url: '', video_link_text: 'Watch' }).success, false)

console.log('Shared/global CMS validation tests passed.')
