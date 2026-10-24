'use client'
// HOD-066: the provider and CSRF token are reused for 60 s within this page instead
// of two extra requests per call. Any 401/403 from the server drops them.
let context: { provider: 'rds'; csrf: string; at: number } | null = null
const CONTEXT_MS = 60_000
export function forgetCmsRequestContext() { context = null }
async function requestContext() {
  if (context && Date.now() - context.at < CONTEXT_MS) return context
  context = null
  const contract = await fetch('/api/cms/provider', { credentials: 'same-origin', cache: 'no-store' })
  const payload = await contract.json()
  if (!contract.ok || payload?.provider !== 'rds') throw new Error('Content service unavailable.')
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
export async function cmsRequestHeaders(mutation = true): Promise<Headers> {
  const current = await requestContext()
  const headers = new Headers({ 'content-type': 'application/json' })
  if (mutation) headers.set('x-admin-csrf', current.csrf)
  return headers
}
export async function cmsFetch(url: string, options: RequestInit = {}) {
  const pathname = url.split('?')[0]
  const cms = /^\/api\/cms\/(?:about\/(?:founders|hero|timeline|values|wide-banner)|bespoke\/(?:manufacturing|process)|(?:blog|education)\/(?:hero|posts(?:\/[1-9][0-9]*)?)|contact\/(?:hero|info)|education\/hubs|docs\/(?:terms|privacy-policy|shipping|returns)|home\/(?:bespoke-showcase|bestsellers|certifications|collection|collection-page|couples|discover-rings|discover-shapes|hero|hiphop|hiphop-showcase|offer-section|offers(?:/[0-9a-f-]{36})?|reels|shop-by-category|testimonials-cards)|checkout-result|promotion|service-banner|seo-settings|summary|support\/(?:announcement-bar|faq(?:\/categories)?)|references\/products)$/
  const bespoke = /^\/api\/bespoke\/(?:hero|form-config|(?:submissions|portfolio-categories|portfolio-items)(?:\/[0-9a-f-]{36})?)$/i
  if ((!cms.test(pathname) && !bespoke.test(pathname)) || url.includes('#')) throw new Error('Invalid content data path.')
  try {
    const headers = await cmsRequestHeaders(!['GET','HEAD'].includes((options.method ?? 'GET').toUpperCase()))
    new Headers(options.headers).forEach((value,key) => { if (!['authorization','x-admin-csrf'].includes(key.toLowerCase())) headers.set(key,value) })
    const response = await fetch(url,{...options,credentials:'same-origin',headers})
    if (response.status === 401 || response.status === 403) context = null
    return response
  } catch {
    return Response.json({error:'Content request unavailable. Please sign in again or retry after the service is restored.'},{status:503})
  }
}
