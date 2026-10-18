/** Canonical video URLs are permanent CDN references; historical references are never rewritten. */
export function isCanonicalAwsVideoReference(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    if (url.href !== value || url.protocol !== 'https:' || !['media.houseofdiams.com', 'content.houseofdiams.com'].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash) return false
    const key = decodeURIComponent(url.pathname.slice(1))
    return /\.(mp4|mov|webm|m4v)$/i.test(key) && key.includes('/') && !/[\u0000-\u001f\u007f\\]/.test(key) && key.split('/').every(p => p && p !== '.' && p !== '..')
  } catch { return false }
}
