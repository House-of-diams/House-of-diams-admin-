import assert from 'node:assert/strict'
import test from 'node:test'
import { revisionOf } from '../lib/revision.ts'

// HOD-054: identical data always gives the same revision; any value change gives a new one.
test('revision ignores key order, array row order and undefined; detects value changes', () => {
  const a = { name: 'Ring', ids: ['b', 'a'], items: [{ id: 2, price: 5 }, { id: 1, price: 4 }], gone: undefined }
  const b = { items: [{ price: 4, id: 1 }, { id: 2, price: 5 }], ids: ['a', 'b'], name: 'Ring' }
  assert.equal(revisionOf(a), revisionOf(b))
  assert.match(revisionOf(a), /^[0-9a-f]{32}$/)
  assert.notEqual(revisionOf(a), revisionOf({ ...b, name: 'Ring 2' }))
  assert.notEqual(revisionOf(a), revisionOf({ ...b, items: [{ id: 1, price: 4 }, { id: 2, price: 6 }] }))
  assert.notEqual(revisionOf({ x: null }), revisionOf({ x: 0 }))
})
