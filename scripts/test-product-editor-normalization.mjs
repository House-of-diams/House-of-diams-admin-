import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getProductEditorCacheKey,
  normalizeProductEditorItem,
} from '../lib/product-editor.ts'

test('normalizes absent optional values into controlled form defaults', () => {
  const item = normalizeProductEditorItem(null)

  assert.equal(item.name, '')
  assert.equal(item.stockQuantity, '0')
  assert.equal(item.shippingEnabled, true)
  assert.equal(item.careWarrantyEnabled, true)
  assert.deepEqual(item.imagePaths, [null, null, null, null])
  assert.deepEqual(item.showImageSlots, [true, true, true, true])
  assert.equal(item.specifications.length, 1)
  assert.equal(item.detailSections.length, 1)
})

test('normalizes relation-backed values and preserves explicit false flags', () => {
  const item = normalizeProductEditorItem({
    id: 'product-1',
    name: 'Ring',
    slug: 'ring',
    sku: 'R-1',
    main_category_id: 'category-1',
    subcategory_id: null,
    option_id: null,
    wedding_gender: 'unisex',
    description: null,
    tag_line: null,
    base_price: 1200,
    discount_price: null,
    featured: false,
    status: 'active',
    purity_values: ['18K'],
    metal_ids: ['legacy-metal'],
    metal_variants: [
      { metal_id: 'variant-metal', price: 1200, is_default: true, sort_order: 1 },
    ],
    fit_options: ['Comfort'],
    gemstone_value: 'Diamond, Ruby',
    material_value_ids: ['material-1'],
    shape_ids: ['shape-1'],
    show_image_1: false,
    show_video: false,
    shipping_enabled: false,
    care_warranty_enabled: false,
  })

  assert.deepEqual(item.selectedMetalIds, ['variant-metal'])
  assert.deepEqual(item.selectedPurities, ['18K'])
  assert.equal(item.purityPrices[0].id, 'legacy-0-18k')
  assert.deepEqual(item.gemstoneValues, ['Diamond', 'Ruby'])
  assert.deepEqual(item.selectedMaterialValueIds, ['material-1'])
  assert.deepEqual(item.selectedShapeIds, ['shape-1'])
  assert.equal(item.fitEnabled, true)
  assert.equal(item.showImageSlots[0], false)
  assert.equal(item.showVideo, false)
  assert.equal(item.shippingEnabled, false)
  assert.equal(item.careWarrantyEnabled, false)
})

test('uses one stable cache key for load and save invalidation', () => {
  const url = '/api/products/by-slug/example-ring'
  assert.equal(getProductEditorCacheKey(url), 'product-edit:/api/products/by-slug/example-ring')
})
