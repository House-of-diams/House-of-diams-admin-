/** New AWS references are absolute permanent URLs. Relative legacy keys never change origin. */
export function isCanonicalAwsImageReference(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ['media.houseofdiams.com','content.houseofdiams.com'].includes(url.hostname)
      && !url.port && !url.username && !url.password && !url.search && !url.hash
      && /^\/(?:[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_.-]+\.(?:webp|svg)$/.test(url.pathname)
      && !url.pathname.includes('..')
  } catch { return false }
}

/** Origin that serves stored relative media keys (the AWS media CDN, same as the storefront). */
export const MEDIA_CDN_BASE = (process.env.NEXT_PUBLIC_MEDIA_CDN_BASE_URL?.trim() || 'https://media.houseofdiams.com').replace(/\/+$/, '')

/** Stored images are absolute AWS URLs or relative keys; relative keys resolve against the media CDN. */
export function resolveStoredImage(input: string | null | undefined) {
  return resolveImageReference(input, MEDIA_CDN_BASE)
}

export function resolveImageReference(input: string | null | undefined, legacyBase?: string): string | null {
  const value = input?.trim()
  if (!value || /[\u0000-\u001f\\]/.test(value) || value.startsWith('//')) return null
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (url.username || url.password) return null
      // Expiring signatures must never become a new canonical media reference.
      // Legacy stored signed URLs remain unchanged for compatibility, never rewritten.
      return value
    } catch { return null }
  }
  if (/^blob:/i.test(value)) return value
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null
  let decoded: string
  try { decoded = decodeURIComponent(value.split(/[?#]/)[0]) } catch { return null }
  if (decoded.split('/').some(segment => segment === '..' || segment === '.') || /[\\\u0000-\u001f]/.test(decoded)) return null
  if (value.startsWith('/')) return value
  return legacyBase ? `${legacyBase.replace(/\/+$/, '')}/${value}` : null
}
