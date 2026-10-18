import { selectedMixedImage, denyLegacyImageInAwsMode } from '@/lib/image-mixed-route'
import { selectedMixedVideo, denyLegacyVideoInAwsMode } from '@/lib/video-route'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { invalidateCentralVideoLibrary, uploadProductVideoToR2 } from '@/lib/r2'
import { productVideoContentsMatch } from '@/lib/product-operations-validation'
import { isS3MediaConfigured, uploadMediaToS3 } from '@/lib/s3-media'

const collectionBucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'
const maxImageSize = 25 * 1024 * 1024
const maxVideoSize = 100 * 1024 * 1024
const maxRequestSize = maxVideoSize + 1024 * 1024
const imageFormatsByMime = new Map<string, Set<string>>([
  ['image/jpeg', new Set(['jpeg'])],
  ['image/png', new Set(['png'])],
  ['image/webp', new Set(['webp'])],
  ['image/avif', new Set(['avif', 'heif'])],
])
const videoExtensions = new Map([['video/mp4', 'mp4'], ['video/quicktime', 'mov'], ['video/webm', 'webm']])

export async function POST(request: Request) {
  const selectedImage = await selectedMixedImage(request, 'product')
  if (selectedImage) return selectedImage
  const selectedVideo = await selectedMixedVideo(request, 'product')
  if (selectedVideo) return selectedVideo
  const { assertAdmin } = await import('@/lib/cms-auth')
  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const contentLength = Number(request.headers.get('content-length'))
  if (!Number.isFinite(contentLength) || contentLength <= 0) return NextResponse.json({ error: 'A valid upload size is required.' }, { status: 411 })
  if (contentLength > maxRequestSize) return NextResponse.json({ error: 'The upload request is too large.' }, { status: 413 })

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')
  const kind = formData?.get('kind')
  const folder = formData?.get('folder')
  if (!(file instanceof File) || (kind !== 'image' && kind !== 'video') || (folder !== 'products' && folder !== 'hiphop')) {
    return NextResponse.json({ error: 'Invalid product media upload request.' }, { status: 400 })
  }
  if (file.size < 1 || file.size > (kind === 'image' ? maxImageSize : maxVideoSize)) {
    return NextResponse.json({ error: kind === 'image' ? 'Images must be 25 MB or smaller.' : 'Videos must be 100 MB or smaller.' }, { status: file.size > 0 ? 413 : 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  if (kind === 'image') {
    const denied = denyLegacyImageInAwsMode()
    if (denied) return denied
    const allowedFormats = imageFormatsByMime.get(file.type)
    if (!allowedFormats) return NextResponse.json({ error: 'Only JPG, PNG, WebP, or AVIF images are allowed.' }, { status: 400 })

    let output: Buffer
    try {
      const image = sharp(buffer, { failOn: 'warning', limitInputPixels: 40_000_000 })
      const metadata = await image.metadata()
      if (!metadata.format || !allowedFormats.has(metadata.format)) return NextResponse.json({ error: 'The file contents do not match the selected image type.' }, { status: 400 })
      output = await image.rotate().resize({ width: 2200, height: 2200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer()
    } catch {
      return NextResponse.json({ error: 'The uploaded file is not a valid supported image.' }, { status: 400 })
    }

    const filePath = `${folder}/images/${crypto.randomUUID()}.webp`
    if (isS3MediaConfigured()) {
      try {
        const stored = await uploadMediaToS3(filePath, output, 'image/webp')
        return NextResponse.json({ provider: 's3', path: stored.url, url: stored.url }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
      } catch { return NextResponse.json({ error: 'Unable to store the product image.' }, { status: 500 }) }
    }
    const { error } = await access.adminClient.storage.from(collectionBucket).upload(filePath, output, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' })
    if (error) return NextResponse.json({ error: 'Unable to store the product image.' }, { status: 500 })
    const { data } = access.adminClient.storage.from(collectionBucket).getPublicUrl(filePath)
    return NextResponse.json({ provider: 'supabase', path: filePath, url: data.publicUrl }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  }

  const deniedVideo = denyLegacyVideoInAwsMode()
  if (deniedVideo) return deniedVideo
  const extension = videoExtensions.get(file.type)
  if (!extension) return NextResponse.json({ error: 'Only MP4, MOV, or WebM videos are allowed.' }, { status: 400 })
  if (!productVideoContentsMatch(file.type, buffer)) return NextResponse.json({ error: 'The file contents do not match the selected video type.' }, { status: 400 })

  try {
    if (isS3MediaConfigured()) {
      const path = `${folder}/videos/${crypto.randomUUID()}.${extension}`
      const stored = await uploadMediaToS3(path, buffer, file.type)
      return NextResponse.json({ provider: 's3', path: stored.url, url: stored.url }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
    }
    const uploadedVideo = await uploadProductVideoToR2({ buffer, extension, folder, contentType: file.type })
    invalidateCentralVideoLibrary()
    return NextResponse.json({ provider: 'r2', path: uploadedVideo.url, url: uploadedVideo.url }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to store the product video.' }, { status: 500 })
  }
}
