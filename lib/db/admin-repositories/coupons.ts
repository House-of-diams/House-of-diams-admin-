import 'server-only'
import type { DbExecutor } from '../query'
import type { CouponRow } from '@/app/dashboard/coupons/coupon-types'
import { couponSaveSchema } from '../../coupon-save'
import { parseCmsJson } from '../../cms-id-safety'
import { exactId, jsonRows, OperationsError, pageNumber, safeCount, uuid } from './operations-shared'
import { revisionOf, STALE_EDITOR_MESSAGE } from '../../revision'
const fields=['code','title','discount_type','discount_value','reward_type','minimum_order_amount','gift_product_id','gift_variant_data','gift_banner_image_url','banner_enabled','banner_title','banner_description','starts_at','ends_at','featured_priority','usage_limit','is_active'] as const
const columns='id,code,title,discount_type,discount_value,reward_type,minimum_order_amount,gift_product_id,gift_variant_data,gift_banner_image_url,banner_enabled,banner_title,banner_description,starts_at,ends_at,featured_priority,usage_limit,usage_count,is_active,created_at'
export const COUPON_PAGE_SIZE=20
/** HOD-054: revision over the editable fields only, so redemptions (usage_count) never look like an edit. */
export function couponRevision(row:Record<string,unknown>){return revisionOf(Object.fromEntries(fields.map(f=>[f,row[f]??null])))}
export function createCouponsRepository(db:DbExecutor) {
  /** HOD-065: one page (optionally searched by code, title or offer type) plus the exact match count. */
  async function list(rawPage:unknown=1,query='') {
    const page=pageNumber(rawPage)
    const needle=query.trim().slice(0,100)
    // LIKE wildcards in the search are literal (backslash is ILIKE's default escape).
    const pattern=needle?`%${needle.replace(/[\\%_]/g,m=>`\\${m}`)}%`:''
    const match="($2::text='' OR code ILIKE $2::text OR coalesce(title,'') ILIKE $2::text OR coalesce(reward_type,discount_type,'') ILIKE $2::text)"
    const {rows}=await db.query<{total:string;items:string}>(`WITH page AS (SELECT ${columns} FROM public.coupons WHERE ${match}
      ORDER BY created_at DESC,id DESC LIMIT ${COUPON_PAGE_SIZE} OFFSET $1::integer)
      SELECT (SELECT count(*)::text FROM public.coupons WHERE ${match}) AS total,
      COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY page.created_at DESC,page.id DESC) FROM page),'[]'::jsonb)::text AS items`,[(page-1)*COUPON_PAGE_SIZE,pattern])
    if(rows.length!==1)throw new Error('Invalid coupon list')
    const total=safeCount(rows[0].total)
    return {items:parseCmsJson(rows[0].items) as CouponRow[],page,pageSize:COUPON_PAGE_SIZE,total,totalPages:Math.max(1,Math.ceil(total/COUPON_PAGE_SIZE))}
  }
  async function one(id:unknown) {return (await jsonRows<CouponRow>(db,`SELECT to_jsonb(c)::text AS item FROM (SELECT ${columns} FROM public.coupons WHERE id=$1::bigint) c`,[exactId(id)]))[0]??null}
  /** expectedRevision: the HTTP route always passes one (missing header = ''); internal callers may omit it. */
  async function save(raw:unknown,expectedRevision?:string|null) {
    const coupon=couponSaveSchema.parse(raw)
    if(coupon.id && expectedRevision!==undefined){
      const current=(await jsonRows<CouponRow>(db,`SELECT to_jsonb(c)::text AS item FROM (SELECT ${columns} FROM public.coupons WHERE id=$1::bigint FOR UPDATE) c`,[exactId(coupon.id)]))[0]
      if(!current)throw new OperationsError(404,'Coupon not found.')
      if(couponRevision(current)!==expectedRevision)throw new OperationsError(409,STALE_EDITOR_MESSAGE)
    }
    const date=(value:string|null)=>{if(!value)return null;const d=new Date(value);if(Number.isNaN(d.getTime()))throw new OperationsError(400,'Enter a valid coupon date.');return d.toISOString()}
    const starts=date(coupon.starts_at),ends=date(coupon.ends_at)
    if(starts && ends && ends<=starts)throw new OperationsError(400,'The end date and time must be after the start date and time.')
    const gift=coupon.reward_type==='free_gift'?coupon.gift_product_id:null
    const variantData=coupon.reward_type==='free_gift'?coupon.gift_variant_data:{}
    if(gift){
      const product=await db.query('SELECT id FROM public.products WHERE id=$1::uuid AND status::text=\'active\' FOR UPDATE',[uuid(gift)])
      if(product.rows.length!==1)throw new OperationsError(400,'The selected gift product must be active.')
      // Lock existing association rows until commit; the parent UPDATE lock also serializes FK checks.
      const variants=await db.query<{id:string}>('SELECT id FROM public.product_metal_variants WHERE product_id=$1::uuid FOR SHARE',[gift])
      const variant=variantData.variant_id
      if(variants.rows.length && !variant)throw new OperationsError(400,'Select the exact gift variant.')
      if(variant && !variants.rows.some(v=>v.id===variant))throw new OperationsError(400,'The selected gift variant does not belong to this product.')
    }
    const payload={...coupon,code:coupon.code.toUpperCase(),title:coupon.title.trim(),discount_type:coupon.reward_type==='fixed'?'fixed':'percentage',discount_value:coupon.reward_type==='free_gift'?0:coupon.discount_value,gift_product_id:gift,gift_variant_data:variantData,starts_at:starts,ends_at:ends,gift_banner_image_url:coupon.gift_banner_image_url?.trim()||null,banner_title:coupon.banner_title?.trim()||null,banner_description:coupon.banner_description?.trim()||null}
    const projection=fields.map(f=>`(jsonb_populate_record(NULL::public.coupons,$1::jsonb)).${f}`).join(',')
    const rows=await jsonRows<{id:number|string}>(db,coupon.id
      ?`UPDATE public.coupons SET (${fields.join(',')})=(${projection}) WHERE id=$2::bigint RETURNING jsonb_build_object('id',id)::text AS item`
      :`INSERT INTO public.coupons (${fields.join(',')}) SELECT ${projection} RETURNING jsonb_build_object('id',id)::text AS item`,coupon.id?[JSON.stringify(payload),exactId(coupon.id)]:[JSON.stringify(payload)])
    if(rows.length!==1)throw new OperationsError(404,'Coupon not found.')
    if(expectedRevision===undefined)return {ok:true,id:rows[0].id}
    const saved=await one(rows[0].id)
    return {ok:true,id:rows[0].id,revision:saved?couponRevision(saved):null}
  }
  async function remove(id:unknown) {
    const result=await db.query('DELETE FROM public.coupons WHERE id=$1::bigint RETURNING id',[exactId(id)])
    if(result.rows.length!==1)throw new OperationsError(404,'Coupon not found.')
    return {ok:true}
  }
  return {list,one,save,remove}
}
