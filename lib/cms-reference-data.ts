import 'server-only'
import type { CmsReader } from './cms-command'
import type { CmsReferenceResults } from './db/admin-repositories/cms-references'
export async function readCmsReference<K extends keyof CmsReferenceResults>(reader: CmsReader, name: K): Promise<{data: CmsReferenceResults[K]; error: {message: string} | null}> {
  return { data: await reader.references.read(name), error: null }
}
