import 'server-only'
import { NextResponse } from 'next/server'
import { readImageProvider, imageTarget, type ImageContext } from './image-provider'
import { authorizeProductRequest } from './product-session-runtime'
import { ProductSessionError } from './product-session-error'
import { handleAdminImageUpload, type UploadConfig } from './admin-image-upload'

export async function handleImageUpload(request: Request, config: UploadConfig, context: ImageContext = 'content'): Promise<Response> {
  try {
    readImageProvider()
    const { actor } = await authorizeProductRequest(request, true)
    return handleAdminImageUpload(request, { provider: 'aws', actor, target: imageTarget(context) }, config)
  } catch (error) {
    return NextResponse.json({ error: 'Image service unavailable.' }, { status: error instanceof ProductSessionError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

/** Direct image protocols lack content validation/finalization; never issue AWS signatures. */
export async function denyAwsImageSigning(request: Request): Promise<Response> {
  try {
    readImageProvider()
    await authorizeProductRequest(request, true)
    return NextResponse.json({ error: 'Use the authenticated image upload endpoint.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: 'Image service unavailable.' }, { status: error instanceof ProductSessionError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
