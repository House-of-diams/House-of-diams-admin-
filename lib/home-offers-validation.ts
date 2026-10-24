import { z } from 'zod'
import { isCanonicalAwsImageReference } from './image-reference'

/** Mirrors the limits in the home_offers table (15_home_offers.forward.sql). */
const line = (min: number, max: number, empty = 'This field cannot be empty.') => z.string().trim().min(min, empty).max(max, `Use at most ${max} characters.`)
const imagePath = z.string().trim().max(1000).refine((value) => value === '' || isCanonicalAwsImageReference(value), 'Upload the image with the uploader; pasted or external addresses are not allowed.')
const alt = z.string().trim().max(200, 'Use at most 200 characters.')

export const HOME_OFFERS_MAX = 50

export const homeOfferSchema = z.object({
  id: z.string().uuid().optional(),
  name: line(1, 120, 'Give the offer a name so you can find it later.'),
  coupon_id: z.union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]{0,18}$/)]).nullable().transform((value) => (value === null ? null : String(value))),
  button_label: line(1, 40, 'The button needs a label.'),
  home_image_path: imagePath, home_image_alt: alt,
  promo_image_left_path: imagePath, promo_image_left_alt: alt,
  promo_image_right_path: imagePath, promo_image_right_alt: alt,
  is_active: z.boolean(),
}).strict().superRefine((offer, ctx) => {
  if (offer.is_active && !(offer.home_image_path && offer.promo_image_left_path && offer.promo_image_right_path)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Upload the home image and both banner images before making this offer active.' })
  }
})

export type HomeOfferInput = z.infer<typeof homeOfferSchema>
export type HomeOffer = Omit<HomeOfferInput, 'id' | 'coupon_id'> & { id: string; coupon_id: string | null; revision: string }
export type OfferCoupon = { id: string; code: string; title: string | null; reward_type: string; is_active: boolean; ends_at: string | null; has_gift: boolean }

export const NEW_OFFER_DEFAULTS: Omit<HomeOfferInput, 'id'> = {
  name: '', coupon_id: null, button_label: 'View Gift',
  home_image_path: '', home_image_alt: '', promo_image_left_path: '', promo_image_left_alt: '', promo_image_right_path: '', promo_image_right_alt: '',
  is_active: false,
}
