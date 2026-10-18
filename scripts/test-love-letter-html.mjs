import test from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtmlText } from '../lib/html-escape.ts'
import { sanitizeLoveLetterHtml } from '../lib/love-letter-html.ts'

test('removes executable and non-letter markup from saved letter HTML', () => {
  const sanitized = sanitizeLoveLetterHtml('<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">click</a><p onclick="alert(1)">Hello</p>')

  assert.doesNotMatch(sanitized, /<script|alert\(1\)|<img|<a\b|onclick|javascript:/i)
  assert.match(sanitized, /click/)
  assert.equal(sanitized, 'click<p>Hello</p>')
})

test('preserves the approved rich-letter formatting without attributes', () => {
  const sanitized = sanitizeLoveLetterHtml('<h2 class="title">A note</h2><p>Hello <strong>Dhruval</strong><br><em>Always</em></p><ul><li>One</li></ul>')

  assert.equal(sanitized, '<h2>A note</h2><p>Hello <strong>Dhruval</strong><br /><em>Always</em></p><ul><li>One</li></ul>')
})

test('escapes plain-text print metadata', () => {
  assert.equal(escapeHtmlText('< > " \' &'), '&lt; &gt; &quot; &#39; &amp;')
})
