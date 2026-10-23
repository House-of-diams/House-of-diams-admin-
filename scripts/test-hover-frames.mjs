// Offline test for lib/hover-frames.ts pure helpers and the frame upload runner.
import test from 'node:test'
import assert from 'node:assert/strict'
import { frameTimes, fitWithin, validateHoverVideoFile, uploadHoverFrames, nextHoverVersion, HOVER_FRAME_COUNT, HOVER_MAX_VIDEO_BYTES } from '../lib/hover-frames.ts'

test('frame times are 24 increasing moments from the start to just before the end', () => {
  const times = frameTimes(10)
  assert.equal(times.length, HOVER_FRAME_COUNT)
  assert.equal(times[0], 0)
  assert.ok(times[23] < 10 && times[23] > 9.9)
  assert.deepEqual([...times].sort((a, b) => a - b), times)
  assert.deepEqual(frameTimes(0), [])
  assert.deepEqual(frameTimes(Number.NaN), [])
  assert.equal(frameTimes(0.02).length, 24)
})

test('frames are scaled down to fit, never up', () => {
  assert.deepEqual(fitWithin(4000, 2000), { width: 1000, height: 500 })
  assert.deepEqual(fitWithin(600, 800), { width: 600, height: 800 })
  assert.deepEqual(fitWithin(0, 100), { width: 0, height: 0 })
  assert.deepEqual(fitWithin(3000, 3000, 500), { width: 500, height: 500 })
})

test('video files are checked for type and size', () => {
  assert.equal(validateHoverVideoFile({ type: 'video/mp4', size: 5 }), null)
  assert.match(validateHoverVideoFile({ type: 'image/png', size: 5 }), /MP4, MOV or WebM/)
  assert.match(validateHoverVideoFile({ type: 'video/mp4', size: 0 }), /empty/)
  assert.match(validateHoverVideoFile({ type: 'video/mp4', size: HOVER_MAX_VIDEO_BYTES + 1 }), /MB or smaller/)
})

test('the next version is one above the saved one', () => {
  assert.equal(nextHoverVersion(null), 1)
  assert.equal(nextHoverVersion({ version: 4 }), 5)
})

const blobs = Array.from({ length: 24 }, (_, i) => ({ i }))

test('uploads all 24 frames and returns their addresses in order', async () => {
  const seen = []
  const progress = []
  const paths = await uploadHoverFrames(blobs, 2, async (blob, index, version) => { seen.push(index); return `p/v${version}/${index}` }, (done, total) => progress.push([done, total]))
  assert.deepEqual(paths, blobs.map((_, i) => `p/v2/${i}`))
  assert.equal(new Set(seen).size, 24)
  assert.deepEqual(progress.at(-1), [24, 24])
})

test('a frame that fails is retried, and a persistent failure stops the upload', async () => {
  const attempts = new Map()
  const flaky = async (_blob, index) => {
    attempts.set(index, (attempts.get(index) ?? 0) + 1)
    if (index === 5 && attempts.get(index) < 3) throw new Error('network')
    return `ok/${index}`
  }
  assert.equal((await uploadHoverFrames(blobs, 1, flaky)).length, 24)
  assert.equal(attempts.get(5), 3)

  let calls = 0
  await assert.rejects(uploadHoverFrames(blobs, 1, async () => { calls++; throw new Error('server said no') }), /server said no/)
  assert.ok(calls <= 3 * 3 + 3, `stopped early, made ${calls} calls`)
})

test('refuses a wrong frame count and honours cancellation', async () => {
  await assert.rejects(uploadHoverFrames(blobs.slice(1), 1, async () => 'x'), /exactly 24/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(uploadHoverFrames(blobs, 1, async () => 'x', undefined, controller.signal), /Cancelled/)
})
