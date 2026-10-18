import { z } from 'zod'

const uuid = z.string().uuid()
const status = z.enum(['active', 'hidden'])
const timestamp = z.string().datetime({ offset: true })
const displayOrder = z.number().int().min(0).max(1_000_000)

function isSafeStoredPathOrUrl(value: string) {
  if (value.startsWith('bespoke/images/')) {
    return /^bespoke\/images\/[0-9a-f-]{36}\.webp$/i.test(value) && !value.includes('..')
  }

  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

const nullableMediaLocation = z.union([
  z.string().trim().max(2_048).refine(isSafeStoredPathOrUrl, 'Use a valid HTTPS URL or an uploaded Bespoke media path.'),
  z.literal('').transform(() => null),
  z.null(),
]).optional().transform((value) => value ?? null)

export const portfolioCategoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'Category name is required.').max(200),
  slug: z.string().trim().min(1, 'Category slug is required.').max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Category slug must use lowercase letters, numbers, and hyphens.'),
  image_path: nullableMediaLocation,
  display_order: displayOrder,
  status,
}).strict()

export const portfolioCategoryUpdateSchema = portfolioCategoryCreateSchema.extend({
  expected_updated_at: timestamp,
}).strict()

const portfolioItemShape = {
  title: z.string().trim().min(1, 'Portfolio title is required.').max(300),
  tag: z.string().trim().min(1, 'Portfolio tag is required.').max(150),
  category_id: uuid,
  media_type: z.enum(['image', 'video']),
  media_path: nullableMediaLocation,
  thumbnail_path: nullableMediaLocation,
  gem_style: z.string().trim().max(100).nullable().optional().transform((value) => value || null),
  gem_color: z.string().trim().max(100).nullable().optional().transform((value) => value || null),
  dark_theme: z.boolean(),
  short_description: z.string().trim().max(5_000).nullable().optional().transform((value) => value || null),
  display_order: displayOrder,
  status,
}

function validatePortfolioMedia(value: { media_type: 'image' | 'video'; media_path?: string | null }, context: z.RefinementCtx) {
  if (value.media_type === 'video' && value.media_path && !value.media_path.startsWith('https://')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['media_path'], message: 'Video media must use a direct HTTPS URL.' })
  }
}

export const portfolioItemCreateSchema = z.object(portfolioItemShape).strict().superRefine(validatePortfolioMedia)
export const portfolioItemUpdateSchema = z.object({ ...portfolioItemShape, expected_updated_at: timestamp }).strict().superRefine(validatePortfolioMedia)
export const portfolioIdSchema = uuid
export const portfolioExpectedTimestampSchema = timestamp

export type PortfolioDatabaseError = { code?: string; message?: string }

export function portfolioMutationError(error: PortfolioDatabaseError, subject: 'category' | 'item', operation: 'save' | 'delete') {
  if (error.code === '23505') {
    return { status: 409, message: subject === 'category' ? 'A portfolio category with this slug already exists.' : 'This portfolio item conflicts with an existing record.' }
  }
  if (error.code === '23503') {
    if (subject === 'category' && operation === 'delete') return { status: 409, message: 'This category still contains portfolio items and cannot be deleted.' }
    return { status: 409, message: 'The selected portfolio category is no longer available.' }
  }
  if (['22023', '22P02', '23502', '23514'].includes(error.code ?? '')) {
    return { status: 400, message: `The portfolio ${subject} details are invalid.` }
  }
  return {
    status: 500,
    message: operation === 'delete' ? `Unable to delete the portfolio ${subject}.` : `Unable to save the portfolio ${subject}. No changes were applied.`,
  }
}
