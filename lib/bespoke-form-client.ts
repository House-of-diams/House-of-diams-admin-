import type { BespokeFormSnapshot } from './bespoke-form-save'

const listKeys = ['guarantees', 'pieceTypes', 'stoneOptions', 'caratOptions', 'metalOptions'] as const

export function bespokeFormSaveBody(current: BespokeFormSnapshot, original: BespokeFormSnapshot, requestId = crypto.randomUUID()) {
  const deletedIds = Object.fromEntries(listKeys.map((key) => {
    const retained = new Set(current[key].flatMap((row) => row.id ? [row.id] : []))
    return [key, original[key].flatMap((row) => row.id && !retained.has(row.id) ? [row.id] : [])]
  }))

  return JSON.stringify({
    request_id: requestId,
    expected_revision: original.revision,
    settings: current.settings ?? { intro_heading: '', intro_subtitle: '', footer_note: '', status: 'active' },
    lists: Object.fromEntries(listKeys.map((key) => [key, current[key]])),
    deleted_ids: deletedIds,
  })
}
