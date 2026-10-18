import 'server-only'
import type { assertAdmin } from './cms-auth'
import type { AdminActor } from './auth/admin-identity-core'
import type { CatalogArguments, CatalogCommand, createCatalogRepository } from './db/admin-repositories/catalog'
import type { NavbarArguments, NavbarCommand, createNavbarRepository } from './db/admin-repositories/navbar'

type LegacyAccess = Exclude<Awaited<ReturnType<typeof assertAdmin>>, { error: unknown }>
export type CatalogRdsAccess = { provider: 'rds'; actor: AdminActor; catalog: ReturnType<typeof createCatalogRepository>; navbar: ReturnType<typeof createNavbarRepository> }
export type CatalogAccess = LegacyAccess | CatalogRdsAccess
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> }
export type CatalogReader = RpcClient | ReturnType<typeof createCatalogRepository>

export function catalogReader(access: CatalogAccess): CatalogReader {
  return 'provider' in access ? access.catalog : access.adminClient
}
export async function readCatalog<K extends CatalogCommand>(reader: CatalogReader, name: K, input: CatalogArguments[K]) {
  if ('execute' in reader) return { data: await reader.execute(name, input), error: null }
  return reader.rpc(name, input)
}
export async function catalogMutation<K extends CatalogCommand>(access: CatalogAccess, name: K, input: CatalogArguments[K]) {
  if ('provider' in access) return { data: await access.catalog.execute(name, input), error: null }
  return access.adminClient.rpc(name, { ...input, p_actor_id: access.user.id })
}
export async function navbarMutation<K extends NavbarCommand>(access: CatalogAccess, name: K, input: NavbarArguments[K]) {
  if ('provider' in access) return { data: await access.navbar.execute(name, input), error: null }
  return access.adminClient.rpc(name, { ...input, p_actor_id: access.user.id })
}
