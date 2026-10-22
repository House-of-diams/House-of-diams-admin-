'use client'

import { useEffect, useRef, useState } from 'react'
import { AUTO_LOGIN_STORAGE_KEY, shouldAutoLogin } from '@/lib/auto-login'

export function KeycloakLogin({ upstreamPending = false, signedOut = false, autoStart = false }: { upstreamPending?: boolean; signedOut?: boolean; autoStart?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [redirecting, setRedirecting] = useState(false)
  const message = upstreamPending
    ? 'Signed out of this admin app. Identity-provider sign-out could not be confirmed; your single sign-on session may remain active.'
    : signedOut ? 'You have been signed out.' : ''

  useEffect(() => {
    if (!autoStart) return
    let last = 0
    try { last = Number(window.sessionStorage.getItem(AUTO_LOGIN_STORAGE_KEY) ?? 0) } catch { /* storage blocked: try once */ }
    if (!shouldAutoLogin(last, Date.now())) return
    try { window.sessionStorage.setItem(AUTO_LOGIN_STORAGE_KEY, String(Date.now())) } catch { /* ignore */ }
    setRedirecting(true)
    formRef.current?.requestSubmit()
  }, [autoStart])

  return <main className="flex min-h-screen items-center justify-center bg-background p-8">
    <section className="max-w-md space-y-6 rounded-2xl border bg-card p-8">
      <h1 className="text-2xl font-semibold">Admin Login</h1>
      {redirecting
        ? <p role="status">Taking you to the secure sign-in…</p>
        : <p>Continue to the House of Diams identity service to sign in.</p>}
      {message && <p role="status">{message}</p>}
      <form ref={formRef} action="/api/auth/login" method="post">
        <button className="rounded-lg bg-primary px-4 py-3 text-white">Continue to secure sign-in</button>
      </form>
    </section>
  </main>
}
