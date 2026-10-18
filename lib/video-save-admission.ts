import 'server-only'
import type { DbExecutor } from './db/query'
import { isCanonicalAwsVideoReference } from './video-reference'

/** Compare only video references at the same semantic slot. Never rewrite media/JSONB.
 * Existing IDs stabilize arrays across reorder; id-less arrays use their position.
 */
export function videoReferenceSlots(value: unknown, path = '', found = new Map<string, string>(), videoSlot = false) {
  if (typeof value === 'string') {
    // Include malformed/new pasted AWS URLs as candidates so canonical checks cannot be bypassed.
    let candidate = false
    try {
      const url = new URL(value)
      if (['media.houseofdiams.com','content.houseofdiams.com'].includes(url.hostname.toLowerCase())
        && (videoSlot || /\.(?:mp4|mov|webm|m4v)$/i.test(decodeURIComponent(url.pathname)))) {
        candidate = true
      }
    } catch { /* Plain text/images and existing relative media paths are outside this AWS reference policy. */ }
    if (candidate) {
      if (found.has(path) && found.get(path) !== value) throw new Error('Ambiguous video slot.')
      found.set(path, value)
    }
  } else if (Array.isArray(value)) value.forEach((item, i) => {
    const id = item && typeof item === 'object' && 'id' in item && ['string','number'].includes(typeof item.id) && item.id ? `id:${item.id}` : `index:${i}`
    const slot = `${path}/${encodeURIComponent(id)}`
    if (i && value.slice(0, i).some(other => other && typeof other === 'object' && 'id' in other && `id:${other.id}` === id)) throw new Error('Ambiguous video slot.')
    videoReferenceSlots(item, slot, found, videoSlot)
  })
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    const isVideo = /^video_(path|url)$/.test(key) || ('media_type' in value && value.media_type === 'video' && /^(media_path|desktop_media_path|mobile_media_path)$/.test(key))
    videoReferenceSlots(item, `${path}/${encodeURIComponent(key)}`, found, isVideo)
  }
  return found
}
export async function enforceVideoSave(db: DbExecutor, next: unknown, previous: unknown) {
  const old = videoReferenceSlots(previous)
  for (const [slot, url] of videoReferenceSlots(next)) {
    if (old.get(slot) === url) continue
    if (!isCanonicalAwsVideoReference(url)) throw new Error('Use an admitted video from the library.')
    // Resolution derives the canonical URL from trusted bucket/key and locks status/policy
    // through the caller's business transaction. A browser flag/ID is never authority.
    const { resolveAdmittedVideo } = await import('./video-admission-runtime')
    const record = await resolveAdmittedVideo(url, undefined, db)
    if (record.url !== url) throw new Error('Video reference mismatch.')
  }
}

/** Mirrors admin_product_save_v1: metal rows/variants are keyed by metal_id;
 * child media IDs and submitted parent IDs are ignored by the routine. Child
 * references are a multiset within that parent: reorder preserves history, a
 * second copy or a different parent is a new reference. Never use browser IDs.
 */
export function productVideoProjection(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  const media = (items: unknown) => {
    if (!Array.isArray(items)) return items
    const counts = new Map<string, number>()
    return Object.fromEntries(items.map(item => {
      if (!item || typeof item !== 'object') throw new Error('Invalid product media.')
      const { id: _id, product_id: _product, variant_id: _variant, sort_order: _sort, ...fields } = item
      void _id; void _product; void _variant; void _sort
      if (typeof fields.media_path === 'string') fields.media_path = fields.media_path.trim()
      const identity = JSON.stringify([fields.media_type, fields.media_path])
      const occurrence = counts.get(identity) ?? 0
      counts.set(identity, occurrence + 1)
      return [identity + ':' + occurrence, fields]
    }))
  }
  const byMetal = (items: unknown, variants: boolean) => {
    if (!Array.isArray(items)) return items
    const result: Record<string, unknown> = Object.create(null)
    for (const item of items) {
      if (!item || typeof item !== 'object' || typeof item.metal_id !== 'string') throw new Error('Invalid product metal.')
      const key = item.metal_id.toLowerCase()
      if (Object.hasOwn(result, key)) throw new Error('Duplicate product metal.')
      const { id: _id, product_id: _product, sort_order: _sort, ...fields } = item
      void _id; void _product; void _sort
      result[key] = variants ? { ...fields, media_items: media(fields.media_items) } : fields
    }
    return result
  }
  return { ...record, metal_media: byMetal(record.metal_media, false),
    metal_variants: byMetal(record.metal_variants, true),
    default_variant_media_items: media(record.default_variant_media_items) }
}
