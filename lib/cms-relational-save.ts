import { NextResponse } from 'next/server'
import { z } from 'zod'
import { cmsMutation, readCms, type CmsAccess, type CmsReader } from './cms-command'
import { supportAnnouncementItemSchema, supportAnnouncementParentSchema, supportFaqItemSchema, supportFaqParentSchema } from './cms-support-schemas'
import { checkoutResultItemSchema, checkoutResultParentSchema, promotionItemSchema, promotionParentSchema, serviceBannerItemSchema, serviceBannerParentSchema, summaryItemSchema, summaryParentSchema } from './cms-shared-schemas'

export type CmsRelationalKind = 'checkout_result' | 'promotion' | 'service_banner' | 'summary' | 'announcement' | 'faq'
type Access = CmsAccess
const uuid = z.string().uuid()

const schemas: Record<CmsRelationalKind, { parent: z.ZodTypeAny; item: z.ZodTypeAny }> = {
  checkout_result: {
    parent: checkoutResultParentSchema,
    item: checkoutResultItemSchema,
  },
  promotion: {
    parent: promotionParentSchema,
    item: promotionItemSchema,
  },
  service_banner: {
    parent: serviceBannerParentSchema,
    item: serviceBannerItemSchema,
  },
  summary: {
    parent: summaryParentSchema,
    item: summaryItemSchema,
  },
  announcement: {
    parent: supportAnnouncementParentSchema,
    item: supportAnnouncementItemSchema,
  },
  faq: {
    parent: supportFaqParentSchema,
    item: supportFaqItemSchema,
  },
}

const envelope = z.object({ request_id: uuid, expected_revision: z.string().regex(/^[a-f0-9]{32}$/), deleted_ids: z.array(z.string().min(1)).max(500), parent: z.record(z.string(), z.unknown()), items: z.array(z.record(z.string(), z.unknown())).max(500) }).strict()
export type CmsRelationalSnapshot = { parent: Record<string, unknown> | null; items: Array<Record<string, unknown>>; revision: string }

export async function loadCmsRelationalSnapshot(client: CmsReader, kind: CmsRelationalKind) {
  const { data, error } = await readCms(client, 'cms_relational_snapshot_v1', { p_kind: kind })
  if (error) throw new Error(error.code === 'PGRST202' || error.code === '42883' ? 'This CMS section is awaiting its database migration.' : 'Unable to load this CMS section.')
  return data as CmsRelationalSnapshot
}

export function errorResponse(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202' || error.code === '42883') return NextResponse.json({ error: 'This CMS section is awaiting its database update. Existing content was not changed.' }, { status: 503 })
  if (error.code === '40001') return NextResponse.json({ error: 'This section changed after you opened it. Reload before saving again.' }, { status: 409 })
  if (['22023', '22P02', '23502', '23503', '23505', '23514'].includes(error.code ?? '')) return NextResponse.json({ error: 'This section contains invalid or conflicting data.' }, { status: 400 })
  return NextResponse.json({ error: 'Unable to save this section. No partial changes were committed.' }, { status: 500 })
}

export async function saveCmsRelational(access: Access, kind: CmsRelationalKind, input: unknown) {
  const parsed = envelope.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid save payload.' }, { status: 400 })
  const parent = schemas[kind].parent.safeParse(parsed.data.parent)
  if (!parent.success) return NextResponse.json({ error: parent.error.issues[0]?.message ?? 'Invalid section details.' }, { status: 400 })
  const items = z.array(schemas[kind].item).safeParse(parsed.data.items)
  if (!items.success) return NextResponse.json({ error: items.error.issues[0]?.message ?? 'Invalid section item.' }, { status: 400 })
  const ids = items.data.flatMap((item: { id?: unknown }) => item.id == null ? [] : [String(item.id)])
  if (new Set(ids).size !== ids.length || new Set(parsed.data.deleted_ids).size !== parsed.data.deleted_ids.length || ids.some((id) => parsed.data.deleted_ids.includes(id))) return NextResponse.json({ error: 'Item IDs must be unique and cannot also be deleted.' }, { status: 400 })
  if (kind === 'checkout_result' && (items.data.length !== 4 || new Set(items.data.map((item: { state: string }) => item.state)).size !== 4)) return NextResponse.json({ error: 'All four checkout states are required.' }, { status: 400 })
  if (kind === 'promotion') {
    const promotion = parent.data as { cta_action: string; cta_link: string; selected_coupon_id: number | string | null }
    if (promotion.cta_action === 'redirect' && !promotion.cta_link.trim()) return NextResponse.json({ error: 'A destination link is required for Redirect mode.' }, { status: 400 })
    if (promotion.cta_action === 'reveal_coupon') {
      if (!promotion.selected_coupon_id) return NextResponse.json({ error: 'Select an active coupon for Reveal coupon mode.' }, { status: 400 })
      const coupon = 'provider' in access
        ? (await access.db.query<{ id: number; usage_limit: number | null; usage_count: number | null }>('SELECT id,usage_limit,usage_count FROM public.coupons WHERE id=$1::bigint AND is_active=true', [promotion.selected_coupon_id])).rows[0]
        : (await access.adminClient.from('coupons').select('id,usage_limit,usage_count').eq('id', promotion.selected_coupon_id).eq('is_active', true).maybeSingle()).data
      if (!coupon || (coupon.usage_limit != null && Number(coupon.usage_count ?? 0) >= Number(coupon.usage_limit))) return NextResponse.json({ error: 'The selected coupon is unavailable or has reached its usage limit.' }, { status: 400 })
    }
  }
  const { data, error } = await cmsMutation(access, 'cms_save_relational_v1', { p_request_id: parsed.data.request_id, p_expected_revision: parsed.data.expected_revision, p_kind: kind, p_parent: parent.data, p_items: items.data, p_deleted_ids: parsed.data.deleted_ids })
  if (error) return errorResponse(error)
  return NextResponse.json({ ok: true, ...(data as object) }, { headers: { 'Cache-Control': 'no-store' } })
}
