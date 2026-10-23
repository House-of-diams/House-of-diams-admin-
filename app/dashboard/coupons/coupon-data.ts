import { operationsPage } from '@/lib/operations-page-data'
import { couponRevision, createCouponsRepository } from '@/lib/db/admin-repositories/coupons'
import { couponProductSources } from '@/lib/db/admin-repositories/coupon-products'
import { resolveStoredImage } from '@/lib/image-reference'
import type { CouponProduct, CouponRow } from './coupon-types'

export function couponMediaUrl(path?: string | null) {
  return resolveStoredImage(path) ?? ''
}

export async function getCouponProducts(): Promise<CouponProduct[]> {
  const {products,variants,metals,media}=await operationsPage(db=>couponProductSources(db))
  const metalById = new Map((metals.data ?? []).map((item) => [item.id, item]))
  const mediaByVariant = new Map<string, string>()
  for (const item of media.data ?? []) if (item.variant_id && !mediaByVariant.has(item.variant_id)) mediaByVariant.set(item.variant_id, couponMediaUrl(item.media_path))
  return (products.data ?? []).map((product) => {
    const productImage = couponMediaUrl(product.image_1_path)
    return {
      ...product,
      image_1_path: productImage,
      stock_quantity: Number(product.stock_quantity ?? 0),
      base_price: Number(product.base_price ?? 0),
      variants: (variants.data ?? []).filter((variant) => variant.product_id === product.id).map((variant) => {
        const metal = metalById.get(variant.metal_id)
        return { id: variant.id, label: metal?.display_label || [metal?.purity_label, metal?.base_metal_name || metal?.name].filter(Boolean).join(' ') || 'Default variant', price: Number(variant.price ?? 0), image_url: mediaByVariant.get(variant.id) || productImage, is_default: Boolean(variant.is_default) }
      }),
    }
  }) as CouponProduct[]
}

/** RDS mode returns one page (HOD-065); legacy mode returns every coupon and the client pages. */
export function getCoupons(page=1,query=''):Promise<{items:CouponRow[];server?:{page:number;total:number;query:string}}> {
  return operationsPage(async db=>{const result=await createCouponsRepository(db).list(page,query);return {items:result.items,server:{page:result.page,total:result.total,query}}})
}
export function getCoupon(id:number|string):Promise<CouponRow|null> {return operationsPage(async db=>{const row=await createCouponsRepository(db).one(id);return row?{...row,revision:couponRevision(row)}:null})}
