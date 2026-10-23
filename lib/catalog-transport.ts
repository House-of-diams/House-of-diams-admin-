'use client'

// HOD-066: the provider and CSRF token are reused for 60 s within this page instead
// of two extra requests per call. Any 401/403 from the server drops them.
let context: { provider: 'rds'; csrf: string; at: number } | null = null
const CONTEXT_MS = 60_000
export function forgetCatalogRequestContext() { context = null }
async function requestContext() {
  if (context && Date.now() - context.at < CONTEXT_MS) return context
  context = null
  const contract = await fetch('/api/catalog/provider', { credentials: 'same-origin', cache: 'no-store' })
  const payload = await contract.json()
  if (!contract.ok || payload?.provider !== 'rds') throw new Error('Catalog service unavailable.')
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
export async function catalogRequestHeaders(mutation = true): Promise<Headers> {
  const current = await requestContext()
  const headers = new Headers({ 'content-type': 'application/json' })
  if (mutation) headers.set('x-admin-csrf', current.csrf)
  return headers
}

export async function catalogFetch(url: string, options: RequestInit = {}) {
  // Media has its own C migration; data transport cannot accidentally route an upload.
  if (!/^\/api\/(?:catalog(?:\/[a-z-]+(?:\/[^/?#]+)?)?|navbar(?:\/[^/?#]+)?)(?:\?|$)/.test(url)
    || /\/(?:upload|featured-image|section-icon)(?:[/?]|$)/.test(url)) throw new Error('Invalid catalog data path.')
  try {
    const headers = await catalogRequestHeaders(!['GET', 'HEAD'].includes(options.method ?? 'GET'))
    new Headers(options.headers).forEach((value, key) => {
      if (!['authorization', 'x-admin-csrf'].includes(key.toLowerCase())) headers.set(key, value)
    })
    const response = await fetch(url, { ...options, credentials: 'same-origin', headers })
    if (response.status === 401 || response.status === 403) context = null
    return response
  } catch {
    return Response.json({ error: 'Catalog request unavailable. Please sign in again or retry after the service is restored.' }, { status: 503 })
  }
}
