const ALLOWED_HOSTS = new Set(['instagram.com', 'www.instagram.com'])
const ALLOWED_TYPES = new Set(['reel', 'reels', 'p', 'tv'])
const SHORTCODE_PATTERN = /^[A-Za-z0-9_-]+$/
export function canonicalizeInstagramUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || url.port || url.hash) return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length !== 2 || !ALLOWED_TYPES.has(parts[0].toLowerCase()) || !SHORTCODE_PATTERN.test(parts[1])) return null
    return `https://www.instagram.com/${parts[0].toLowerCase()}/${parts[1]}/`
  } catch { return null }
}
