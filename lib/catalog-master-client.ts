export function catalogMasterSaveBody(item: Record<string, unknown>, expectedRevision?: string | null) {
  return JSON.stringify({ request_id: crypto.randomUUID(), expected_revision: expectedRevision ?? null, item })
}

export function catalogMasterDeleteBody(expectedRevision: string) {
  return JSON.stringify({ request_id: crypto.randomUUID(), expected_revision: expectedRevision })
}
