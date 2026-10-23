// Videos are read into memory (up to 100 MB each, then copied for checks and hashing), so a few uploads at once can
// exhaust a small server. This allows a small number at a time per server process and asks the others to retry.
const DEFAULT_LIMIT = 2
const MAX_LIMIT = 4

export function videoUploadLimit(env: Record<string, string | undefined> = process.env) {
  const configured = Number.parseInt(env.ADMIN_VIDEO_MAX_CONCURRENT_UPLOADS ?? '', 10)
  return Number.isInteger(configured) && configured >= 1 ? Math.min(configured, MAX_LIMIT) : DEFAULT_LIMIT
}

export function createVideoUploadGate(limit: () => number = videoUploadLimit) {
  let active = 0
  return {
    /** A release function, or null when the server is already handling its share of uploads. Release exactly once. */
    tryAcquire(): (() => void) | null {
      if (active >= limit()) return null
      active++
      let released = false
      return () => { if (!released) { released = true; active-- } }
    },
    get active() { return active },
  }
}

export const videoUploadGate = createVideoUploadGate()
