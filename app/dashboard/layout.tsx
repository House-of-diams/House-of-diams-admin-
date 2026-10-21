import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { SessionKeepAlive } from '@/components/session-keep-alive'
import { Topbar } from '@/components/topbar'
import { getAdminServerSession } from '@/lib/admin-server'
import { getCustomerMetrics } from '@/lib/admin-users'
import { getNotificationCount } from '@/lib/notifications'

// Authenticated cookie-dependent trees must never execute data loaders at build time.
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const admin = await getAdminServerSession()

  if (!admin) {
    redirect('/login')
  }

  const [customers, notificationCount] = await Promise.all([
    getCustomerMetrics(),
    getNotificationCount(admin.userId),
  ])

  return (
    <div className="flex h-screen bg-secondary/50">
      <Sidebar customerCount={customers.persistedCustomerIdentities ?? customers.historicalRegistrations ?? undefined} />
      <div className="flex flex-1 flex-col overflow-hidden bg-transparent">
        <Topbar notificationCount={notificationCount} />
        <main className="flex-1 overflow-auto rounded-tl-2xl bg-white">
          {children}
        </main>
      </div>
      <SessionKeepAlive />
    </div>
  )
}
