import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function loadTs(path) {
  const moduleRecord = { exports: {} }
  const nodeRequire = createRequire(path)
  const output = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(output, {
    module: moduleRecord, exports: moduleRecord.exports,
    require: (name) => name.startsWith('.') ? loadTs(resolve(dirname(path), `${name}.ts`)) : nodeRequire(name),
  })
  return moduleRecord.exports
}

const { couponDatabaseError, couponSaveSchema } = loadTs(fileURLToPath(new URL('../lib/coupon-save.ts', import.meta.url)))

const valid = () => ({
  code: 'SAVE-20', title: 'Seasonal offer', reward_type: 'percentage', discount_type: 'percentage',
  discount_value: 20, minimum_order_amount: 0, gift_product_id: null, gift_variant_id: '', gift_variant_data: {},
  gift_banner_image_url: null, banner_enabled: false, banner_title: null, banner_description: null,
  starts_at: null, ends_at: null, featured_priority: 0, usage_limit: null, is_active: true,
})

test('accepts an allow-listed percentage coupon', () => assert.equal(couponSaveSchema.safeParse(valid()).success, true))
test('rejects mass-assigned and malformed fields', () => {
  assert.equal(couponSaveSchema.safeParse({ ...valid(), usage_count: 999 }).success, false)
  assert.equal(couponSaveSchema.safeParse({ ...valid(), code: 'SAVE 20!' }).success, false)
  assert.equal(couponSaveSchema.safeParse({ ...valid(), discount_value: Number.NaN }).success, false)
})
test('enforces reward-specific constraints', () => {
  assert.equal(couponSaveSchema.safeParse({ ...valid(), discount_value: 101 }).success, false)
  assert.equal(couponSaveSchema.safeParse({ ...valid(), reward_type: 'free_gift', discount_value: 0 }).success, false)
})
test('does not expose unknown database messages', () => {
  const duplicate = couponDatabaseError({ code: '23505', message: 'private index name' }, 'save')
  assert.equal(duplicate.status, 409)
  assert.equal(duplicate.message, 'A coupon with this code already exists.')
  assert.equal(couponDatabaseError({ code: 'XX000', message: 'private database details' }, 'save').message.includes('private'), false)
})
