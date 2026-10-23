// Offline test for lib/video-upload-gate.ts.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createVideoUploadGate, videoUploadLimit } from '../lib/video-upload-gate.ts'

test('the limit defaults to two and can be configured between one and four', () => {
  assert.equal(videoUploadLimit({}), 2)
  assert.equal(videoUploadLimit({ ADMIN_VIDEO_MAX_CONCURRENT_UPLOADS: '1' }), 1)
  assert.equal(videoUploadLimit({ ADMIN_VIDEO_MAX_CONCURRENT_UPLOADS: '3' }), 3)
  assert.equal(videoUploadLimit({ ADMIN_VIDEO_MAX_CONCURRENT_UPLOADS: '50' }), 4)
  for (const bad of ['0', '-1', 'abc', '', '1.5x']) assert.ok(videoUploadLimit({ ADMIN_VIDEO_MAX_CONCURRENT_UPLOADS: bad }) >= 1, bad)
  assert.equal(videoUploadLimit({ ADMIN_VIDEO_MAX_CONCURRENT_UPLOADS: '0' }), 2)
})

test('only the allowed number of uploads run at once, and a finished upload frees its place', () => {
  const gate = createVideoUploadGate(() => 2)
  const a = gate.tryAcquire(), b = gate.tryAcquire()
  assert.ok(a && b)
  assert.equal(gate.tryAcquire(), null, 'third upload is turned away')
  a()
  assert.equal(gate.active, 1)
  const c = gate.tryAcquire()
  assert.ok(c)
  assert.equal(gate.tryAcquire(), null)
  b(); c()
  assert.equal(gate.active, 0)
})

test('releasing twice never frees someone else\'s place', () => {
  const gate = createVideoUploadGate(() => 1)
  const first = gate.tryAcquire()
  first(); first(); first()
  assert.equal(gate.active, 0)
  const second = gate.tryAcquire()
  assert.ok(second)
  first()
  assert.equal(gate.tryAcquire(), null, 'the old release does not open the slot')
  second()
})
