import { createHash } from 'node:crypto'

// HOD-054: a save carries the revision of the data the editor opened; the server
// recomputes it under a row lock and refuses the save (409) if anyone changed it.
// Canonical form: object keys sorted, undefined dropped, arrays sorted, so the hash
// does not depend on key order or on query row order between identical reads.
// (A pure reordering of an id list without its own sort field is not a change here.)
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical).map(item => JSON.stringify(item)).sort().map(item => JSON.parse(item))
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().filter(key => record[key] !== undefined).map(key => [key, canonical(record[key])]))
  }
  return value
}

export function revisionOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value)) ?? 'null').digest('hex').slice(0, 32)
}

export const REVISION_HEADER = 'x-expected-revision'
export const STALE_EDITOR_MESSAGE = 'Someone else changed this since you opened it. Reload the page to see their changes, then save again.'
