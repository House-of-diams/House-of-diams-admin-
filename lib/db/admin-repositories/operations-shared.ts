import 'server-only'
import { z } from 'zod'
import type { DbExecutor } from '../query'
import { parseCmsJson } from '../../cms-id-safety'

export class OperationsError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409 | 503, message: string) { super(message) }
}
export const uuid = (value: string) => z.string().uuid().parse(value)
export function pageNumber(value: unknown, max = 100_000) { return z.coerce.number().int().min(1).max(max).parse(value) }
export function exactId(value: unknown): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new OperationsError(400, 'Invalid ID.')
  const text = String(value)
  if (!/^[1-9][0-9]{0,18}$/.test(text) || BigInt(text) > BigInt('9223372036854775807')) throw new OperationsError(400, 'Invalid ID.')
  return text
}
export function safeCount(value: unknown): number {
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid count')
  return count
}
/** JSON text keeps bigint IDs exact and preserves PostgreSQL numeric JSON contracts. */
export async function jsonRows<T>(db: DbExecutor, sql: string, values: unknown[] = []): Promise<T[]> {
  const { rows } = await db.query<{ item: string }>(sql, values)
  return rows.map(row => { if (typeof row.item !== 'string') throw new Error('Invalid operation result'); return parseCmsJson(row.item) as T })
}
export async function optionalRelation(db: DbExecutor, table: 'newsletter_submissions' | 'promotion_popup_responses'): Promise<boolean> {
  // Presence only: permissions/column/query failures must propagate, never look like an empty feature.
  const { rows } = await db.query<{ present: boolean }>('SELECT to_regclass($1::text) IS NOT NULL AS present', [`public.${table}`])
  if (rows.length !== 1 || typeof rows[0].present !== 'boolean') throw new Error('Invalid feature availability')
  return rows[0].present
}
