import { z } from 'zod'

const cmsIdSchema = z.union([z.number().int().safe().positive(), z.string().regex(/^[1-9][0-9]*$/).refine(value => /^[1-9][0-9]*$/.test(value) && BigInt(value) <= BigInt('9223372036854775807'), 'Invalid CMS identifier')])

const persistedId = cmsIdSchema.transform(String)
const uuid = z.string().uuid()
const optionalText = z.string().max(200_000).default('')

const tagSchema = z.object({ id: persistedId.optional(), tag: z.string().trim().min(1).max(200) }).strict()
const productSchema = z.object({ id: persistedId.optional(), product_id: uuid }).strict()
const blockSchema = z.object({
  id: persistedId.optional(), block_type: z.enum(['text', 'image', 'heading', 'quote']), heading: optionalText,
  body_html: optionalText, image_path: optionalText, image_alt: optionalText, image_caption: optionalText, is_enabled: z.boolean(),
}).strict().superRefine((block, context) => {
  const required = block.block_type === 'image' ? block.image_path : block.block_type === 'heading' ? block.heading : block.body_html
  if (!required.trim()) context.addIssue({ code: z.ZodIssueCode.custom, message: 'The content block is incomplete.' })
})

const articlePostSchema = z.object({
  slug: optionalText, title: z.string().trim().min(1).max(500), title_html: optionalText, card_title: optionalText,
  subtitle: z.string().trim().min(1).max(10_000), category: optionalText, catalog_category_id: z.union([uuid, z.literal(''), z.null()]).optional(),
  author: optionalText, date_label: optionalText, read_time: optionalText, bg_key: optionalText, bg_color: optionalText,
  hero_image_path: optionalText, card_image_path: optionalText, hero_image_alt: optionalText,
  body_html: z.string().trim().min(1).max(1_000_000), is_published: z.boolean(), sort_order: z.coerce.number().int().min(-1_000_000).max(1_000_000),
  // Search-result text; empty means the article title and intro are used.
  seo_title: z.string().trim().max(120).optional(), seo_description: z.string().trim().max(500).optional(), seo_indexable: z.boolean().optional(),
}).strict()

export const articleSaveSchema = z.object({
  request_id: uuid, expected_revision: z.string().regex(/^[a-f0-9]{32}$/).nullable().optional(), post: articlePostSchema,
  tags: z.array(tagSchema).max(100), products: z.array(productSchema).max(100), content_blocks: z.array(blockSchema).max(100),
  deleted_tag_ids: z.array(persistedId).max(100), deleted_product_ids: z.array(persistedId).max(100), deleted_block_ids: z.array(persistedId).max(100),
}).strict().superRefine((payload, context) => {
  const checks: Array<[string, Array<string | undefined>, string[]]> = [
    ['tag', payload.tags.map((item) => item.id), payload.deleted_tag_ids],
    ['product relation', payload.products.map((item) => item.id), payload.deleted_product_ids],
    ['content block', payload.content_blocks.map((item) => item.id), payload.deleted_block_ids],
  ]
  for (const [label, ids, deletedIds] of checks) {
    const saved = ids.filter((id): id is string => Boolean(id))
    if (new Set(saved).size !== saved.length) context.addIssue({ code: z.ZodIssueCode.custom, message: `A ${label} ID is duplicated.` })
    if (new Set(deletedIds).size !== deletedIds.length || deletedIds.some((id) => saved.includes(id))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `A deleted ${label} ID is invalid or duplicated.` })
    }
  }
  const normalizedTags = payload.tags.map((item) => item.tag.toLowerCase())
  if (new Set(normalizedTags).size !== normalizedTags.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Tags must be unique.' })
  if (new Set(payload.products.map((item) => item.product_id)).size !== payload.products.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Products may only be selected once.' })
})

export const articleDeleteSchema = z.object({ request_id: uuid, expected_revision: z.string().regex(/^[a-f0-9]{32}$/) }).strict()
