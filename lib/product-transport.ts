'use client'

/** Server-authoritative selection per operation; never cache an activation or retry writes. */
export async function productRequestHeaders(mutation = true): Promise<Headers> {
  const contract = await fetch('/api/products/provider', { credentials: 'same-origin', cache: 'no-store' })
  const payload = await contract.json()
  if (!contract.ok || !['supabase', 'rds'].includes(payload?.provider)) throw new Error('Product service unavailable.')
  const headers = new Headers({ 'content-type': 'application/json' })
  if (payload.provider === 'rds') {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
    const session = await response.json()
    if (!response.ok || session?.authenticated !== true || typeof session.csrfToken !== 'string' || !session.csrfToken) throw new Error('Please sign in again.')
    if (mutation) headers.set('x-admin-csrf', session.csrfToken)
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
  return fetch(url, { ...options, credentials: 'same-origin', headers })
}
