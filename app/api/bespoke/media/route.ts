import { selectedMixedImage, denyLegacyImageInAwsMode } from '@/lib/image-mixed-route'
import { NextResponse } from 'next/server'
import { isS3MediaConfigured, uploadMediaToS3 } from '@/lib/s3-media'
import sharp from 'sharp'
import { assertAdmin } from '@/lib/cms-auth'

const collectionBucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'
const maxFileSize = 10 * 1024 * 1024
const maxRequestSize = maxFileSize + 1024 * 1024
const allowedFormatsByMime = new Map<string, Set<string>>([
  ['image/jpeg', new Set(['jpeg'])],
  ['image/png', new Set(['png'])],
  ['image/webp', new Set(['webp'])],
  ['image/avif', new Set(['avif', 'heif'])],
])

export async function POST(request: Request) {
  const selectedImage = await selectedMixedImage(request, 'bespoke')
  if (selectedImage) return selectedImage
  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const contentLength = Number(request.headers.get('content-length'))
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return NextResponse.json({ error: 'A valid upload size is required.' }, { status: 411 })
  }
  if (contentLength > maxRequestSize) {
    return NextResponse.json({ error: 'The upload request is too large.' }, { status: 413 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')
  const kind = formData?.get('kind')
  if (!(file instanceof File) || kind !== 'image') {
    return NextResponse.json({ error: 'Only Bespoke image uploads are supported here. Paste a direct HTTPS URL for videos.' }, { status: 400 })
  }
  if (file.size < 1 || file.size > maxFileSize) {
    return NextResponse.json({ error: 'Images must be between 1 byte and 10 MB.' }, { status: file.size > maxFileSize ? 413 : 400 })
  }

  const denied = denyLegacyImageInAwsMode()
  if (denied) return denied
  const allowedFormats = allowedFormatsByMime.get(file.type)
  if (!allowedFormats) {
    return NextResponse.json({ error: 'Only JPG, PNG, WebP, or AVIF images are allowed.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  let uploadBuffer: Buffer
  try {
    const image = sharp(buffer, { failOn: 'warning', limitInputPixels: 40_000_000 })
    const metadata = await image.metadata()
    if (!metadata.format || !allowedFormats.has(metadata.format)) {
      return NextResponse.json({ error: 'The file contents do not match the selected image type.' }, { status: 400 })
    }
    uploadBuffer = await image.rotate().resize({ width: 2200, height: 2200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer()
  } catch {
    return NextResponse.json({ error: 'The uploaded file is not a valid supported image.' }, { status: 400 })
  }

  const filePath = `bespoke/images/${crypto.randomUUID()}.webp`
  if (isS3MediaConfigured()) {
    try {
      const stored = await uploadMediaToS3(filePath, uploadBuffer, 'image/webp')
      const { error: mirrorError } = await access.adminClient.storage.from(collectionBucket).upload(filePath, uploadBuffer, { contentType: 'image/webp', upsert: false, cacheControl: '86400' })
      if (mirrorError) throw mirrorError
      return NextResponse.json({ path: filePath, url: stored.url }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
    } catch { return NextResponse.json({ error: 'Unable to store the uploaded image.' }, { status: 500 }) }
  }
  const { error: uploadError } = await access.adminClient.storage.from(collectionBucket).upload(filePath, uploadBuffer, {
    contentType: 'image/webp',
    upsert: false,
    cacheControl: '31536000',
  })
  if (uploadError) return NextResponse.json({ error: 'Unable to store the uploaded image.' }, { status: 500 })

  const { data } = access.adminClient.storage.from(collectionBucket).getPublicUrl(filePath)
  return NextResponse.json({ path: filePath, url: data.publicUrl }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
