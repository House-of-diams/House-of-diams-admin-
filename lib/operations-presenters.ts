import type { EnquiriesPageData, BespokeEnquiry, ContactEnquiry, NewsletterEnquiry, PromotionEnquiry } from './enquiries'
import type { AdminNotificationItem, NotificationsPageData } from './notifications'
import type { EnquirySources, NotificationSources } from './db/admin-repositories/enquiries'
function toProductTitle(topic:string|null,fallback:string){const normalized=topic?.replace(/^Product Enquiry:\s*/i,'').trim();return normalized?`Product Enquiry: ${normalized}`:fallback}
export function presentEnquiries({bespokeResult,contactResult,newsletterResult,promotionResult,promotionQuestionsResult}:EnquirySources):EnquiriesPageData {
  const bespokeItems: BespokeEnquiry[] = (bespokeResult.error ? [] : bespokeResult.data ?? []).map((item) => ({
    id: `bespoke-${item.id}`,
    source: 'bespoke',
    full_name: item.full_name,
    email: item.email,
    phone: item.phone ?? null,
    title: `Bespoke: ${item.piece_type || 'Custom piece'}`,
    summary: item.country ? `${item.piece_type} from ${item.country}` : item.piece_type || 'Bespoke enquiry',
    message: item.message ?? '',
    status: item.status ?? 'new',
    created_at: item.created_at,
    href: `/dashboard/bespoke/submissions/${item.id}`,
  }))

  const contactRows = contactResult.error ? [] : contactResult.data ?? []

  const contactItems: ContactEnquiry[] = contactRows
    .filter((item) => !(item.topic ?? '').toLowerCase().startsWith('product enquiry:'))
    .map((item) => ({
      id: `contact-${item.id}`,
      source: 'contact',
      full_name: item.full_name,
      email: item.email,
      phone: item.phone ?? null,
      title: item.topic?.trim() || 'Contact Enquiry',
      summary: item.topic?.trim() || 'General contact enquiry',
      message: item.message ?? '',
      status: item.status ?? 'new',
      created_at: item.created_at,
      href: '/dashboard/enquiries?tab=contact',
    }))

  const productItems: ContactEnquiry[] = contactRows
    .filter((item) => (item.topic ?? '').toLowerCase().startsWith('product enquiry:'))
    .map((item) => ({
      id: `product-${item.id}`,
      source: 'product',
      full_name: item.full_name,
      email: item.email,
      phone: item.phone ?? null,
      title: toProductTitle(item.topic, 'Product Enquiry'),
      summary: 'Product quote / interest request',
      message: item.message ?? '',
      status: item.status ?? 'new',
      created_at: item.created_at,
      href: '/dashboard/enquiries?tab=product',
    }))

  const newsletterEnabled = newsletterResult.enabled
  const newsletterItems: NewsletterEnquiry[] =
    newsletterResult.error || !newsletterEnabled
      ? []
      : (newsletterResult.data ?? []).map((item) => ({
          id: `newsletter-${item.id}`,
          source: 'newsletter',
          full_name: 'Newsletter Subscriber',
          email: item.email,
          phone: null,
          title: 'Homepage Newsletter',
          summary: item.source?.trim() || 'Newsletter signup',
          message: 'Subscribed to the newsletter.',
          status: item.status ?? 'new',
          created_at: item.created_at,
          href: '/dashboard/enquiries?tab=newsletter',
        }))

  const promotionLeadsEnabled = promotionResult.enabled
  const promotionItems: PromotionEnquiry[] =
    promotionResult.error || !promotionLeadsEnabled
      ? []
      : (promotionResult.data ?? []).map((item) => {
          const questions = (promotionQuestionsResult.error ? [] : promotionQuestionsResult.data ?? []).filter((question) => question.promotion_id === item.promotion_id)
          const answers = item.answers && typeof item.answers === 'object' && !Array.isArray(item.answers) ? item.answers as Record<string, string | string[]> : {}
          const answerRows = Object.entries(answers).map(([key, value]) => ({
            label: questions.find((question) => question.field_key === key)?.question || key,
            value: Array.isArray(value) ? value.join(', ') : String(value),
          }))
          return {
            id: `promotion-${item.id}`,
            source: 'promotion',
            full_name: 'Promotion Lead',
            email: item.email,
            phone: null,
            title: item.coupon_revealed ? 'Promotion Coupon Reveal' : 'Promotion Lead',
            summary: item.coupon_revealed ? 'Coupon revealed after submitting answers' : 'Answers submitted',
            message: '',
            status: 'new',
            created_at: item.created_at,
            href: '/dashboard/enquiries?tab=promotion',
            answers: answerRows,
            coupon_revealed: Boolean(item.coupon_revealed),
            revealed_at: item.revealed_at ?? null,
          }
        })

  const items = [...bespokeItems, ...contactItems, ...productItems, ...newsletterItems, ...promotionItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return {
    items,
    counts: {
      all: items.length,
      bespoke: bespokeItems.length,
      contact: contactItems.length,
      product: productItems.length,
      newsletter: newsletterItems.length,
      promotion: promotionItems.length,
    },
    newsletterEnabled,
    promotionLeadsEnabled,
  }
}
export function presentNotifications({ordersResult,bespokeResult,contactResult,newsletterResult,readKeys}:NotificationSources):NotificationsPageData {
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

  const newsletterEnabled = newsletterResult.enabled
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
