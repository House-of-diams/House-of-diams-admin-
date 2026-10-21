import assert from 'node:assert/strict'
import test from 'node:test'
import { KEEPALIVE_INTERVAL_MS, readPingOutcome, shouldPing } from '../lib/session-keepalive.ts'

test('pings only after real activity and a full interval', () => {
  const t0 = 1_000_000
  assert.equal(shouldPing(t0, t0, t0 + KEEPALIVE_INTERVAL_MS), false, 'no activity since the last ping')
  assert.equal(shouldPing(t0 + 10, t0, t0 + 1_000), false, 'too soon after the last ping')
  assert.equal(shouldPing(t0 + 10, t0, t0 + KEEPALIVE_INTERVAL_MS), true)
})
test('only an explicit 401 means signed out', () => {
  assert.equal(readPingOutcome(200), 'ok')
  assert.equal(readPingOutcome(401), 'expired')
  for (const status of [403, 404, 500, 502, 503]) assert.equal(readPingOutcome(status), 'ignore')
})
