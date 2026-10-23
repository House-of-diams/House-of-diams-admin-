import 'server-only'
import type { AdminActor } from './auth/admin-identity-core'
import type { CmsArguments, CmsCommand, createCmsRepository } from './db/admin-repositories/cms'
import type { DbExecutor } from './db/query'
/** Repository calls keep the `{ data, error }` envelope the save helpers were written against; `error` is never set on success. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandResult = { data: any; error: { code?: string; message?: string } | null }
export type CmsRdsAccess = { provider: 'rds'; actor: AdminActor; cms: ReturnType<typeof createCmsRepository>; db: DbExecutor }
export type CmsAccess = CmsRdsAccess
export type CmsReader = ReturnType<typeof createCmsRepository>
export function cmsReader(access: CmsAccess): CmsReader { return access.cms }
export async function readCms<K extends CmsCommand>(reader: CmsReader, name: K, input: CmsArguments[K]): Promise<CommandResult> {
  return { data: await reader.execute(name, input), error: null }
}
export async function cmsMutation<K extends CmsCommand>(access: CmsAccess, name: K, input: CmsArguments[K]): Promise<CommandResult> {
  return { data: await access.cms.execute(name, input), error: null }
}
