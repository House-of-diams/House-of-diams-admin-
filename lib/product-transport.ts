'use client'

/** Server-authoritative selection; writes are never retried. */
// HOD-066: the provider and CSRF token are reused for 60 s within this page instead
// of two extra requests per call. Any 401/403 from the server drops them.
let context: { provider: 'supabase' | 'rds'; csrf: string; at: number } | null = null
const CONTEXT_MS = 60_000
export function forgetProductRequestContext() { context = null }
async function requestContext() {
  if (context && Date.now() - context.at < CONTEXT_MS) return context
  context = null
  const contract = await fetch('/api/products/provider', { credentials: 'same-origin', cache: 'no-store' })
  const payload = await contract.json()
  if (!contract.ok || !['supabase', 'rds'].includes(payload?.provider)) throw new Error('Product service unavailable.')
  let csrf = ''
  if (payload.provider === 'rds') {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
    const session = await response.json()
    if (!response.ok || session?.authenticated !== true || typeof session.csrfToken !== 'string' || !session.csrfToken) throw new Error('Please sign in again.')
    csrf = session.csrfToken
  }
  context = { provider: payload.provider, csrf, at: Date.now() }
  return context
}
export async function productRequestHeaders(mutation = true): Promise<Headers> {
  const current = await requestContext()
  const headers = new Headers({ 'content-type': 'application/json' })
  if (current.provider === 'rds') {
    if (mutation) headers.set('x-admin-csrf', current.csrf)
  } else {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.auth.getSession()
    if (!data.session?.access_token) throw new Error('Please sign in again.')
    headers.set('authorization', `Bearer ${data.session.access_token}`)
  }
  return headers
}
export async function productFetch(url: string, options: RequestInit = {}) {
  if (!/^\/api\/(?:products|inventory)(?:[/?]|$)/.test(url)) throw new Error('Invalid product API path.')
  const headers = await productRequestHeaders(!['GET', 'HEAD'].includes(options.method ?? 'GET'))
  new Headers(options.headers).forEach((value, key) => {
    if (!['authorization', 'x-admin-csrf'].includes(key.toLowerCase())) headers.set(key, value)
  })
  const response = await fetch(url, { ...options, credentials: 'same-origin', headers })
  if (response.status === 401 || response.status === 403) context = null
  return response
}
