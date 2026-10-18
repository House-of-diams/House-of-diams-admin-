import type { QueryResultRow } from 'pg'
import { AdminDbError, mapAdminDbError } from './errors'
export interface DbExecutor {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: Row[] }>
}
export interface DbClient extends DbExecutor { release(error?: boolean): void }
export interface DbPool { connect(): Promise<DbClient> }
export type AdminTransactionOptions = { snapshot?: boolean; repeatableWrite?: boolean }
const principalSql = `SELECT session_user::text AS login_role, current_user::text AS active_role,
  EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'hod_admin_app') AS capability_exists,
  EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = session_user
    AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) AS safe_login,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname <> 'hod_admin_app'
    AND r.rolname <> session_user AND pg_catalog.pg_has_role(session_user, r.oid, 'MEMBER')) AS isolated_login,
  EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'hod_admin_app'
    AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) AS safe_capability,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname <> 'hod_admin_app'
    AND pg_catalog.pg_has_role('hod_admin_app', r.oid, 'MEMBER')) AS isolated_capability`
export async function withAdminTransaction<T>(pool: DbPool, loginRole: string, run: (db: DbExecutor) => Promise<T>, options?: AdminTransactionOptions): Promise<T> {
  let client: DbClient | undefined
  let began = false
  let discard = false
  try {
    if (options?.snapshot && options.repeatableWrite) throw new AdminDbError('invalid')
    client = await pool.connect()
    await client.query(options?.snapshot ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
      : options?.repeatableWrite ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE' : 'BEGIN'); began = true
    const { rows } = await client.query(principalSql)
    const p = rows[0]
    if (rows.length !== 1 || p.login_role !== loginRole || p.active_role !== loginRole
      || p.safe_login !== true || p.isolated_login !== true || p.safe_capability !== true
      || p.isolated_capability !== true || p.capability_exists !== true) {
      discard = true
      throw new AdminDbError('permission')
    }
    await client.query('SET LOCAL ROLE hod_admin_app')
    const value = await run(client)
    await client.query('COMMIT'); began = false
    return value
  } catch (error) {
    if (client && began) {
      try { await client.query('ROLLBACK') } catch { discard = true }
    } else { discard = true }
    throw mapAdminDbError(error)
  } finally { client?.release(discard) }
}
export async function queryAdmin<Row extends QueryResultRow>(pool: DbPool, loginRole: string, text: string, values: unknown[] = []): Promise<Row[]> {
  return withAdminTransaction(pool, loginRole, async db => (await db.query<Row>(text, values)).rows)
}

