export function catalogHierarchySaveBody(item: Record<string, unknown>, expectedRevision: string | null, seo?: Record<string, string | boolean>) {
  return JSON.stringify({ request_id: crypto.randomUUID(), expected_revision: expectedRevision, item, ...(seo ? { seo } : {}) })
}

export function catalogHierarchyDeleteBody(expectedRevision: string) {
  return JSON.stringify({ request_id: crypto.randomUUID(), expected_revision: expectedRevision })
}
