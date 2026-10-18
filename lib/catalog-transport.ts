'use client'

export async function catalogRequestHeaders(mutation = true): Promise<Headers> {
  const contract = await fetch('/api/catalog/provider', { credentials: 'same-origin', cache: 'no-store' })
  const payload = await contract.json()
  if (!contract.ok || !['supabase', 'rds'].includes(payload?.provider)) throw new Error('Catalog service unavailable.')
  const headers = new Headers({ 'content-type': 'application/json' })
  if (payload.provider === 'rds') {
    const result = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
    const session = await result.json()
    if (!result.ok || session?.authenticated !== true || typeof session.csrfToken !== 'string' || !session.csrfToken) throw new Error('Please sign in again.')
    if (mutation) headers.set('x-admin-csrf', session.csrfToken)
  } else {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.auth.getSession()
    if (!data.session?.access_token) throw new Error('Please sign in again.')
    headers.set('authorization', `Bearer ${data.session.access_token}`)
  }
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
    return await fetch(url, { ...options, credentials: 'same-origin', headers })
  } catch {
    return Response.json({ error: 'Catalog request unavailable. Please sign in again or retry after the service is restored.' }, { status: 503 })
  }
}
