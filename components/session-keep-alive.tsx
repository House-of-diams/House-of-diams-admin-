'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ACTIVITY_EVENTS, KEEPALIVE_INTERVAL_MS, readPingOutcome, shouldPing } from '@/lib/session-keepalive'

/** Mounted once in the dashboard layout. Renders nothing. */
export function SessionKeepAlive() {
  const router = useRouter()
  useEffect(() => {
    let lastActivityAt = Date.now()
    let lastPingAt = Date.now()
    const markActive = () => { lastActivityAt = Date.now() }
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, markActive, { passive: true, capture: true })

    const ping = async () => {
      if (document.visibilityState === 'hidden' || !shouldPing(lastActivityAt, lastPingAt, Date.now())) return
      lastPingAt = Date.now()
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
        // Expired for real: go to sign-in now instead of failing later on Save.
        if (readPingOutcome(response.status) === 'expired') router.replace('/login')
      } catch { /* offline or server restarting: try again next tick */ }
    }
    const timer = window.setInterval(ping, KEEPALIVE_INTERVAL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void ping() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, markActive, { capture: true })
    }
  }, [router])
  return null
}
