import { z } from 'zod'

const uuid = z.string().uuid()
const nullableString = z.string().nullable()
const finiteNumber = z.number().finite()
const nonNegativeNumber = finiteNumber.nonnegative()
const positivePrice = finiteNumber.positive()

function uniqueIds(message: string) {
  return (values: string[], context: z.RefinementCtx) => {
    if (new Set(values).size !== values.length) context.addIssue({ code: z.ZodIssueCode.custom, message })
  }
}

const idArray = (message: string) => z.array(uuid).superRefine(uniqueIds(message))
const keyValueSchema = z.object({ key: z.string(), value: z.string() }).strict()
const detailSectionSchema = z.object({ id: z.string().min(1), title: z.string(), visible: z.boolean(), rows: z.array(keyValueSchema) }).strict()
const variantMediaSchema = z.object({
  id: uuid.optional(),
  product_id: uuid.optional(),
  variant_id: uuid.nullable().optional(),
  media_type: z.enum(['image', 'video']),
  media_path: z.string(),
  alt_text: nullableString.optional(),
  sort_order: z.number().int(),
  is_default_fallback: z.boolean().optional(),
}).strict()
const variantSchema = z.object({
  id: uuid.optional(),
  product_id: uuid.optional(),
  metal_id: uuid,
  price: positivePrice,
  is_default: z.boolean(),
  sort_order: z.number().int(),
  media_items: z.array(variantMediaSchema).optional(),
}).strict()
const purityPriceSchema = z.object({
  // ProductForm's test-data action intentionally supplies temporary non-UUID IDs;
  // persisted IDs are UUIDs, while these temporary keys are resolved on insert.
  id: z.string().min(1).optional(),
  product_id: uuid.optional(),
  purity_label: z.string(),
  price: positivePrice,
  compare_at_price: nonNegativeNumber.nullable().optional(),
  sort_order: z.number().int(),
}).strict()
const metalMediaSchema = z.object({
  id: uuid.optional(),
  product_id: uuid.optional(),
  metal_id: uuid,
  image_1_path: nullableString.optional(),
  image_2_path: nullableString.optional(),
  image_3_path: nullableString.optional(),
  image_4_path: nullableString.optional(),
  video_path: nullableString.optional(),
  is_default_fallback: z.boolean().optional(),
}).strict()
const faqSchema = z.object({
  id: uuid.optional(),
  product_id: uuid.optional(),
  question: z.string(),
  answer: z.string(),
  sort_order: z.number().int(),
  is_active: z.boolean(),
  source: z.string().optional(),
}).strict()
const customDropdownOptionSchema = z.object({
  id: uuid,
  label: z.string(),
  value: z.string(),
  is_enabled: z.boolean(),
  display_order: z.number().int(),
}).strict()
const customDropdownSchema = z.object({
  id: uuid,
  name: z.string(),
  label: z.string(),
  is_enabled: z.boolean(),
  is_required: z.boolean(),
  display_order: z.number().int(),
  options: z.array(customDropdownOptionSchema),
}).strict()

export const productPayloadSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  product_lane: z.enum(['standard', 'hiphop', 'collection']),
  detail_template: z.enum(['standard', 'hiphop']),
  featured: z.boolean(),
  description: nullableString,
  tag_line: nullableString,
  seo_title: nullableString,
  seo_description: nullableString,
  h1_title: nullableString,
  base_price: positivePrice.nullable(),
  discount_price: nonNegativeNumber.nullable(),
  gst_slab_id: uuid.nullable(),
  stock_quantity: nonNegativeNumber,
  allow_checkout: z.boolean(),
  status: z.enum(['draft', 'active', 'hidden', 'archived']),
  main_category_id: uuid,
  subcategory_id: uuid.nullable(),
  option_id: uuid.nullable(),
  linked_subcategory_ids: idArray('Linked subcategory IDs must be unique.'),
  linked_option_ids: idArray('Linked option IDs must be unique.'),
  style_id: uuid.nullable(),
  metal_ids: idArray('Metal IDs must be unique.'),
  metal_variants: z.array(variantSchema).superRefine((variants, context) => {
    if (new Set(variants.map((variant) => variant.metal_id)).size !== variants.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Metal variants must use unique metals.' })
    }
    const defaultCount = variants.filter((variant) => variant.is_default).length
    if (variants.length > 0 && defaultCount !== 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Exactly one metal variant must be the default.' })
    }
  }),
  default_variant_media_items: z.array(variantMediaSchema),
  purity_values: z.array(z.string()),
  purity_prices: z.array(purityPriceSchema),
  default_purity_price_id: z.string().min(1).nullable(),
  metal_media: z.array(metalMediaSchema).superRefine((media, context) => {
    if (new Set(media.map((item) => item.metal_id)).size !== media.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Metal media must use unique metals.' })
  }),
  certificate_ids: idArray('Certificate IDs must be unique.'),
  ring_size_ids: idArray('Ring size IDs must be unique.'),
  ring_enabled: z.boolean(),
  ring_category_id: uuid.nullable(),
  fit_options: z.array(z.string()),
  fit_label: nullableString,
  gemstone_label: nullableString,
  gemstone_value: nullableString,
  material_value_ids: idArray('Material value IDs must be unique.'),
  shapes_enabled: z.boolean(),
  shape_ids: idArray('Stone shape IDs must be unique.'),
  show_purity: z.boolean(),
  engraving_enabled: z.boolean(),
  engraving_label: nullableString,
  custom_dropdowns_enabled: z.boolean(),
  custom_dropdowns: z.array(customDropdownSchema),
  shipping_enabled: z.boolean(),
  care_warranty_enabled: z.boolean(),
  shipping_override_enabled: z.boolean(),
  care_warranty_override_enabled: z.boolean(),
  shipping_rule_id: uuid.nullable(),
  care_warranty_rule_id: uuid.nullable(),
  shipping_title_override: nullableString,
  shipping_body_override: nullableString,
  care_warranty_title_override: nullableString,
  care_warranty_body_override: nullableString,
  features: z.array(z.string()),
  specifications: z.array(keyValueSchema),
  product_details: z.array(keyValueSchema),
  detail_sections: z.array(detailSectionSchema),
  faq_items: z.array(faqSchema),
  image_1_path: nullableString,
  image_2_path: nullableString,
  image_3_path: nullableString,
  image_4_path: nullableString,
  image_1_alt: nullableString,
  image_2_alt: nullableString,
  image_3_alt: nullableString,
  image_4_alt: nullableString,
  video_path: nullableString,
  model_3d_url: nullableString,
  show_image_1: z.boolean(),
  show_image_2: z.boolean(),
  show_image_3: z.boolean(),
  show_image_4: z.boolean(),
  show_video: z.boolean(),
  custom_order_enabled: z.boolean(),
  ready_to_ship: z.boolean(),
  hiphop_badges: z.array(z.string()),
  chain_length_options: z.array(z.string()),
  hiphop_carat_label: nullableString,
  hiphop_carat_values: z.array(z.string()),
  gram_weight_label: nullableString,
  gram_weight_value: nullableString,
}).strict().superRefine((payload, context) => {
  if (payload.subcategory_id && payload.linked_subcategory_ids.includes(payload.subcategory_id)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['linked_subcategory_ids'], message: 'The primary subcategory cannot be linked twice.' })
  }
  if (payload.option_id && payload.linked_option_ids.includes(payload.option_id)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['linked_option_ids'], message: 'The primary option cannot be linked twice.' })
  }
})

export type ProductPayload = z.infer<typeof productPayloadSchema>

export function productPayloadErrorMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? 'Invalid product payload.'
}

export function safeProductSaveError(error: { code?: string | null } | null | undefined) {
  switch (error?.code) {
    case 'PGRST202':
    case '42883': return { status: 503, message: 'Product saving is awaiting its database migration.' }
    case 'P0002': return { status: 404, message: 'Product not found.' }
    case 'PGRST116': return { status: 404, message: 'Product not found.' }
    case '23505': return { status: 409, message: 'A product or product relationship already exists with those values.' }
    case '23503': return { status: 409, message: 'A selected product dependency is no longer available.' }
    case '40001': return { status: 409, message: 'The product changed while it was being saved. Refresh and try again.' }
    case '22P02':
    case '22023':
    case '23502':
    case '23514': return { status: 400, message: 'The product payload is invalid.' }
    default: return { status: 500, message: 'Unable to save product.' }
  }
}
