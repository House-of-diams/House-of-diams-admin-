import { handleCmsImageUpload } from '@/lib/cms-image-upload-route'

export async function POST(request: Request) {
  return handleCmsImageUpload(request, {
    prefix: 'contact',
    maxBytes: 1 * 1024 * 1024,
    width: 512,
    allowSvg: true,
    svgOnly: true,
  })
}
