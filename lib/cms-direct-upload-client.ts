import { uploadAwsImage } from './image-transport'
import { uploadAwsVideo } from './video-transport'

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

  // Uploads go through the server to AWS; there is no direct-to-storage or fallback path.
  return file.type.startsWith('video/')
    ? uploadAwsVideo(file, options.fallbackEndpoint, options.fallbackFields ?? {})
    : uploadAwsImage(file, options.fallbackEndpoint, options.fallbackFields)
}
