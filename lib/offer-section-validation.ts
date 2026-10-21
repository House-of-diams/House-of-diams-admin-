import { z } from 'zod'

/** Mirrors the limits in the home_offer_section table (10_cms_home_offer_section.forward.sql). */
const line = (min: number, max: number) => z.string().trim().min(min, 'This field cannot be empty.').max(max, `Use at most ${max} characters.`)

export const offerSectionSchema = z.object({
  is_enabled: z.boolean(),
  label: line(1, 80),
  heading: line(1, 160),
  gift_heading: line(1, 160),
  description: z.string().trim().max(600, 'Use at most 600 characters.'),
  button_text: line(1, 60),
}).strict()

export type OfferSection = z.infer<typeof offerSectionSchema>

/** What the website shows today; used when the database row does not exist yet. */
export const OFFER_SECTION_DEFAULTS: OfferSection = {
  is_enabled: true,
  label: 'Exclusive offer',
  heading: 'Get {offer} Off',
  gift_heading: 'Free Gift on Orders Over {minimum}',
  description: '',
  button_text: 'Get Your Coupon Code',
}
