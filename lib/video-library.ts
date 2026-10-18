import 'server-only'
import { videoNamespace, videoSources } from './video-provider'
import { createVideoStorage, type VideoAsset } from './video-storage'

/** A single bounded namespace; invalidation/refresh cannot repopulate from an older request. */
export function createVideoLibrary<T>(now: () => number = Date.now) {
  let generation = 0
  let cached: { namespace: string; items: T[]; at: number } | undefined
  let pending: { namespace: string; promise: Promise<T[]> } | undefined
  return {
    invalidate() { generation++; cached = undefined; pending = undefined },
    async get(namespace: string, load: () => Promise<T[]>, refresh = false): Promise<T[]> {
      if (!refresh && cached?.namespace === namespace && now() - cached.at < 300000) return cached.items
      if (!refresh && pending?.namespace === namespace) return pending.promise
      const version = ++generation
      // A failed refresh must not leave an earlier success eligible for reuse.
      cached = undefined
      const promise = Promise.resolve().then(load).then(items => {
        if (generation === version) cached = { namespace, items, at: now() }
        return items
      }).finally(() => { if (generation === version) pending = undefined })
      pending = { namespace, promise }
      return promise
    },
  }
}
const cache = createVideoLibrary<VideoAsset>()
export function invalidateAwsVideoLibrary() { cache.invalidate() }
export async function getAwsVideoLibrary(refresh = false) {
  const sources = videoSources()
  const items = await cache.get(videoNamespace(sources), () => createVideoStorage().list(sources), refresh)
  const { admissionPolicy } = await import('./video-admission')
  if (!admissionPolicy()) return items
  if (items.length > 1000) throw new Error('Video admission inventory exceeds verification budget.')
  const { resolveAdmittedVideo } = await import('./video-admission-runtime')
  // Bounded listing already caps discovery. Serial checks avoid an unbounded Head/DB burst.
  const result: VideoAsset[] = []
  for (const item of items) {
    try {
      const record = await resolveAdmittedVideo(item.url)
      result.push({ ...item, size: record.size, contentType: record.mime, verification: 'admitted', admissionId: record.id })
    } catch { result.push({ ...item, verification: 'unknown' }) }
  }
  return result
}
