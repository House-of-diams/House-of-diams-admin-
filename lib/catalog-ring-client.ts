export function catalogRingSaveBody(categories: unknown[], sizes: unknown[], expectedRevision: string, deletedCategoryIds: string[] = [], deletedSizeIds: string[] = []) {
  return JSON.stringify({ request_id: crypto.randomUUID(), expected_revision: expectedRevision, categories, sizes, deleted_category_ids: deletedCategoryIds, deleted_size_ids: deletedSizeIds })
}
