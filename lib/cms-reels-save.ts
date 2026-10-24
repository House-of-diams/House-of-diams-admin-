import { z } from 'zod'
import { canonicalizeInstagramUrl } from './instagram-url'
import { isCanonicalAwsVideoReference } from './video-reference'

const instagramUrl = z.string().max(500).transform((value, ctx) => {
  const canonical = canonicalizeInstagramUrl(value)
  if (!canonical) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use a valid public Instagram Reel or post URL.' })
    return z.NEVER
  }
  return canonical
})

// An uploaded reel video: a permanent address on the media CDN, never a pasted or external one.
const videoUrl = z.string().max(1000).refine(
  (value) => isCanonicalAwsVideoReference(value) && /\.(mp4|mov|webm)$/i.test(value) && !value.slice('https://'.length).includes('//'),
  'Upload the reel video with the uploader; pasted or external video addresses are not allowed.',
)

export const reelsSaveSchema = z.object({
  request_id: z.string().uuid(),
  expected_revision: z.string().regex(/^[a-f0-9]{32}$/),
  heading: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(240),
  is_enabled: z.boolean(),
  marquee_duration_seconds: z.number().int().min(10).max(180),
  pause_on_hover: z.boolean(),
  deleted_ids: z.array(z.string().uuid()).max(30),
  items: z.array(z.object({
    id: z.string().uuid().optional(),
    // A reel is exactly one of these two (checked below); the key is simply left out for the kind it is not.
    instagram_url: instagramUrl.optional(),
    video_url: videoUrl.optional(),
    title: z.string().trim().max(100),
    is_enabled: z.boolean(),
    cover_image_url: z.string().trim().max(1000).url().refine((value) => /^https?:\/\//i.test(value), 'Use HTTP or HTTPS.').nullable().optional(),
  }).strict()).max(30),
}).strict().superRefine((payload, ctx) => {
  const ids = payload.items.flatMap((item) => item.id ? [item.id] : [])
  if (payload.items.some((item) => (item.instagram_url === undefined) === (item.video_url === undefined))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Each reel needs either an Instagram URL or an uploaded video, not both.' })
  }
  const sources = payload.items.map((item) => item.instagram_url ?? item.video_url)
  if (new Set(ids).size !== ids.length || new Set(payload.deleted_ids).size !== payload.deleted_ids.length
    || payload.deleted_ids.some((id) => ids.includes(id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A reel ID was duplicated or both retained and deleted.' })
  }
  if (new Set(sources).size !== sources.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Each reel URL must be unique.' })
  }
})

export function reelsSaveError(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202' || error.code === '42883') {
    return { status: 503, message: 'Reels saving is awaiting a database update. Your saved content has not been changed.' }
  }
  if (error.code === '40001') return { status: 409, message: 'This Reels section changed after you opened it. Reload before saving again.' }
  if (error.code === '42501') return { status: 403, message: 'Administrator access is required.' }
  if (error.code === '22023' || error.code === '22P02') return { status: 400, message: 'The Reels section contains invalid or conflicting data.' }
  if (error.code === '23505') return { status: 409, message: 'A reel URL or position conflicts with another entry. Your changes were not saved.' }
  return { status: 500, message: 'Unable to save reels. No part of this save was committed. Please try again.' }
}
