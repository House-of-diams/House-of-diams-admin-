import { NextResponse } from 'next/server'
import { z } from 'zod'
import { cmsIdSchema } from './cms-id-safety'
import type { assertAdmin } from './cms-auth'

type Access = Exclude<Awaited<ReturnType<typeof assertAdmin>>, { error: NextResponse }>
type DatabaseError = { code?: string; message?: string }

const optionalText = (max: number) => z.string().max(max)
const optionalNullableText = (max: number) => z.string().max(max).nullable()

const giftVariantSchema = z.object({
  variant_id: z.string().uuid().optional(),
  label: optionalText(500).optional(),
  price: z.number().finite().nonnegative().optional(),
  image_url: optionalText(2_000).optional(),
  sku: optionalText(200).optional(),
  product_name: optionalText(500).optional(),
  product_slug: optionalText(500).optional(),
}).strict()

export const couponSaveSchema = z.object({
  id: cmsIdSchema.optional(),
  code: z.string().trim().min(1, 'Coupon code is required.').max(100).regex(/^[A-Za-z0-9_-]+$/, 'Coupon code may only contain letters, numbers, hyphens, and underscores.'),
  title: optionalText(500),
  reward_type: z.enum(['percentage', 'fixed', 'free_gift']),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.number().finite().nonnegative(),
  minimum_order_amount: z.number().finite().nonnegative(),
  gift_product_id: z.string().uuid().nullable(),
  gift_variant_id: z.union([z.string().uuid(), z.literal('')]),
  gift_variant_data: giftVariantSchema,
  gift_banner_image_url: optionalNullableText(2_000),
  banner_enabled: z.boolean(),
  banner_title: optionalNullableText(500),
  banner_description: optionalNullableText(5_000),
  starts_at: optionalNullableText(100),
  ends_at: optionalNullableText(100),
  featured_priority: z.number().int().min(0).max(1_000_000),
  usage_limit: z.number().int().positive().nullable(),
  is_active: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.reward_type === 'percentage' && value.discount_value > 100) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['discount_value'], message: 'Percentage discount cannot exceed 100%.' })
  }
  if (value.reward_type === 'free_gift' && (!value.gift_product_id || value.minimum_order_amount <= 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['gift_product_id'], message: 'Free-gift coupons require a product and a minimum order amount.' })
  }
})

function parseOptionalDate(value: string | null, label: string) {
  if (!value) return { value: null as string | null }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return { error: `${label} must be a valid date and time.` }
  return { value: parsed.toISOString() }
}

export function couponDatabaseError(error: DatabaseError, operation: 'save' | 'delete') {
  if (error.code === '23505') return { status: 409, message: 'A coupon with this code already exists.' }
  if (error.code === '23503') return { status: 409, message: operation === 'delete' ? 'This coupon is still referenced and cannot be deleted.' : 'A selected coupon reference is no longer available.' }
  if (['22023', '22P02', '23502', '23514'].includes(error.code ?? '')) return { status: 400, message: 'The coupon details are invalid.' }
  return { status: 500, message: operation === 'delete' ? 'Unable to delete the coupon.' : 'Unable to save the coupon. No changes were applied.' }
}

export async function saveCoupon(access: Access, input: unknown) {
  const parsed = couponSaveSchema.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid coupon details.' }, { status: 400 })

  const coupon = parsed.data
  const startsAt = parseOptionalDate(coupon.starts_at, 'Start date')
  if ('error' in startsAt) return NextResponse.json({ error: startsAt.error }, { status: 400 })
  const endsAt = parseOptionalDate(coupon.ends_at, 'End date')
  if ('error' in endsAt) return NextResponse.json({ error: endsAt.error }, { status: 400 })
  if (startsAt.value && endsAt.value && new Date(endsAt.value) <= new Date(startsAt.value)) {
    return NextResponse.json({ error: 'The end date and time must be after the start date and time.' }, { status: 400 })
  }

  const rewardType = coupon.reward_type
  const giftProductId = rewardType === 'free_gift' ? coupon.gift_product_id : null
  const giftVariantData = rewardType === 'free_gift' ? coupon.gift_variant_data : {}

  if (giftProductId) {
    const { data: giftProduct, error: giftProductError } = await access.adminClient.from('products').select('id, status, stock_quantity').eq('id', giftProductId).maybeSingle()
    if (giftProductError) {
      const safe = couponDatabaseError(giftProductError, 'save')
      return NextResponse.json({ error: safe.message }, { status: safe.status })
    }
    if (!giftProduct || giftProduct.status !== 'active' || Number(giftProduct.stock_quantity ?? 0) < 1) {
      return NextResponse.json({ error: 'The selected gift product must be active and in stock.' }, { status: 400 })
    }

    const variantId = giftVariantData.variant_id ?? null
    const { count: variantCount, error: countError } = await access.adminClient.from('product_metal_variants').select('id', { count: 'exact', head: true }).eq('product_id', giftProductId)
    if (countError) {
      const safe = couponDatabaseError(countError, 'save')
      return NextResponse.json({ error: safe.message }, { status: safe.status })
    }
    if ((variantCount ?? 0) > 0 && !variantId) return NextResponse.json({ error: 'Select the exact gift variant.' }, { status: 400 })
    if (variantId) {
      const { data: variant, error: variantError } = await access.adminClient.from('product_metal_variants').select('id').eq('id', variantId).eq('product_id', giftProductId).maybeSingle()
      if (variantError) {
        const safe = couponDatabaseError(variantError, 'save')
        return NextResponse.json({ error: safe.message }, { status: safe.status })
      }
      if (!variant) return NextResponse.json({ error: 'The selected gift variant does not belong to this product.' }, { status: 400 })
    }
  }

  const payload = {
    code: coupon.code.toUpperCase(), title: coupon.title.trim(), discount_type: rewardType === 'fixed' ? 'fixed' : 'percentage',
    discount_value: rewardType === 'free_gift' ? 0 : coupon.discount_value, reward_type: rewardType,
    minimum_order_amount: coupon.minimum_order_amount, gift_product_id: giftProductId, gift_variant_data: giftVariantData,
    gift_banner_image_url: coupon.gift_banner_image_url?.trim() || null, banner_enabled: coupon.banner_enabled,
    banner_title: coupon.banner_title?.trim() || null, banner_description: coupon.banner_description?.trim() || null,
    starts_at: startsAt.value, ends_at: endsAt.value, featured_priority: coupon.featured_priority,
    usage_limit: coupon.usage_limit, is_active: coupon.is_active,
  }

  const result = coupon.id
    ? await access.adminClient.from('coupons').update(payload).eq('id', coupon.id).select('id').maybeSingle()
    : await access.adminClient.from('coupons').insert(payload).select('id').single()
  if (result.error) {
    const safe = couponDatabaseError(result.error, 'save')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  if (!result.data?.id) return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 })
  return NextResponse.json({ ok: true, id: result.data.id }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function deleteCoupon(access: Access, rawId: string) {
  const id = cmsIdSchema.safeParse(rawId)
  if (!id.success) return NextResponse.json({ error: 'Invalid coupon ID.' }, { status: 400 })
  const { data, error } = await access.adminClient.from('coupons').delete().eq('id', id.data).select('id').maybeSingle()
  if (error) {
    const safe = couponDatabaseError(error, 'delete')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  if (!data) return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 })
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
