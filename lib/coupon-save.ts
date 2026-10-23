import { z } from 'zod'
import { cmsIdSchema } from './cms-id-safety'

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

export function couponDatabaseError(error: DatabaseError, operation: 'save' | 'delete') {
  if (error.code === '23505') return { status: 409, message: 'A coupon with this code already exists.' }
  if (error.code === '23503') return { status: 409, message: operation === 'delete' ? 'This coupon is still referenced and cannot be deleted.' : 'A selected coupon reference is no longer available.' }
  if (['22023', '22P02', '23502', '23514'].includes(error.code ?? '')) return { status: 400, message: 'The coupon details are invalid.' }
  return { status: 500, message: operation === 'delete' ? 'Unable to delete the coupon.' : 'Unable to save the coupon. No changes were applied.' }
}

