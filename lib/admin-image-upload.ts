import { NextResponse } from 'next/server'
import sharp from 'sharp'
import type { assertAdmin } from './cms-auth'
import { validateSafeSvg } from './admin-upload-validation'
import { isS3MediaConfigured, uploadMediaToS3 } from './s3-media'
import type { AdminActor } from './auth/admin-identity-core'
import { boundedImageForm, ImageBodyTooLarge, validateAwsSvg } from './image-validation'

type Access = Exclude<Awaited<ReturnType<typeof assertAdmin>>, { error: NextResponse }>
export type UploadConfig = {
  bucket: string
  maxBytes: number
  rasterWidth: number | ((form: FormData) => number)
  rasterHeight?: number
  rasterFit?: 'inside' | 'cover'
  preserveAspectRatio?: boolean
  allowSvg?: boolean
  svgOnly?: boolean
  quality?: number
  /** Pixel ceiling for decoding; banners may be larger than the 40 MP default. */
  maxInputPixels?: number
  successStatus?: 200 | 201
  validateForm?: (form: FormData) => string | null
  buildPath: (extension: 'webp' | 'svg', form: FormData) => string
}

const rasterFormats = new Map<string, Set<string>>([
  ['image/jpeg', new Set(['jpeg'])],
  ['image/png', new Set(['png'])],
  ['image/webp', new Set(['webp'])],
  ['image/avif', new Set(['avif', 'heif'])],
])

type AwsAccess = { provider: 'aws'; actor: AdminActor; target: { bucket: string; baseUrl: string } }
export async function handleAdminImageUpload(request: Request, access: Access | AwsAccess, config: UploadConfig) {
  const contentLength = Number(request.headers.get('content-length'))
  if (!Number.isFinite(contentLength) || contentLength <= 0) return NextResponse.json({ error: 'A valid upload size is required.' }, { status: 411 })
  if (contentLength > config.maxBytes + 1024 * 1024) return NextResponse.json({ error: 'The upload request is too large.' }, { status: 413 })

  let form: FormData | null
  try {
    form = 'provider' in access ? await boundedImageForm(request, config.maxBytes + 1024 * 1024) : await request.formData().catch(() => null)
  } catch (error) {
    return NextResponse.json({ error: error instanceof ImageBodyTooLarge ? 'The upload request is too large.' : 'Invalid image request.' }, { status: error instanceof ImageBodyTooLarge ? 413 : 400 })
  }
  const file = form?.get('file')
  if (!form || !(file instanceof File)) return NextResponse.json({ error: 'Missing image file.' }, { status: 400 })
  const formError = config.validateForm?.(form)
  if (formError) return NextResponse.json({ error: formError }, { status: 400 })
  if (file.size < 1 || file.size > config.maxBytes) return NextResponse.json({ error: `Images must be ${Math.floor(config.maxBytes / 1024 / 1024)} MB or smaller.` }, { status: file.size > 0 ? 413 : 400 })

  const input = Buffer.from(await file.arrayBuffer())
  let output: Buffer
  let extension: 'webp' | 'svg'
  let contentType: 'image/webp' | 'image/svg+xml'
  if (file.type === 'image/svg+xml') {
    if (!config.allowSvg || !validateSafeSvg(input) || ('provider' in access && !validateAwsSvg(input))) return NextResponse.json({ error: config.allowSvg ? 'The SVG contains unsupported or unsafe content.' : 'SVG images are not allowed here.' }, { status: 400 })
    output = input
    extension = 'svg'
    contentType = 'image/svg+xml'
  } else {
    if (config.svgOnly) return NextResponse.json({ error: 'Only safe SVG files are allowed.' }, { status: 400 })
    const formats = rasterFormats.get(file.type)
    if (!formats) return NextResponse.json({ error: 'Only JPG, PNG, WebP, or AVIF images are allowed.' }, { status: 400 })
    try {
      const image = sharp(input, { failOn: 'warning', limitInputPixels: config.maxInputPixels ?? 40_000_000 })
      const metadata = await image.metadata()
      if (!metadata.format || !formats.has(metadata.format)) return NextResponse.json({ error: 'The file contents do not match the selected image type.' }, { status: 400 })
      const width = typeof config.rasterWidth === 'function' ? config.rasterWidth(form) : config.rasterWidth
      output = await image.rotate().resize({ width, height: config.rasterHeight ?? (config.preserveAspectRatio ? undefined : width), fit: config.rasterFit ?? 'inside', withoutEnlargement: true }).webp({ quality: config.quality ?? 84 }).toBuffer()
      extension = 'webp'
      contentType = 'image/webp'
    } catch {
      return NextResponse.json({ error: 'The uploaded file is not a valid supported image.' }, { status: 400 })
    }
  }

  const path = config.buildPath(extension, form)
  if ('provider' in access) {
    try {
      const stored = await uploadMediaToS3(path, output, contentType, access.target)
      return NextResponse.json({ provider: 's3', path: stored.url, url: stored.url }, { status: config.successStatus ?? 201, headers: { 'Cache-Control': 'no-store' } })
    } catch {
      return NextResponse.json({ error: 'Unable to store the uploaded image.' }, { status: 500 })
    }
  }
  if (isS3MediaConfigured()) {
    try {
      const stored = await uploadMediaToS3(path, output, contentType)
      // Keep relative-path admin previews working until their URL builders move to the CDN.
      const { error: mirrorError } = await access.adminClient.storage.from(config.bucket).upload(path, output, { contentType, upsert: false, cacheControl: '86400' })
      if (mirrorError) throw mirrorError
      return NextResponse.json({ provider: 's3', ...stored }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
    } catch {
      return NextResponse.json({ error: 'Unable to store the uploaded image.' }, { status: 500 })
    }
  }
  const { error } = await access.adminClient.storage.from(config.bucket).upload(path, output, { contentType, upsert: false, cacheControl: '31536000' })
  if (error) return NextResponse.json({ error: 'Unable to store the uploaded image.' }, { status: 500 })
  const { data } = access.adminClient.storage.from(config.bucket).getPublicUrl(path)
  return NextResponse.json({ path, url: data.publicUrl }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
