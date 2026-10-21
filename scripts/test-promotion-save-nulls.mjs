import assert from 'node:assert/strict'
import test from 'node:test'
import { promotionItemSchema, promotionParentSchema } from '../lib/cms-shared-schemas.ts'

// Shapes taken from the live UAT popup: option questions have NULL validation_pattern.
const optionQuestion = { id: 18, field_key: 'age_range', question: 'What is your age range?', input_type: 'options', validation_pattern: null, validation_message: 'Please select your age range.', is_required: true, options: [{ id: 'under_25', label: 'Under 25', value: 'under_25' }, { id: '25_34', label: '25-34', value: '25_34' }], allow_multiple: false, is_active: true, sort_order: 2 }
const parent = { label: '', title: 'Discover Our Signature Pieces', description: '', cta_text: 'Our collection', cta_link: '/shop', cta_action: 'reveal_coupon', selected_coupon_id: 4, image_path: 'promotion-popup/x.webp', mobile_image_path: null, image_alt: null, image_only_mode: false, is_active: true, show_once_per_session: true }

test('an option question with NULL validation text saves (stored as empty text)', () => {
  const parsed = promotionItemSchema.parse(optionQuestion)
  assert.equal(parsed.validation_pattern, '')
  assert.equal(parsed.validation_message, 'Please select your age range.')
})

test('NULL optional text on the popup itself saves as empty text', () => {
  const parsed = promotionParentSchema.parse(parent)
  assert.equal(parsed.mobile_image_path, '')
  assert.equal(parsed.image_alt, '')
})

test('required wording is still enforced and unknown fields are still refused', () => {
  assert.throws(() => promotionItemSchema.parse({ ...optionQuestion, question: '   ' }))
  assert.throws(() => promotionItemSchema.parse({ ...optionQuestion, step: 1 }))
  assert.throws(() => promotionParentSchema.parse({ ...parent, help_text: 'x' }))
  assert.throws(() => promotionParentSchema.parse({ ...parent, is_active: null }))
})
