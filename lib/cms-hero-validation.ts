import { z } from 'zod'

const cmsIdSchema = z.union([z.number().int().safe().positive(), z.string().regex(/^[1-9][0-9]*$/).refine(value => /^[1-9][0-9]*$/.test(value) && BigInt(value) <= BigInt('9223372036854775807'), 'Invalid CMS identifier')])

const slideSchema = z.object({
  id: cmsIdSchema.optional(),
  sort_order: z.number().int().min(0).max(1000).optional(),
  image_path: z.string().trim().max(1000),
  mobile_image_path: z.string().trim().max(1000).optional().default(''),
  headline: z.string().trim().max(200),
  subtitle: z.string().trim().max(1000),
  button_text: z.string().trim().max(100),
  button_link: z.string().trim().max(1000),
}).strict()

export const heroSaveSchema = z.object({
  request_id: z.string().uuid(),
  expected_revision: z.string().regex(/^[a-f0-9]{32}$/),
  deleted_ids: z.array(z.string().regex(/^\d+$/)).max(100),
  eyebrow: z.string().max(160).optional(),
  headline: z.string().max(240).optional(),
  subtitle: z.string().max(1000).optional(),
  slider_enabled: z.boolean(),
  seo_title: z.string().trim().max(120),
  seo_description: z.string().trim().max(320),
  items: z.array(slideSchema).max(100),
}).strict().superRefine((payload, ctx) => {
  const retainedIds = payload.items.flatMap((item) => item.id ? [String(item.id)] : [])
  if (new Set(retainedIds).size !== retainedIds.length
    || new Set(payload.deleted_ids).size !== payload.deleted_ids.length
    || payload.deleted_ids.some((id) => retainedIds.includes(id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A slide ID was duplicated or both retained and deleted.' })
  }
})
