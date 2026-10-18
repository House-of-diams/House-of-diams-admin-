export type CmsSaveEnvelope = {
  requestId: string
  revision: string
  deletedIds: string[]
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const revisionPattern = /^[0-9a-f]{32}$/

export function readCmsSaveEnvelope(body: Record<string, unknown>): CmsSaveEnvelope | null {
  const requestId = typeof body.request_id === 'string' && uuidPattern.test(body.request_id) ? body.request_id : null
  const revision = typeof body.expected_revision === 'string' && revisionPattern.test(body.expected_revision) ? body.expected_revision : null
  const rawDeletedIds = Array.isArray(body.deleted_ids) && body.deleted_ids.every((id) => typeof id === 'string' && id.length > 0)
    ? body.deleted_ids as string[]
    : null
  const deletedIds = rawDeletedIds && new Set(rawDeletedIds).size === rawDeletedIds.length ? rawDeletedIds : null
  return requestId && revision && deletedIds ? { requestId, revision, deletedIds } : null
}
