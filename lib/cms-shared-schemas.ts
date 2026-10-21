import { z } from 'zod'
import { safeLinkSchema } from './link-validation.ts'

const cmsIdSchema = z.union([z.number().int().safe().positive(), z.string().regex(/^[1-9][0-9]*$/).refine(value => /^[1-9][0-9]*$/.test(value) && BigInt(value) <= BigInt('9223372036854775807'), 'Invalid CMS identifier')])

const text = (max = 10_000) => z.string().max(max)
// Stored rows can hold NULL where the editor shows an empty box; treat NULL as empty text.
const textOrEmpty = (max = 10_000) => z.preprocess((value) => value ?? '', z.string().max(max))
const required = (max = 10_000) => z.string().trim().min(1).max(max)
const integer = z.coerce.number().int().min(0).max(1_000_000)
const numericId = cmsIdSchema.transform(String)
const uuid = z.string().uuid()
const httpUrl = z.string().max(2_000).refine((value) => !value || /^https?:\/\//i.test(value), 'Use a valid HTTP(S) URL.')
// HOD-067: one shared link rule.
const safeLink = safeLinkSchema

export const checkoutResultParentSchema = z.object({ main_banner_image_path: text(2_000), main_banner_image_alt: text(2_000), secondary_banner_image_path: text(2_000), secondary_banner_image_alt: text(2_000), secondary_eyebrow: text(500), secondary_heading: text(500), secondary_paragraph: text(10_000), is_enabled: z.boolean() }).strict()
export const checkoutResultItemSchema = z.object({ state: z.enum(['success', 'pending', 'failed', 'error']), eyebrow: text(500), heading: text(500), paragraph: text(10_000), order_button_label: text(500), is_enabled: z.boolean() }).strict()

export const promotionParentSchema = z.object({ label: textOrEmpty(500), title: textOrEmpty(500), description: textOrEmpty(10_000), cta_text: textOrEmpty(500), cta_link: safeLink, cta_action: z.enum(['redirect', 'reveal_coupon']), selected_coupon_id: cmsIdSchema.nullable(), image_path: textOrEmpty(2_000), mobile_image_path: textOrEmpty(2_000), image_alt: textOrEmpty(2_000), image_only_mode: z.boolean(), is_active: z.boolean(), show_once_per_session: z.boolean() }).strict()
export const promotionItemSchema = z.object({ id: numericId.nullable().optional(), field_key: z.string().regex(/^[a-z][a-z0-9_]{1,49}$/), question: required(2_000), input_type: z.enum(['text', 'email', 'phone', 'number', 'options']), options: z.array(z.object({ id: z.string().min(1).max(200), label: required(500), value: required(500) }).strict()).max(100), allow_multiple: z.boolean(), validation_pattern: textOrEmpty(2_000), validation_message: textOrEmpty(2_000), is_required: z.boolean(), is_active: z.boolean(), sort_order: integer }).strict().superRefine((item, context) => {
  if (item.input_type === 'options' && item.options.length < 2) context.addIssue({ code: 'custom', path: ['options'], message: 'Option questions require at least two choices.' })
  if (new Set(item.options.map((option) => option.id)).size !== item.options.length || new Set(item.options.map((option) => option.value.toLowerCase())).size !== item.options.length) context.addIssue({ code: 'custom', path: ['options'], message: 'Option IDs and values must be unique.' })
})

export const serviceBannerParentSchema = z.object({ image_path: text(2_000), image_alt: text(2_000), is_enabled: z.boolean() }).strict()
export const serviceBannerItemSchema = z.object({ id: uuid.optional(), title: required(500), paragraph: required(10_000), sort_order: integer, is_active: z.boolean() }).strict()

export const summaryParentSchema = z.object({ heading: required(200), is_enabled: z.boolean() }).strict()
export const summaryItemSchema = z.object({ id: uuid.optional(), sort_order: integer, icon_url: httpUrl, pointer_text: required(500), video_url: httpUrl, video_link_text: text(150) }).strict().refine((item) => !item.video_link_text.trim() || Boolean(item.video_url), 'Video link text requires a video URL.')
