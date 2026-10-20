import { NextResponse } from 'next/server'
import { withOperationsRoute, isOperationsRds } from '@/lib/operations-route'
import { createCouponsRepository } from '@/lib/db/admin-repositories/coupons'
export const runtime='nodejs'
export const dynamic='force-dynamic'
import { couponDatabaseError, saveCoupon } from '@/lib/coupon-save'

export async function GET(request: Request) {
  return withOperationsRoute(request,async access=>{
  if(isOperationsRds(access)){const params=new URL(request.url).searchParams;return Response.json(await createCouponsRepository(access.db).list(params.get('page')??1,params.get('q')??''))}

  const { data, error } = await access.adminClient
    .from('coupons')
    .select('id, code, title, discount_type, discount_value, reward_type, minimum_order_amount, gift_product_id, gift_variant_data, gift_banner_image_url, banner_enabled, banner_title, banner_description, starts_at, ends_at, featured_priority, usage_limit, usage_count, is_active, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    const safe = couponDatabaseError(error, 'save')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  return NextResponse.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
  })
}

export async function POST(request: Request) {
  return withOperationsRoute(request,async access=>{
  if(isOperationsRds(access)) return Response.json(await createCouponsRepository(access.db).save(await request.json().catch(()=>null)))
  const body = await request.json().catch(() => null)
  return saveCoupon(access, body)
  })
}
