import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { readVideoProvider, videoNamespace, videoSources } from '@/lib/video-provider'
import { getAwsVideoLibrary } from '@/lib/video-library'
import { authorizeProductRequest } from '@/lib/product-session-runtime'
import { ProductSessionError } from '@/lib/product-session-error'
import { videoLibraryQuerySchema } from '@/lib/product-operations-validation'

export async function GET(request: Request) {
  try {
    readVideoProvider()
    await authorizeProductRequest(request, false)
    const query = videoLibraryQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()))
    if (!query.success) return NextResponse.json({ error: 'Invalid video library request.' }, { status: 400 })
    const namespace = createHash('sha256').update(videoNamespace(videoSources())).digest('hex')
    const items = await getAwsVideoLibrary(query.data.refresh === '1')
    return NextResponse.json({ items, provider: 's3', namespace }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: 'Unable to load the product video library.' }, { status: error instanceof ProductSessionError ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
