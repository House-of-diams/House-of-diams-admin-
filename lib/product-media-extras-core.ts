import { z } from 'zod'
import type { AdminActor } from './auth/admin-identity-core'
import { ProductSessionError } from './product-session-error'
import type { AdminTransactionOptions, DbExecutor } from './db/query'
import { revisionOf, REVISION_HEADER, STALE_EDITOR_MESSAGE } from './revision'
import { isCanonicalAwsVideoReference } from './video-reference'

// HOD-090: the product's video library, the video each metal option uses, and the 24-frame hover view.
// These live in their own tables and are saved by their own request, so the existing product save is untouched.
export const HOVER_FRAME_COUNT = 24
export const MAX_LIBRARY_VIDEOS = 12

const uuid = z.string().uuid()
export const mediaExtrasSchema = z.object({
  library: z.array(z.object({
    id: uuid,
    label: z.string().trim().min(1, 'Each library video needs a label.').max(80, 'A library video label must be 80 characters or fewer.'),
    media_path: z.string().trim().min(1).max(2000),
  }).strict()).max(MAX_LIBRARY_VIDEOS, `A product can have at most ${MAX_LIBRARY_VIDEOS} library videos.`),
  links: z.array(z.object({ metal_id: uuid, library_id: uuid.nullable() }).strict()).max(200),
  hover: z.union([
    z.null(),
    z.object({
      version: z.number().int().min(1).max(1_000_000),
      frame_paths: z.array(z.string().min(1).max(2000)).length(HOVER_FRAME_COUNT, `The hover view needs exactly ${HOVER_FRAME_COUNT} frames.`),
    }).strict(),
  ]).optional(),
}).strict()
export type MediaExtrasInput = z.infer<typeof mediaExtrasSchema>

export type MediaExtrasState = {
  library: { id: string; label: string; media_path: string }[]
  links: { metal_id: string; library_id: string }[]
  hover: { version: number; frame_paths: string[] } | null
}

export const MEDIA_EXTRAS_UNAVAILABLE_MESSAGE = 'The video library is not installed on this database yet.'

type Dependencies = {
  provider: () => 'rds'
  authorize: (request: Request, mutation: boolean) => Promise<{ actor: AdminActor }>
  transaction: <T>(run: (db: DbExecutor) => Promise<T>, options?: AdminTransactionOptions) => Promise<T>
  /** The same admission check the product save applies to videos: a new or changed video must be one uploaded through the admin uploader. */
  enforceVideos: (db: DbExecutor, next: unknown, previous: unknown) => Promise<void>
}
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
// Messages raised by the video admission check that mean "this video is not allowed" (not a server fault).
const NOT_ADMITTED_MESSAGES = new Set(['Use an admitted video from the library.', 'Video is not admitted.', 'Video reference mismatch.', 'Ambiguous video slot.', 'Published video identity changed.'])
const NOT_SWITCHED_ON_MESSAGES = new Set(['Video admission unavailable.', 'Video admission policy unavailable.'])
export const VIDEO_NOT_ADMITTED_MESSAGE = 'Use a video uploaded with the admin video uploader. Pasted or external video addresses are not allowed.'
export const VIDEO_NOT_SWITCHED_ON_MESSAGE = 'Video uploads are not switched on yet, so library videos cannot be saved.'
const videoProjection = (library: { id: string; media_path: string }[]) => ({ library: library.map((video) => ({ id: video.id, media_type: 'video', media_path: video.media_path.trim() })) })
const sqlState = (error: unknown) => (typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '')

export async function loadMediaExtras(db: DbExecutor, productId: string): Promise<MediaExtrasState> {
  const library = await db.query<{ id: string; label: string; media_path: string }>(
    'SELECT id::text AS id,label,media_path FROM public.product_media_library WHERE product_id=$1::uuid ORDER BY sort_order,id', [productId])
  const links = await db.query<{ metal_id: string; library_id: string }>(
    'SELECT metal_id::text AS metal_id,library_id::text AS library_id FROM public.product_variant_library_links WHERE product_id=$1::uuid ORDER BY metal_id', [productId])
  const hover = await db.query<{ version: number; frame_paths: string[] }>(
    'SELECT version,frame_paths FROM public.product_hover_views WHERE product_id=$1::uuid', [productId])
  return { library: library.rows, links: links.rows, hover: hover.rows[0] ? { version: hover.rows[0].version, frame_paths: hover.rows[0].frame_paths } : null }
}

export function createMediaExtrasHandlers(deps: Dependencies) {
  return async (request: Request, rawId: string): Promise<Response> => {
    try { if (deps.provider() !== 'rds') return response({ error: 'The video library needs the AWS product service.' }, 503) }
    catch { return response({ error: 'Product service unavailable.' }, 503) }
    const id = uuid.safeParse(rawId)
    if (!id.success) return response({ error: 'Invalid product ID.' }, 400)
    const mutation = request.method === 'PUT'
    if (!mutation && request.method !== 'GET') return response({ error: 'Method not allowed.' }, 405)

    let actor: AdminActor
    try { ({ actor } = await deps.authorize(request, mutation)) }
    catch (error) {
      const status = error instanceof ProductSessionError ? error.status : 503
      return response({ error: status === 401 ? 'Unauthorized.' : status === 403 ? 'Forbidden.' : 'Administrator session unavailable.' }, status)
    }

    try {
      if (!mutation) {
        const state = await deps.transaction(async db => {
          const product = await db.query('SELECT id FROM public.products WHERE id=$1::uuid', [id.data])
          return product.rows.length ? loadMediaExtras(db, id.data) : null
        }, { snapshot: true })
        if (!state) return response({ error: 'Product not found.' }, 404)
        return response({ available: true, ...state, revision: revisionOf(state) })
      }

      const parsed = mediaExtrasSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) return response({ error: parsed.error.issues[0]?.message ?? 'Invalid video library request.' }, 400)
      const expected = request.headers.get(REVISION_HEADER)
      return await deps.transaction(async db => {
        const locked = await db.query('SELECT id FROM public.products WHERE id=$1::uuid FOR UPDATE', [id.data])
        if (!locked.rows.length) return response({ error: 'Product not found.' }, 404)
        const current = await loadMediaExtras(db, id.data)
        if (!expected || revisionOf(current) !== expected) return response({ error: STALE_EDITOR_MESSAGE }, 409)
        // A new or changed video must be a permanent address on the media CDN, never a pasted or external address.
        const known = new Map(current.library.map((video) => [video.id, video.media_path.trim()]))
        if (parsed.data.library.some((video) => known.get(video.id) !== video.media_path.trim() && !isCanonicalAwsVideoReference(video.media_path.trim()))) {
          return response({ error: VIDEO_NOT_ADMITTED_MESSAGE }, 400)
        }
        try { await deps.enforceVideos(db, videoProjection(parsed.data.library), videoProjection(current.library)) }
        catch (error) {
          const message = error instanceof Error ? error.message : ''
          if (NOT_ADMITTED_MESSAGES.has(message)) return response({ error: VIDEO_NOT_ADMITTED_MESSAGE }, 400)
          if (NOT_SWITCHED_ON_MESSAGES.has(message)) return response({ error: VIDEO_NOT_SWITCHED_ON_MESSAGE }, 503)
          throw error
        }
        const hoverSet = parsed.data.hover !== undefined
        await db.query('SELECT public.admin_product_media_extras_save_v1($1::uuid,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb,$6::boolean)', [
          actor.profileId, id.data, JSON.stringify(parsed.data.library), JSON.stringify(parsed.data.links),
          hoverSet && parsed.data.hover ? JSON.stringify(parsed.data.hover) : null, hoverSet,
        ])
        const saved = await loadMediaExtras(db, id.data)
        return response({ available: true, ...saved, revision: revisionOf(saved) })
      })
    } catch (error) {
      const code = sqlState(error)
      if (code === '42P01' || code === '42883') return response({ available: false, error: MEDIA_EXTRAS_UNAVAILABLE_MESSAGE }, mutation ? 503 : 200)
      // The save function raises these with a message written for the administrator.
      if (mutation && code === '22023' && error instanceof Error) return response({ error: error.message }, 400)
      if (mutation && code === 'P0002') return response({ error: 'Product not found.' }, 404)
      if (mutation && code === '40001') return response({ error: error instanceof Error ? error.message : STALE_EDITOR_MESSAGE }, 409)
      if (code === '42501') return response({ error: 'Forbidden.' }, 403)
      console.error(`[admin-media-extras] ${request.method} failed code=${code || 'unknown'}`)
      return response({ error: 'Unable to complete the video library request.' }, 500)
    }
  }
}

