import 'server-only'
import type { AdminActor } from './auth/admin-identity-core'
import type { CatalogArguments, CatalogCommand, createCatalogRepository } from './db/admin-repositories/catalog'
import type { NavbarArguments, NavbarCommand, createNavbarRepository } from './db/admin-repositories/navbar'

/** Repository calls keep the `{ data, error }` envelope the save helpers were written against; `error` is never set on success. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandResult = { data: any; error: { code?: string; message?: string } | null }
export type CatalogRdsAccess = { provider: 'rds'; actor: AdminActor; catalog: ReturnType<typeof createCatalogRepository>; navbar: ReturnType<typeof createNavbarRepository> }
export type CatalogAccess = CatalogRdsAccess
export type CatalogReader = ReturnType<typeof createCatalogRepository>

export function catalogReader(access: CatalogAccess): CatalogReader {
  return access.catalog
}
export async function readCatalog<K extends CatalogCommand>(reader: CatalogReader, name: K, input: CatalogArguments[K]): Promise<CommandResult> {
  return { data: await reader.execute(name, input), error: null }
}
export async function catalogMutation<K extends CatalogCommand>(access: CatalogAccess, name: K, input: CatalogArguments[K]): Promise<CommandResult> {
  return { data: await access.catalog.execute(name, input), error: null }
}
export async function navbarMutation<K extends NavbarCommand>(access: CatalogAccess, name: K, input: NavbarArguments[K]): Promise<CommandResult> {
  return { data: await access.navbar.execute(name, input), error: null }
}
