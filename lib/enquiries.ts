import { operationsPage } from './operations-page-data'
import { createEnquiriesRepository } from './db/admin-repositories/enquiries'
import { presentEnquiries } from './operations-presenters'
import { createSupabaseAdminClient } from '@/lib/admin-supabase'

export type EnquiryTab = 'all' | 'bespoke' | 'contact' | 'product' | 'newsletter' | 'promotion'

export type BespokeEnquiry = {
  id: string
  source: 'bespoke'
  full_name: string
  email: string
  phone: string | null
  title: string
  summary: string
  message: string
  status: string | null
  created_at: string
  href: string
}

export type ContactEnquiry = {
  id: string
  source: 'contact' | 'product'
  full_name: string
  email: string
  phone: string | null
  title: string
  summary: string
  message: string
  status: string | null
  created_at: string
  href: string
}

export type NewsletterEnquiry = {
  id: string
  source: 'newsletter'
  full_name: string
  email: string
  phone: null
  title: string
  summary: string
  message: string
  status: string | null
  created_at: string
  href: string
}

export type PromotionEnquiry = {
  id: string
  source: 'promotion'
  full_name: string
  email: string
  phone: null
  title: string
  summary: string
  message: string
  status: string
  created_at: string
  href: string
  answers: Array<{ label: string; value: string }>
  coupon_revealed: boolean
  revealed_at: string | null
}

export type AdminEnquiryItem = BespokeEnquiry | ContactEnquiry | NewsletterEnquiry | PromotionEnquiry

export type EnquiriesPageData = {
  items: AdminEnquiryItem[]
  counts: Record<EnquiryTab, number>
  newsletterEnabled: boolean
  promotionLeadsEnabled: boolean
}

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  return error?.code === 'PGRST205' || error?.message?.includes('schema cache') || error?.message?.includes('does not exist')
}

function toProductTitle(topic: string | null, fallback: string) {
  const normalized = topic?.replace(/^Product Enquiry:\s*/i, '').trim()
  return normalized ? `Product Enquiry: ${normalized}` : fallback
}

async function getLegacyEnquiriesPageData(): Promise<EnquiriesPageData> {
  const adminClient = createSupabaseAdminClient()

  const [bespokeResult, contactResult, newsletterResult, promotionResult, promotionQuestionsResult] = await Promise.all([
    adminClient
      .from('bespoke_submissions')
      .select('id, full_name, email, phone, piece_type, country, message, status, created_at')
      .order('created_at', { ascending: false }),
    adminClient
      .from('contact_submissions')
      .select('id, full_name, email, phone, topic, message, status, created_at')
      .order('created_at', { ascending: false }),
    adminClient
      .from('newsletter_submissions')
      .select('id, email, source, status, created_at')
      .order('created_at', { ascending: false }),
    adminClient
      .from('promotion_popup_responses')
      .select('id, promotion_id, email, answers, coupon_revealed, revealed_at, created_at')
      .order('created_at', { ascending: false }),
    adminClient
      .from('promotion_popup_questions')
      .select('promotion_id, field_key, question'),
  ])

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

  const newsletterEnabled = !isMissingRelationError(newsletterResult.error)
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

  const promotionLeadsEnabled = !isMissingRelationError(promotionResult.error)
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

export async function getEnquiriesPageData() { return operationsPage(async db => presentEnquiries(await createEnquiriesRepository(db).sources()), getLegacyEnquiriesPageData) }
