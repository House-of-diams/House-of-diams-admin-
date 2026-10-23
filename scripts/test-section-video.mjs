// Offline test for the banner video limits and address check.
import test from 'node:test'
import assert from 'node:assert/strict'
import { SECTION_VIDEO_MAX_BYTES, sectionVideoProblem } from '../lib/video-limits.ts'
import { isVideoAddress } from '../lib/media-kind.ts'

test('banner videos: type, size and empty files are checked before anything is sent', () => {
  assert.equal(sectionVideoProblem({ type: 'video/mp4', size: 5 * 1024 * 1024 }), null)
  assert.equal(sectionVideoProblem({ type: 'video/webm', size: SECTION_VIDEO_MAX_BYTES }), null)
  assert.match(sectionVideoProblem({ type: 'video/mp4', size: SECTION_VIDEO_MAX_BYTES + 1 }), /40 MB or smaller/)
  assert.match(sectionVideoProblem({ type: 'image/png', size: 5 }), /MP4, MOV or WebM/)
  assert.match(sectionVideoProblem({ type: 'video/mp4', size: 0 }), /empty/)
  assert.match(sectionVideoProblem({ type: 'video/mp4', size: 55 * 1024 * 1024 }), /55\.0 MB/)
})

test('a saved banner address is recognised as a video by its file extension', () => {
  assert.equal(isVideoAddress('https://media.houseofdiams.com/products/videos/11111111-2222-4333-8444-555555555555.mp4'), true)
  assert.equal(isVideoAddress('https://media.houseofdiams.com/bespoke-showcase/a.webp'), false)
  assert.equal(isVideoAddress(''), false)
  assert.equal(isVideoAddress(undefined), false)
})
