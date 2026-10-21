import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { OFFER_SECTION_DEFAULTS, offerSectionSchema } from '../lib/offer-section-validation.ts'

const ok = { ...OFFER_SECTION_DEFAULTS }

test('the built-in wording is valid and matches the database defaults', () => {
  assert.deepEqual(offerSectionSchema.parse(ok), ok)
  // The SQL lives beside the repo on the developer machine, not in CI.
  const file = new URL('../../sql-to-apply/phase-7/10_cms_home_offer_section.forward.sql', import.meta.url)
  if (!fs.existsSync(file)) return
  const sql = fs.readFileSync(file, 'utf8')
  for (const text of [ok.label, ok.heading, ok.gift_heading, ok.button_text]) assert.ok(sql.includes(`'${text}'`), text)
})

test('text is trimmed and blank required fields are refused', () => {
  assert.equal(offerSectionSchema.parse({ ...ok, label: '  Members only  ' }).label, 'Members only')
  for (const key of ['label', 'heading', 'gift_heading', 'button_text']) assert.throws(() => offerSectionSchema.parse({ ...ok, [key]: '   ' }), key)
  assert.equal(offerSectionSchema.parse({ ...ok, description: '' }).description, '')
})

test('lengths follow the database limits', () => {
  assert.throws(() => offerSectionSchema.parse({ ...ok, label: 'x'.repeat(81) }))
  assert.throws(() => offerSectionSchema.parse({ ...ok, heading: 'x'.repeat(161) }))
  assert.throws(() => offerSectionSchema.parse({ ...ok, button_text: 'x'.repeat(61) }))
  assert.throws(() => offerSectionSchema.parse({ ...ok, description: 'x'.repeat(601) }))
})

test('unknown fields are refused (strict)', () => {
  assert.throws(() => offerSectionSchema.parse({ ...ok, section_key: 'other' }))
  assert.throws(() => offerSectionSchema.parse({ ...ok, step: 1 }))
})

test('the CMS client allows exactly this path', () => {
  const source = fs.readFileSync(new URL('../lib/cms-transport.ts', import.meta.url), 'utf8')
  assert.ok(source.includes('offer-section'))
})
