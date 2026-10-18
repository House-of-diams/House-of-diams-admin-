'use client'
export async function cmsRequestHeaders(mutation = true): Promise<Headers> {
  const contract = await fetch('/api/cms/provider', { credentials: 'same-origin', cache: 'no-store' })
  const payload = await contract.json()
  if (!contract.ok || !['supabase','rds'].includes(payload?.provider)) throw new Error('Content service unavailable.')
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
export async function cmsFetch(url: string, options: RequestInit = {}) {
  const pathname = url.split('?')[0]
  const cms = /^\/api\/cms\/(?:about\/(?:founders|hero|timeline|values|wide-banner)|bespoke\/(?:manufacturing|process)|(?:blog|education)\/(?:hero|posts(?:\/[1-9][0-9]*)?)|contact\/(?:hero|info)|docs\/(?:terms|privacy-policy|shipping|returns)|home\/(?:bespoke-showcase|bestsellers|certifications|collection|collection-page|couples|discover-rings|discover-shapes|hero|hiphop|hiphop-showcase|reels|shop-by-category|testimonials-cards)|checkout-result|promotion|service-banner|summary|support\/(?:announcement-bar|faq(?:\/categories)?)|references\/products)$/
  const bespoke = /^\/api\/bespoke\/(?:hero|form-config|(?:submissions|portfolio-categories|portfolio-items)(?:\/[0-9a-f-]{36})?)$/i
  if ((!cms.test(pathname) && !bespoke.test(pathname)) || url.includes('#')) throw new Error('Invalid content data path.')
  try {
    const headers = await cmsRequestHeaders(!['GET','HEAD'].includes((options.method ?? 'GET').toUpperCase()))
    new Headers(options.headers).forEach((value,key) => { if (!['authorization','x-admin-csrf'].includes(key.toLowerCase())) headers.set(key,value) })
    return await fetch(url,{...options,credentials:'same-origin',headers})
  } catch {
    return Response.json({error:'Content request unavailable. Please sign in again or retry after the service is restored.'},{status:503})
  }
}
