import { z } from 'zod'

const cmsIdSchema = z.union([z.number().int().safe().positive(), z.string().regex(/^[1-9][0-9]*$/).refine(value => /^[1-9][0-9]*$/.test(value) && BigInt(value) <= BigInt('9223372036854775807'), 'Invalid CMS identifier')])
const id = cmsIdSchema.optional()
const text = (max: number) => z.string().max(max)
const requiredText = (max: number) => z.string().trim().min(1).max(max)
const safeLink = z.string().max(2_000).refine((value) => !value || /^(?:\/|https?:\/\/|mailto:|tel:)/i.test(value), 'Use a relative, HTTP(S), email, or telephone link.')

export const cmsContentListSchemas = {
  about_values: z.array(z.object({ id, icon_path: text(2_000), image_path: text(2_000), image_alt: text(2_000), title: text(300), description: text(5_000) }).strict()).max(100),
  about_timeline: z.array(z.object({ id, year: text(100), label: text(1_000) }).strict()).max(100),
  about_founders: z.array(z.object({ id, name: text(200), designation: text(300), bio: text(10_000), image_path: text(2_000) }).strict()).max(100),
  contact_info: z.array(z.object({ id, label: requiredText(300), value: requiredText(2_000), note: text(5_000), href: safeLink, icon_path: text(2_000) }).strict()).max(100),
  bespoke_process: z.array(z.object({ id, eyebrow: text(300), title: requiredText(500), description: text(10_000) }).strict()).max(100),
  bespoke_manufacturing: z.array(z.object({
    id,
    step: text(100),
    eyebrow: text(300),
    title: requiredText(500),
    description: text(10_000),
    media_type: z.enum(['image', 'video']),
    media_path: text(2_000),
    image_path: text(2_000),
  }).strict().superRefine((item, context) => {
    const mediaPath = item.media_path.trim()
    if (item.media_type === 'video' && mediaPath && !/^https:\/\//i.test(mediaPath)) {
      context.addIssue({ code: 'custom', path: ['media_path'], message: 'Video URLs must use HTTPS.' })
    }
    if (item.media_type === 'video' && !mediaPath) {
      context.addIssue({ code: 'custom', path: ['media_path'], message: 'A video URL is required.' })
    }
    if (item.media_type === 'image' && mediaPath && /^[a-z][a-z0-9+.-]*:/i.test(mediaPath) && !/^https:\/\//i.test(mediaPath)) {
      context.addIssue({ code: 'custom', path: ['media_path'], message: 'Image URLs must use HTTPS or a storage path.' })
    }
  })).max(100),
}
