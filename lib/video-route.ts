import 'server-only'
import { readVideoProvider, videoTarget } from './video-provider'
import { createVideoStorage, MAX_VIDEO_BYTES, videoTypes, type VideoMime } from './video-storage'
import { invalidateAwsVideoLibrary } from './video-library'
import { authorizeProductRequest } from './product-session-runtime'
import { ProductSessionError } from './product-session-error'
import { boundedImageForm, ImageBodyTooLarge } from './image-validation'
import { videoUploadGate } from './video-upload-gate'

const failure = (status: number, error = 'Video service unavailable.') => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
export async function selectedMixedVideo(request: Request, context: 'product' | 'about'): Promise<Response | null> {
  if (request.headers.get('x-admin-video-upload') !== '1') return null
  try {
    if (readVideoProvider() === 'legacy') return failure(409, 'Video service configuration changed. Reload the uploader.')
    if (request.headers.has('x-admin-image-upload')) return failure(400, 'Invalid media protocol.')
    const access = await authorizeProductRequest(request, true)
    const length = Number(request.headers.get('content-length'))
    if (!Number.isSafeInteger(length) || length <= 0) return failure(411, 'A valid upload size is required.')
    if (length > MAX_VIDEO_BYTES + 1024 * 1024) return failure(413, 'The upload request is too large.')
    // At most a couple of videos at once per server; the rest are told to retry (the file is not read yet).
    const release = videoUploadGate.tryAcquire()
    if (!release) return Response.json({ error: 'Another video is being uploaded. Please try again in a minute.' }, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } })
    try {
    const form = await boundedImageForm(request, MAX_VIDEO_BYTES + 1024 * 1024)
    const file = form?.get('file'), folder = form?.get('folder')
    if (!form || form.get('kind') !== 'video' || !(file instanceof File) || (context === 'product' && folder !== 'products' && folder !== 'hiphop')) return failure(400, 'Invalid video upload request.')
    if (file.size > MAX_VIDEO_BYTES) return failure(413, 'Videos must be 100 MB or smaller.')
    if (!file.size || !Object.hasOwn(videoTypes, file.type)) return failure(400, 'Only MP4, MOV, or WebM videos are allowed.')
    const body = Buffer.from(await file.arrayBuffer())
    const { productVideoContentsMatch } = await import('./product-operations-validation')
    if (!productVideoContentsMatch(file.type, body)) return failure(400, 'The file contents do not match the selected video type.')
    const source = videoTarget(context === 'about' ? 'about' : folder as 'products' | 'hiphop')
    try {
      const { admissionPolicy } = await import('./video-admission')
      const policy = admissionPolicy()
      const stored = policy
        ? await (await import('./video-admission-runtime')).uploadAdmittedVideo(source, body, file.type as VideoMime, access.actor, request.headers.get('x-admin-video-operation') ?? undefined)
        : await createVideoStorage().upload(source, body, file.type as VideoMime)
      invalidateAwsVideoLibrary()
      return Response.json({ provider: 's3', path: stored.url, url: stored.url, admission: policy ? 'admitted' : 'provisional' }, { status: context === 'about' ? 200 : 201, headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      // Server log only (never sent to the browser) so a failed upload can be diagnosed.
      console.error('[admin-video] upload failed:', error instanceof Error ? `${error.name}: ${error.message.slice(0, 160)}` : 'unknown error')
      return failure(500, 'Unable to store the uploaded video.')
    }
    } finally { release() }
  } catch (error) {
    return failure(error instanceof ProductSessionError ? error.status : error instanceof ImageBodyTooLarge ? 413 : 503)
  }
}
export function denyLegacyVideoInAwsMode(): Response | null {
  try { return readVideoProvider() === 'legacy' ? null : failure(409, 'Use the authenticated video upload protocol.') }
  catch { return failure(503) }
}
/** About signing is mixed and legacy-only; selected videos use bounded server uploads. */
export async function denyAwsVideoSigning(request: Request): Promise<Response | null> {
  try {
    if (readVideoProvider() === 'legacy') return null
    await authorizeProductRequest(request, true)
    return failure(503, 'Use the authenticated media upload endpoint.')
  } catch (error) { return failure(error instanceof ProductSessionError ? error.status : 503) }
}
