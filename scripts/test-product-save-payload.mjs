import assert from 'node:assert/strict'
import test from 'node:test'
import {
  serializeProductMetalMedia,
  serializeProductMetalVariants,
  serializeProductPurityPrices,
} from '../lib/product-save-payload.ts'

test('product save serializers exclude database audit fields from loaded child rows', () => {
  const auditFields = { created_at: '2026-09-29T00:00:00Z', updated_at: '2026-09-29T00:00:00Z' }
  const [media] = serializeProductMetalMedia([{ ...auditFields, id: 'media-id', product_id: 'product-id', metal_id: 'metal-id', image_1_path: 'products/image.webp' }])
  const [price] = serializeProductPurityPrices([{ ...auditFields, id: 'price-id', product_id: 'product-id', purity_label: '18K', price: 1000, sort_order: 1 }])
  const [variant] = serializeProductMetalVariants([{ ...auditFields, id: 'variant-id', product_id: 'product-id', metal_id: 'metal-id', price: 1000, is_default: true, sort_order: 1, media_items: [{ ...auditFields, id: 'variant-media-id', product_id: 'product-id', media_type: 'image', media_path: 'products/variant.webp', sort_order: 1 }] }])

  for (const value of [media, price, variant, variant.media_items[0]]) {
    assert.equal('created_at' in value, false)
    assert.equal('updated_at' in value, false)
  }
})
