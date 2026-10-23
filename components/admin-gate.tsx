'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminAuthProvider, adminCookieSession } from '@/lib/admin-auth-client'

export function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true

    const verify = async () => {
      try {
        await adminAuthProvider()
        await adminCookieSession()
        if (active) setReady(true)
      } catch { if (active) router.replace('/login') }
    }

    void verify()

    return () => {
      active = false
    }
  }, [router])

  if (!ready) {
    return <div className="h-screen bg-background" />
  }

  return <>{children}</>
}
