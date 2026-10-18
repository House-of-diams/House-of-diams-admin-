import assert from 'node:assert/strict'
import test from 'node:test'
import { passwordChangeSchema, settingsDatabaseError, siteSettingsSchema } from '../lib/settings-validation.ts'

test('accepts a strictly shaped settings payload', () => {
  assert.equal(siteSettingsSchema.safeParse({ whatsapp_number: '919999999999', default_gst_slab_id: null, maintenance_mode_enabled: false, maintenance_mode_message: 'Back shortly.', estimated_delivery_text: 'Approximately 3 to 4 weeks' }).success, true)
})

test('rejects settings mass assignment and malformed values', () => {
  const base = { whatsapp_number: '919999999999', default_gst_slab_id: null, maintenance_mode_enabled: false, maintenance_mode_message: 'Back shortly.', estimated_delivery_text: 'Approximately 3 to 4 weeks' }
  assert.equal(siteSettingsSchema.safeParse({ ...base, settings_key: 'attacker-key' }).success, false)
  assert.equal(siteSettingsSchema.safeParse({ ...base, whatsapp_number: '+91 99999' }).success, false)
})

test('requires matching, changed passwords', () => {
  assert.equal(passwordChangeSchema.safeParse({ currentPassword: 'old-password', newPassword: 'new-password', confirmPassword: 'new-password' }).success, true)
  assert.equal(passwordChangeSchema.safeParse({ currentPassword: 'same-password', newPassword: 'same-password', confirmPassword: 'same-password' }).success, false)
  assert.equal(passwordChangeSchema.safeParse({ currentPassword: 'old-password', newPassword: 'new-password', confirmPassword: 'different' }).success, false)
})

test('maps database errors without exposing details', () => {
  assert.equal(settingsDatabaseError({ code: 'XX000', message: 'private database details' }).message.includes('private'), false)
})
