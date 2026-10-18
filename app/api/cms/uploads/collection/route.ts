import { handleCmsImageUpload } from '@/lib/cms-image-upload-route'

export async function POST(request: Request) {
  return handleCmsImageUpload(request, {
    prefix: 'collection',
    maxBytes: 5 * 1024 * 1024,
    width: 1600,
    allowSvg: true,
  })
}
