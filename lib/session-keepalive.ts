// Keeps an admin signed in while they are really working in a long-lived page.
// The server's idle timer only counts requests, so typing in an editor for 30 minutes
// would otherwise log the admin out. A ping is sent only if there was real activity
// since the last one; an unattended tab stops pinging and expires as before.
export const KEEPALIVE_INTERVAL_MS = 4 * 60_000
export const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'input', 'scroll', 'touchstart'] as const

export function shouldPing(lastActivityAt: number, lastPingAt: number, now: number): boolean {
  return lastActivityAt > lastPingAt && now - lastPingAt >= KEEPALIVE_INTERVAL_MS - 1_000
}

/** 'expired' only for an explicit 401: other failures (503, network) never log anyone out. */
export function readPingOutcome(status: number): 'ok' | 'expired' | 'ignore' {
  if (status === 401) return 'expired'
  return status >= 200 && status < 300 ? 'ok' : 'ignore'
}
