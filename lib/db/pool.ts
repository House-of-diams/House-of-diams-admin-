import 'server-only'
import { readFileSync } from 'node:fs'
import { Pool } from 'pg'
import { readAdminDbConfig } from './config'
import { queryAdmin, withAdminTransaction } from './query'
import type { AdminTransactionOptions, DbExecutor } from './query'
import type { QueryResultRow } from 'pg'
const state = globalThis as typeof globalThis & { hodAdminDb?: { pool: Pool; loginRole: string } }
function database() {
  if (!state.hodAdminDb) {
    const config = readAdminDbConfig(process.env, path => readFileSync(path, 'utf8'))
    const pool = new Pool(config.pool)
    // pg requires a handler for idle-client errors; do not log credentials/query details.
    pool.on('error', () => {})
    state.hodAdminDb = { pool, loginRole: config.loginRole }
  }
  return state.hodAdminDb
}
export function adminQuery<Row extends QueryResultRow>(text: string, values: unknown[] = []): Promise<Row[]> {
  const db = database()
  return queryAdmin<Row>(db.pool, db.loginRole, text, values)
}
export function adminTransaction<T>(run: (db: DbExecutor) => Promise<T>, options?: AdminTransactionOptions): Promise<T> {
  const db = database()
  return withAdminTransaction(db.pool, db.loginRole, run, options)
}
export async function closeAdminPool(): Promise<void> {
  const db = state.hodAdminDb
  delete state.hodAdminDb
  if (db) await db.pool.end()
}
