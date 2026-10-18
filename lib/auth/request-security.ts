import 'server-only'
import { timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = '__Host-hod_admin_session'
export const FLOW_COOKIE = '__Host-hod_admin_flow'
export const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer' }

export function equalSecret(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y)
}

export function safeReturnPath(value: string | null): string {
  const path = value ?? '/dashboard'
  // Reject encoded paths, dot segments, backslashes and control characters rather than normalizing them.
  if (path.length > 1024 || !/^\/dashboard(?:\/[a-zA-Z0-9_-]+)*\/?$/.test(path)) throw new Error('Invalid redirect')
  return path
}

export function cookieValue(request: Request, name: string): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';').map(v => v.trim())
    .filter(v => v.startsWith(`${name}=`)).map(v => v.slice(name.length + 1))
  return values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(values[0]) ? values[0] : null
}

export function secureCookie(name: string, value: string, seconds: number): string {
  if (![SESSION_COOKIE, FLOW_COOKIE].includes(name) || (value && !/^[A-Za-z0-9_-]{43}$/.test(value))) throw new Error('Invalid cookie')
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(seconds))}`
}

export function assertSameOrigin(request: Request, origin: string): void {
  if (new URL(request.url).origin !== origin || request.headers.get('origin') !== origin
    || (request.headers.get('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) throw new Error('Invalid origin')
}

export function assertMutation(request: Request, origin: string, csrf: string): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) throw new Error('Invalid method')
  assertSameOrigin(request, origin)
  if (!equalSecret(request.headers.get('x-admin-csrf') ?? '', csrf)) throw new Error('Invalid CSRF')
}
