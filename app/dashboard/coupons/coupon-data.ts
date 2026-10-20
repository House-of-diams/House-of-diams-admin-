import { operationsPage } from '@/lib/operations-page-data'
import { createCouponsRepository } from '@/lib/db/admin-repositories/coupons'
import { couponProductSources } from '@/lib/db/admin-repositories/coupon-products'
import { createSupabaseAdminClient } from '@/lib/admin-supabase'
import type { CouponProduct, CouponRow } from './coupon-types'

const bucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'

export function couponMediaUrl(path?: string | null) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  return base ? `${base}/storage/v1/object/public/${bucket}/${path.replace(/^\/+/, '')}` : path
}

async function legacyGetCoupons(): Promise<CouponRow[]> {
  const client = createSupabaseAdminClient()
  const { data, error } = await client.from('coupons').select('id, code, title, discount_type, discount_value, reward_type, minimum_order_amount, gift_product_id, gift_variant_data, gift_banner_image_url, banner_enabled, banner_title, banner_description, starts_at, ends_at, featured_priority, usage_limit, usage_count, is_active, created_at').order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as CouponRow[]
}

async function legacyGetCoupon(id: number | string): Promise<CouponRow | null> {
  const client = createSupabaseAdminClient()
  const { data, error } = await client.from('coupons').select('id, code, title, discount_type, discount_value, reward_type, minimum_order_amount, gift_product_id, gift_variant_data, gift_banner_image_url, banner_enabled, banner_title, banner_description, starts_at, ends_at, featured_priority, usage_limit, usage_count, is_active, created_at').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data as CouponRow | null
}

export async function getCouponProducts(): Promise<CouponProduct[]> {
  const {products,variants,metals,media}=await operationsPage(db=>couponProductSources(db),async()=>{
  const client = createSupabaseAdminClient()
  const [products, variants, metals, media] = await Promise.all([
    client.from('products').select('id, name, slug, sku, status, stock_quantity, base_price, image_1_path').eq('status', 'active').order('name'),
    client.from('product_metal_variants').select('id, product_id, metal_id, price, is_default, sort_order').order('sort_order'),
    client.from('catalog_metals').select('id, name, display_label, purity_label, base_metal_name'),
    client.from('product_variant_media_items').select('variant_id, media_type, media_path, sort_order').eq('media_type', 'image').order('sort_order'),
  ])
return {products,variants,metals,media}
})
  for (const result of [products, variants, metals, media]) if (result.error) throw new Error(result.error.message)
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
  return operationsPage(async db=>{const result=await createCouponsRepository(db).list(page,query);return {items:result.items,server:{page:result.page,total:result.total,query}}},async()=>({items:await legacyGetCoupons()}))
}
export function getCoupon(id:number|string):Promise<CouponRow|null> {return operationsPage(db=>createCouponsRepository(db).one(id),()=>legacyGetCoupon(id))}
