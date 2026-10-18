'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminAuthProvider, adminCookieSession } from '@/lib/admin-auth-client'

export function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined

    const verify = async () => {
      try {
        if (await adminAuthProvider() === 'keycloak') {
          await adminCookieSession()
          if (active) setReady(true)
          return
        }
        const { supabase } = await import('@/lib/supabase')
        const { data: sessionData } = await supabase.auth.getSession()
        const user = sessionData.session?.user

        if (!active) return
        if (!user) {
          router.replace('/login')
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (!active) return

        if (profile?.role !== 'admin') {
          router.replace('/login')
          return
        }

        setReady(true)
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!active) return
          if (!session?.user) {
            setReady(false)
            router.replace('/login')
          }
        })
        unsubscribe = () => data.subscription.unsubscribe()
        if (!active) unsubscribe()
      } catch { if (active) router.replace('/login') }
    }

    void verify()

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [router])

  if (!ready) {
    return <div className="h-screen bg-background" />
  }

  return <>{children}</>
}
