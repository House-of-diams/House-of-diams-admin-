import { handleImageUpload } from '@/lib/image-route'

type CmsImageUploadConfig = {
  prefix: string
  maxBytes: number
  width: number
  allowSvg?: boolean
  svgOnly?: boolean
}

export async function handleCmsImageUpload(request: Request, config: CmsImageUploadConfig) {
  return handleImageUpload(request, {
    bucket: process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod',
    maxBytes: config.maxBytes,
    rasterWidth: config.width,
    preserveAspectRatio: true,
    allowSvg: config.allowSvg,
    svgOnly: config.svgOnly,
    buildPath: (extension) => `${config.prefix}/${crypto.randomUUID()}.${extension}`,
  })
}
