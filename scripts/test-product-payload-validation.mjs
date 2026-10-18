import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { productPayloadSchema } from '../lib/product-payload-validation.ts'
import { normalizeProductCustomDropdowns, validateProductCustomDropdowns } from '../lib/product-custom-dropdowns.ts'

const id = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`

function payload() {
  return {
    name: 'Atomic Test Product', sku: 'ATOMIC-TEST', product_lane: 'standard', detail_template: 'standard',
    featured: false, description: null, tag_line: null, seo_title: null, seo_description: null, h1_title: null,
    base_price: 100, discount_price: null, gst_slab_id: null, stock_quantity: 0, allow_checkout: false,
    status: 'active', main_category_id: id(1), subcategory_id: null, option_id: null,
    linked_subcategory_ids: [], linked_option_ids: [], style_id: null, metal_ids: [], metal_variants: [],
    default_variant_media_items: [], purity_values: [], purity_prices: [], default_purity_price_id: null,
    metal_media: [], certificate_ids: [], ring_size_ids: [], ring_enabled: false, ring_category_id: null,
    fit_options: [], fit_label: null, gemstone_label: null, gemstone_value: null, material_value_ids: [],
    shapes_enabled: false, shape_ids: [], show_purity: false, engraving_enabled: false, engraving_label: null,
    custom_dropdowns_enabled: false, custom_dropdowns: [], shipping_enabled: false, care_warranty_enabled: false,
    shipping_override_enabled: false, care_warranty_override_enabled: false, shipping_rule_id: null,
    care_warranty_rule_id: null, shipping_title_override: null, shipping_body_override: null,
    care_warranty_title_override: null, care_warranty_body_override: null, features: [], specifications: [],
    product_details: [], detail_sections: [], faq_items: [], image_1_path: null, image_2_path: null,
    image_3_path: null, image_4_path: null, image_1_alt: null, image_2_alt: null, image_3_alt: null,
    image_4_alt: null, video_path: null, model_3d_url: null, show_image_1: true, show_image_2: true,
    show_image_3: true, show_image_4: true, show_video: true, custom_order_enabled: false, ready_to_ship: false,
    hiphop_badges: [], chain_length_options: [], hiphop_carat_label: null, hiphop_carat_values: [],
    gram_weight_label: null, gram_weight_value: null,
  }
}

test('accepts the current simple ProductForm payload', () => {
  assert.equal(productPayloadSchema.safeParse(payload()).success, true)
})

test('accepts variants, media, FAQs, custom dropdowns, and temporary purity IDs', () => {
  const value = payload()
  value.metal_ids = [id(2)]
  value.metal_variants = [{ metal_id: id(2), price: 120, is_default: true, sort_order: 1, media_items: [{ media_type: 'image', media_path: 'products/a.webp', sort_order: 1 }] }]
  value.default_variant_media_items = [{ media_type: 'video', media_path: 'https://example.test/video.mp4', sort_order: 1, is_default_fallback: true }]
  value.purity_prices = [{ id: 'test-18k', purity_label: '18K', price: 120, compare_at_price: null, sort_order: 1 }]
  value.default_purity_price_id = 'test-18k'
  value.faq_items = [{ question: 'Question?', answer: 'Answer.', sort_order: 1, is_active: true, source: 'admin' }]
  value.custom_dropdowns_enabled = true
  value.custom_dropdowns = [{ id: id(3), name: 'chain', label: 'Chain', is_enabled: true, is_required: false, display_order: 0, options: [{ id: id(4), label: 'Short', value: 'short', is_enabled: true, display_order: 0 }] }]
  assert.equal(productPayloadSchema.safeParse(value).success, true)
})

test('requires exactly one default metal variant when variants are present', () => {
  const value = payload()
  value.metal_ids = [id(2), id(3)]
  value.metal_variants = [
    { metal_id: id(2), price: 120, is_default: false, sort_order: 1 },
    { metal_id: id(3), price: 140, is_default: false, sort_order: 2 },
  ]
  assert.equal(productPayloadSchema.safeParse(value).success, false)
  value.metal_variants[1].is_default = true
  assert.equal(productPayloadSchema.safeParse(value).success, true)
})

test('the editor hydrates relation-backed product data before an edit save is available', () => {
  const source = readFileSync(new URL('../components/product-form.tsx', import.meta.url), 'utf8')
  const loader = readFileSync(new URL('../lib/product-editor-data.ts', import.meta.url), 'utf8')
  assert.match(source, /\(loading \|\| !productHydrated\)/)
  assert.match(loader, /metalVariantBundle/)
  assert.match(loader, /loadProductFaqItems/)
  assert.match(loader, /loadProductCustomDropdowns/)
  assert.match(loader, /loadProductLinkSelections/)
})

test('prepares custom dropdown names and option values before the RPC save', () => {
  const value = payload()
  value.custom_dropdowns = [{ id: id(3), name: '', label: 'Select chain', is_enabled: true, is_required: false, display_order: 99, options: [{ id: id(4), label: 'Short', value: '', is_enabled: true, display_order: 99 }] }]
  const parsed = productPayloadSchema.parse(value)
  const prepared = { ...parsed, custom_dropdowns: normalizeProductCustomDropdowns(parsed.custom_dropdowns).map((group, groupIndex) => ({
    ...group,
    display_order: groupIndex,
    options: group.options.map((option, optionIndex) => ({ ...option, display_order: optionIndex })),
  })) }
  assert.equal(prepared.custom_dropdowns[0].name, 'select_chain')
  assert.equal(prepared.custom_dropdowns[0].display_order, 0)
  assert.equal(prepared.custom_dropdowns[0].options[0].value, 'short')
  assert.equal(prepared.custom_dropdowns[0].options[0].display_order, 0)
  assert.match(readFileSync(new URL('../lib/product-save.ts', import.meta.url), 'utf8'), /normalizeProductCustomDropdowns\(payload\.custom_dropdowns\)/)
})

test('ProductForm ignores a repeated submit while a save is in flight', () => {
  const formSource = readFileSync(new URL('../components/product-form.tsx', import.meta.url), 'utf8')
  assert.match(formSource, /event\.preventDefault\(\)\s+if \(saving\) return\s+setSaving\(true\)/)
})

for (const [name, mutate] of [
  ['missing required field', (value) => { delete value.name }],
  ['malformed UUID', (value) => { value.main_category_id = 'bad-id' }],
  ['invalid enum', (value) => { value.status = 'published' }],
  ['wrong primitive type', (value) => { value.stock_quantity = 'zero' }],
  ['negative base price', (value) => { value.base_price = -1 }],
  ['zero base price', (value) => { value.base_price = 0 }],
  ['invalid variant price', (value) => { value.metal_variants = [{ metal_id: id(2), price: 0, is_default: true, sort_order: 1 }] }],
  ['invalid purity price', (value) => { value.purity_prices = [{ purity_label: '18K', price: 0, sort_order: 0 }] }],
  ['non-finite price', (value) => { value.base_price = Infinity }],
  ['malformed relationship ID', (value) => { value.shape_ids = ['not-a-uuid'] }],
  ['duplicate relationship ID', (value) => { value.shape_ids = [id(2), id(2)] }],
  ['incorrect nested type', (value) => { value.faq_items = 'not-an-array' }],
  ['unknown field', (value) => { value.unexpected = true }],
]) {
  test(`rejects ${name}`, () => {
    const value = payload()
    mutate(value)
    assert.equal(productPayloadSchema.safeParse(value).success, false)
  })
}

test('rejects an invalid enabled custom dropdown', () => {
  const value = payload()
  value.custom_dropdowns_enabled = true
  value.custom_dropdowns = [{ id: id(3), name: 'chain', label: 'Chain', is_enabled: true, is_required: false, display_order: 0, options: [] }]
  assert.equal(validateProductCustomDropdowns(value.custom_dropdowns), '“Chain” needs at least one enabled option.')
})
