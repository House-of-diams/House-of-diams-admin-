import { NotificationsClient } from './notifications-client'
import { getNotificationsPageData } from '@/lib/notifications'
import { getAdminServerSession } from '@/lib/admin-server'

export default async function NotificationsPage() {
  const admin = await getAdminServerSession()
  const initialData = await getNotificationsPageData(admin?.userId)
  return <NotificationsClient initialData={initialData} />
}
