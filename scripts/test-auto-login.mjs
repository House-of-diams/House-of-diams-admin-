import assert from 'node:assert/strict'
import test from 'node:test'
import { AUTO_LOGIN_COOLDOWN_MS, autoLoginAllowed, shouldAutoLogin } from '../lib/auto-login.ts'

test('a plain visit starts sign-in; sign-out and error visits do not', () => {
  assert.equal(autoLoginAllowed(undefined), true)
  assert.equal(autoLoginAllowed({}), true)
  assert.equal(autoLoginAllowed({ logout: 'complete' }), false)
  assert.equal(autoLoginAllowed({ logout: 'upstream-pending' }), false)
  assert.equal(autoLoginAllowed({ error: 'x' }), false)
})
test('never starts twice in a row within the cooldown (no redirect loop)', () => {
  const t = 1_000_000
  assert.equal(shouldAutoLogin(0, t), true, 'first visit')
  assert.equal(shouldAutoLogin(t - 1_000, t), false, 'bounced straight back')
  assert.equal(shouldAutoLogin(t - AUTO_LOGIN_COOLDOWN_MS - 1, t), true, 'a later visit')
  assert.equal(shouldAutoLogin(Number.NaN, t), true)
})
