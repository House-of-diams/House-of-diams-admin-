import 'server-only'
import { readOperationsProvider } from './operations-provider'
import { authorizeProductPage } from './product-server-request'
import { adminTransaction } from './db/pool'
import type { DbExecutor } from './db/query'
import type { AdminActor } from './auth/admin-identity-core'
/** Each loader independently authorizes; shared gate cutover remains central work. */
export async function operationsPage<R>(rds:(db:DbExecutor,actor:AdminActor)=>Promise<R>):Promise<R> {
  readOperationsProvider(process.env)
  const {actor}=await authorizeProductPage()
  return adminTransaction(db=>rds(db,actor))
}
