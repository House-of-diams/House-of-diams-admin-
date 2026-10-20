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
    // pg requires a handler for idle-client errors. HOD-036: log only the error
    // code and class so outages are visible, never credentials or query text.
    pool.on('error', (error: Error & { code?: unknown }) => {
      const code = typeof error.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : 'unknown'
      console.error(`[admin-db] idle client error code=${code} type=${error.name}`)
    })
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
