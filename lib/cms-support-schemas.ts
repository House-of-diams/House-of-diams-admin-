import { z } from 'zod'
import { safeLinkSchema } from './link-validation.ts'

const cmsIdSchema = z.union([z.number().int().safe().positive(), z.string().regex(/^[1-9][0-9]*$/).refine(value => /^[1-9][0-9]*$/.test(value) && BigInt(value) <= BigInt('9223372036854775807'), 'Invalid CMS identifier')])

const revision = z.string().regex(/^[a-f0-9]{32}$/)
const numericId = cmsIdSchema.transform(String)
const uuid = z.string().uuid()
const integer = z.coerce.number().int().min(0).max(1_000_000)
const text = (max: number) => z.string().max(max)
const required = (max: number) => z.string().trim().min(1).max(max)
// HOD-067: one shared link rule.
const safeLink = safeLinkSchema

export const supportAnnouncementParentSchema = z.object({ is_active: z.boolean(), autoplay: z.boolean(), speed_ms: z.coerce.number().int().min(100).max(120_000) }).strict()
export const supportAnnouncementItemSchema = z.object({ id: numericId.optional(), message: required(2_000), link_url: safeLink, open_in_new_tab: z.boolean(), sort_order: integer, is_active: z.boolean() }).strict()
export const supportFaqParentSchema = z.object({ title: required(500), subtitle: text(2_000) }).strict()
export const supportFaqItemSchema = z.object({ id: numericId.optional(), question: required(2_000), answer: required(50_000), sort_order: integer, is_active: z.boolean(), category_id: z.union([cmsIdSchema, z.null()]), catalog_category_id: z.union([uuid, z.null()]) }).strict()
const category = z.object({
  name: z.string().trim().min(1).max(300), slug: z.string().max(300), description: z.string().max(10_000),
  image_path: z.union([z.string().max(2_000), z.null()]), image_alt: z.string().max(2_000),
  sort_order: z.coerce.number().int().min(0).max(1_000_000), is_active: z.boolean(),
}).strict()

export const faqCategorySaveSchema = z.object({
  request_id: z.string().uuid(), id: cmsIdSchema.nullable(), expected_revision: revision.nullable(), item: category,
}).strict().superRefine((value, context) => {
  if ((value.id === null) !== (value.expected_revision === null)) context.addIssue({ code: 'custom', message: 'Reload this FAQ category before saving.' })
})

export const faqCategoryDeleteSchema = z.object({
  request_id: z.string().uuid(), id: cmsIdSchema, expected_revision: revision,
}).strict()
