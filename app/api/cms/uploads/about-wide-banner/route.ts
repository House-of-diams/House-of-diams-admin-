import { handleCmsImageUpload } from '@/lib/cms-image-upload-route'

export async function POST(request: Request) {
  return handleCmsImageUpload(request, {
    prefix: 'about/wide-banner',
    maxBytes: 8 * 1024 * 1024,
    width: 2400,
  })
}
