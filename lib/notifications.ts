import { operationsPage } from './operations-page-data'
import { createNotificationsRepository } from './db/admin-repositories/notifications'

export type AdminNotificationType = 'order' | 'bespoke' | 'contact' | 'product' | 'newsletter'

export type AdminNotificationItem = {
  id: string
  notificationKey: string
  type: AdminNotificationType
  title: string
  summary: string
  status: string
  createdAt: string
  href: string
  read: boolean
}

export type NotificationsPageData = {
  items: AdminNotificationItem[]
  counts: Record<'all' | AdminNotificationType, number>
  unreadCounts: Record<'all' | AdminNotificationType, number>
  newsletterEnabled: boolean
}

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  return error?.code === 'PGRST205' || error?.message?.includes('schema cache') || error?.message?.includes('does not exist')
}

export async function getNotificationCount(adminUserId?: string) {
  const data = await getNotificationsPageData(adminUserId)
  return data.unreadCounts.all
}

export async function getNotificationsPageData(adminUserId?:string) { return operationsPage((db,actor) => createNotificationsRepository(db,actor).read()) }
