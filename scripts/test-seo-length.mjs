import test from 'node:test'
import assert from 'node:assert/strict'
import { measureSeoText, seoLengthStatus } from '../lib/seo-length.ts'

test('counts characters and words after collapsing whitespace', () => {
  assert.deepEqual(measureSeoText('  Luxury   diamond\n jewellery  '), { text: 'Luxury diamond jewellery', characters: 24, words: 3 })
  assert.deepEqual(measureSeoText('   '), { text: '', characters: 0, words: 0 })
})

test('titles are judged against 30-60 characters', () => {
  assert.equal(seoLengthStatus('', 'title').tone, 'empty')
  assert.equal(seoLengthStatus('Short title', 'title').tone, 'short')
  assert.equal(seoLengthStatus('Lab Grown Diamond Engagement Rings | House of Diams'.slice(0, 50), 'title').tone, 'good')
  const long = seoLengthStatus('x'.repeat(75), 'title'); assert.equal(long.tone, 'long'); assert.match(long.message, /15 over/)
})

test('descriptions are judged against 70-160 characters', () => {
  assert.equal(seoLengthStatus('a '.repeat(10), 'description').tone, 'short')
  assert.equal(seoLengthStatus('word '.repeat(24).trim(), 'description').tone, 'good')
  assert.equal(seoLengthStatus('word '.repeat(40), 'description').tone, 'long')
})
