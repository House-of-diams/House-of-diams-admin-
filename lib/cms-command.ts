import 'server-only'
import type { assertAdmin } from './cms-auth'
import type { AdminActor } from './auth/admin-identity-core'
import type { CmsArguments, CmsCommand, createCmsRepository } from './db/admin-repositories/cms'
import type { DbExecutor } from './db/query'
type LegacyAccess = Exclude<Awaited<ReturnType<typeof assertAdmin>>, { error: unknown }>
export type CmsRdsAccess = { provider: 'rds'; actor: AdminActor; cms: ReturnType<typeof createCmsRepository>; db: DbExecutor }
export type CmsAccess = LegacyAccess | CmsRdsAccess
export type CmsReader = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> } | ReturnType<typeof createCmsRepository>
export function cmsReader(access: CmsAccess): CmsReader { return 'provider' in access ? access.cms : access.adminClient }
export async function readCms<K extends CmsCommand>(reader: CmsReader, name: K, input: CmsArguments[K]) {
  if ('execute' in reader) return { data: await reader.execute(name, input), error: null }
  return reader.rpc(name, input)
}
export async function cmsMutation<K extends CmsCommand>(access: CmsAccess, name: K, input: CmsArguments[K]) {
  if ('provider' in access) return { data: await access.cms.execute(name, input), error: null }
  return access.adminClient.rpc(name, { ...input, p_actor_id: access.user.id })
}
