import { operationsPage } from './operations-page-data'
import { createEnquiriesRepository } from './db/admin-repositories/enquiries'
import { presentEnquiries } from './operations-presenters'

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
  /** Set when the server paged the inbox (HOD-065); items then hold one page of the active tab. */
  paging?: { page: number; pageSize: number; total: number }
}

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  return error?.code === 'PGRST205' || error?.message?.includes('schema cache') || error?.message?.includes('does not exist')
}

function toProductTitle(topic: string | null, fallback: string) {
  const normalized = topic?.replace(/^Product Enquiry:\s*/i, '').trim()
  return normalized ? `Product Enquiry: ${normalized}` : fallback
}

export function normalizeEnquiryTab(value: string | null | undefined): EnquiryTab {
  return value === 'bespoke' || value === 'contact' || value === 'product' || value === 'newsletter' || value === 'promotion' ? value : 'all'
}
export async function getEnquiriesPageData(tab: EnquiryTab = 'all', page = 1) {
  return operationsPage(async db => {
    const paged = await createEnquiriesRepository(db).pagedSources(tab, page)
    return { ...presentEnquiries(paged.sources), counts: paged.counts, paging: { page: paged.page, pageSize: paged.pageSize, total: paged.total } }
  })
}
