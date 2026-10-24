import 'server-only'
import type { DbExecutor } from '../query'
import { HOME_OFFERS_MAX, homeOfferSchema, type HomeOffer, type OfferCoupon } from '../../home-offers-validation'
import { jsonRows, OperationsError, uuid } from './operations-shared'
import { revisionOf, STALE_EDITOR_MESSAGE } from '../../revision'

export const HOME_OFFERS_NOT_READY = 'Offers need their database update first. Ask your developer to run 15_home_offers.forward.sql.'
const columns = ['id', 'name', 'coupon_id', 'button_label', 'home_image_path', 'home_image_alt', 'promo_image_left_path', 'promo_image_left_alt', 'promo_image_right_path', 'promo_image_right_alt', 'is_active'] as const
type Row = Omit<HomeOffer, 'revision'>

export function homeOfferRevision(row: Row) { return revisionOf(Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))) }
const withRevision = (row: Row): HomeOffer => ({ ...row, revision: homeOfferRevision(row) })

/** Table or privilege missing = the database update has not been applied yet. */
function notReady(error: unknown) {
  const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : ''
  return code === '42P01' || code === '42501' ? new OperationsError(503, HOME_OFFERS_NOT_READY) : error
}

export function createHomeOffersRepository(db: DbExecutor) {
  const select = `SELECT jsonb_build_object(${columns.map((column) => column === 'coupon_id' ? "'coupon_id',coupon_id::text" : `'${column}',${column}`).join(',')})::text AS item FROM public.home_offers`

  async function list(): Promise<HomeOffer[]> {
    try {
      const rows = await jsonRows<Row>(db, `${select} ORDER BY is_active DESC, created_at DESC, id LIMIT ${HOME_OFFERS_MAX + 1}`)
      return rows.map(withRevision)
    } catch (error) { throw notReady(error) }
  }
  async function find(id: string): Promise<HomeOffer | null> {
    const rows = await jsonRows<Row>(db, `${select} WHERE id=$1::uuid`, [id])
    return rows[0] ? withRevision(rows[0]) : null
  }
  /** Coupons the admin can attach to an offer. */
  async function coupons(): Promise<OfferCoupon[]> {
    return jsonRows<OfferCoupon>(db, `SELECT jsonb_build_object('id',c.id::text,'code',c.code,'title',c.title,'reward_type',c.reward_type,'is_active',c.is_active,
      'ends_at',c.ends_at,'has_gift',c.gift_product_id IS NOT NULL)::text AS item FROM public.coupons c ORDER BY c.is_active DESC, c.created_at DESC LIMIT 200`)
  }

  /** expectedRevision: the HTTP route always passes one for an existing offer; a stale editor gets a 409. */
  async function save(raw: unknown, expectedRevision?: string | null): Promise<HomeOffer> {
    const input = homeOfferSchema.parse(raw)
    try {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))', ['admin:home_offers'])
      let id = input.id
      if (id) {
        const current = await find(uuid(id))
        if (!current) throw new OperationsError(404, 'This offer no longer exists. Reload the page.')
        if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new OperationsError(409, STALE_EDITOR_MESSAGE)
      } else {
        const count = await db.query<{ n: string }>('SELECT count(*)::text AS n FROM public.home_offers')
        if (Number(count.rows[0]?.n ?? 0) >= HOME_OFFERS_MAX) throw new OperationsError(400, `You can keep at most ${HOME_OFFERS_MAX} offers. Delete an old one first.`)
      }
      // One active offer at a time: switching this one on switches every other one off first.
      if (input.is_active) await db.query('UPDATE public.home_offers SET is_active=false,updated_at=now() WHERE is_active AND ($1::uuid IS NULL OR id<>$1::uuid)', [id ?? null])
      const values = [input.name, input.coupon_id, input.button_label, input.home_image_path, input.home_image_alt, input.promo_image_left_path, input.promo_image_left_alt,
        input.promo_image_right_path, input.promo_image_right_alt, input.is_active]
      if (id) {
        await db.query(`UPDATE public.home_offers SET name=$2::text,coupon_id=$3::bigint,button_label=$4::text,home_image_path=$5::text,home_image_alt=$6::text,promo_image_left_path=$7::text,
          promo_image_left_alt=$8::text,promo_image_right_path=$9::text,promo_image_right_alt=$10::text,is_active=$11::boolean,updated_at=now() WHERE id=$1::uuid`, [id, ...values])
      } else {
        const inserted = await db.query<{ id: string }>(`INSERT INTO public.home_offers (name,coupon_id,button_label,home_image_path,home_image_alt,promo_image_left_path,promo_image_left_alt,
          promo_image_right_path,promo_image_right_alt,is_active) VALUES ($1::text,$2::bigint,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::boolean) RETURNING id::text AS id`, values)
        id = inserted.rows[0]?.id
      }
      const saved = id ? await find(id) : null
      if (!saved) throw new Error('Offer was not saved')
      return saved
    } catch (error) { throw notReady(error) }
  }

  async function remove(rawId: string): Promise<void> {
    const id = uuid(rawId)
    try {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))', ['admin:home_offers'])
      const deleted = await db.query('DELETE FROM public.home_offers WHERE id=$1::uuid RETURNING id', [id])
      if (!deleted.rows.length) throw new OperationsError(404, 'This offer no longer exists. Reload the page.')
    } catch (error) { throw notReady(error) }
  }
  return { list, coupons, save, remove }
}
