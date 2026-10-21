import { handleCmsImageUpload } from '@/lib/cms-image-upload-route'

export async function POST(request: Request) {
  return handleCmsImageUpload(request, {
    prefix: 'hero',
    maxBytes: 15 * 1024 * 1024,
    width: 2200,
    allowSvg: true,
  })
}
