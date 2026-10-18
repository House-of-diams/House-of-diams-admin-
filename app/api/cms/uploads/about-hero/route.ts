import { selectedMixedImage, denyLegacyImageInAwsMode } from '@/lib/image-mixed-route'
import { selectedMixedVideo, denyLegacyVideoInAwsMode } from '@/lib/video-route'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { productVideoContentsMatch } from '@/lib/product-operations-validation'
import { isS3MediaConfigured, uploadMediaToS3 } from '@/lib/s3-media'

const bucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'
const videoTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
const imageFormats = new Map([
  ['image/jpeg', 'jpeg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/avif', 'avif'],
])

export async function POST(request: Request) {
  const selectedImage = await selectedMixedImage(request, 'about')
  if (selectedImage) return selectedImage
  const selectedVideo = await selectedMixedVideo(request, 'about')
  if (selectedVideo) return selectedVideo
  const { assertAdmin } = await import('@/lib/cms-auth')
  const access = await assertAdmin(request)
  if ('error' in access) return access.error
  const contentLength = Number(request.headers.get('content-length'))
  if (!Number.isFinite(contentLength) || contentLength <= 0) return NextResponse.json({ error: 'A valid upload size is required.' }, { status: 411 })
  if (contentLength > 101 * 1024 * 1024) return NextResponse.json({ error: 'The upload request is too large.' }, { status: 413 })
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const kind = String(form?.get('kind') ?? '')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Missing file.' }, { status: 400 })
  if (kind !== 'image' && kind !== 'video' && kind !== 'poster') return NextResponse.json({ error: 'Invalid upload kind.' }, { status: 400 })

  const isVideo = kind === 'video'
  if (isVideo) {
    const deniedVideo = denyLegacyVideoInAwsMode()
    if (deniedVideo) return deniedVideo
  }
  if (!isVideo) {
    const denied = denyLegacyImageInAwsMode()
    if (denied) return denied
  }
  if (isVideo && (!videoTypes.has(file.type) || file.size < 1 || file.size > 100 * 1024 * 1024)) return NextResponse.json({ error: 'Use an MP4, WebM, or MOV video up to 100MB.' }, { status: 400 })
  if (!isVideo && (!imageTypes.has(file.type) || file.size < 1 || file.size > 8 * 1024 * 1024)) return NextResponse.json({ error: 'Use a JPG, PNG, WebP, or AVIF image up to 8MB.' }, { status: 400 })

  const extension = isVideo ? (file.type === 'video/webm' ? 'webm' : file.type === 'video/quicktime' ? 'mov' : 'mp4') : 'webp'
  const path = `about/hero/${kind}/${crypto.randomUUID()}.${extension}`
  const input = Buffer.from(await file.arrayBuffer())
  if (isVideo && !productVideoContentsMatch(file.type, input)) return NextResponse.json({ error: 'The file contents do not match the selected video type.' }, { status: 400 })
  let output: Buffer = input
  if (!isVideo) {
    try {
      const image = sharp(input, { failOn: 'warning', limitInputPixels: 40_000_000 })
      const metadata = await image.metadata()
      if (metadata.format !== imageFormats.get(file.type)) return NextResponse.json({ error: 'The file contents do not match the selected image type.' }, { status: 400 })
      output = await image.rotate().resize({ width: 2400, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer()
    } catch {
      return NextResponse.json({ error: 'The uploaded file is not a valid supported image.' }, { status: 400 })
    }
  }
  if (isS3MediaConfigured()) {
    try {
      await uploadMediaToS3(path, output, isVideo ? file.type : 'image/webp')
      const { error: mirrorError } = await access.adminClient.storage.from(bucket).upload(path, output, { contentType: isVideo ? file.type : 'image/webp', upsert: false })
      if (mirrorError) throw mirrorError
      return NextResponse.json({ path })
    } catch { return NextResponse.json({ error: 'Unable to store the uploaded media.' }, { status: 500 }) }
  }
  const { error } = await access.adminClient.storage.from(bucket).upload(path, output, { contentType: isVideo ? file.type : 'image/webp', upsert: false })
  if (error) return NextResponse.json({ error: 'Unable to store the uploaded media.' }, { status: 500 })
  return NextResponse.json({ path })
}
