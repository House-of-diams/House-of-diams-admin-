import 'server-only'
import { NextResponse } from 'next/server'
import { readImageProvider, imageTarget, type ImageContext } from './image-provider'
import { authorizeProductRequest } from './product-session-runtime'
import { ProductSessionError } from './product-session-error'
import { handleAdminImageUpload, type UploadConfig } from './admin-image-upload'

export async function handleImageUpload(request: Request, config: UploadConfig, context: ImageContext = 'content'): Promise<Response> {
  try {
    if (readImageProvider() === 'aws') {
      const { actor } = await authorizeProductRequest(request, true)
      return handleAdminImageUpload(request, { provider: 'aws', actor, target: imageTarget(context) }, config)
    }
  } catch (error) {
    return NextResponse.json({ error: 'Image service unavailable.' }, { status: error instanceof ProductSessionError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } })
  }
  const { assertAdmin } = await import('./cms-auth')
  const access = await assertAdmin(request)
  if ('error' in access) return access.error!
  return handleAdminImageUpload(request, access, config)
}

/** Direct image protocols lack content validation/finalization; never issue AWS signatures. */
export async function denyAwsImageSigning(request: Request): Promise<Response | null> {
  try {
    if (readImageProvider() === 'legacy') return null
    await authorizeProductRequest(request, true)
    return NextResponse.json({ error: 'Use the authenticated image upload endpoint.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: 'Image service unavailable.' }, { status: error instanceof ProductSessionError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
