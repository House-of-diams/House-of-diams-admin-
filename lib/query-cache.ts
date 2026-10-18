'use client'

type CacheEntry<T> = {
  data: T
  loadedAt: number
}

const queryData = new Map<string, CacheEntry<unknown>>()
const queryPending = new Map<string, Promise<unknown>>()

export function getCachedQueryData<T>(key: string, staleTimeMs: number): T | null {
  const entry = queryData.get(key)
  if (!entry || Date.now() - entry.loadedAt >= staleTimeMs) return null
  return entry.data as T
}

export function setCachedQueryData<T>(key: string, data: T) {
  queryData.set(key, { data, loadedAt: Date.now() })
}

export function deleteCachedQueryData(key: string) {
  queryData.delete(key)
  queryPending.delete(key)
}

export async function fetchCachedQuery<T>({
  key,
  staleTimeMs,
  fetcher,
}: {
  key: string
  staleTimeMs: number
  fetcher: () => Promise<T | null>
}) {
  const cached = getCachedQueryData<T>(key, staleTimeMs)
  if (cached) return cached

  const pending = queryPending.get(key) as Promise<T | null> | undefined
  if (pending) return pending

  const request = fetcher()
    .then((data) => {
      if (data) setCachedQueryData(key, data)
      return data
    })
    .finally(() => {
      queryPending.delete(key)
    })

  queryPending.set(key, request)
  return request
}
