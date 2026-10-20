import { z } from 'zod'

// HOD-067: the one rule for links admins type into the CMS and navbar.
// Allowed: empty, a site path (/shop), an anchor (#faq), an absolute http(s) URL,
// mailto: or tel:. Rejected: protocol-relative //host (another site), bare words
// such as "shop" (resolve differently on every page), spaces, control characters,
// and executable schemes such as javascript: or data:.
export function isSafeAdminLink(value: string): boolean {
  if (value === '') return true
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return false
  if (value.startsWith('//')) return false
  if (value.startsWith('/') || value.startsWith('#')) return true
  let url: URL
  try { url = new URL(value) } catch { return false }
  if (url.protocol === 'mailto:' || url.protocol === 'tel:') return url.pathname.length > 0
  return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.length > 0 && !url.username && !url.password
}

export const SAFE_LINK_MESSAGE = 'Use a link starting with /, #, https://, mailto: or tel: (no spaces).'

/** Trims, then checks. Up to 2,000 characters. */
export const safeLinkSchema = z.string().trim().max(2_000).refine(isSafeAdminLink, SAFE_LINK_MESSAGE)
