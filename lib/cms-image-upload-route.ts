import { handleImageUpload } from '@/lib/image-route'

type CmsImageUploadConfig = {
  prefix: string
  maxBytes: number
  width: number
  allowSvg?: boolean
  quality?: number
  maxInputPixels?: number
  svgOnly?: boolean
}

export async function handleCmsImageUpload(request: Request, config: CmsImageUploadConfig) {
  return handleImageUpload(request, {
    maxBytes: config.maxBytes,
    rasterWidth: config.width,
    preserveAspectRatio: true,
    allowSvg: config.allowSvg,
    quality: config.quality,
    maxInputPixels: config.maxInputPixels,
    svgOnly: config.svgOnly,
    buildPath: (extension) => `${config.prefix}/${crypto.randomUUID()}.${extension}`,
  })
}
