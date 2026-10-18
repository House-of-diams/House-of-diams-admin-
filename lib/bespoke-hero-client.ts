type Slide = { id?: string }

export function bespokeHeroSaveBody(item: Record<string, unknown>, items: Slide[], originalItems: Slide[], expectedRevision: string, requestId = crypto.randomUUID()) {
  const retained = new Set(items.flatMap((entry) => entry.id ? [entry.id] : []))
  return JSON.stringify({ request_id: requestId, expected_revision: expectedRevision, item, items, deleted_ids: originalItems.flatMap((entry) => entry.id && !retained.has(entry.id) ? [entry.id] : []) })
}
