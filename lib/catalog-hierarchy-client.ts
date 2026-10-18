export function catalogHierarchySaveBody(item: Record<string, unknown>, expectedRevision: string | null) {
  return JSON.stringify({ request_id: crypto.randomUUID(), expected_revision: expectedRevision, item })
}

export function catalogHierarchyDeleteBody(expectedRevision: string) {
  return JSON.stringify({ request_id: crypto.randomUUID(), expected_revision: expectedRevision })
}
