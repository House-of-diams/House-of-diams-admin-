export type AdminDbErrorKind = 'unavailable' | 'permission' | 'conflict' | 'invalid' | 'internal'
export class AdminDbError extends Error {
  constructor(public readonly kind: AdminDbErrorKind, public readonly sqlState?: string) {
    super('Admin database operation failed')
    this.name = 'AdminDbError'
  }
}
export function mapAdminDbError(error: unknown): AdminDbError {
  if (error instanceof AdminDbError) return error
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const state = /^[0-9A-Z]{5}$/.test(code) ? code : undefined
  const kind = code === '42501' ? 'permission'
    : ['40001', '40P01', '23505', 'PT409'].includes(code) ? 'conflict'
    : ['23503', '23514', '22P02'].includes(code) ? 'invalid'
    : ['42883', '42P01', '53300', '57P01', '57014'].includes(code) || code.startsWith('08')
      || ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(code) ? 'unavailable' : 'internal'
  return new AdminDbError(kind, state)
}
