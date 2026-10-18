import { handleCmsImageUpload } from '@/lib/cms-image-upload-route'

export async function POST(request: Request) {
  return handleCmsImageUpload(request, {
    prefix: 'summary-icons',
    maxBytes: 2 * 1024 * 1024,
    width: 512,
    allowSvg: true,
  })
}
