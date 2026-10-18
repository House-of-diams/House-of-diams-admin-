'use client'
import { isCanonicalAwsVideoReference } from './video-reference'

export type ClientVideoAsset = { key: string; url: string; size: number; lastModified: string | null; contentType?: string; extension?: string; verification?: 'unknown' | 'admitted'; admissionId?: string; libraryProvider?: 'legacy' | 'aws' }

export function canSelectLibraryVideo(item: ClientVideoAsset) {
  return item.verification === 'admitted' ? typeof item.admissionId === 'string' && !!item.admissionId : item.verification === undefined && (item.libraryProvider === 'legacy' || !isCanonicalAwsVideoReference(item.url))
}
export async function selectLibraryVideo(item: ClientVideoAsset): Promise<ClientVideoAsset> {
  if (!canSelectLibraryVideo(item)) throw new Error('Video is not admitted.')
  if (item.verification !== 'admitted') return item
  const response = await fetch('/api/products/videos/select', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'content-type': 'application/json', 'x-admin-csrf': await csrf() }, body: JSON.stringify({ url: item.url, admissionId: item.admissionId }) })
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.admissionId !== item.admissionId || result.url !== item.url) throw new Error('Video selection expired. Refresh the library.')
  return { ...item, url: result.url }
}
let generation = 0
let cached: { namespace: string; items: ClientVideoAsset[]; at: number } | undefined
let pending: { namespace: string; promise: Promise<ClientVideoAsset[]> } | undefined
export function invalidateClientVideoLibrary() { generation++; cached = undefined; pending = undefined }
export async function readClientVideoProvider(): Promise<{ provider: 'aws' | 'legacy'; namespace: string }> {
  const response = await fetch('/api/videos/provider', { credentials: 'same-origin', cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !['aws', 'legacy'].includes(payload?.provider) || typeof payload.namespace !== 'string' || !payload.namespace) throw new Error('Video service unavailable.')
  return payload
}
async function csrf() {
  const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
  const session = await response.json().catch(() => null)
  if (!response.ok || session?.authenticated !== true || typeof session.csrfToken !== 'string' || !session.csrfToken) throw new Error('Please sign in again.')
  return session.csrfToken as string
}
export async function tryUploadAwsVideo(file: File, endpoint: string, fields: Record<string, string>): Promise<string | null> {
  if (!['/api/products/media', '/api/cms/uploads/about-hero'].includes(endpoint) || fields.kind !== 'video') throw new Error('Invalid video endpoint.')
  if ((await readClientVideoProvider()).provider === 'legacy') return null
  const form = new FormData()
  form.set('file', file)
  for (const [key, value] of Object.entries(fields)) if (key !== 'file') form.set(key, value)
  const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'x-admin-csrf': await csrf(), 'x-admin-video-upload': '1' }, body: form })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.provider !== 's3' || !isCanonicalAwsVideoReference(payload.path) || payload.path !== payload.url) throw new Error('Unable to upload video.')
  invalidateClientVideoLibrary()
  return payload.path
}
export async function fetchVideoLibrary(refresh = false): Promise<ClientVideoAsset[]> {
  const mode = await readClientVideoProvider()
  if (!refresh && cached?.namespace === mode.namespace && Date.now() - cached.at < 300000) return cached.items
  if (!refresh && pending?.namespace === mode.namespace) return pending.promise
  const version = ++generation
  cached = undefined
  const promise = (async () => {
    const headers = new Headers()
    if (mode.provider === 'legacy') {
      const { supabase } = await import('./supabase')
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (token) headers.set('authorization', `Bearer ${token}`)
    }
    const response = await fetch(`/api/products/videos${refresh ? '?refresh=1' : ''}`, { credentials: 'same-origin', cache: 'no-store', headers })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !Array.isArray(payload?.items)) throw new Error('Unable to load videos.')
    // A configuration change between discovery and read cannot seed another namespace.
    if (mode.provider === 'aws' && payload.namespace !== mode.namespace) throw new Error('Video service configuration changed. Refresh the library.')
    for (const item of payload.items) {
      if (typeof item?.key !== 'string' || typeof item.url !== 'string' || !Number.isSafeInteger(item.size) || item.size < 0 || !(item.lastModified === null || typeof item.lastModified === 'string') || (mode.provider === 'aws' && !isCanonicalAwsVideoReference(item.url))) throw new Error('Invalid video library response.')
    }
    // AWS discovery is never silently promoted to approval by a missing/forged field.
    const items: ClientVideoAsset[] = payload.items.map((item: ClientVideoAsset) => mode.provider === 'aws'
      ? { ...item, libraryProvider: 'aws', verification: item.verification === 'admitted' && typeof item.admissionId === 'string' && item.admissionId ? 'admitted' : 'unknown' }
      : { ...item, libraryProvider: 'legacy' })
    if (generation === version) cached = { namespace: mode.namespace, items, at: Date.now() }
    return items
  })().finally(() => { if (generation === version) pending = undefined })
  pending = { namespace: mode.namespace, promise }
  return promise
}
