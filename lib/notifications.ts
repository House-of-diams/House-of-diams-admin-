import { operationsPage } from './operations-page-data'
import { createNotificationsRepository } from './db/admin-repositories/notifications'
import { createSupabaseAdminClient } from '@/lib/admin-supabase'

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

async function getLegacyNotificationsPageData(adminUserId?: string): Promise<NotificationsPageData> {
  const adminClient = createSupabaseAdminClient()

  const [ordersResult, bespokeResult, contactResult, newsletterResult] = await Promise.all([
    adminClient
      .from('orders')
      .select('id, order_number, customer_first_name, customer_last_name, customer_email, total_amount, status, created_at')
      .eq('payment_status', 'paid')
      .order('created_at', { ascending: false })
      .limit(25),
    adminClient
      .from('bespoke_submissions')
      .select('id, full_name, email, piece_type, status, created_at')
      .eq('status', 'new')
      .order('created_at', { ascending: false })
      .limit(25),
    adminClient
      .from('contact_submissions')
      .select('id, full_name, email, topic, status, created_at')
      .eq('status', 'new')
      .order('created_at', { ascending: false })
      .limit(25),
    adminClient
      .from('newsletter_submissions')
      .select('id, email, source, status, created_at')
      .eq('status', 'new')
      .order('created_at', { ascending: false })
      .limit(25),
  ])

  const baseOrderItems: Omit<AdminNotificationItem, 'read'>[] = (ordersResult.error ? [] : ordersResult.data ?? [])
    .filter((item) => item.status === 'pending')
    .map((item) => ({
      id: `order-${item.id}`,
      notificationKey: `order:${item.id}`,
      type: 'order',
      title: `New Order ${item.order_number}`,
      summary: `${[item.customer_first_name, item.customer_last_name].filter(Boolean).join(' ') || item.customer_email} placed an order for $${Number(item.total_amount || 0).toLocaleString()}`,
      status: item.status ?? 'pending',
      createdAt: item.created_at,
      href: `/dashboard/orders/${item.id}`,
    }))

  const baseBespokeItems: Omit<AdminNotificationItem, 'read'>[] = (bespokeResult.error ? [] : bespokeResult.data ?? []).map((item) => ({
    id: `bespoke-${item.id}`,
    notificationKey: `bespoke:${item.id}`,
    type: 'bespoke',
    title: `New Bespoke Enquiry`,
    summary: `${item.full_name} requested a ${item.piece_type || 'custom piece'}`,
    status: item.status ?? 'new',
    createdAt: item.created_at,
    href: `/dashboard/bespoke/submissions/${item.id}`,
  }))

  const contactRows = contactResult.error ? [] : contactResult.data ?? []
  const baseContactItems: Omit<AdminNotificationItem, 'read'>[] = contactRows
    .filter((item) => !(item.topic ?? '').toLowerCase().startsWith('product enquiry:'))
    .map((item) => ({
      id: `contact-${item.id}`,
      notificationKey: `contact:${item.id}`,
      type: 'contact',
      title: `New Contact Enquiry`,
      summary: `${item.full_name} submitted ${item.topic?.trim() || 'a contact enquiry'}`,
      status: item.status ?? 'new',
      createdAt: item.created_at,
      href: '/dashboard/enquiries?tab=contact',
    }))

  const baseProductItems: Omit<AdminNotificationItem, 'read'>[] = contactRows
    .filter((item) => (item.topic ?? '').toLowerCase().startsWith('product enquiry:'))
    .map((item) => ({
      id: `product-${item.id}`,
      notificationKey: `product:${item.id}`,
      type: 'product',
      title: `New Product Enquiry`,
      summary: `${item.full_name} asked about ${(item.topic ?? '').replace(/^Product Enquiry:\s*/i, '').trim() || 'a product'}`,
      status: item.status ?? 'new',
      createdAt: item.created_at,
      href: '/dashboard/enquiries?tab=product',
    }))

  const newsletterEnabled = !isMissingRelationError(newsletterResult.error)
  const baseNewsletterItems: Omit<AdminNotificationItem, 'read'>[] =
    newsletterResult.error || !newsletterEnabled
      ? []
      : (newsletterResult.data ?? []).map((item) => ({
          id: `newsletter-${item.id}`,
          notificationKey: `newsletter:${item.id}`,
          type: 'newsletter',
          title: 'New Newsletter Signup',
          summary: `${item.email} joined from ${item.source || 'the website'}`,
          status: item.status ?? 'new',
          createdAt: item.created_at,
          href: '/dashboard/enquiries?tab=newsletter',
        }))

  const baseItems = [...baseOrderItems, ...baseBespokeItems, ...baseContactItems, ...baseProductItems, ...baseNewsletterItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  const readKeys = new Set<string>()

  if (adminUserId) {
    const readResult = await adminClient
      .from('admin_notification_reads')
      .select('notification_key')
      .eq('admin_user_id', adminUserId)

    if (!isMissingRelationError(readResult.error)) {
      for (const row of readResult.data ?? []) {
        if (typeof row.notification_key === 'string') {
          readKeys.add(row.notification_key)
        }
      }
    }
  }

  const items: AdminNotificationItem[] = baseItems.map((item) => ({
    ...item,
    read: readKeys.has(item.notificationKey),
  }))

  const unreadCounts: NotificationsPageData['unreadCounts'] = {
    all: items.filter((item) => !item.read).length,
    order: items.filter((item) => item.type === 'order' && !item.read).length,
    bespoke: items.filter((item) => item.type === 'bespoke' && !item.read).length,
    contact: items.filter((item) => item.type === 'contact' && !item.read).length,
    product: items.filter((item) => item.type === 'product' && !item.read).length,
    newsletter: items.filter((item) => item.type === 'newsletter' && !item.read).length,
  }

  return {
    items,
    counts: {
      all: items.length,
      order: baseOrderItems.length,
      bespoke: baseBespokeItems.length,
      contact: baseContactItems.length,
      product: baseProductItems.length,
      newsletter: baseNewsletterItems.length,
    },
    unreadCounts,
    newsletterEnabled,
  }
}

export async function getNotificationCount(adminUserId?: string) {
  const data = await getNotificationsPageData(adminUserId)
  return data.unreadCounts.all
}

export async function getNotificationsPageData(adminUserId?:string) { return operationsPage((db,actor) => createNotificationsRepository(db,actor).read(), () => getLegacyNotificationsPageData(adminUserId)) }
