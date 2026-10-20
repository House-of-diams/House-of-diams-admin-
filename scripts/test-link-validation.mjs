import assert from 'node:assert/strict'
import test from 'node:test'
import { isSafeAdminLink, safeLinkSchema } from '../lib/link-validation.ts'
import { heroSaveSchema } from '../lib/cms-hero-validation.ts'
import { cmsSingletonItemSchemas } from '../lib/cms-singleton-schemas.ts'

// HOD-067: one link rule for CMS and navbar fields.
test('admin links: site paths, anchors, http(s), mailto and tel only', () => {
  for (const ok of ['', '/', '/shop/solitaire-ring', '/engagement-rings?metal=gold', '#faq', 'https://houseofdiams.com/a', 'http://example.com', 'mailto:care@houseofdiams.com', 'tel:+15551234567'])
    assert.equal(isSafeAdminLink(ok), true, ok)
  for (const bad of ['shop', 'shop/rings', '//evil.example/x', 'javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x', '/shop rings', 'https://', 'https://user:pass@host/x', 'ftp://host/x', '/a\b', 'mailto:', '/x\u0000'])
    assert.equal(isSafeAdminLink(bad), false, bad)
  assert.equal(safeLinkSchema.parse('  /shop  '), '/shop', 'surrounding spaces are trimmed, not rejected')
})

test('hero rejects bad slide links and the dropped top-level fields', () => {
  const slide = { image_path: 'hero/a.webp', headline: 'H', subtitle: '', button_text: 'Shop', button_link: '/shop' }
  const base = { request_id: '00000000-0000-4000-8000-000000000001', expected_revision: 'a'.repeat(32), deleted_ids: [], slider_enabled: true, seo_title: '', seo_description: '', items: [slide] }
  assert.equal(heroSaveSchema.safeParse(base).success, true)
  assert.equal(heroSaveSchema.safeParse({ ...base, items: [{ ...slide, button_link: 'shop' }] }).success, false)
  assert.equal(heroSaveSchema.safeParse({ ...base, eyebrow: 'Ignored before' }).success, false)
  assert.equal(cmsSingletonItemSchemas.about_wide_banner.shape.button_link.safeParse('//evil.example').success, false)
})
