import { tryUploadAwsImage } from './image-transport'
import { tryUploadAwsVideo, invalidateClientVideoLibrary } from './video-transport'

type DirectCmsUploadOptions = {
  file: File
  accessToken?: string
  signEndpoint: string
  fallbackEndpoint: string
  maxInputBytes?: number
  rasterWidth?: number
  webpQuality?: number
  svgOnly?: boolean
  rasterOnly?: boolean
  allowedMimeTypes?: string[]
  signFields?: Record<string, string | number>
  fallbackFields?: Record<string, string>
}

export async function uploadCmsAssetDirectWithFallback(options: DirectCmsUploadOptions) {
  const { file } = options
  if (options.maxInputBytes && file.size > options.maxInputBytes) throw new Error('File is too large.')
  if (options.svgOnly && file.type !== 'image/svg+xml') throw new Error('Only SVG icons are allowed.')
  if (options.rasterOnly && file.type === 'image/svg+xml') throw new Error('SVG is not allowed for this upload.')
  if (options.allowedMimeTypes && !options.allowedMimeTypes.includes(file.type)) throw new Error('Invalid file type.')

  if (file.type.startsWith('video/')) {
    const stored = await tryUploadAwsVideo(file, options.fallbackEndpoint, options.fallbackFields ?? {})
    if (stored) return stored
  } else {
    const stored = await tryUploadAwsImage(file, options.fallbackEndpoint, options.fallbackFields)
    if (stored) return stored
  }
  const { supabase } = await import('./supabase')
  const accessToken = options.accessToken ?? (await supabase.auth.getSession()).data.session?.access_token
  if (!accessToken) throw new Error('Please sign in again.')

  try {
    if (process.env.NEXT_PUBLIC_MEDIA_CDN_BASE_URL) throw new Error('Use server-side AWS media upload.')
    const preparedFile = await prepareCmsAsset(file, options.rasterWidth, options.webpQuality)
    if (preparedFile.type === 'image/svg+xml') throw new Error('SVG requires server validation.')
    const signResponse = await fetch(options.signEndpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ contentType: preparedFile.type, ...options.signFields, declaredSize: preparedFile.size }),
    })
    const signed = await signResponse.json().catch(() => null) as { bucket?: string; path?: string; token?: string; error?: string } | null
    if (!signResponse.ok || !signed?.bucket || !signed.path || !signed.token) throw new Error(signed?.error ?? 'Unable to prepare upload.')
    const { error } = await supabase.storage.from(signed.bucket)
      .uploadToSignedUrl(signed.path, signed.token, preparedFile, { contentType: preparedFile.type })
    if (error) throw error
    if (file.type.startsWith('video/')) invalidateClientVideoLibrary()
    return signed.path
  } catch {
    const formData = new FormData()
    formData.append('file', file)
    for (const [key, value] of Object.entries(options.fallbackFields ?? {})) formData.append(key, value)
    const response = await fetch(options.fallbackEndpoint, {
      method: 'POST', headers: { authorization: `Bearer ${accessToken}` }, body: formData,
    })
    const payload = await response.json().catch(() => null) as { path?: string; error?: string } | null
    if (!response.ok || !payload?.path) throw new Error(payload?.error ?? 'Unable to upload file.')
    if (file.type.startsWith('video/')) invalidateClientVideoLibrary()
    return payload.path
  }
}

async function prepareCmsAsset(file: File, rasterWidth?: number, webpQuality = 82) {
  if (file.type === 'image/svg+xml' || !rasterWidth) return file
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Invalid image type.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const width = Math.min(bitmap.width, rasterWidth)
    const height = Math.max(1, Math.round(bitmap.height * (width / bitmap.width)))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', webpQuality / 100))
    if (!blob) throw new Error('Unable to optimize image.')
    return new File([blob], `${crypto.randomUUID()}.webp`, { type: 'image/webp' })
  } finally {
    bitmap.close()
  }
}
