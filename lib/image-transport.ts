'use client'
import { isCanonicalAwsImageReference } from './image-reference'

const endpoints = /^\/api\/(?:cms\/uploads\/[a-z-]+|catalog\/(?:categories|subcategories|options|styles|stone-shapes)\/upload|navbar\/(?:section-icon|featured-image)|products\/media|bespoke\/media)$/
export async function readClientImageProvider(): Promise<'legacy' | 'aws'> {
  const response = await fetch('/api/images/provider', { credentials: 'same-origin', cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !['legacy', 'aws'].includes(payload?.provider)) throw new Error('Image service unavailable.')
  return payload.provider
}

/** null explicitly means legacy mode. Any selected AWS failure propagates without fallback. */
export async function tryUploadAwsImage(file: File, endpoint: string, fields: Record<string, string> = {}, activity?: { start: () => void; finish: (ok: boolean) => void }): Promise<string | null> {
  if (!endpoints.test(endpoint)) throw new Error('Invalid image endpoint.')
  if (await readClientImageProvider() === 'legacy') return null
  activity?.start()
  let ok = false
  try {
  const sessionResponse = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
  const session = await sessionResponse.json().catch(() => null)
  if (!sessionResponse.ok || session?.authenticated !== true || typeof session.csrfToken !== 'string' || !session.csrfToken) throw new Error('Please sign in again.')
  const form = new FormData()
  form.set('file', file)
  for (const [key, value] of Object.entries(fields)) if (key !== 'file') form.set(key, value)
  const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'x-admin-csrf': session.csrfToken, 'x-admin-image-upload': '1' }, body: form })
  const payload = await response.json().catch(() => null)
  if (!response.ok && typeof payload?.error === 'string' && payload.error) throw new Error(payload.error)
  if (!response.ok || payload?.provider !== 's3' || !isCanonicalAwsImageReference(payload.path) || payload.path !== payload.url) throw new Error('Unable to upload image.')
  ok = true
  return payload.path
  } finally { activity?.finish(ok) }
}

/** AWS-only upload: the legacy (Supabase storage) provider no longer exists, so anything but AWS is an error. */
export async function uploadAwsImage(file: File, endpoint: string, fields: Record<string, string> = {}, activity?: { start: () => void; finish: (ok: boolean) => void }): Promise<string> {
  const path = await tryUploadAwsImage(file, endpoint, fields, activity)
  if (path === null) throw new Error('Image service unavailable.')
  return path
}
