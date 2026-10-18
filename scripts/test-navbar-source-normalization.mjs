import assert from 'node:assert/strict'
import test from 'node:test'
import { filterNavbarSectionSourceItems } from '../lib/navbar-source-items.ts'

test('normalization removes stale source kinds from a stone-shape section', () => {
  const normalized = filterNavbarSectionSourceItems('Stone Shapes', [
    { id: '1', sourceKind: 'metal', sourceItemId: 'metal-id', label: '10K Yellow Gold', sortOrder: 1, isActive: true },
    { id: '2', sourceKind: 'stone_shape', sourceItemId: 'shape-id', label: 'Round', sortOrder: 2, isActive: true },
  ])

  assert.deepEqual(normalized.map((entry) => entry.sourceKind), ['stone_shape'])
})

test('normalization clears source items for section types that do not support them', () => {
  const normalized = filterNavbarSectionSourceItems('Manual Links', [
    { id: '1', sourceKind: 'metal', sourceItemId: 'metal-id', label: '10K Yellow Gold', sortOrder: 1, isActive: true },
  ])

  assert.deepEqual(normalized, [])
})
