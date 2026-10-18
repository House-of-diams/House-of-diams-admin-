import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildProductSlugBase,
  getRetiredProductSlug,
  selectAvailableProductSlug,
} from '../lib/product-slug-core.ts'

test('normalizes a descriptive product name', () => {
  assert.equal(buildProductSlugBase(' Eight-Prong Framed Oval Diamond Pendant '), 'eight-prong-framed-oval-diamond-pendant')
})

test('removes punctuation and collapses whitespace and hyphens', () => {
  assert.equal(buildProductSlugBase('Diamond & Pearl -- Ring!'), 'diamond-pearl-ring')
})

test('rejects a name that cannot form a slug', () => {
  assert.throws(() => buildProductSlugBase('!!!'), /must contain characters/)
})

test('uses the clean base when it is available', () => {
  assert.equal(selectAvailableProductSlug('diamond-ring', []), 'diamond-ring')
})

test('allocates deterministic numeric suffixes for existing product collisions', () => {
  assert.equal(selectAvailableProductSlug('diamond-ring', ['diamond-ring']), 'diamond-ring-2')
  assert.equal(selectAvailableProductSlug('diamond-ring', ['diamond-ring', 'diamond-ring-2']), 'diamond-ring-3')
})

test('does not treat a longer unrelated slug as an exact collision', () => {
  assert.equal(selectAvailableProductSlug('diamond-ring', ['diamond-ring-deluxe']), 'diamond-ring')
})

test('extracts retired product slugs and ignores non-product paths', () => {
  assert.equal(getRetiredProductSlug('/shop/diamond-ring'), 'diamond-ring')
  assert.equal(getRetiredProductSlug('/shop/diamond-ring?legacy=true'), 'diamond-ring')
  assert.equal(getRetiredProductSlug('/fine-jewellery/diamond-rings'), null)
})

test('reserves a retired product slug', () => {
  const retiredSlug = getRetiredProductSlug('/shop/diamond-ring')
  assert.equal(selectAvailableProductSlug('diamond-ring', retiredSlug ? [retiredSlug] : []), 'diamond-ring-2')
})
