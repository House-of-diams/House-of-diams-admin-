import { z } from 'zod'

const cmsIdSchema = z.union([z.number().int().safe().positive(), z.string().regex(/^[1-9][0-9]*$/).refine(value => /^[1-9][0-9]*$/.test(value) && BigInt(value) <= BigInt('9223372036854775807'), 'Invalid CMS identifier')])

const id = cmsIdSchema.transform(String)

export const docsSaveSchema = z.object({
  request_id: z.string().uuid(), expected_revision: z.string().regex(/^[a-f0-9]{32}$/),
  page: z.object({
    title: z.string().trim().min(1).max(500), eyebrow: z.string().trim().min(1).max(500),
    subtitle: z.string().trim().min(1).max(10_000), faq_category_id: z.union([cmsIdSchema, z.null()]).optional(),
  }).strict(),
  blocks: z.array(z.object({
    id: id.optional(), heading: z.string().max(10_000), description: z.string().max(50_000), body: z.string().max(1_000_000),
  }).strict().refine((block) => Boolean(block.heading.trim() || block.description.trim() || block.body.trim()), 'Every block must contain content.')).max(100),
  deleted_block_ids: z.array(id).max(100),
}).strict().superRefine((payload, context) => {
  const ids = payload.blocks.flatMap((block) => block.id ? [block.id] : [])
  if (new Set(ids).size !== ids.length || new Set(payload.deleted_block_ids).size !== payload.deleted_block_ids.length || payload.deleted_block_ids.some((deleted) => ids.includes(deleted))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'A block ID is invalid or duplicated.' })
  }
})
