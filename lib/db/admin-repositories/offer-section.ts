import 'server-only'
import type { DbExecutor } from '../query'
import { OFFER_SECTION_DEFAULTS, offerSectionSchema, type OfferSection } from '../../offer-section-validation'
import { jsonRows, OperationsError } from './operations-shared'
import { revisionOf, STALE_EDITOR_MESSAGE } from '../../revision'

const key = 'selected_coupon_offer'
const fields = ['is_enabled', 'label', 'heading', 'gift_heading', 'description', 'button_text'] as const
export const OFFER_SECTION_NOT_READY = 'The Offer Section needs its database update first. Ask your developer to run 10_cms_home_offer_section.forward.sql.'

export function offerSectionRevision(item: Record<string, unknown>) {
  return revisionOf(Object.fromEntries(fields.map((field) => [field, item[field] ?? null])))
}

/** Table or privilege missing = the database update has not been applied yet. */
function notReady(error: unknown) {
  const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : ''
  return code === '42P01' || code === '42501' ? new OperationsError(503, OFFER_SECTION_NOT_READY) : error
}

export function createOfferSectionRepository(db: DbExecutor) {
  async function read(): Promise<OfferSection> {
    try {
      const rows = await jsonRows<OfferSection>(db, `SELECT jsonb_build_object(${fields.map((field) => `'${field}',${field}`).join(',')})::text AS item FROM public.home_offer_section WHERE section_key=$1::text`, [key])
      if (rows.length > 1) throw new Error('Ambiguous offer section')
      return rows[0] ? { ...OFFER_SECTION_DEFAULTS, ...rows[0] } : OFFER_SECTION_DEFAULTS
    } catch (error) { throw notReady(error) }
  }

  /** expectedRevision: the HTTP route always passes one; a stale editor gets a 409. */
  async function save(raw: unknown, expectedRevision?: string | null) {
    const input = offerSectionSchema.parse(raw)
    try {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))', ['admin:home_offer_section'])
      if (expectedRevision !== undefined && offerSectionRevision(await read()) !== expectedRevision) throw new OperationsError(409, STALE_EDITOR_MESSAGE)
      const values = [key, input.is_enabled, input.label, input.heading, input.gift_heading, input.description, input.button_text]
      const updated = await db.query(
        'UPDATE public.home_offer_section SET is_enabled=$2::boolean,label=$3::text,heading=$4::text,gift_heading=$5::text,description=$6::text,button_text=$7::text,updated_at=now() WHERE section_key=$1::text RETURNING section_key', values)
      if (updated.rows.length > 1) throw new Error('Ambiguous offer section')
      if (!updated.rows.length) await db.query(
        'INSERT INTO public.home_offer_section (section_key,is_enabled,label,heading,gift_heading,description,button_text) VALUES ($1::text,$2::boolean,$3::text,$4::text,$5::text,$6::text,$7::text)', values)
    } catch (error) { throw notReady(error) }
    const item = await read()
    return { success: true as const, item, revision: offerSectionRevision(item) }
  }
  return { read, save }
}
