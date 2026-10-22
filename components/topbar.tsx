'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmLeaveIfUnsaved } from '@/hooks/use-unsaved-changes'
import { Bell, Search } from 'lucide-react'
import { logoutAdmin } from '@/lib/admin-auth-client'
import { AdminDataSourceStatus } from '@/components/admin-data-source-status'

export function Topbar({ notificationCount = 0 }: { notificationCount?: number }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const signOut = async () => {
    setSigningOut(true)
    setLogoutError('')
    try {
      const result = await logoutAdmin()
      window.location.replace(result.upstreamLogout ? '/login?logout=complete' : '/login?logout=upstream-pending')
    } catch { setLogoutError('Sign-out could not be confirmed. Please retry.'); setSigningOut(false) }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!confirmLeaveIfUnsaved()) return
    router.push(trimmed ? `/dashboard/search?q=${encodeURIComponent(trimmed)}` : '/dashboard/search')
  }

  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-y-2 bg-transparent px-6 py-3">
      <form onSubmit={handleSubmit} className="w-full max-w-md sm:min-w-0 sm:flex-1">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages, products, orders, CMS..."
            className="w-full rounded-md border border-border bg-white py-2 pl-9 pr-4 text-sm placeholder-muted-foreground transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </form>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <AdminDataSourceStatus />
        {logoutError && <p role="alert" className="text-xs text-red-700">{logoutError}</p>}
        <button type="button" disabled={signingOut} onClick={() => void signOut()} className="rounded-md px-3 py-2 text-sm">{signingOut ? 'Signing out…' : 'Sign out'}</button>
        <button
          type="button"
          onClick={() => { if (confirmLeaveIfUnsaved()) router.push('/dashboard/notifications') }}
          className="relative rounded-md p-1.5 transition-colors hover:bg-secondary"
          aria-label="Notifications"
        >
          <Bell size={18} className="text-foreground" />
          {notificationCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white shadow-sm">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          ) : null}
        </button>
      </div>
    </header>
  )
}
